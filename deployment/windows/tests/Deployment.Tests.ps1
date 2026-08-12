$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\Virgo.Deployment.psm1'
Import-Module $modulePath -Force

$script:Passed = 0
$script:Failed = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-Test([string]$Name, [scriptblock]$Test) {
  try {
    & $Test
    $script:Passed++
    Write-Host "PASS $Name" -ForegroundColor Green
  } catch {
    $script:Failed++
    Write-Host "FAIL $Name - $($_.Exception.Message)" -ForegroundColor Red
  }
}

function New-TestRoot([string]$CurrentTag = 'v1.0.1') {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ('virgo-deploy-test-' + [guid]::NewGuid().ToString('N'))
  [System.IO.Directory]::CreateDirectory($root) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $root 'backups')) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $root 'logs')) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $root 'docker-compose.prod.yml'), "services:`n  api: {}`n")
  $envText = @"
IMAGE_TAG=$CurrentTag
POSTGRES_USER=virgo
POSTGRES_DB=virgo_prod
API_PORT=3001
PUBLIC_API_URL=https://api.virgo.ph
WEB_APP_URL=https://web.virgo.ph
PUBLIC_SITE_URL=https://virgo.ph
UNRELATED_VALUE=preserve-me
"@
  [System.IO.File]::WriteAllText((Join-Path $root '.env'), $envText)
  $state = [ordered]@{
    schemaVersion = 1
    current = $CurrentTag
    previous = $null
    lastSuccessful = $CurrentTag
    lastAttempted = $CurrentTag
    status = 'healthy'
    lastAttemptStatus = 'initialized'
    deployedAt = '2026-08-13T00:00:00+08:00'
    releaseCommit = $null
    backupPath = $null
    deploymentDurationSeconds = 0
    failureReason = $null
    healthCheckResults = @()
    failedReleases = [ordered]@{}
  }
  Save-VirgoState (Join-Path $root 'deployment-state.json') $state
  return $root
}

