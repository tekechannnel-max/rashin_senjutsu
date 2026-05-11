param(
  [ValidateSet('oracle', 'concept', 'all')]
  [string]$Kind = 'all'
)

$ErrorActionPreference = 'Stop'

$env:SOCIAL_AUTOMATED_POSTING_ENABLED = 'true'
$env:SOCIAL_PLATFORMS = 'threads'
$env:SOCIAL_PAID_CTA_MODE = 'soft'
$env:SOCIAL_RELEASE_MODE = 'prelaunch'
$env:SOCIAL_BOOTH_ENABLED = 'false'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

$nodeArgs = @('scripts/social/run-scheduled-posts.js', '--once')
if ($Kind -ne 'all') {
  $nodeArgs += "--only-kind=$Kind"
}

& node @nodeArgs
exit $LASTEXITCODE
