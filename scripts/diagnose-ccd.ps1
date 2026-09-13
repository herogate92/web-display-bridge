$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root 'native\publish\DisplayHelper.exe'
$out = Join-Path $root 'artifacts\ccd-result.json'
$journal = Join-Path $root 'artifacts\ccd-recovery.json'
New-Item -ItemType Directory -Path (Join-Path $root 'artifacts') -Force | Out-Null
$result = [ordered]@{ time=(Get-Date).ToString('o'); result=$null; error=$null; after=$null }
try {
    if (Test-Path -LiteralPath $journal) { throw 'Existing CCD recovery journal. Do not run again until reviewed.' }
    $targets = @((& $helper list | ConvertFrom-Json) | Where-Object { $_.virtual -and -not $_.primary })
    if ($targets.Count -ne 1) { throw 'Expected exactly one virtual monitor.' }
    $result.result = & $helper ccd-diagnose $targets[0].identity $journal | ConvertFrom-Json
    $result.result | Format-List
} catch { $result.error=$_.Exception.Message; Write-Host $result.error }
finally {
    $result.after = @((& $helper list | ConvertFrom-Json) | Where-Object { $_.virtual -or $_.active } | Select-Object name,virtual,active,bounds,frequency)
    $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $out -Encoding UTF8
    Write-Host ('Saved: ' + $out)
}
