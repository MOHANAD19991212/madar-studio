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
  '.otf'  = 'font/otf'
  '.ttf'  = 'font/ttf'
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

# Long cache for fingerprint-free static assets, none for markup.
$longCache = @('.otf', '.ttf', '.woff', '.woff2', '.jpg', '.jpeg', '.png',
               '.webp', '.avif', '.svg', '.mp4', '.webm', '.ico')

# Never serve source or repo internals. Without this the server hands out
# serve.ps1 itself, and anything under .git, as plain text.
$blockedExt  = @('.ps1', '.psm1', '.bat', '.cmd', '.sh', '.env', '.log', '.bak')
$blockedPath = @('.git', '.github', 'node_modules')

$rootFull = [IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

    $path = Join-Path $root ($rel -replace '/', '\')
    if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }
    if (-not (Test-Path $path -PathType Leaf) -and -not [IO.Path]::HasExtension($path)) { $path = "$path.html" }

    # Directory-traversal guard. HttpListener already normalises the path and
    # rejects encoded "../", but never rely on the framework alone: resolve the
    # final path and require it to stay inside the site root.
    $inside = $false
    try {
      $full = [IO.Path]::GetFullPath($path)
      $inside = $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)
    } catch { $inside = $false }

    # Source-disclosure guard: reject blocked extensions, dot-files and repo dirs.
    if ($inside) {
      $ext  = [IO.Path]::GetExtension($path).ToLower()
      $name = [IO.Path]::GetFileName($path)
      $tail = $full.Substring($rootFull.Length).ToLower()
      if ($blockedExt -contains $ext) { $inside = $false }
      elseif ($name.StartsWith('.'))  { $inside = $false }
      else {
        foreach ($seg in $blockedPath) {
          if ($tail -like "*\$seg\*" -or $tail -like "*\$seg") { $inside = $false; break }
        }
      }
    }

    if ($inside -and (Test-Path $path -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      else { $ctx.Response.ContentType = 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($path)
      $ctx.Response.StatusCode = 200

      if ($longCache -contains $ext) {
        $ctx.Response.Headers.Add('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      }
    } else {
      $ctx.Response.StatusCode = 404
      $ctx.Response.ContentType = 'text/html; charset=utf-8'
      $bytes = [Text.Encoding]::UTF8.GetBytes($notFound)
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    }

    # Security headers. A static site has no cookies or auth, so the surface is
    # small, but these close off framing, MIME sniffing and referrer leakage.
    # Mirror them in the host config when deploying - GitHub Pages sends none.
    $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
    $ctx.Response.Headers.Add('X-Frame-Options', 'DENY')
    $ctx.Response.Headers.Add('Referrer-Policy', 'strict-origin-when-cross-origin')
    $ctx.Response.Headers.Add('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()')

    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  } catch { }
}
