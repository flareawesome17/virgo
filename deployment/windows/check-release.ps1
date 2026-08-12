[CmdletBinding()]
param(
  [string]$RootPath,
  [string]$Repository = 'flareawesome17/virgo'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RootPath)) { $RootPath = $PSScriptRoot }
$modulePath = Join-Path $PSScriptRoot 'scripts\Virgo.Deployment.psm1'
Import-Module $modulePath -Force

$logsPath = Join-Path $RootPath 'logs'
if (-not (Test-Path -LiteralPath $logsPath -PathType Container)) { [System.IO.Directory]::CreateDirectory($logsPath) | Out-Null }
$pollLog = Join-Path $logsPath 'release-poller.log'

function Write-PollLog([string]$Message, [string]$Level = 'INFO') {
  $line = '{0} [{1}] {2}' -f (Get-Date).ToString('o'), $Level, $Message
  Write-Host $line
  [System.IO.File]::AppendAllText($pollLog, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
}

try {
  $context = New-VirgoContext -RootPath $RootPath -LogPath $null -Adapter $null
  $state = Read-VirgoState (Join-Path $RootPath 'deployment-state.json')
  $latest = Get-LatestVirgoProductionRelease -Context $context -Repository $Repository
  if ($null -eq $latest) {
    Write-PollLog 'No valid published production release was returned by GitHub.' 'WARN'
    exit 0
  }

  $tag = [string]$latest.tag_name
  $decision = Get-VirgoReleaseDecision -State $state -LatestTag $tag
  if (-not $decision.Deploy) {
    Write-PollLog $decision.Reason
    exit 0
  }

  $readiness = Test-VirgoReleaseReady -Context $context -Release $latest -Tag $tag
  if (-not $readiness.Ready) {
    Write-PollLog "Release $tag is published but not deployable yet: $($readiness.Reason)" 'WARN'
    exit 0
  }

  Write-PollLog "Starting automatic deployment of $tag."
  $deployScript = Join-Path $RootPath 'deploy.ps1'
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $deployScript -Tag $tag -RootPath $RootPath -Repository $Repository -Automatic
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    Write-PollLog "Deployment of $tag exited with code $code. See its timestamped deployment log." 'ERROR'
    exit $code
  }
  $after = Read-VirgoState (Join-Path $RootPath 'deployment-state.json')
  if ([string]$after.lastSuccessful -eq $tag) {
    Write-PollLog "Deployment of $tag completed successfully."
  } else {
    Write-PollLog "Deployment process exited without activating $tag; a later poll may retry if it remains eligible." 'WARN'
  }
  exit 0
} catch {
  Write-PollLog $_.Exception.Message 'ERROR'
  exit 1
}