function New-TestAdapter {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$CurrentTag = 'v1.0.1',
    [string]$TargetTag = 'v1.0.2',
    [switch]$MissingImage,
    [switch]$MissingMarker,
    [switch]$DigestMismatch,
    [switch]$BackupFailure,
    [switch]$MigrationFailure,
    [switch]$TargetHealthFailure
  )
  $behavior = @{
    Root = $Root
    RunningTag = $CurrentTag
    TargetTag = $TargetTag
    MissingImage = [bool]$MissingImage
    MissingMarker = [bool]$MissingMarker
    DigestMismatch = [bool]$DigestMismatch
    BackupFailure = [bool]$BackupFailure
    MigrationFailure = [bool]$MigrationFailure
    TargetHealthFailure = [bool]$TargetHealthFailure
    Trace = New-Object System.Collections.ArrayList
    Tick = 0
  }

  $run = {
    param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
    [void]$behavior.Trace.Add(($FilePath + ' ' + ($Arguments -join ' ')))
    $joined = $Arguments -join ' '

    if ($joined -like 'buildx imagetools inspect*') {
      if ($behavior.MissingImage -and $joined -like '*virgo-dashboard*') { return [pscustomobject]@{ ExitCode = 1; Output = @('manifest unknown') } }
      $digest = if ($joined -like '*virgo-api*') { 'sha256:' + ('a' * 64) } elseif ($joined -like '*virgo-web*') { 'sha256:' + ('b' * 64) } elseif ($behavior.DigestMismatch) { 'sha256:' + ('d' * 64) } else { 'sha256:' + ('c' * 64) }
      $manifest = [ordered]@{ digest = $digest } | ConvertTo-Json
      return [pscustomobject]@{ ExitCode = 0; Output = @($manifest) }
    }

    if ($Arguments.Count -ge 4 -and $Arguments[0] -eq 'inspect' -and $Arguments[2] -eq '--format') {
      $container = $Arguments[1]
      if ($container -eq 'virgo-cloudflared') { return [pscustomobject]@{ ExitCode = 0; Output = @('running|none|cloudflare/cloudflared:latest') } }
      if ($container -eq 'virgo-postgres') { return [pscustomobject]@{ ExitCode = 0; Output = @('running|healthy|postgres:17-alpine') } }
      $service = $container.Substring('virgo-'.Length)
      $health = 'healthy'
      if ($behavior.TargetHealthFailure -and $behavior.RunningTag -eq $behavior.TargetTag -and $service -eq 'api') { $health = 'unhealthy' }
      return [pscustomobject]@{ ExitCode = 0; Output = @("running|$health|ghcr.io/flareawesome17/virgo-${service}:$($behavior.RunningTag)") }
    }

    if ($joined -like 'exec virgo-postgres pg_dump*') {
      if ($behavior.BackupFailure) { return [pscustomobject]@{ ExitCode = 1; Output = @('simulated pg_dump failure') } }
      return [pscustomobject]@{ ExitCode = 0; Output = @() }
    }
    if ($joined -like 'exec virgo-postgres test*') { return [pscustomobject]@{ ExitCode = 0; Output = @() } }
    if ($Arguments.Count -gt 0 -and $Arguments[0] -eq 'cp') {
      $destination = $Arguments[-1]
      [System.IO.File]::WriteAllBytes($destination, [byte[]](1, 2, 3, 4))
      return [pscustomobject]@{ ExitCode = 0; Output = @() }
    }
    if ($joined -like 'exec virgo-postgres rm*') { return [pscustomobject]@{ ExitCode = 0; Output = @() } }

    if ($joined -like '*migrate-cli.js*') {
      if ($behavior.MigrationFailure) { return [pscustomobject]@{ ExitCode = 1; Output = @('simulated migration failure') } }
      return [pscustomobject]@{ ExitCode = 0; Output = @('No pending migrations') }
    }

    if ($joined -like 'compose * up *') {
      $tagLine = Get-Content -LiteralPath (Join-Path $behavior.Root '.env') | Where-Object { $_ -match '^IMAGE_TAG=' }
      $behavior.RunningTag = ($tagLine -replace '^IMAGE_TAG=', '')
      return [pscustomobject]@{ ExitCode = 0; Output = @('containers recreated') }
    }

    if ($joined -like 'compose * pull *') { return [pscustomobject]@{ ExitCode = 0; Output = @('images pulled') } }
    if ($joined -like 'image inspect *') { return [pscustomobject]@{ ExitCode = 0; Output = @('{}') } }
    if ($joined -like 'exec virgo-web node*' -or $joined -like 'exec virgo-dashboard node*') { return [pscustomobject]@{ ExitCode = 0; Output = @('200') } }
    return [pscustomobject]@{ ExitCode = 0; Output = @() }
  }.GetNewClosure()

  $request = {
    param([string]$Uri, [hashtable]$Headers, [int]$TimeoutSeconds)
    if ($Uri -like 'https://api.github.com/*/releases/tags/*') {
      $assets = if ($behavior.MissingMarker) { @() } else { @([ordered]@{ name = "virgo-deployable-$($behavior.TargetTag).json"; url = 'https://api.github.test/assets/deployable-marker' }) }
      $body = [ordered]@{ tag_name = $behavior.TargetTag; draft = $false; prerelease = $false; published_at = '2026-08-13T00:00:00Z'; target_commitish = 'abc123'; assets = $assets } | ConvertTo-Json -Depth 5
      return [pscustomobject]@{ Success = $true; StatusCode = 200; Body = $body; Error = $null }
    }
    if ($Uri -eq 'https://api.github.test/assets/deployable-marker') {
      $body = [ordered]@{
        tag = $behavior.TargetTag
        images = [ordered]@{
          api = 'sha256:' + ('a' * 64)
          web = 'sha256:' + ('b' * 64)
          dashboard = 'sha256:' + ('c' * 64)
        }
      } | ConvertTo-Json -Depth 5
      return [pscustomobject]@{ Success = $true; StatusCode = 200; Body = $body; Error = $null }
    }
    if ($Uri -like 'http://127.0.0.1:*/health/ready') {
      return [pscustomobject]@{ Success = $true; StatusCode = 200; Body = '{"status":"ready","database":"ok"}'; Error = $null }
    }
    if ($Uri -like '*/health/live') {
      return [pscustomobject]@{ Success = $true; StatusCode = 200; Body = '{"status":"ok"}'; Error = $null }
    }
    return [pscustomobject]@{ Success = $true; StatusCode = 200; Body = '<html>ok</html>'; Error = $null }
  }.GetNewClosure()

  $now = {
    $behavior.Tick++
    return [datetimeoffset]::Parse('2026-08-13T00:00:00+08:00').AddSeconds($behavior.Tick)
  }.GetNewClosure()
  $sleep = { param([int]$Seconds) $behavior.Tick += $Seconds }.GetNewClosure()

  return [pscustomobject]@{
    Adapter = @{ Run = $run; Request = $request; Now = $now; Sleep = $sleep }
    Behavior = $behavior
  }
}

