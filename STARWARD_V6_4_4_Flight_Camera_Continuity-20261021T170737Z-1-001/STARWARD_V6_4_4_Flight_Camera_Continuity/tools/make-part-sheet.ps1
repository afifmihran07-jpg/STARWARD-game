# =============================================================================
#  make-part-sheet.ps1 — generates assets/sprites/rocket-parts.png
#
#  The sheet is a uniform 13 x 9 grid (96 x 128 px cells) of original 2D rocket
#  part sprites on a transparent background, with brushed-metal bodies and
#  dark ink outlines.
#
#  Run:  powershell -ExecutionPolicy Bypass -File tools\make-part-sheet.ps1
# =============================================================================
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$COLS = 13; $ROWS = 9; $CW = 96; $CH = 128
$W = $COLS * $CW; $H = $ROWS * $CH
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\sprites\rocket-parts.png'
$outDir = Split-Path -Parent $out
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# --- palette -----------------------------------------------------------------
$BG     = [System.Drawing.Color]::FromArgb(255, 157, 192, 230)
$INK    = [System.Drawing.Color]::FromArgb(255, 34, 46, 58)
$INK_S  = [System.Drawing.Color]::FromArgb(255, 60, 76, 92)
$LIGHT  = [System.Drawing.Color]::FromArgb(255, 244, 248, 252)
$MID    = [System.Drawing.Color]::FromArgb(255, 196, 205, 214)
$DARK   = [System.Drawing.Color]::FromArgb(255, 118, 130, 141)
$STEEL  = [System.Drawing.Color]::FromArgb(255, 150, 161, 171)
$CHAR   = [System.Drawing.Color]::FromArgb(255, 58, 64, 71)
$CHAR_L = [System.Drawing.Color]::FromArgb(255, 96, 104, 112)
$GOLD   = [System.Drawing.Color]::FromArgb(255, 226, 178, 92)
$BLUE   = [System.Drawing.Color]::FromArgb(255, 116, 168, 214)
$GLASS  = [System.Drawing.Color]::FromArgb(255, 128, 183, 219)
$ORANGE = [System.Drawing.Color]::FromArgb(255, 236, 150, 76)
$WHITE  = [System.Drawing.Color]::FromArgb(255, 232, 238, 243)

$g.Clear([System.Drawing.Color]::Transparent)

# --- geometry helpers --------------------------------------------------------
# All sprite helpers work in "cell space": (col,row) + fractions of a cell.
function PX($col, $u) { return $col * $CW + $u * $CW }
function PY($row, $v) { return $row * $CH + $v * $CH }
function PW($w) { return $w * $CW }
function PH($h) { return $h * $CH }

