param([string]$Archive)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$lock = Get-Content -LiteralPath (Join-Path $workspace 'driver.lock.json') -Raw | ConvertFrom-Json
if (-not $Archive) { $Archive = Join-Path $workspace ('.cache/driver/' + $lock.driver.name) }
$actual = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $lock.driver.sha256) { throw 'Driver ZIP SHA-256 mismatch. Do not install.' }
$output = Join-Path $workspace '.cache/driver/verified'
Expand-Archive -LiteralPath $Archive -DestinationPath $output -Force
$signatures = @(Get-ChildItem -LiteralPath $output -Recurse -File | Where-Object { $_.Extension -in '.cat','.dll','.sys','.exe' } | ForEach-Object {
    $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
    [pscustomobject]@{ File = $_.Name; Status = [string]$signature.Status; Signer = $signature.SignerCertificate.Subject; Thumbprint = $signature.SignerCertificate.Thumbprint }
})
$signatures | Format-Table -AutoSize
$catalogs = @($signatures | Where-Object { $_.File -like '*.cat' })
if ($catalogs.Count -eq 0 -or @($catalogs | Where-Object { $_.Status -ne 'Valid' -or $_.Thumbprint -ne $lock.catalogSignerThumbprint }).Count -ne 0) {
    throw 'Pinned catalog signature could not be verified. Installation is not verified on this machine.'
}
Write-Output 'Pinned ZIP hash and SignPath catalog signature verified. Driver installation and catalog membership are enforced separately by Windows PnP.'
