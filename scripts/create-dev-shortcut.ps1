param(
    [string]$OutputDir = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $projectRoot 'WebDisplayBridge-Dev.cmd'
$electron = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path -LiteralPath $launcher)) { throw "Development launcher not found: $launcher" }
if (-not $OutputDir -or -not (Test-Path -LiteralPath $OutputDir -PathType Container)) {
    throw "Desktop folder not found: $OutputDir"
}

$shortcutPath = Join-Path $OutputDir 'WebDisplay Bridge (Dev).lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Build and run WebDisplay Bridge from local source'
if (Test-Path -LiteralPath $electron) { $shortcut.IconLocation = "$electron,0" }
$shortcut.Save()

if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'Shortcut was not created.' }
Write-Output "Created: $shortcutPath"
