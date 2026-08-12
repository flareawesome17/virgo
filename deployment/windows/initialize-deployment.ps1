[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$RootPath = $PSScriptRoot,
  [switch]$ReconcileImageTag,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'scripts\Virgo.Deployment.psm1'
Import-Module $modulePath -Force

$action = if ($ReconcileImageTag) { 'Reconcile IMAGE_TAG to the inspected running release and initialize deployment state' } else { 'Initialize deployment state from the running production release' }
if (-not $PSCmdlet.ShouldProcess((Join-Path $RootPath 'deployment-state.json'), $action)) {
  return
}

try {
  $state = Initialize-VirgoDeploymentState -RootPath $RootPath -ReconcileImageTag:$ReconcileImageTag -Force:$Force
  Write-Host "Deployment state initialized at $(Join-Path $RootPath 'deployment-state.json')."
  Write-Host "Current successful release: $($state.current)"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
