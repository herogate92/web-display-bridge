param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 4)]
    [int]$Count
)

$ErrorActionPreference = 'Stop'
$configPath = 'C:\VirtualDisplayDriver\vdd_settings.xml'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())

if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Count', $Count)
    $elevated = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}

Add-Type -AssemblyName System.Windows.Forms
$backup = $null
try {
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw 'VDD 설정 파일을 찾지 못했습니다: C:\VirtualDisplayDriver\vdd_settings.xml'
    }
    [xml]$xml = Get-Content -LiteralPath $configPath -Raw
    $countNode = $xml.SelectSingleNode('/vdd_settings/monitors/count')
    if (-not $countNode) { throw 'VDD 모니터 수 설정을 찾지 못했습니다.' }
    if ([int]$countNode.InnerText -eq $Count) { exit 0 }

    $backup = "$configPath.webmonitor-count-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item -LiteralPath $configPath -Destination $backup
    $countNode.InnerText = [string]$Count
    $xml.Save($configPath)

    $devices = @(Get-PnpDevice -Class Display -PresentOnly | Where-Object FriendlyName -eq 'Virtual Display Driver')
    if ($devices.Count -ne 1) { throw '설치된 Virtual Display Driver를 고유하게 찾지 못했습니다.' }
    $result = & pnputil.exe /restart-device $devices[0].InstanceId 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "드라이버 재시작 실패: $result" }

    [System.Windows.Forms.MessageBox]::Show(
        "가상 모니터 수를 $Count 대로 변경했습니다.",
        'WebDisplay Bridge',
        'OK',
        'Information'
    ) | Out-Null
} catch {
    if ($backup -and (Test-Path -LiteralPath $backup)) {
        Copy-Item -LiteralPath $backup -Destination $configPath -Force
        $devices = @(Get-PnpDevice -Class Display -PresentOnly | Where-Object FriendlyName -eq 'Virtual Display Driver')
        if ($devices.Count -eq 1) { & pnputil.exe /restart-device $devices[0].InstanceId | Out-Null }
    }
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'WebDisplay Bridge', 'OK', 'Error') | Out-Null
    exit 1
}
