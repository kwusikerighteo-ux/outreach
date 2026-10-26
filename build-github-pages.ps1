# Rebuilds the "github-pages" folder (what you upload to GitHub) from the working files,
# with the sheet ID and API key removed so they never end up in the public repository.
# Run: right-click -> Run with PowerShell, or: powershell -ExecutionPolicy Bypass -File build-github-pages.ps1

$root = $PSScriptRoot
$out = Join-Path $root 'github-pages'
$utf8 = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force (Join-Path $out 'mobile-app\icons') | Out-Null
Copy-Item (Join-Path $root 'mobile-app\icons\*') (Join-Path $out 'mobile-app\icons') -Force
Copy-Item (Join-Path $root 'mobile-app\manifest.webmanifest'), (Join-Path $root 'mobile-app\sw.js') (Join-Path $out 'mobile-app') -Force
Copy-Item (Join-Path $root 'unibox-core.js') $out -Force

foreach ($f in @('index.html', 'mobile-app\index.html')) {
  $text = [IO.File]::ReadAllText((Join-Path $root $f))
  $text = [regex]::Replace($text, "(sheetId|apiKey|hubUrl|hubSecret): '[^']*'", "`$1: ''")
  [IO.File]::WriteAllText((Join-Path $out $f), $text, $utf8)
}

$leaks = Get-ChildItem $out -Recurse -File | Select-String -Pattern 'AIza[0-9A-Za-z_-]{20,}'
if ($leaks) { Write-Warning "An API key is still present in: $($leaks.Path -join ', ')" } else { Write-Output "github-pages is ready to upload (no keys inside)." }
