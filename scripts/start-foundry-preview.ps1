param(
  [string]$SecretFile,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$previewRoot = Split-Path -Parent $PSScriptRoot
if (-not $SecretFile) {
  $SecretFile = Join-Path $previewRoot '.superpowers/sdd/2026-09-19-foundry-edge-widget/secrets/test-accounts.json'
}
if (-not (Test-Path -LiteralPath $SecretFile)) { throw 'The local test-world secret file is missing. Configure the test service account first.' }
$previewRuntime = Join-Path (Split-Path -Parent $SecretFile) 'preview-runtime'
$previewNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$previewNode = if ($previewNodeCommand) { $previewNodeCommand.Source } else { Join-Path $env:TEMP 'xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe' }
if (-not (Test-Path -LiteralPath $previewNode)) { throw 'Install Node.js 24 or later, then run this launcher again.' }
$previewListener = Get-NetTCPConnection -LocalPort 8791 -State Listen -ErrorAction SilentlyContinue
if (-not $previewListener) {
  New-Item -ItemType Directory -Path $previewRuntime -Force | Out-Null
  Start-Process -FilePath $previewNode -ArgumentList @('foundry-edge-connector/src/preview.js', ('"' + $SecretFile + '"'), ('"' + $previewRuntime + '"')) -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewRuntime 'output.log') -RedirectStandardError (Join-Path $previewRuntime 'error.log')
}
$previewReady = Join-Path $previewRuntime 'preview-ready.json'
Write-Host 'Opening the live test-world preview. First pairing may take up to a minute.'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:8791' }
for ($previewAttempt = 0; $previewAttempt -lt 60; $previewAttempt++) {
  if (Test-Path -LiteralPath $previewReady) {
    $previewInfo = Get-Content -LiteralPath $previewReady -Raw | ConvertFrom-Json
    if ($previewInfo.expires -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
      Write-Host ('Pairing code (10 minutes): ' + $previewInfo.code)
      return
    }
  }
  Start-Sleep -Seconds 1
}
Write-Host 'No fresh pairing invitation is available. If already paired, the preview still works. Otherwise check the runtime log or restart the preview.'
