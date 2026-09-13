$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root 'native\publish\DisplayHelper.exe'
$journal = Join-Path $root 'artifacts\display-diagnostic-recovery.json'
$report = Join-Path $root 'artifacts\display-diagnostic.json'
New-Item -ItemType Directory -Path (Join-Path $root 'artifacts') -Force | Out-Null
$result = [ordered]@{ time = (Get-Date).ToString('o'); probe = $null; activation = $null; after = $null; error = $null }
try {
    $probe = & $helper probe | ConvertFrom-Json
    $result.probe = $probe
    if (@($probe | Where-Object { $_.control -and $_.testCode -eq 0 }).Count -eq 0) {
        throw 'The unchanged physical display checks also failed. No display settings were changed.'
    }
    if (Test-Path -LiteralPath $journal) {
        $restore = & $helper restore $journal | ConvertFrom-Json
        if ($restore.error) { throw $restore.error }
    }
    $targets = @((& $helper list | ConvertFrom-Json) | Where-Object { $_.virtual -and -not $_.primary })
    if ($targets.Count -ne 1) { throw 'Exactly one virtual display is required. No physical display will be changed.' }
    $result.activation = & $helper activate $targets[0].identity 1920 1080 60 $journal | ConvertFrom-Json
    if ($result.activation.error) { throw $result.activation.error }
    Write-Host 'Virtual display activated: 1920 x 1080 at 60 Hz.' -ForegroundColor Green
} catch {
    $result.error = $_.Exception.Message
    Write-Host $result.error -ForegroundColor Yellow
    if (Test-Path -LiteralPath $journal) {
        $result['recovery'] = & $helper restore $journal | ConvertFrom-Json
    }
} finally {
    $result.after = @((& $helper list | ConvertFrom-Json) | Select-Object name,virtual,active,bounds,frequency)
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $report -Encoding UTF8
    Write-Host ('Diagnostic report saved: ' + $report)
}
