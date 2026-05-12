param(
  [ValidateSet('oracle', 'concept', 'all')]
  [string]$Kind = 'all'
)

$ErrorActionPreference = 'Stop'

$env:PUBLIC_ORIGIN = 'https://rashin-senjutsu.onrender.com'
$env:THREADS_EXPECTED_USERNAME = 'sensai_teke'
$env:SOCIAL_AUTOMATED_POSTING_ENABLED = 'true'
$env:SOCIAL_PLATFORMS = 'threads'
$env:SOCIAL_PAID_CTA_MODE = 'soft'
$env:SOCIAL_RELEASE_MODE = 'prelaunch'
$env:SOCIAL_BOOTH_ENABLED = 'false'
$env:SOCIAL_THREADS_IMAGE_FALLBACK_TEXT = 'true'
$env:THREADS_CONTAINER_TIMEOUT_MS = '120000'
$env:THREADS_POST_VERIFY_TIMEOUT_MS = '120000'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

$logDir = Join-Path $repo 'data\social-posts\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ('scheduled-post-{0}.log' -f (Get-Date -Format 'yyyy-MM-dd'))

$nodeArgs = @('scripts/social/run-scheduled-posts.js', '--once')
if ($Kind -ne 'all') {
  $nodeArgs += "--only-kind=$Kind"
}

$startedAt = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
Add-Content -Encoding UTF8 -Path $logFile -Value "[$startedAt] START kind=$Kind"

try {
  $output = & node @nodeArgs 2>&1
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Add-Content -Encoding UTF8 -Path $logFile -Value $line
    Write-Output $line
  }
} catch {
  $exitCode = 1
  Add-Content -Encoding UTF8 -Path $logFile -Value ($_ | Out-String)
}

$finishedAt = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
Add-Content -Encoding UTF8 -Path $logFile -Value "[$finishedAt] END kind=$Kind exit=$exitCode"
exit $exitCode
