$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:WEBMONITOR_DATA_DIR = Join-Path $root 'artifacts\stream-session'
Remove-Item Env:WEBMONITOR_SMOKE -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electron)) { throw 'Electron runtime is missing.' }
# This is the interactive control window, not a background service.
Start-Process -FilePath $electron -ArgumentList ('"' + $root + '"') -WorkingDirectory $root -WindowStyle Normal
