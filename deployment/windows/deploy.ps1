[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [string]$RootPath = $PSScriptRoot,
  [string]$Repository = 'flareawesome17/virgo',
  [switch]$AllowDowngrade,
  [switch]$ForceRetry,
  [switch]$Automatic,
  [int]$HealthTimeoutSeconds = 120,
  [int]$HealthPollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'scripts\Virgo.Deployment.psm1'
Import-Module $modulePath -Force

try {
  $result = Invoke-VirgoDeployment `
    -Tag $Tag `
    -RootPath $RootPath `
    -Repository $Repository `
    -AllowDowngrade:$AllowDowngrade `
    -ForceRetry:$ForceRetry `
    -DryRun:$WhatIfPreference `
    -Source $(if ($Automatic) { 'automatic' } else { 'manual' }) `
    -HealthTimeoutSeconds $HealthTimeoutSeconds `
    -HealthPollSeconds $HealthPollSeconds

  if ($result.LogPath) { Write-Host "Deployment log: $($result.LogPath)" }
  exit [int]$result.ExitCode
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