function Grad($x, $y, $w, $h, $c1, $c2, [single]$angle = 90) {
  $rect = New-Object System.Drawing.RectangleF([single]$x, [single]$y, [single][Math]::Max($w, 0.01), [single][Math]::Max($h, 0.01))
  return New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, $angle)
}
function PenInk([single]$w = 2.0, $c = $null) {
  if ($null -eq $c) { $c = $INK }
  $p = New-Object System.Drawing.Pen($c, $w)
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}
function Poly($g, $xs, $ys, $brush, $pen) {
  $pts = New-Object 'System.Drawing.PointF[]' $xs.Count
  for ($i = 0; $i -lt $xs.Count; $i++) { $pts[$i] = New-Object System.Drawing.PointF([single]$xs[$i], [single]$ys[$i]) }
  if ($brush) { $g.FillPolygon($brush, $pts) }
  if ($pen) { $g.DrawPolygon($pen, $pts) }
}
function Ell($g, $x, $y, $w, $h, $brush, $pen) {
  if ($brush) { $g.FillEllipse($brush, [single]$x, [single]$y, [single]$w, [single]$h) }
  if ($pen) { $g.DrawEllipse($pen, [single]$x, [single]$y, [single]$w, [single]$h) }
}
function RR($g, $x, $y, $w, $h, $r, $brush, $pen) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc([single]$x, [single]$y, $r * 2, $r * 2, 180, 90)
  $p.AddArc([single]($x + $w - $r * 2), [single]$y, $r * 2, $r * 2, 270, 90)
  $p.AddArc([single]($x + $w - $r * 2), [single]($y + $h - $r * 2), $r * 2, $r * 2, 0, 90)
  $p.AddArc([single]$x, [single]($y + $h - $r * 2), $r * 2, $r * 2, 90, 90)
  $p.CloseFigure()
  if ($brush) { $g.FillPath($brush, $p) }
  if ($pen) { $g.DrawPath($pen, $p) }
  $p.Dispose()
}
# --- sprite primitives -------------------------------------------------------
# Metallic cylinder / tank body.
function SprTank($col, $row, $u, $v, $w, $h, $c1 = $LIGHT, $c2 = $STEEL, $capC = $null, $rim = $true) {
  $x = PX $col $u; $y = PY $row $v; $ww = PW $w; $hh = PH $h
  if ($null -eq $capC) { $capC = $DARK }
  $b = Grad $x $y $ww $hh $c1 $c2 90
  RR $g $x $y $ww $hh ([single]([Math]::Min($ww * 0.22, 8))) $b (PenInk)
  # highlight stripe
  $hi = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
  $g.FillRectangle($hi, [single]($x + $ww * 0.18), [single]($y + $hh * 0.10), [single]($ww * 0.14), [single]($hh * 0.80))
  $hi.Dispose()
  if ($rim) {
    $rb = New-Object System.Drawing.SolidBrush($capC)
    RR $g ($x - $ww * 0.06) ($y + $hh * 0.02) ($ww * 1.12) ($hh * 0.09) 2 $rb (PenInk 1.6)
    RR $g ($x - $ww * 0.06) ($y + $hh * 0.89) ($ww * 1.12) ($hh * 0.09) 2 $rb (PenInk 1.6)
    $rb.Dispose()
  }
  $b.Dispose()
}

# Cone / nose cone (apex up).
function SprCone($col, $row, $u, $v, $w, $h, $c1 = $LIGHT, $c2 = $MID, $round = $false) {
  $x = PX $col ($u + $w / 2); $y = PY $row $v; $ww = PW $w; $hh = PH $h
  $b = Grad ($x - $ww / 2) $y $ww $hh $c1 $c2 90
  if ($round) {
    # ogive: draw as a filled path with curved flanks
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddBezier([single]$x, [single]$y, [single]($x + $ww * 0.18), [single]($y + $hh * 0.35), [single]($x + $ww * 0.5), [single]($y + $hh * 0.72), [single]($x + $ww * 0.5), [single]($y + $hh))
    $p.AddLine([single]($x + $ww * 0.5), [single]($y + $hh), [single]($x - $ww * 0.5), [single]($y + $hh))
    $p.AddBezier([single]($x - $ww * 0.5), [single]($y + $hh), [single]($x - $ww * 0.5), [single]($y + $hh * 0.72), [single]($x - $ww * 0.18), [single]($y + $hh * 0.35), [single]$x, [single]$y)
    $p.CloseFigure()
    $g.FillPath($b, $p); $g.DrawPath((PenInk), $p); $p.Dispose()
  }
  else {
    Poly $g @($x, ($x + $ww / 2), ($x - $ww / 2)) @($y, ($y + $hh), ($y + $hh)) $b (PenInk)
  }
  $b.Dispose()
}