function Remove-TestRoot([string]$Root) {
  if ($Root -and (Test-Path -LiteralPath $Root)) { Remove-Item -LiteralPath $Root -Recurse -Force }
}

Invoke-Test 'entry scripts resolve omitted RootPath after PowerShell 5.1 parameter binding' {
  $windowsRoot = Split-Path -Parent $PSScriptRoot
  $entryScripts = @(
    'deploy.ps1',
    'check-release.ps1',
    'initialize-deployment.ps1',
    'register-deployment-task.ps1',
    'set-github-token.ps1'
  )
  foreach ($name in $entryScripts) {
    $content = [System.IO.File]::ReadAllText((Join-Path $windowsRoot $name))
    Assert-True ($content -notmatch '\[string\]\$RootPath\s*=') "$name must not evaluate PSScriptRoot as a parameter default"
    Assert-True ($content -match 'IsNullOrWhiteSpace\(\$RootPath\).*\$RootPath\s*=\s*\$PSScriptRoot') "$name must resolve an omitted RootPath after parameter binding"
  }

  $setTokenOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $windowsRoot 'set-github-token.ps1') -WhatIf 2>&1)
  Assert-True ($LASTEXITCODE -eq 0) "set-github-token.ps1 default RootPath failed: $($setTokenOutput -join ' ')"
  Assert-True (($setTokenOutput -join ' ') -like "*$windowsRoot*") 'set-github-token.ps1 must resolve RootPath to its own directory'

  $initializeOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $windowsRoot 'initialize-deployment.ps1') -WhatIf 2>&1)
  Assert-True ($LASTEXITCODE -eq 0) "initialize-deployment.ps1 default RootPath failed: $($initializeOutput -join ' ')"
  Assert-True (($initializeOutput -join ' ') -like "*$windowsRoot*") 'initialize-deployment.ps1 must resolve RootPath to its own directory'
}

Invoke-Test 'octet-stream release marker bytes are decoded as UTF-8 JSON' {
  $module = Get-Module -Name 'Virgo.Deployment'
  Assert-True ($null -ne $module) 'deployment module must be loaded'
  $result = & $module {
    $expected = '{"message":"' + [char]0x2713 + '"}'
    [pscustomobject]@{
      Expected = $expected
      Bytes = ConvertTo-VirgoResponseBody ([System.Text.Encoding]::UTF8.GetBytes($expected))
      Text = ConvertTo-VirgoResponseBody $expected
      Empty = ConvertTo-VirgoResponseBody $null
    }
  }
  Assert-True ($result.Bytes -eq $result.Expected) 'byte-array response content must be decoded as UTF-8'
  Assert-True ($result.Text -eq $result.Expected) 'text response content must remain unchanged'
  Assert-True ($result.Empty -eq '') 'null response content must become an empty body'
  Assert-True ($null -ne ($result.Bytes | ConvertFrom-Json)) 'decoded byte-array response must remain valid JSON'
}

