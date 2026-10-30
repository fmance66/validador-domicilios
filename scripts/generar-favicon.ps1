# Genera public/favicon.ico (16, 32 y 48 px) con el mismo dibujo que public/icono.svg: GDI+ no
# lee SVG, así que las formas se repiten acá. Si se cambia el SVG, actualizar este script.
#
# Uso: powershell -File scripts/generar-favicon.ps1

Add-Type -AssemblyName System.Drawing

$azul = [System.Drawing.Color]::FromArgb(0x0d, 0x65, 0x8b)
$salida = Join-Path $PSScriptRoot '..\public\favicon.ico'

function Dibujar([int]$tamano) {
  $bmp = New-Object System.Drawing.Bitmap $tamano, $tamano
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.ScaleTransform($tamano / 512, $tamano / 512)

  # fondo: cuadrado con esquinas redondeadas (rx 112)
  $fondo = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 224
  $fondo.AddArc(0, 0, $d, $d, 180, 90)
  $fondo.AddArc(512 - $d, 0, $d, $d, 270, 90)
  $fondo.AddArc(512 - $d, 512 - $d, $d, $d, 0, 90)
  $fondo.AddArc(0, 512 - $d, $d, $d, 90, 90)
  $fondo.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $azul), $fondo)

  # pin: círculo de radio 120 centrado en (256, 208) que termina en punta en (256, 432)
  $pin = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pin.AddArc(136, 88, 240, 240, 180, 180)
  $pin.AddBezier(376, 208, 376, 302, 256, 432, 256, 432)
  $pin.AddBezier(256, 432, 256, 432, 136, 302, 136, 208)
  $pin.CloseFigure()
  $g.FillPath([System.Drawing.Brushes]::White, $pin)

  # tilde
  $lapiz = New-Object System.Drawing.Pen $azul, 34
  $lapiz.StartCap = 'Round'; $lapiz.EndCap = 'Round'; $lapiz.LineJoin = 'Round'
  $g.DrawLines($lapiz, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF 200, 210),
    (New-Object System.Drawing.PointF 240, 250),
    (New-Object System.Drawing.PointF 312, 174)))

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , $ms.ToArray()
}

# .ico con imágenes PNG adentro (válido desde Windows Vista y en todos los navegadores)
$tamanos = 16, 32, 48
$imagenes = $tamanos | ForEach-Object { , (Dibujar $_) }
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ms
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$tamanos.Count)
$offset = 6 + 16 * $tamanos.Count
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $w.Write([byte]$tamanos[$i]); $w.Write([byte]$tamanos[$i]); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$imagenes[$i].Length); $w.Write([uint32]$offset)
  $offset += $imagenes[$i].Length
}
foreach ($img in $imagenes) { $w.Write($img) }
[System.IO.File]::WriteAllBytes($salida, $ms.ToArray())
Write-Output "Generado: $((Resolve-Path $salida).Path)"
