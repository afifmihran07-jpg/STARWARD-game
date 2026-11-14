/* =========================================================================
   math.js — minimal 3D math: vectors, quaternions, 4x4 matrices.

   Quaternions represent body orientation so rotation integration is
   physically correct (angular velocity -> quaternion derivative) and free
   of gimbal lock / Euler singularities.
   ========================================================================= */
(function (global) {
  'use strict';

  const EPS = 1e-12;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const deg = Math.PI / 180;

  /* ------------------------------ Vec3 ---------------------------------- */
  function V3(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; }

  const Vec3 = {
    create: (x, y, z) => V3(x, y, z),
    clone: (a) => V3(a.x, a.y, a.z),
    copy: (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; },
    /** Write components into an existing vector; returns it for chaining. */
    set: (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; },
    zero: (o) => { o.x = 0; o.y = 0; o.z = 0; return o; },

    add: (a, b) => V3(a.x + b.x, a.y + b.y, a.z + b.z),
    sub: (a, b) => V3(a.x - b.x, a.y - b.y, a.z - b.z),
    mul: (a, s) => V3(a.x * s, a.y * s, a.z * s),
    div: (a, s) => V3(a.x / s, a.y / s, a.z / s),
    neg: (a) => V3(-a.x, -a.y, -a.z),

    // In-place accumulation: avoids per-substep allocation in hot loops.
    addScaled: (a, b, s) => {
      a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a;
    },

    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => V3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x
    ),
    lenSq: (a) => a.x * a.x + a.y * a.y + a.z * a.z,
    len: (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
    dist: (a, b) => {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    distSq: (a, b) => {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      return dx * dx + dy * dy + dz * dz;
    },
    norm: (a) => {
      const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      return l > EPS ? V3(a.x / l, a.y / l, a.z / l) : V3(0, 0, 0);
    },
    lerp: (a, b, t) => V3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t)),

    /** Component of `a` perpendicular to unit vector `n`. */
    reject: (a, n) => {
      const d = Vec3.dot(a, n);
      return V3(a.x - n.x * d, a.y - n.y * d, a.z - n.z * d);
    }
  };
/* ---------------------------- Quaternion ------------------------------ */
  // Factory (not a `function` declaration) so it does not collide with the
  // `Quat` object literal below in the same scope.
  const Quat = (x, y, z, w) => ({ x: x || 0, y: y || 0, z: z || 0, w: (w === undefined ? 1 : w) });

  const QuatMethods = {
    create: () => Quat(0, 0, 0, 1),
    clone: (q) => Quat(q.x, q.y, q.z, q.w),
    identity: (q) => { q.x = 0; q.y = 0; q.z = 0; q.w = 1; return q; },

    fromAxisAngle: (axis, angle) => {
      const n = Vec3.norm(axis);
      if (n.x === 0 && n.y === 0 && n.z === 0) return Quat.create();
      const h = angle * 0.5, s = Math.sin(h);
      return Quat(n.x * s, n.y * s, n.z * s, Math.cos(h));
    },

    multiply: (a, b) => Quat(
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    ),

    conjugate: (q) => Quat(-q.x, -q.y, -q.z, q.w),

    norm: (q) => {
      const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
      if (l < EPS) return Quat.create();
      q.x /= l; q.y /= l; q.z /= l; q.w /= l; return q;
    },

    /** Rotate vector v by q (body -> world). */
    rotate: (q, v) => {
      // t = 2 * (q_vec x v);  v' = v + q_w*t + q_vec x t
      const tx = 2 * (q.y * v.z - q.z * v.y);
      const ty = 2 * (q.z * v.x - q.x * v.z);
      const tz = 2 * (q.x * v.y - q.y * v.x);
      return V3(
        v.x + q.w * tx + q.y * tz - q.z * ty,
        v.y + q.w * ty + q.z * tx - q.x * tz,
        v.z + q.w * tz + q.x * ty - q.y * tx
      );
    },

    /** Inverse-rotate (world -> body); equivalent to rotate by conjugate. */
    rotateInv: (q, v) => Quat.rotate(Quat.conjugate(q), v),

    /**
     * Integrate orientation by angular velocity w over dt using
     * q' = 0.5 * q (x) omega, then re-normalise onto the unit hypersphere.
     */
    integrate: (q, w, dt) => {
      const h = dt * 0.5;
      const qw = q.w, qx = q.x, qy = q.y, qz = q.z;
      q.w += h * (-qx * w.x - qy * w.y - qz * w.z);
      q.x += h * (qw * w.x + qy * w.z - qz * w.y);
      q.y += h * (qw * w.y + qz * w.x - qx * w.z);
      q.z += h * (qw * w.z + qx * w.y - qy * w.x);
      return Quat.norm(q);
    },

    /** Shortest-arc rotation taking unit vector `from` to unit vector `to`. */
    fromUnitVectors: (from, to) => {
      const d = Vec3.dot(from, to);
      if (d > 0.999999) return Quat.create();
      if (d < -0.999999) {
        // Antiparallel: any perpendicular axis yields a valid 180-degree turn.
        let axis = Vec3.cross(V3(1, 0, 0), from);
        if (Vec3.lenSq(axis) < EPS) axis = Vec3.cross(V3(0, 1, 0), from);
        axis = Vec3.norm(axis);
        return Quat(axis.x, axis.y, axis.z, 0);
      }
      const c = Vec3.cross(from, to);
      return Quat.norm(Quat(c.x, c.y, c.z, 1 + d));
    },

    slerp: (a, b, t) => {
      let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
      let bx = b.x, by = b.y, bz = b.z, bw = b.w;
      if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
      if (cos > 0.9995) {
        return Quat.norm(Quat(
          lerp(a.x, bx, t), lerp(a.y, by, t),
          lerp(a.z, bz, t), lerp(a.w, bw, t)
        ));
      }
      const theta = Math.acos(clamp(cos, -1, 1)), s = Math.sin(theta);
      const wa = Math.sin((1 - t) * theta) / s, wb = Math.sin(t * theta) / s;
      return Quat(
        a.x * wa + bx * wb, a.y * wa + by * wb,
        a.z * wa + bz * wb, a.w * wa + bw * wb
      );
    },

    /**
     * Build a look-rotation: local -Z points along `fwd`, local +Y toward
     * `up`.
     *
     * `fromMat3` reads the basis as ROWS of a matrix that maps world -> local
     * (the transpose of "local basis vectors as world images"), so the basis
     * is transposed here. Getting this backwards yields an inverted rotation
     * that points the nose away from the target direction.
     */
    lookRotation: (fwd, up) => {
      const z = Vec3.neg(Vec3.norm(fwd));
      let x = Vec3.cross(up, z);
      if (Vec3.lenSq(x) < 1e-8) x = Vec3.cross(Vec3.create(0, 0, 1), z);
      x = Vec3.norm(x);
      const y = Vec3.cross(z, x);
      // Transpose: [x y z] rows -> columns.
      return Quat.fromMat3([
        x.x, y.x, z.x,
        x.y, y.y, z.y,
        x.z, y.z, z.z
      ]);
    },

    /** Quaternion from a row-major 9-element basis matrix. */
    fromMat3: (m) => {
      const m00 = m[0], m01 = m[1], m02 = m[2];
      const m10 = m[3], m11 = m[4], m12 = m[5];
      const m20 = m[6], m21 = m[7], m22 = m[8];
      const tr = m00 + m11 + m22;
      if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        return Quat((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s);
      }
      if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        return Quat(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
      }
      if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        return Quat((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
      }
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      return Quat((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
    }
  };

/* ------------------- Mat4 (column-major, Float64Array) -----------------

     These MUST be double precision. World coordinates in this game are
     heliocentric — Earth's position is ~1.5e11 m from the origin. A float32
     has ~7 significant digits, so at 1.5e11 the spacing between
     representable values is ~16 km: adding 100 m to a world coordinate is a
     silent no-op.

     The view matrix is exactly where that destroys the picture. Its
     translation column is m[12..14] = -dot(basis, eye), i.e. ~-1.5e11, and
     transformPoint evaluates m[0]*x + m[4]*y + m[8]*z + m[12]. That subtracts
     two numbers of order 1e11 to obtain a camera-relative offset of order
     1e2 m, so the useful digits are annihilated by cancellation and every
     object comes out kilometres away from where it belongs (typically with a
     positive view-space z, so it is culled as "behind the camera" and the
     viewport renders black).

     Float64 gives ~1e-5 m of resolution at these magnitudes, which is far
     below anything the simulation cares about. Both the per-matrix store and
     the multiply() scratch buffer must be 64-bit: truncating in the scratch
     would re-introduce the same error on the way out.
  ---------------------------------------------------------------------- */
  const _s16 = new Float64Array(16);

  function Mat4() {
    this.m = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  Mat4.prototype = {
    identity() {
      this.m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      return this;
    },

    /**
     * View matrix from eye/target/up (right-handed, camera looks down -Z).
     *
     * Storage is column-major (m[c * 4 + r]), matching compose(), and
     * transformPoint() reads row r as m[0*4+r]*x + m[1*4+r]*y + m[2*4+r]*z.
     * So each basis vector must be written DOWN a column, i.e. m[0]=x.x,
     * m[1]=y.x, m[2]=z.x — not the three values of x laid out consecutively.
     *
     * Writing them across instead (m[0..2] = x, m[4..6] = y, m[8..10] = z)
     * stores the transpose. That is invisible for an axis-aligned camera,
     * because a diagonal basis is symmetric, but for any rotated view it
     * mirrors and skews the world: points land in the wrong place and end up
     * with positive view-space z, so projectPoint() culls them as "behind the
     * camera" and the viewport comes out black.
     */
    lookAt(eye, target, up) {
      const z = Vec3.norm(Vec3.sub(eye, target));
      let x = Vec3.cross(up, z);
      if (Vec3.lenSq(x) < 1e-9) x = Vec3.cross(V3(0, 0, 1), z);
      x = Vec3.norm(x);
      const y = Vec3.cross(z, x);
      const m = this.m;
      // Column 0 = x axis, column 1 = y axis, column 2 = z axis.
      m[0] = x.x; m[1] = y.x; m[2] = z.x; m[3] = 0;
      m[4] = x.y; m[5] = y.y; m[6] = z.y; m[7] = 0;
      m[8] = x.z; m[9] = y.z; m[10] = z.z; m[11] = 0;
      m[12] = -Vec3.dot(x, eye); m[13] = -Vec3.dot(y, eye); m[14] = -Vec3.dot(z, eye); m[15] = 1;
      return this;
    },

    /** Perspective projection; camera looks down -Z. */
    perspective(fovY, aspect, near, far) {
      const f = 1 / Math.tan(fovY * 0.5), m = this.m;
      m[0] = f / aspect; m[1] = 0; m[2] = 0; m[3] = 0;
      m[4] = 0; m[5] = f; m[6] = 0; m[7] = 0;
      m[8] = 0; m[9] = 0; m[10] = (far + near) / (near - far); m[11] = -1;
      m[12] = 0; m[13] = 0; m[14] = (2 * far * near) / (near - far); m[15] = 0;
      return this;
    },

    /** Rigid transform: translation * rotation(q) * scale. */
    compose(pos, q, scale) {
      const sx = scale ? scale.x : 1, sy = scale ? scale.y : 1, sz = scale ? scale.z : 1;
      const { x, y, z, w } = q;
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      const m = this.m;
      m[0] = (1 - (yy + zz)) * sx; m[1] = (xy + wz) * sx; m[2] = (xz - wy) * sx; m[3] = 0;
      m[4] = (xy - wz) * sy; m[5] = (1 - (xx + zz)) * sy; m[6] = (yz + wx) * sy; m[7] = 0;
      m[8] = (xz + wy) * sz; m[9] = (yz - wx) * sz; m[10] = (1 - (xx + yy)) * sz; m[11] = 0;
      m[12] = pos.x; m[13] = pos.y; m[14] = pos.z; m[15] = 1;
      return this;
    },

    /** out = this * other (applies `other` first, then `this`). */
    multiply(other) {
      const a = this.m, b = other.m, o = _s16;
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      this.m.set(o);
      return this;
    },

    /** Transform point (w=1). Does not perform the perspective divide. */
    transformPoint(v) {
      const m = this.m;
      return V3(
        m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
        m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
        m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14]
      );
    },

    /** Transform direction (w=0) — ignores translation. */
    transformDir(v) {
      const m = this.m;
      return V3(
        m[0] * v.x + m[4] * v.y + m[8] * v.z,
        m[1] * v.x + m[5] * v.y + m[9] * v.z,
        m[2] * v.x + m[6] * v.y + m[10] * v.z
      );
    }
  };

  /* ----------------------------- Utilities ----------------------------- */
  const Util = {
    clamp, lerp, deg,
    sign: (v) => (v < 0 ? -1 : 1),
    smoothstep: (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    /** Frame-rate independent exponential approach. */
    damp: (cur, tgt, lambda, dt) => lerp(cur, tgt, 1 - Math.exp(-lambda * dt)),
    wrapPi(a) {
      a = (a + Math.PI) % (2 * Math.PI);
      if (a < 0) a += 2 * Math.PI;
      return a - Math.PI;
    },
    /**
     * SI-prefix formatting. Space distances span many orders of magnitude,
     * so fixed formatting would be unreadable. Each entry in a ladder is a
     * factor of 1000 from the last, which keeps the stepping consistent.
     */
    formatSI(v, digits) {
      if (digits === undefined) digits = 2;
      if (!isFinite(v)) return '---';
      let a = Math.abs(v);
      if (a === 0) return '0';

      if (a >= 1) {
        const big = ['', 'k', 'M', 'G', 'T', 'P', 'E'];
        let i = 0;
        while (a >= 1000 && i < big.length - 1) { a /= 1000; i++; }
        return a.toFixed(digits) + ' ' + big[i];
      }

      // Below one: walk down the sub-unit prefixes.
      const small = ['n', 'u', 'm', ''];
      let j = small.length - 1;
      while (a < 1 && j > 0) { a *= 1000; j--; }
      return a.toFixed(digits) + ' ' + small[j];
    },
    formatDeg(rad) {
      return isFinite(rad) ? (rad * 180 / Math.PI).toFixed(1) : '---';
    }
  };

  // Attach the method table to the factory so both `Quat(...)` and
  // `Quat.rotate(...)` work, matching how it is used everywhere else.
  Object.assign(Quat, QuatMethods);

  global.Math3 = { Vec3, Quat, Mat4, Util, EPS };
})(window);