Invoke-Test 'targeted IMAGE_TAG update supports CRLF and preserves unrelated env lines' {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) ('virgo-env-test-' + [guid]::NewGuid().ToString('N'))
  [System.IO.Directory]::CreateDirectory($root) | Out-Null
  try {
    $module = Get-Module -Name 'Virgo.Deployment'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    foreach ($case in @(
      [pscustomobject]@{ Name = 'crlf'; NewLine = "`r`n" },
      [pscustomobject]@{ Name = 'lf'; NewLine = "`n" }
    )) {
      $path = Join-Path $root ('.env.' + $case.Name)
      $original = @('POSTGRES_DB=virgo_prod', 'IMAGE_TAG=v1.0.0', 'UNRELATED_VALUE=preserve-me', '') -join $case.NewLine
      $expected = @('POSTGRES_DB=virgo_prod', 'IMAGE_TAG=v1.0.1', 'UNRELATED_VALUE=preserve-me', '') -join $case.NewLine
      [System.IO.File]::WriteAllText($path, $original, $utf8)
      & $module {
        param($EnvPath)
        Set-VirgoImageTag -EnvPath $EnvPath -ExpectedCurrent 'v1.0.0' -NewTag 'v1.0.1'
      } $path
      Assert-True ([System.IO.File]::ReadAllText($path) -ceq $expected) "$($case.Name) update must change only IMAGE_TAG and preserve line endings"
      Assert-True ([System.IO.File]::ReadAllText($path + '.phase2.bak') -ceq $original) "$($case.Name) update must retain an exact backup"
    }
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'native stderr is captured while the real exit code remains authoritative' {
  $module = Get-Module -Name 'Virgo.Deployment'
  $results = & $module {
    $adapter = New-DefaultVirgoAdapter
    $runner = $adapter.Run
    [pscustomobject]@{
      Success = & $runner 'powershell.exe' @('-NoProfile', '-Command', "[Console]::Error.WriteLine('normal progress'); exit 0") ([System.IO.Path]::GetTempPath())
      Failure = & $runner 'powershell.exe' @('-NoProfile', '-Command', "[Console]::Error.WriteLine('real failure'); exit 7") ([System.IO.Path]::GetTempPath())
    }
  }
  Assert-True ($results.Success.ExitCode -eq 0) 'stderr from a successful native command must not become a failure'
  Assert-True (($results.Success.Output -join ' ') -like '*normal progress*') 'successful native stderr must remain visible in captured output'
  Assert-True ($results.Failure.ExitCode -eq 7) 'a native nonzero exit code must be preserved exactly'
  Assert-True (($results.Failure.Output -join ' ') -like '*real failure*') 'failed native stderr must remain visible in captured output'
}

Invoke-Test 'invalid tag is rejected' {
  Assert-True (-not (Test-VirgoTag 'latest')) 'latest must be rejected'
  Assert-True (-not (Test-VirgoTag 'v1.0.0-rc.1')) 'prerelease must be rejected'
  Assert-True (Test-VirgoTag 'v1.2.3') 'semantic production tag must be accepted'
}

Invoke-Test 'no new release exits without deployment' {
  $root = New-TestRoot
  try {
    $state = Read-VirgoState (Join-Path $root 'deployment-state.json')
    $decision = Get-VirgoReleaseDecision $state 'v1.0.1'
    Assert-True (-not $decision.Deploy) 'same release must not deploy'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'new valid release runs the complete safe pipeline' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter -HealthTimeoutSeconds 5 -HealthPollSeconds 1
    Assert-True ($result.Status -eq 'healthy') 'deployment should finish healthy'
    $trace = $mock.Behavior.Trace -join "`n"
    Assert-True ($trace -like '*pg_dump*') 'backup must run'
    Assert-True ($trace -like '*migrate-cli.js*') 'migration must run'
    Assert-True ($trace -like '*--force-recreate api*') 'api must be recreated explicitly'
    Assert-True ($trace -like '*--force-recreate web dashboard*') 'web and dashboard must be recreated explicitly'
    Assert-True ($trace -notlike '*compose*down*') 'deployment must never run compose down'
    $state = Read-VirgoState (Join-Path $root 'deployment-state.json')
    Assert-True ($state.current -eq 'v1.0.2') 'state must record new current release'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'missing GHCR image changes nothing' {
  $root = New-TestRoot
  try {
    $beforeEnv = [System.IO.File]::ReadAllText((Join-Path $root '.env'))
    $beforeState = [System.IO.File]::ReadAllText((Join-Path $root 'deployment-state.json'))
    $mock = New-TestAdapter $root -MissingImage
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter
    Assert-True ($result.Status -eq 'not-ready') 'incomplete release should remain pending'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $root '.env')) -eq $beforeEnv) '.env must not change'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $root 'deployment-state.json')) -eq $beforeState) 'state must not change'
    Assert-True (@(Get-ChildItem (Join-Path $root 'backups')).Count -eq 0) 'no backup should run before image completeness'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'missing successful-workflow marker remains pending' {
  $root = New-TestRoot
  try {
    $beforeEnv = [System.IO.File]::ReadAllText((Join-Path $root '.env'))
    $mock = New-TestAdapter $root -MissingMarker
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter
    Assert-True ($result.Status -eq 'not-ready') 'unmarked release should remain pending'
    Assert-True ($result.Reason -like '*workflow marker*') 'pending reason must name the workflow marker'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $root '.env')) -eq $beforeEnv) '.env must not change'
    Assert-True (@(Get-ChildItem (Join-Path $root 'backups')).Count -eq 0) 'unmarked release must not trigger backup'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'manifest digest mismatch cannot reuse a stale success marker' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root -DigestMismatch
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter
    Assert-True ($result.Status -eq 'not-ready') 'digest mismatch should remain pending'
    Assert-True ($result.Reason -like '*digest does not match*') 'reason must identify digest mismatch'
    Assert-True (@(Get-ChildItem (Join-Path $root 'backups')).Count -eq 0) 'digest mismatch must not trigger backup'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'backup failure aborts before pull migration and start' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root -BackupFailure
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter
    Assert-True ($result.Status -eq 'failed-before-start') 'backup failure must abort before start'
    $trace = $mock.Behavior.Trace -join "`n"
    Assert-True ($trace -notlike '*compose * pull api web dashboard*') 'pull must not follow backup failure'
    Assert-True ($trace -notlike '*migrate-cli.js*') 'migration must not follow backup failure'
    Assert-True ((Read-VirgoEnv (Join-Path $root '.env')).Values.IMAGE_TAG -eq 'v1.0.1') 'tag must remain previous'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'migration failure restores tag and never starts new application' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root -MigrationFailure
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter
    Assert-True ($result.Status -eq 'failed-before-start') 'migration failure must stop before application start'
    $trace = $mock.Behavior.Trace -join "`n"
    Assert-True ($trace -like '*migrate-cli.js*') 'migration must have been attempted'
    Assert-True ($trace -notlike '*--force-recreate*') 'no app container may be recreated'
    Assert-True ((Read-VirgoEnv (Join-Path $root '.env')).Values.IMAGE_TAG -eq 'v1.0.1') 'tag must be restored'
    Assert-True (@(Get-ChildItem (Join-Path $root 'backups') -Filter '*.dump').Count -eq 1) 'verified backup must remain'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'health failure rolls application back without database restore' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root -TargetHealthFailure
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter -HealthTimeoutSeconds 3 -HealthPollSeconds 1
    Assert-True ($result.Status -eq 'rolled-back') 'health failure should roll back successfully'
    Assert-True ((Read-VirgoEnv (Join-Path $root '.env')).Values.IMAGE_TAG -eq 'v1.0.1') 'rollback must restore previous tag'
    $trace = $mock.Behavior.Trace -join "`n"
    Assert-True ($trace -notlike '*pg_restore*') 'rollback must never restore PostgreSQL'
    Assert-True ($trace -notlike '*down*') 'rollback must never run compose down'
    $state = Read-VirgoState (Join-Path $root 'deployment-state.json')
    Assert-True ($state.lastAttemptStatus -eq 'rolled-back') 'state must record rollback'
    Assert-True (Test-VirgoFailedRelease $state 'v1.0.2') 'failed release must be suppressed'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'failed release is suppressed on later polls' {
  $root = New-TestRoot
  try {
    $state = Read-VirgoState (Join-Path $root 'deployment-state.json')
    $state.failedReleases = [ordered]@{ 'v1.0.2' = [ordered]@{ failedAt = '2026-08-13T00:00:00Z'; reason = 'test' } }
    $decision = Get-VirgoReleaseDecision $state 'v1.0.2'
    Assert-True (-not $decision.Deploy) 'failed release must not redeploy'
    Assert-True ($decision.Reason -like '*suppressed*') 'suppression reason should be explicit'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'existing deployment lock blocks a second process and stale file does not' {
  $root = New-TestRoot
  try {
    $mock = New-TestAdapter $root
    $context = New-VirgoContext $root $null $mock.Adapter
    $first = Enter-VirgoDeploymentLock $context
    Assert-True ($null -ne $first) 'first process should acquire lock'
    try {
      $second = Enter-VirgoDeploymentLock $context
      Assert-True ($null -eq $second) 'second process must be blocked'
    } finally { $first.Dispose() }
    $afterCrash = Enter-VirgoDeploymentLock $context
    Assert-True ($null -ne $afterCrash) 'OS-released stale lock file must be reusable'
    $afterCrash.Dispose()
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'state initialization refuses mismatch unless explicitly reconciled' {
  $root = New-TestRoot 'v1.0.2'
  try {
    Remove-Item -LiteralPath (Join-Path $root 'deployment-state.json') -Force
    Remove-Item -LiteralPath (Join-Path $root 'deployment-state.json.bak') -Force -ErrorAction SilentlyContinue
    $mock = New-TestAdapter $root -CurrentTag 'v1.0.1'
    $refused = $false
    try { Initialize-VirgoDeploymentState -RootPath $root -Adapter $mock.Adapter | Out-Null } catch { $refused = $_.Exception.Message -like '*does not match running release*' }
    Assert-True $refused 'initializer must refuse an unexplained mismatch'
    $state = Initialize-VirgoDeploymentState -RootPath $root -Adapter $mock.Adapter -ReconcileImageTag
    Assert-True ($state.current -eq 'v1.0.1') 'state must use the authoritative running tag'
    Assert-True ((Read-VirgoEnv (Join-Path $root '.env')).Values.IMAGE_TAG -eq 'v1.0.1') '.env must be reconciled atomically'
  } finally { Remove-TestRoot $root }
}

Invoke-Test 'dry run makes no filesystem or production changes' {
  $root = New-TestRoot
  try {
    $beforeEnv = [System.IO.File]::ReadAllText((Join-Path $root '.env'))
    $beforeState = [System.IO.File]::ReadAllText((Join-Path $root 'deployment-state.json'))
    $mock = New-TestAdapter $root
    $result = Invoke-VirgoDeployment -Tag 'v1.0.2' -RootPath $root -Adapter $mock.Adapter -DryRun
    Assert-True ($result.Status -eq 'dry-run') 'dry run status expected'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $root '.env')) -eq $beforeEnv) '.env changed during dry run'
    Assert-True ([System.IO.File]::ReadAllText((Join-Path $root 'deployment-state.json')) -eq $beforeState) 'state changed during dry run'
    Assert-True (-not (Test-Path (Join-Path $root 'deployment.lock'))) 'dry run created a lock file'
    Assert-True (@(Get-ChildItem (Join-Path $root 'backups')).Count -eq 0) 'dry run created a backup'
    $trace = $mock.Behavior.Trace -join "`n"
    Assert-True ($trace -notlike '*pg_dump*') 'dry run touched the database'
    Assert-True ($trace -notlike '*compose * pull*') 'dry run pulled images'
    Assert-True ($trace -notlike '*compose * up*') 'dry run changed containers'
  } finally { Remove-TestRoot $root }
}

Write-Host "`n$($script:Passed) passed, $($script:Failed) failed"
if ($script:Failed -gt 0) { exit 1 }
