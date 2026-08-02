# Madar Studio - simple local web server (no Node, no Python needed)
# Run:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open:  http://localhost:5177/
#
# NOTE: this file is intentionally ASCII-only so Windows PowerShell 5.1
#       parses it correctly regardless of console code page.

param([int]$Port = 5177)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try { $listener.Start() }
catch {
  Write-Host "Could not bind port $Port. Try another one:  -Port 5178" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  Madar is running at:  http://localhost:$Port/" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.avif' = 'image/avif'
  '.woff2'= 'font/woff2'
  '.woff' = 'font/woff'
  '.ico'  = 'image/x-icon'
  '.mp4'  = 'video/mp4'
  '.webm' = 'video/webm'
}

# 404 body written with HTML entities so the source stays ASCII
$notFound = '<!doctype html><meta charset="utf-8"><title>404</title>' +
            '<body style="font:500 2rem system-ui;padding:3rem;direction:rtl">' +
            '&#1636;&#1632;&#1636; &#8212; ' +
            '&#1575;&#1604;&#1589;&#1601;&#1581;&#1577; &#1594;&#1610;&#1585; ' +
            '&#1605;&#1608;&#1580;&#1608;&#1583;&#1577;</body>'

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

    $path = Join-Path $root ($rel -replace '/', '\')
    if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }
    if (-not (Test-Path $path -PathType Leaf) -and -not [IO.Path]::HasExtension($path)) { $path = "$path.html" }

    if (Test-Path $path -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      else { $ctx.Response.ContentType = 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($path)
      $ctx.Response.StatusCode = 200
    } else {
      $ctx.Response.StatusCode = 404
      $ctx.Response.ContentType = 'text/html; charset=utf-8'
      $bytes = [Text.Encoding]::UTF8.GetBytes($notFound)
    }

    $ctx.Response.Headers.Add('Cache-Control', 'no-cache, no-store')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  } catch { }
}
