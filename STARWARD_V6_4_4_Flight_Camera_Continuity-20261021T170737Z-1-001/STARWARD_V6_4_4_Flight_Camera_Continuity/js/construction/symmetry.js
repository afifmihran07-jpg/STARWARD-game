import {
  RocketPart
} from '../rocket/rocketPart.js';
export function symmetricParts(type, x, y, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    out.push(new RocketPart(type, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), a));
  }
  return out;
}
