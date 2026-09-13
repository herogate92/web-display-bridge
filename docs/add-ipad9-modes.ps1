param(
    [int]$Width = 0,
    [int]$Height = 0,
    [int]$RefreshRate = 60
)
$ErrorActionPreference = 'Stop'
$configPath = 'C:\VirtualDisplayDriver\vdd_settings.xml'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    if ($Width -gt 0 -or $Height -gt 0) { $arguments += @('-Width', $Width, '-Height', $Height, '-RefreshRate', $RefreshRate) }
    $elevated = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}

Add-Type -AssemblyName System.Windows.Forms
try {
    if (($Width -eq 0) -xor ($Height -eq 0)) { throw '가로와 세로를 모두 입력하세요.' }
    if ($Width -ne 0 -and ($Width -lt 640 -or $Width -gt 3840 -or $Height -lt 480 -or $Height -gt 2160 -or $Width % 2 -ne 0 -or $Height % 2 -ne 0)) {
        throw '해상도는 가로 640~3840, 세로 480~2160 범위의 짝수로 입력하세요.'
    }
    if ($RefreshRate -lt 24 -or $RefreshRate -gt 60) { throw '주사율은 24~60fps 범위로 입력하세요.' }
    if (-not (Test-Path -LiteralPath $configPath)) { throw 'VDD 설정 파일을 찾지 못했습니다: C:\VirtualDisplayDriver\vdd_settings.xml' }
    [xml]$xml = Get-Content -LiteralPath $configPath -Raw
    $resolutions = $xml.SelectSingleNode('/vdd_settings/resolutions')
    $global = $xml.SelectSingleNode('/vdd_settings/global')
    if (-not $resolutions -or -not $global) { throw 'VDD 설정 파일 형식을 확인하지 못했습니다.' }
    $backup = "$configPath.webmonitor-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item -LiteralPath $configPath -Destination $backup
    if ($Width -gt 0) {
        $hasRefreshRate = @($global.SelectNodes('g_refresh_rate') | Where-Object { [int]$_.InnerText -eq $RefreshRate }).Count -gt 0
        if (-not $hasRefreshRate) {
            $refreshNode = $xml.CreateElement('g_refresh_rate'); $refreshNode.InnerText = [string]$RefreshRate; [void]$global.AppendChild($refreshNode)
        }
    }
    $requestedModes = if ($Width -gt 0) {
        @([pscustomobject]@{ Width = $Width; Height = $Height; RefreshRate = $RefreshRate })
    } else {
        @(
            [pscustomobject]@{ Width = 1080; Height = 810; RefreshRate = 30 }
            [pscustomobject]@{ Width = 1440; Height = 1080; RefreshRate = 30 }
            [pscustomobject]@{ Width = 2160; Height = 1620; RefreshRate = 30 }
        )
    }
    foreach ($mode in $requestedModes) {
        $found = @($resolutions.SelectNodes('resolution') | Where-Object { [int]$_.width -eq $mode.Width -and [int]$_.height -eq $mode.Height }).Count -gt 0
        if ($found) { continue }
        $node = $xml.CreateElement('resolution')
        foreach ($field in @(@('width', $mode.Width), @('height', $mode.Height), @('refresh_rate', $mode.RefreshRate))) {
            $child = $xml.CreateElement($field[0]); $child.InnerText = [string]$field[1]; [void]$node.AppendChild($child)
        }
        [void]$resolutions.AppendChild($node)
    }
    $xml.Save($configPath)
    $devices = @(Get-PnpDevice -Class Display -PresentOnly | Where-Object FriendlyName -eq 'Virtual Display Driver')
    if ($devices.Count -ne 1) { throw '설치된 Virtual Display Driver 한 대를 찾지 못했습니다. 설정은 저장했으며 재부팅 후 적용됩니다.' }
    $result = & pnputil.exe /restart-device $devices[0].InstanceId 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "드라이버 재시작에 실패했습니다. PC 재부팅 후 적용됩니다.`n$result" }
    $message = if ($Width -gt 0) { "${Width}×${Height} ${RefreshRate}fps 모드를 추가했습니다." } else { '아이패드 9 해상도를 추가했습니다.' }
    [System.Windows.Forms.MessageBox]::Show("$message`nWebDisplay Bridge에서 다시 확인을 누르세요.`n`n백업: $backup", 'WebDisplay Bridge', 'OK', 'Information') | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'WebDisplay Bridge', 'OK', 'Error') | Out-Null
    exit 1
}
