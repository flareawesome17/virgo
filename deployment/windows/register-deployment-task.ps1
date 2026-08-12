[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$RootPath,
  [string]$TaskName = 'Virgo Production Release Poller',
  [int]$IntervalMinutes = 5,
  [switch]$RunWhetherLoggedOn,
  [switch]$Disable,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RootPath)) { $RootPath = $PSScriptRoot }
if ($IntervalMinutes -lt 1) { throw 'IntervalMinutes must be at least 1.' }

if ($Unregister) {
  if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister Scheduled Task')) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
  }
  return
}

if ($Disable) {
  if ($PSCmdlet.ShouldProcess($TaskName, 'Disable Scheduled Task')) {
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
  }
  return
}

$checkScript = Join-Path ([System.IO.Path]::GetFullPath($RootPath)) 'check-release.ps1'
if (-not (Test-Path -LiteralPath $checkScript -PathType Leaf)) { throw "Polling script not found: $checkScript" }
if (-not (Test-Path -LiteralPath (Join-Path $RootPath 'deployment-state.json') -PathType Leaf)) {
  throw 'deployment-state.json is missing. Run initialize-deployment.ps1 before registering the task.'
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -RootPath "{1}"' -f $checkScript, ([System.IO.Path]::GetFullPath($RootPath))
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory ([System.IO.Path]::GetFullPath($RootPath))
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not $PSCmdlet.ShouldProcess($TaskName, "Register every $IntervalMinutes minutes as $user")) { return }

if ($RunWhetherLoggedOn) {
  $credential = Get-Credential -UserName $user -Message 'Enter the Windows password for the account that owns Docker Desktop and its GHCR login.'
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User $credential.UserName -Password $credential.GetNetworkCredential().Password -RunLevel Highest -Description 'Polls GitHub Releases and safely deploys complete Virgo releases.' -Force | Out-Null
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Polls GitHub Releases and safely deploys complete Virgo releases.' -Force | Out-Null
}

Write-Host "Scheduled Task '$TaskName' registered but has not been run by this script."
Write-Host "Verify Docker Desktop and GHCR access under '$user', then test with: Start-ScheduledTask -TaskName '$TaskName'"