# Engine bell: throat at top, flared skirt at bottom.
function SprBell($col, $row, $u, $v, $w, $h, $c1 = $LIGHT, $c2 = $DARK, $nozzle = $true) {
  $x = PX $col ($u + $w / 2); $y = PY $row $v; $ww = PW $w; $hh = PH $h
  $throat = $ww * 0.34; $skirt = $ww
  $b = Grad $x $y $ww $hh $c1 $c2 90
  Poly $g @(($x - $throat / 2), ($x + $throat / 2), ($x + $skirt / 2), ($x - $skirt / 2)) `
        @($y, $y, ($y + $hh), ($y + $hh)) $b (PenInk)
  # combustion chamber collar
  $cb = New-Object System.Drawing.SolidBrush($CHAR_L)
  RR $g ($x - $throat * 0.62) ($y - $hh * 0.06) ($throat * 1.24) ($hh * 0.18) 2 $cb (PenInk 1.6)
  $cb.Dispose()
  if ($nozzle) {
    $nb = New-Object System.Drawing.SolidBrush($CHAR)
    Ell $g ($x - $skirt / 2) ($y + $hh - $hh * 0.06) $skirt ($hh * 0.12) $nb (PenInk 1.4)
    $nb.Dispose()
  }
  $b.Dispose()
}

# Flat disc / spacer ring.
function SprDisc($col, $row, $u, $v, $w, $h, $c1 = $MID, $c2 = $DARK) {
  $x = PX $col $u; $y = PY $row $v; $ww = PW $w; $hh = PH $h
  $b = Grad $x $y $ww $hh $c1 $c2 90
  RR $g $x $y $ww $hh ([single]($hh / 2)) $b (PenInk 1.8)
  $b.Dispose()
}

# Dark structural box / panel.
function SprBox($col, $row, $u, $v, $w, $h, $c1 = $CHAR, $c2 = $CHAR_L, $glass = $false) {
  $x = PX $col $u; $y = PY $row $v; $ww = PW $w; $hh = PH $h
  $b = Grad $x $y $ww $hh $c1 $c2 90
  RR $g $x $y $ww $hh 3 $b (PenInk)
  if ($glass) {
    $gb = New-Object System.Drawing.SolidBrush($GLASS)
    RR $g ($x + $ww * 0.18) ($y + $hh * 0.22) ($ww * 0.64) ($hh * 0.34) 2 $gb (PenInk 1.4)
    $gb.Dispose()
  }
  $b.Dispose()
}

# Swept fin (right triangle, hypotenuse on the left).
function SprFin($col, $row, $u, $v, $w, $h, $flip = $false) {
  $x = PX $col $u; $y = PY $row $v; $ww = PW $w; $hh = PH $h
  $b = Grad $x $y $ww $hh ([System.Drawing.Color]::FromArgb(255, 150, 161, 171)) $DARK 90
  if ($flip) { Poly $g @(($x + $ww), $x, ($x + $ww)) @($y, ($y + $hh), ($y + $hh)) $b (PenInk) }
  else { Poly $g @($x, ($x + $ww), $x) @($y, ($y + $hh), ($y + $hh)) $b (PenInk) }
  $b.Dispose()
}

# --- part sprites ------------------------------------------------------------
function SprCapsule($col, $row, $w, $h, $big) {
  $x = PX $col ((1 - $w) / 2); $y = PY $row 0.12; $ww = PW $w; $hh = PH $h
  $b = Grad $x $y $ww $hh $WHITE $STEEL 90
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddBezier([single]($x + $ww / 2), [single]$y, [single]($x + $ww * 0.12), [single]($y + $hh * 0.10), [single]$x, [single]($y + $hh * 0.55), [single]$x, [single]($y + $hh * 0.72))
  $p.AddLine([single]$x, [single]($y + $hh * 0.72), [single]($x + $ww), [single]($y + $hh * 0.72))
  $p.AddBezier([single]($x + $ww), [single]($y + $hh * 0.72), [single]($x + $ww), [single]($y + $hh * 0.55), [single]($x + $ww * 0.88), [single]($y + $hh * 0.10), [single]($x + $ww / 2), [single]$y)
  $p.CloseFigure()
  $g.FillPath($b, $p); $g.DrawPath((PenInk), $p)
  $wb = New-Object System.Drawing.SolidBrush($GLASS)
  $pw = $ww * 0.36; $ph = $hh * 0.16
  if ($big) { $ph = $hh * 0.20 }
  Ell $g ($x + $ww / 2 - $pw / 2) ($y + $hh * 0.30) $pw $ph $wb (PenInk 1.6)
  $wb.Dispose()
  $mb = New-Object System.Drawing.SolidBrush($DARK)
  RR $g $x ($y + $hh * 0.72) $ww ($hh * 0.10) 2 $mb (PenInk 1.5)
  RR $g ($x + $ww * 0.22) ($y + $hh * 0.82) ($ww * 0.56) ($hh * 0.10) 2 $mb (PenInk 1.5)
  $mb.Dispose(); $p.Dispose(); $b.Dispose()
}
function SprProbe($col, $row) {
  SprDisc $col $row 0.10 0.40 0.80 0.22 $MID $DARK
  SprBell $col $row 0.34 0.62 0.32 0.16 $MID $DARK $true
  $pen = PenInk 1.8
  $g.DrawLine($pen, (PX $col 0.50), (PY $row 0.40), (PX $col 0.50), (PY $row 0.16))
  Ell $g (PX $col 0.42) (PY $row 0.08) (PW 0.16) (PH 0.09) (New-Object System.Drawing.SolidBrush($MID)) $pen
  $g.DrawLine($pen, (PX $col 0.50), (PY $row 0.17), (PX $col 0.72), (PY $row 0.24))
  $pen.Dispose()
}
function SprDock($col, $row) {
  $x = PX $col 0.14; $y = PY $row 0.34; $ww = PW 0.72; $hh = PH 0.16
  $b = Grad $x $y $ww $hh $LIGHT $DARK 90
  Ell $g $x $y $ww $hh $b (PenInk)
  $hb = New-Object System.Drawing.SolidBrush($BG)
  Ell $g ($x + $ww * 0.22) ($y + $hh * 0.22) ($ww * 0.56) ($hh * 0.56) $hb (PenInk 1.6)
  $hb.Dispose()
  $cb = New-Object System.Drawing.SolidBrush($CHAR_L)
  for ($i = 0; $i -lt 4; $i++) {
    $cx = $x + $ww * (0.08 + 0.28 * $i); RR $g $cx ($y - $hh * 0.30) ($ww * 0.14) ($hh * 0.34) 2 $cb (PenInk 1.4)
  }
  $cb.Dispose(); $b.Dispose()
  SprCone $col $row 0.40 0.52 0.20 0.20 $MID $DARK $false
}
function SprScience($col, $row) {
  SprBox $col $row 0.10 0.40 0.80 0.44 $WHITE $MID $false
  $pen = PenInk 1.6
  $db = New-Object System.Drawing.SolidBrush($GLASS)
  Ell $g (PX $col 0.26) (PY $row 0.46) (PW 0.48) (PH 0.22) $db $pen
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($DARK)), (PX $col 0.46), (PY $row 0.24), (PW 0.08), (PH 0.18))
  $pen.Dispose(); $db.Dispose()
}
function SprBattery($col, $row) {
  SprBox $col $row 0.22 0.30 0.56 0.50 $GOLD $DARK $false
  $pen = PenInk 1.6
  $g.DrawLine($pen, (PX $col 0.36), (PY $row 0.30), (PX $col 0.36), (PY $row 0.20))
  $g.DrawLine($pen, (PX $col 0.64), (PY $row 0.30), (PX $col 0.64), (PY $row 0.20))
  $pen.Dispose()
  SprDisc $col $row 0.30 0.80 0.40 0.08 $MID $DARK
}
function SprWheelAssembly($col, $row, $kind) {
  $cx = PX $col 0.50; $cy = PY $row 0.50; $r = PW 0.34
  $b = Grad ($cx - $r) ($cy - $r) ($r * 2) ($r * 2) $LIGHT $DARK 45
  Ell $g ($cx - $r) ($cy - $r) ($r * 2) ($r * 2) $b (PenInk 2.2)
  $hub = New-Object System.Drawing.SolidBrush($STEEL)
  Ell $g ($cx - $r * 0.34) ($cy - $r * 0.34) ($r * 0.68) ($r * 0.68) $hub (PenInk 1.8)
  $pen = PenInk 1.6
  if ($kind -eq 'gear') {
    $tb = New-Object System.Drawing.SolidBrush($MID)
    for ($i = 0; $i -lt 10; $i++) {
      $a = $i * [Math]::PI / 5
      $px = $cx + [Math]::Cos($a) * $r; $py = $cy + [Math]::Sin($a) * $r
      $g.FillEllipse($tb, [single]($px - 3), [single]($py - 3), 6, 6)
    }
    $tb.Dispose()
    for ($i = 0; $i -lt 8; $i++) {
      $a = $i * [Math]::PI / 4
      $g.DrawLine($pen, [single]$cx, [single]$cy, [single]($cx + [Math]::Cos($a) * $r * 0.72), [single]($cy + [Math]::Sin($a) * $r * 0.72))
    }
  }
  else {
    $tread = New-Object System.Drawing.Pen($INK, 6.0)
    $g.DrawEllipse($tread, [single]($cx - $r * 0.94), [single]($cy - $r * 0.94), [single]($r * 1.88), [single]($r * 1.88))
    $tread.Dispose()
    for ($i = 0; $i -lt 6; $i++) {
      $a = $i * [Math]::PI / 3
      $g.DrawLine($pen, [single]$cx, [single]$cy, [single]($cx + [Math]::Cos($a) * $r * 0.72), [single]($cy + [Math]::Sin($a) * $r * 0.72))
    }
  }
  $pen.Dispose(); $hub.Dispose(); $b.Dispose()
}
function SprSolar($col, $row) {
  $pen = PenInk 1.8
  $c1 = [System.Drawing.Color]::FromArgb(255, 58, 96, 158)
  $c2 = [System.Drawing.Color]::FromArgb(255, 24, 48, 92)
  $b = Grad (PX $col 0.06) (PY $row 0.34) (PW 0.88) (PH 0.32) $c1 $c2 90
  RR $g (PX $col 0.06) (PY $row 0.34) (PW 0.88) (PH 0.32) 3 $b $pen
  $line = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 150, 200, 255), 1.4)
  for ($i = 1; $i -lt 5; $i++) { $g.DrawLine($line, (PX $col (0.06 + 0.22 * $i)), (PY $row 0.34), (PX $col (0.06 + 0.22 * $i)), (PY $row 0.66)) }
  for ($j = 1; $j -lt 3; $j++) { $g.DrawLine($line, (PX $col 0.06), (PY $row (0.34 + 0.16 * $j)), (PX $col 0.94), (PY $row (0.34 + 0.16 * $j))) }
  $line.Dispose()
  $sb = New-Object System.Drawing.SolidBrush($MID)
  RR $g (PX $col 0.44) (PY $row 0.66) (PW 0.12) (PH 0.22) 2 $sb $pen
  $sb.Dispose(); $b.Dispose(); $pen.Dispose()
}
function SprRcs($col, $row) {
  $pen = PenInk 1.6
  $b = New-Object System.Drawing.SolidBrush($MID)
  RR $g (PX $col 0.34) (PY $row 0.34) (PW 0.32) (PH 0.32) 2 $b $pen
  $b.Dispose()
  SprBox $col $row 0.14 0.30 0.20 0.12 $CHAR $CHAR_L $false
  SprBox $col $row 0.66 0.30 0.20 0.12 $CHAR $CHAR_L $false
  SprBox $col $row 0.30 0.14 0.12 0.18 $CHAR $CHAR_L $false
  SprBox $col $row 0.58 0.68 0.12 0.18 $CHAR $CHAR_L $false
  SprDisc $col $row 0.34 0.78 0.32 0.10 $MID $DARK
  $pen.Dispose()
}
function SprLadder($col, $row) {
  $pen = PenInk 2.0
  $g.DrawLine($pen, (PX $col 0.38), (PY $row 0.10), (PX $col 0.38), (PY $row 0.90))
  $g.DrawLine($pen, (PX $col 0.62), (PY $row 0.10), (PX $col 0.62), (PY $row 0.90))
  $rb = New-Object System.Drawing.Pen($STEEL, 3.2); $rb.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  for ($i = 0; $i -lt 6; $i++) { $y = PY $row (0.18 + 0.14 * $i); $g.DrawLine($rb, (PX $col 0.38), [single]$y, (PX $col 0.62), [single]$y) }
  $rb.Dispose(); $pen.Dispose()
}
function SprTruss($col, $row) {
  $pen = PenInk 2.0
  $b = Grad (PX $col 0.26) (PY $row 0.12) (PW 0.48) (PH 0.76) $WHITE $MID 90
  RR $g (PX $col 0.26) (PY $row 0.12) (PW 0.48) (PH 0.76) 2 $b $pen
  $d = New-Object System.Drawing.Pen($INK_S, 1.6)
  for ($i = 0; $i -lt 5; $i++) {
    $y0 = PY $row (0.16 + 0.15 * $i); $y1 = PY $row (0.16 + 0.15 * ($i + 1))
    $g.DrawLine($d, (PX $col 0.28), ([single]$y0), (PX $col 0.72), ([single]$y1))
    $g.DrawLine($d, (PX $col 0.72), ([single]$y0), (PX $col 0.28), ([single]$y1))
  }
  $d.Dispose(); $pen.Dispose(); $b.Dispose()
}
function SprLegs($col, $row) {
  $pen = PenInk 2.2
  $g.DrawLine($pen, (PX $col 0.50), (PY $row 0.14), (PX $col 0.20), (PY $row 0.78))
  $g.DrawLine($pen, (PX $col 0.50), (PY $row 0.14), (PX $col 0.80), (PY $row 0.78))
  $lb = New-Object System.Drawing.SolidBrush($MID)
  Ell $g (PX $col 0.08) (PY $row 0.74) (PW 0.24) (PH 0.14) $lb $pen
  Ell $g (PX $col 0.68) (PY $row 0.74) (PW 0.24) (PH 0.14) $lb $pen
  $lb.Dispose(); $pen.Dispose()
  SprDisc $col $row 0.34 0.08 0.32 0.10 $LIGHT $DARK
}
function SprChute($col, $row) {
  $pen = PenInk 1.8
  $cx = PX $col 0.50; $cy = PY $row 0.42; $r = PW 0.34
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc([single]($cx - $r), [single]($cy - $r), [single]($r * 2), [single]($r * 2), 180, 180)
  $p.CloseFigure()
  $b = Grad ($cx - $r) ($cy - $r) ($r * 2) ($r * 2) $WHITE $MID 90
  $g.FillPath($b, $p); $g.DrawPath($pen, $p)
  $g.DrawLine($pen, [single]$cx, [single]($cy - $r), [single]$cx, [single]$cy)
  $g.DrawLine($pen, [single]($cx - $r * 0.7), [single]($cy - $r * 0.72), [single]$cx, [single]$cy)
  $g.DrawLine($pen, [single]($cx + $r * 0.7), [single]($cy - $r * 0.72), [single]$cx, [single]$cy)
  $pen.Dispose(); $b.Dispose(); $p.Dispose()
  SprDisc $col $row 0.30 0.62 0.40 0.16 $GOLD $DARK
}
function SprGridFin($col, $row) {
  $pen = PenInk 2.2
  $b = Grad (PX $col 0.24) (PY $row 0.20) (PW 0.52) (PH 0.60) $MID $DARK 45
  RR $g (PX $col 0.24) (PY $row 0.20) (PW 0.52) (PH 0.60) 3 $b $pen
  $d = New-Object System.Drawing.Pen($INK_S, 1.5)
  for ($i = 1; $i -lt 4; $i++) { $g.DrawLine($d, (PX $col (0.24 + 0.13 * $i)), (PY $row 0.20), (PX $col (0.24 + 0.13 * $i)), (PY $row 0.80)) }
  for ($j = 1; $j -lt 5; $j++) { $g.DrawLine($d, (PX $col 0.24), (PY $row (0.20 + 0.12 * $j)), (PX $col 0.76), (PY $row (0.20 + 0.12 * $j))) }
  $d.Dispose(); $pen.Dispose(); $b.Dispose()
}
function SprBooster($col, $row, $big) {
  $w = 0.52; if ($big) { $w = 0.62 }
  SprTank $col $row (0.5 - $w / 2) 0.08 $w 0.58 $WHITE $STEEL
  SprBell $col $row (0.5 - $w * 0.42) 0.66 ($w * 0.84) 0.22 $MID $DARK $true
}
function SprAdapter($col, $row, $short) {
  $h = 0.26; if ($short) { $h = 0.16 }
  $x = PX $col 0.10; $y = PY $row (0.5 - $h / 2); $ww = PW 0.80; $hh = PH $h
  $b = Grad $x $y $ww $hh $MID $DARK 90
  Poly $g @($x, ($x + $ww), ($x + $ww * 0.72), ($x + $ww * 0.28)) @($y, $y, ($y + $hh), ($y + $hh)) $b (PenInk)
  $b.Dispose()
}
function SprRing($col, $row) {
  $pen = PenInk 1.8
  $b = Grad (PX $col 0.10) (PY $row 0.40) (PW 0.80) (PH 0.22) $LIGHT $DARK 90
  Ell $g (PX $col 0.10) (PY $row 0.40) (PW 0.80) (PH 0.22) $b $pen
  $hb = New-Object System.Drawing.SolidBrush($BG)
  Ell $g (PX $col 0.22) (PY $row 0.45) (PW 0.56) (PH 0.12) $hb $pen
  $hb.Dispose(); $b.Dispose(); $pen.Dispose()
}
function SprDecoupler($col, $row, $sep) {
  SprDisc $col $row 0.08 0.42 0.84 0.14 $LIGHT $DARK
  $pen = PenInk 1.6
  $b = New-Object System.Drawing.SolidBrush($GOLD)
  RR $g (PX $col 0.12) (PY $row 0.57) (PW 0.76) (PH 0.05) 1 $b $null
  $b.Dispose()
  if ($sep) {
    $s = New-Object System.Drawing.Pen($STEEL, 3.0)
    for ($i = 0; $i -lt 3; $i++) { $g.DrawLine($s, (PX $col (0.24 + 0.26 * $i)), (PY $row 0.32), (PX $col (0.24 + 0.26 * $i)), (PY $row 0.42)) }
    $s.Dispose()
    SprDisc $col $row 0.14 0.20 0.72 0.10 $MID $DARK
  }
  $pen.Dispose()
}
function SprStrut($col, $row) {
  $pen = PenInk 2.0
  $g.DrawLine($pen, (PX $col 0.30), (PY $row 0.16), (PX $col 0.30), (PY $row 0.84))
  $g.DrawLine($pen, (PX $col 0.70), (PY $row 0.16), (PX $col 0.70), (PY $row 0.84))
  $g.DrawLine($pen, (PX $col 0.30), (PY $row 0.50), (PX $col 0.70), (PY $row 0.50))
  $pen.Dispose()
}
function SprConduit($col, $row) {
  $pen = PenInk 2.0
  $b = New-Object System.Drawing.SolidBrush($STEEL)
  RR $g (PX $col 0.44) (PY $row 0.08) (PW 0.12) (PH 0.84) 3 $b $pen
  $b.Dispose()
  SprDisc $col $row 0.30 0.14 0.40 0.07 $MID $DARK
  SprDisc $col $row 0.30 0.79 0.40 0.07 $MID $DARK
  $pen.Dispose()
}
function SprAntenna($col, $row) {
  $pen = PenInk 2.0
  $g.DrawLine($pen, (PX $col 0.50), (PY $row 0.80), (PX $col 0.50), (PY $row 0.34))
  $db = Grad (PX $col 0.22) (PY $row 0.10) (PW 0.56) (PH 0.24) $LIGHT $DARK 90
  Ell $g (PX $col 0.22) (PY $row 0.10) (PW 0.56) (PH 0.24) $db $pen
  $db.Dispose()
  $mb = New-Object System.Drawing.SolidBrush($CHAR_L)
  RR $g (PX $col 0.38) (PY $row 0.78) (PW 0.24) (PH 0.14) 2 $mb $pen
  $mb.Dispose(); $pen.Dispose()
}

# --- sheet layout ------------------------------------------------------------
# Columns mirror the reference sheet: 0 nose cones & bells, 1 command/avionics,
# 2 tanks & adapters, 3 structural/landing, 4 aerodynamics & boosters.
& {
  SprCapsule 0 0 0.62 0.50 $false
  SprCone    0 1 0.22 0.12 0.56 0.62 $LIGHT $MID $true
  SprCone    0 2 0.10 0.08 0.80 0.74 $WHITE $STEEL $true
  SprCone    0 3 0.14 0.16 0.72 0.62 $MID $DARK $false
  SprBell    0 4 0.30 0.20 0.40 0.50 $LIGHT $DARK $true
  SprBell    0 5 0.20 0.16 0.60 0.60 $LIGHT $DARK $true
  SprBell    0 6 0.14 0.14 0.72 0.70 $MID $CHAR $true
  SprBell    0 7 0.08 0.12 0.84 0.74 $MID $CHAR $true
  SprChute   0 8

  SprCapsule 1 0 0.80 0.44 $true
  SprProbe   1 1
  SprDock    1 2
  SprScience 1 3
  SprBattery 1 4
  SprDisc 1 5 0.26 0.22 0.48 0.56 $LIGHT $STEEL
  SprDisc 1 5 0.20 0.38 0.60 0.12 $MID $DARK
  SprRcs     1 6
  SprSolar   1 7
  SprAntenna 1 8

  SprTank 2 0 0.34 0.14 0.32 0.72 $LIGHT $MID
  SprTank 2 1 0.16 0.30 0.68 0.40 $LIGHT $MID
  SprTank 2 2 0.14 0.18 0.72 0.64 $WHITE $STEEL
  SprTank 2 3 0.06 0.16 0.88 0.68 $WHITE $STEEL
  SprTank 2 4 0.16 0.08 0.68 0.84 $WHITE $STEEL
  SprTank 2 5 0.06 0.06 0.88 0.88 $LIGHT $DARK
  SprConduit 2 6
  SprAdapter 2 7 $false
  SprAdapter 2 8 $true

  SprDecoupler 3 0 $false
  SprDecoupler 3 1 $true
  SprRing    3 2
  SprDisc    3 3 0.10 0.42 0.80 0.16 $LIGHT $DARK
  SprTruss   3 4
  SprStrut   3 5
  SprLadder  3 6
  SprLegs    3 7
  SprWheelAssembly 3 8 'gear'

  SprFin 4 0 0.16 0.16 0.56 0.66 $false
  SprFin 4 1 0.10 0.20 0.34 0.52 $false
  SprFin 4 1 0.56 0.20 0.34 0.52 $true
  SprFin 4 2 0.20 0.24 0.60 0.30 $false
  SprFin 4 2 0.20 0.62 0.60 0.30 $true
  SprGridFin 4 3
  SprBooster 4 6 $false
  SprBooster 4 7 $true
  SprWheelAssembly 4 8 'wheel'
}

# --- save --------------------------------------------------------------------
$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host ("wrote {0} ({1} bytes, {2}x{3}, {4}x{5} cells)" -f $out, (Get-Item $out).Length, $W, $H, $COLS, $ROWS)
