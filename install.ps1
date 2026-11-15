param([switch]$Yes)
$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/kevinhndz/VisualGit/releases/latest/download'
$asset = 'git-visual-windows-x64.exe'
$binDir = Join-Path $env:LOCALAPPDATA 'Git Visual\bin'
$target = Join-Path $binDir 'git-visual.exe'
$shortcut = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Git Visual.lnk'
Write-Host "Se descargará $asset y SHA256SUMS, se comprobará SHA-256, se instalará en $binDir, se añadirá a PATH de usuario y se creará $shortcut. No se necesita administrador."
if (-not $Yes) {
  $answer = Read-Host '¿Continuar? [s/N]'
  if ($answer -notin @('s', 'S', 'si', 'SI', 'sí', 'SÍ')) { Write-Host 'Cancelado.'; exit 0 }
}
$temp = Join-Path $env:TEMP ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $download = Join-Path $temp $asset
  $sums = Join-Path $temp 'SHA256SUMS'
  Invoke-WebRequest "$repo/$asset" -OutFile $download
  Invoke-WebRequest "$repo/SHA256SUMS" -OutFile $sums
  $line = Get-Content $sums | Where-Object { $_ -match "\s$asset$" } | Select-Object -First 1
  if (-not $line) { throw 'No aparece el checksum del archivo.' }
  $expected = ($line -split '\s+')[0]
  $actual = (Get-FileHash $download -Algorithm SHA256).Hash
  if ($actual -ne $expected) { throw 'El SHA-256 no coincide.' }
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  Copy-Item $download $target -Force
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($current -split ';') -notcontains $binDir) {
    [Environment]::SetEnvironmentVariable('Path', "$current;$binDir", 'User')
  }
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($shortcut)
  $link.TargetPath = $target
  $link.Description = 'Git Visual'
  $link.Save()
  Write-Host 'Instalado. Abre una terminal nueva y ejecuta git visual dentro de tu repositorio.'
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
