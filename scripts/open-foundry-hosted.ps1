$ErrorActionPreference = 'Stop'
$hostedRoot = Split-Path -Parent $PSScriptRoot
$hostedKey = Join-Path $hostedRoot '.superpowers/sdd/2026-09-19-foundry-edge-widget/secrets/vps-admin-key.txt'
if (-not (Test-Path -LiteralPath $hostedKey)) { throw 'The hosted administrator key is not installed on this PC.' }
Write-Host 'Hosted Foundry Edge administration'
Write-Host ('Administrator key: ' + (Get-Content -LiteralPath $hostedKey -Raw).Trim())
Write-Host 'Sign in with this key, select a player, and create a pairing code for their device.'
Start-Process 'https://edge.foundry.jewinashoe.org/admin'
