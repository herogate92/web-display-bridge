$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'artifacts\driver-log'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$report = [ordered]@{ time = (Get-Date).ToString('o'); error = $null; restart = $null; probe = $null; logFiles = @(); cleanup = $null }
$config = 'C:\VirtualDisplayDriver\vdd_settings.xml'
$backup = Join-Path $out ('vdd_settings-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.xml')
$changed = $false
$device = $null
try {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator rights are required to restart only the virtual driver.' }
    $devices = @(Get-PnpDevice -Class Display -PresentOnly | Where-Object { $_.FriendlyName -eq 'Virtual Display Driver' })
    if ($devices.Count -ne 1) { throw 'Expected exactly one Virtual Display Driver; nothing was changed.' }
    $device = $devices[0]
    $hardware = Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds'
    if (@($hardware.Data | Where-Object { $_ -ieq 'Root\MttVDD' -or $_ -ieq 'MttVDD' }).Count -eq 0) { throw 'Unexpected virtual driver hardware ID; nothing was changed.' }
    $before = @((& (Join-Path $root 'native\publish\DisplayHelper.exe') list | ConvertFrom-Json) | Where-Object virtual)
    if (@($before | Where-Object active).Count -gt 0) { throw 'Virtual display is already active. No restart performed.' }
    Copy-Item -LiteralPath $config -Destination $backup
    [xml]$xml = Get-Content -LiteralPath $config -Raw
    $node = $xml.SelectSingleNode('/vdd_settings/options/logging')
    if (-not $node) { throw 'Unrecognized driver configuration schema; nothing was changed.' }
    $node.InnerText = 'true'
    $debug = $xml.SelectSingleNode('/vdd_settings/options/debuglogging')
    if ($debug) { $debug.InnerText = 'true' }
    $changed = $true
    $xml.Save($config)
    $report.restart = (& pnputil.exe /restart-device $device.InstanceId 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Virtual driver restart failed.' }
    Start-Sleep -Seconds 3
    & (Join-Path $root 'scripts\diagnose-display.ps1') | Out-File -LiteralPath (Join-Path $out 'diagnostic-output.txt') -Encoding utf8
    $report.probe = Get-Content -LiteralPath (Join-Path $root 'artifacts\display-diagnostic.json') -Raw | ConvertFrom-Json
    Start-Sleep -Seconds 2
    $logs = @(Get-ChildItem -LiteralPath 'C:\VirtualDisplayDriver\Logs' -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-5) })
    foreach ($log in $logs) {
        Get-Content -LiteralPath $log.FullName -Tail 2500 | Set-Content -LiteralPath (Join-Path $out $log.Name) -Encoding utf8
        $report.logFiles += $log.Name
    }
    Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=(Get-Date).AddMinutes(-5); Level=2,3} -MaxEvents 30 -ErrorAction SilentlyContinue |
        Select-Object TimeCreated,ProviderName,Id,Message | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $out 'system-events.json') -Encoding utf8
} catch { $report.error = $_.Exception.Message }
finally {
    if ($changed) {
        try {
            Copy-Item -LiteralPath $backup -Destination $config -Force
            # Undo only a diagnostic activation, then restore the original logging configuration.
            $journal = Join-Path $root 'artifacts\display-diagnostic-recovery.json'
            if (Test-Path -LiteralPath $journal) {
                $recovery = & (Join-Path $root 'native\publish\DisplayHelper.exe') restore $journal | ConvertFrom-Json
                if ($recovery.error) { throw $recovery.error }
            }
            $report.cleanup = (& pnputil.exe /restart-device $device.InstanceId 2>&1 | Out-String)
            if ($LASTEXITCODE -ne 0) { throw 'Original settings restored on disk; driver restart needs attention.' }
        } catch { $report.cleanup = $_.Exception.Message }
    }
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
}
