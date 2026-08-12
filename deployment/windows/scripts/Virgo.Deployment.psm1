Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ApplicationServices = @('api', 'web', 'dashboard')
$script:RequiredHealthContainers = @('virgo-api', 'virgo-web', 'virgo-dashboard', 'virgo-postgres')
$script:ExpectedImages = [ordered]@{
  api       = 'ghcr.io/flareawesome17/virgo-api'
  web       = 'ghcr.io/flareawesome17/virgo-web'
  dashboard = 'ghcr.io/flareawesome17/virgo-dashboard'
}

function Test-VirgoTag {
  param([Parameter(Mandatory = $true)][string]$Tag)
  return $Tag -match '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
}

function ConvertTo-VirgoVersion {
  param([Parameter(Mandatory = $true)][string]$Tag)
  if (-not (Test-VirgoTag $Tag)) { throw "Invalid Virgo release tag '$Tag'. Expected vMAJOR.MINOR.PATCH." }
  return [version]$Tag.Substring(1)
}

function Get-ObjectPropertyValue {
  param($Object, [string]$Name, $Default = $null)
  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Protect-VirgoLogText {
  param([AllowNull()][string]$Text)
  if ($null -eq $Text) { return '' }
  $safe = $Text -replace '(?i)(password|passwd|token|secret|authorization)(\s*[:=]\s*)[^\s,;]+', '$1$2[REDACTED]'
  $safe = $safe -replace '(?i)(--password(?:-stdin)?\s+)[^\s]+', '$1[REDACTED]'
  return $safe
}

function Write-VirgoLog {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR', 'COMMAND', 'OUTPUT')][string]$Level = 'INFO'
  )
  $now = & $Context.Now
  $line = '{0} [{1}] {2}' -f $now.ToString('o'), $Level, (Protect-VirgoLogText $Message)
  Write-Host $line
  if ($Context.LogPath) {
    [System.IO.File]::AppendAllText($Context.LogPath, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  }
}

function Format-VirgoCommand {
  param([string]$FilePath, [string[]]$Arguments)
  $rendered = foreach ($argument in $Arguments) {
    if ($argument -match '[\s"]') { '"{0}"' -f ($argument -replace '"', '\"') } else { $argument }
  }
  return ((@($FilePath) + @($rendered)) -join ' ').Trim()
}

function ConvertTo-VirgoResponseBody {
  param([AllowNull()]$Content)
  if ($null -eq $Content) { return '' }
  if ($Content -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($Content) }
  return [string]$Content
}

function New-DefaultVirgoAdapter {
  $run = {
    param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
    Push-Location -LiteralPath $WorkingDirectory
    try {
      $lines = @(& $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() })
      $code = $LASTEXITCODE
      if ($null -eq $code) { $code = 0 }
      return [pscustomobject]@{ ExitCode = [int]$code; Output = $lines }
    } catch {
      return [pscustomobject]@{ ExitCode = 1; Output = @($_.Exception.Message) }
    } finally {
      Pop-Location
    }
  }

  $request = {
    param([string]$Uri, [hashtable]$Headers, [int]$TimeoutSeconds)
    try {
      $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -UseBasicParsing -TimeoutSec $TimeoutSeconds -MaximumRedirection 5
      return [pscustomobject]@{
        Success = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
        StatusCode = [int]$response.StatusCode
        Body = ConvertTo-VirgoResponseBody $response.Content
        Error = $null
      }
    } catch {
      $status = 0
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $status = [int]$_.Exception.Response.StatusCode }
      return [pscustomobject]@{ Success = $false; StatusCode = $status; Body = ''; Error = $_.Exception.Message }
    }
  }

  return @{
    Run = $run
    Request = $request
    Now = { Get-Date }
    Sleep = { param([int]$Seconds) Start-Sleep -Seconds $Seconds }
  }
}

function New-VirgoContext {
  param(
    [Parameter(Mandatory = $true)][string]$RootPath,
    [AllowNull()][string]$LogPath,
    [AllowNull()][hashtable]$Adapter
  )
  $resolvedRoot = [System.IO.Path]::GetFullPath($RootPath)
  $selected = if ($Adapter) { $Adapter } else { New-DefaultVirgoAdapter }
  foreach ($required in @('Run', 'Request', 'Now', 'Sleep')) {
    if (-not $selected.ContainsKey($required)) { throw "Deployment adapter is missing '$required'." }
  }
  return [pscustomobject]@{
    RootPath = $resolvedRoot
    ComposePath = Join-Path $resolvedRoot 'docker-compose.prod.yml'
    EnvPath = Join-Path $resolvedRoot '.env'
    StatePath = Join-Path $resolvedRoot 'deployment-state.json'
    LockPath = Join-Path $resolvedRoot 'deployment.lock'
    BackupsPath = Join-Path $resolvedRoot 'backups'
    LogsPath = Join-Path $resolvedRoot 'logs'
    LogPath = $LogPath
    Run = $selected.Run
    Request = $selected.Request
    Now = $selected.Now
    Sleep = $selected.Sleep
  }
}

function Invoke-VirgoCommand {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )
  Write-VirgoLog $Context (Format-VirgoCommand $FilePath $Arguments) 'COMMAND'
  $result = & $Context.Run $FilePath $Arguments $Context.RootPath
  foreach ($line in @($result.Output)) {
    if ($null -ne $line -and [string]$line -ne '') { Write-VirgoLog $Context ([string]$line) 'OUTPUT' }
  }
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    throw "Command failed with exit code $($result.ExitCode): $(Format-VirgoCommand $FilePath $Arguments)"
  }
  return $result
}

function Invoke-VirgoRequest {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$Uri,
    [hashtable]$Headers = @{},
    [int]$TimeoutSeconds = 15
  )
  Write-VirgoLog $Context "GET $Uri" 'COMMAND'
  return (& $Context.Request $Uri $Headers $TimeoutSeconds)
}

function Read-VirgoEnv {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Production environment file not found: $Path" }
  $text = [System.IO.File]::ReadAllText($Path)
  $values = @{}
  foreach ($line in ($text -split "`r?`n")) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $index = $line.IndexOf('=')
    $name = $line.Substring(0, $index).Trim()
    if ($name) { $values[$name] = $line.Substring($index + 1).Trim() }
  }
  return [pscustomobject]@{ Text = $text; Values = $values }
}

function Write-AtomicVirgoText {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Text,
    [AllowNull()][string]$BackupPath
  )
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
  $temp = Join-Path $directory ('.{0}.{1}.tmp' -f ([System.IO.Path]::GetFileName($Path)), [guid]::NewGuid().ToString('N'))
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  try {
    [System.IO.File]::WriteAllText($temp, $Text, $utf8)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      $backup = $BackupPath
      if (-not $backup) { $backup = $Path + '.bak' }
      [System.IO.File]::Replace($temp, $Path, $backup, $true)
    } else {
      [System.IO.File]::Move($temp, $Path)
    }
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  }
}

function Set-VirgoImageTag {
  param(
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [Parameter(Mandatory = $true)][string]$ExpectedCurrent,
    [Parameter(Mandatory = $true)][string]$NewTag
  )
  if (-not (Test-VirgoTag $NewTag)) { throw "Refusing unsafe IMAGE_TAG '$NewTag'." }
  $envData = Read-VirgoEnv $EnvPath
  if (-not $envData.Values.ContainsKey('IMAGE_TAG')) { throw 'IMAGE_TAG is missing from .env.' }
  $actual = [string]$envData.Values['IMAGE_TAG']
  if ($actual -ne $ExpectedCurrent) { throw "IMAGE_TAG mismatch: expected '$ExpectedCurrent', found '$actual'." }
  $matches = [regex]::Matches($envData.Text, '(?m)^IMAGE_TAG=[^\r\n]*$')
  if ($matches.Count -ne 1) { throw "Expected exactly one IMAGE_TAG line; found $($matches.Count)." }
  $match = $matches[0]
  $updated = $envData.Text.Substring(0, $match.Index) + "IMAGE_TAG=$NewTag" + $envData.Text.Substring($match.Index + $match.Length)
  Write-AtomicVirgoText -Path $EnvPath -Text $updated -BackupPath ($EnvPath + '.phase2.bak')
}

function Read-VirgoState {
  param([Parameter(Mandatory = $true)][string]$Path, [switch]$AllowMissing)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    if ($AllowMissing) { return $null }
    throw "Deployment state not found: $Path. Run initialize-deployment.ps1 first."
  }
  try {
    return ([System.IO.File]::ReadAllText($Path) | ConvertFrom-Json)
  } catch {
    $backup = $Path + '.bak'
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      return ([System.IO.File]::ReadAllText($backup) | ConvertFrom-Json)
    }
    throw "Deployment state is unreadable and no recovery copy exists: $($_.Exception.Message)"
  }
}

function Save-VirgoState {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)]$State)
  $json = $State | ConvertTo-Json -Depth 12
  Write-AtomicVirgoText -Path $Path -Text ($json + [Environment]::NewLine) -BackupPath ($Path + '.bak')
}

function Enter-VirgoDeploymentLock {
  param([Parameter(Mandatory = $true)]$Context)
  try {
    $stream = New-Object System.IO.FileStream(
      $Context.LockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    return $null
  }
  $metadata = [ordered]@{ pid = $PID; acquiredAt = (& $Context.Now).ToString('o') } | ConvertTo-Json
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($metadata + [Environment]::NewLine)
  $stream.SetLength(0)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush($true)
  return $stream
}

function Get-VirgoStoredGitHubToken {
  param([Parameter(Mandatory = $true)]$Context)
  if ($env:VIRGO_GITHUB_TOKEN) { return [string]$env:VIRGO_GITHUB_TOKEN }
  $tokenPath = Join-Path $Context.RootPath 'secrets\github-releases-token.dpapi'
  if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) { return $null }
  try {
    $secure = (Get-Content -LiteralPath $tokenPath -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } catch {
    throw 'The encrypted GitHub Releases token cannot be read by this Windows account. Run set-github-token.ps1 as the Scheduled Task account.'
  }
}

function Get-VirgoGitHubHeaders {
  param([Parameter(Mandatory = $true)]$Context)
  $headers = @{
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'Virgo-Production-Deployment-Worker'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  $token = Get-VirgoStoredGitHubToken $Context
  if ($token) { $headers.Authorization = "Bearer $token" }
  return $headers
}

function Get-VirgoGitHubJson {
  param([Parameter(Mandatory = $true)]$Context, [Parameter(Mandatory = $true)][string]$Uri)
  $response = Invoke-VirgoRequest $Context $Uri (Get-VirgoGitHubHeaders $Context) 20
  if (-not $response.Success) { throw "GitHub API request failed ($($response.StatusCode)): $($response.Error)" }
  try { return ($response.Body | ConvertFrom-Json) } catch { throw "GitHub returned invalid JSON for $Uri" }
}

function Get-VirgoReleaseByTag {
  param([Parameter(Mandatory = $true)]$Context, [string]$Repository = 'flareawesome17/virgo', [Parameter(Mandatory = $true)][string]$Tag)
  $escaped = [uri]::EscapeDataString($Tag)
  return Get-VirgoGitHubJson $Context "https://api.github.com/repos/$Repository/releases/tags/$escaped"
}

function Get-LatestVirgoProductionRelease {
  param([Parameter(Mandatory = $true)]$Context, [string]$Repository = 'flareawesome17/virgo')
  $releases = @(Get-VirgoGitHubJson $Context "https://api.github.com/repos/$Repository/releases?per_page=30")
  $valid = foreach ($release in $releases) {
    $tag = [string](Get-ObjectPropertyValue $release 'tag_name' '')
    if ((Get-ObjectPropertyValue $release 'draft' $true) -or (Get-ObjectPropertyValue $release 'prerelease' $true)) { continue }
    if (-not (Get-ObjectPropertyValue $release 'published_at' $null)) { continue }
    if (-not (Test-VirgoTag $tag)) { continue }
    [pscustomobject]@{ Release = $release; Version = ConvertTo-VirgoVersion $tag }
  }
  $latest = $valid | Sort-Object Version -Descending | Select-Object -First 1
  if ($null -eq $latest) { return $null }
  return $latest.Release
}

function Get-VirgoReleaseMarkerAsset {
  param([Parameter(Mandatory = $true)]$Release, [Parameter(Mandatory = $true)][string]$Tag)
  $expected = "virgo-deployable-$Tag.json"
  foreach ($asset in @(Get-ObjectPropertyValue $Release 'assets' @())) {
    if ([string](Get-ObjectPropertyValue $asset 'name' '') -eq $expected) { return $asset }
  }
  return $null
}

function Get-VirgoReleaseMarkerData {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)]$Release,
    [Parameter(Mandatory = $true)][string]$Tag
  )
  $asset = Get-VirgoReleaseMarkerAsset $Release $Tag
  if ($null -eq $asset) { throw "Successful release workflow marker virgo-deployable-$Tag.json is not present." }
  $uri = [string](Get-ObjectPropertyValue $asset 'url' '')
  if (-not $uri) { $uri = [string](Get-ObjectPropertyValue $asset 'browser_download_url' '') }
  if (-not $uri) { throw 'Release marker asset has no download URL.' }
  $headers = Get-VirgoGitHubHeaders $Context
  $headers.Accept = 'application/octet-stream'
  $response = Invoke-VirgoRequest $Context $uri $headers 20
  if (-not $response.Success) { throw "Could not download release marker ($($response.StatusCode)): $($response.Error)" }
  try { $marker = $response.Body | ConvertFrom-Json } catch { throw 'Release marker contains invalid JSON.' }
  if ([string](Get-ObjectPropertyValue $marker 'tag' '') -ne $Tag) { throw 'Release marker tag does not match the requested release.' }
  $images = Get-ObjectPropertyValue $marker 'images' $null
  if ($null -eq $images) { throw 'Release marker does not contain verified image digests.' }
  $digests = [ordered]@{}
  foreach ($service in $script:ApplicationServices) {
    $digest = [string](Get-ObjectPropertyValue $images $service '')
    if ($digest -notmatch '^sha256:[0-9a-f]{64}$') { throw "Release marker has an invalid $service digest." }
    $digests[$service] = $digest
  }
  return [pscustomobject]@{ Asset = $asset; Data = $marker; Digests = $digests }
}

function Test-VirgoRequiredImages {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$ExpectedDigests
  )
  $results = @()
  foreach ($entry in $script:ExpectedImages.GetEnumerator()) {
    $image = "$($entry.Value):$Tag"
    $expected = [string]$ExpectedDigests[$entry.Key]
    $command = Invoke-VirgoCommand $Context 'docker' @('buildx', 'imagetools', 'inspect', $image, '--format', '{{json .Manifest}}') -AllowFailure
    $actual = ''
    if ($command.ExitCode -eq 0) {
      try {
        $manifest = (@($command.Output) -join [Environment]::NewLine) | ConvertFrom-Json
        $actual = [string](Get-ObjectPropertyValue $manifest 'digest' '')
      } catch {
        $actual = ''
      }
    }
    $matches = $actual -eq $expected
    $results += [pscustomobject]@{
      Service = $entry.Key
      Image = $image
      Available = ($command.ExitCode -eq 0)
      ExpectedDigest = $expected
      ActualDigest = $actual
      MatchesMarker = $matches
    }
  }
  return $results
}

function Test-VirgoReleaseReady {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)]$Release,
    [Parameter(Mandatory = $true)][string]$Tag
  )
  try {
    $marker = Get-VirgoReleaseMarkerData $Context $Release $Tag
  } catch {
    return [pscustomobject]@{ Ready = $false; Pending = $true; Reason = $_.Exception.Message; Images = @() }
  }
  $images = @(Test-VirgoRequiredImages $Context $Tag $marker.Digests)
  $invalid = @($images | Where-Object { -not $_.Available -or -not $_.MatchesMarker })
  if ($invalid.Count -gt 0) {
    $details = @($invalid | ForEach-Object {
      if (-not $_.Available) { "$($_.Image) unavailable" }
      else { "$($_.Image) digest does not match the successful workflow marker" }
    })
    return [pscustomobject]@{ Ready = $false; Pending = $true; Reason = "Required GHCR images are incomplete or inconsistent: $($details -join '; ')"; Images = $images }
  }
  return [pscustomobject]@{ Ready = $true; Pending = $false; Reason = $null; Images = $images }
}

function Get-VirgoContainerStatus {
  param([Parameter(Mandatory = $true)]$Context, [Parameter(Mandatory = $true)][string]$Container)
  $format = '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Config.Image}}'
  $result = Invoke-VirgoCommand $Context 'docker' @('inspect', $Container, '--format', $format) -AllowFailure
  if ($result.ExitCode -ne 0 -or @($result.Output).Count -eq 0) {
    return [pscustomobject]@{ Container = $Container; Exists = $false; State = 'missing'; Health = 'missing'; Image = '' }
  }
  $parts = ([string]$result.Output[-1]) -split '\|', 3
  return [pscustomobject]@{ Container = $Container; Exists = $true; State = $parts[0]; Health = $parts[1]; Image = $parts[2] }
}

function Get-VirgoRunningReleaseTag {
  param([Parameter(Mandatory = $true)]$Context)
  $tags = @()
  foreach ($entry in $script:ExpectedImages.GetEnumerator()) {
    $status = Get-VirgoContainerStatus $Context "virgo-$($entry.Key)"
    if (-not $status.Exists) { throw "Required container virgo-$($entry.Key) does not exist." }
    $prefix = "$($entry.Value):"
    if (-not $status.Image.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Unexpected image for virgo-$($entry.Key): $($status.Image)"
    }
    $tags += $status.Image.Substring($prefix.Length)
  }
  $unique = @($tags | Select-Object -Unique)
  if ($unique.Count -ne 1 -or -not (Test-VirgoTag $unique[0])) { throw "Application containers do not share one valid release tag: $($tags -join ', ')" }
  return [string]$unique[0]
}

function Assert-VirgoRoot {
  param([Parameter(Mandatory = $true)]$Context)
  foreach ($path in @($Context.ComposePath, $Context.EnvPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required production file missing: $path" }
  }
  foreach ($path in @($Context.BackupsPath, $Context.LogsPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { [System.IO.Directory]::CreateDirectory($path) | Out-Null }
  }
}

function Assert-VirgoConsistentState {
  param([Parameter(Mandatory = $true)]$Context, [Parameter(Mandatory = $true)]$State)
  $envData = Read-VirgoEnv $Context.EnvPath
  if (-not $envData.Values.ContainsKey('IMAGE_TAG')) { throw 'IMAGE_TAG is missing from .env.' }
  $envTag = [string]$envData.Values['IMAGE_TAG']
  $runningTag = Get-VirgoRunningReleaseTag $Context
  $stateCurrent = [string](Get-ObjectPropertyValue $State 'current' '')
  if (-not (Test-VirgoTag $envTag)) { throw "Invalid IMAGE_TAG in .env: '$envTag'." }
  if ($envTag -ne $runningTag -or $stateCurrent -ne $runningTag) {
    throw "Production version mismatch: .env=$envTag, running=$runningTag, state=$stateCurrent. Reconcile manually before deploying."
  }
  return $runningTag
}

function New-VirgoInitialState {
  param([Parameter(Mandatory = $true)][string]$Tag, [Parameter(Mandatory = $true)]$Context)
  return [ordered]@{
    schemaVersion = 1
    current = $Tag
    previous = $null
    lastSuccessful = $Tag
    lastAttempted = $Tag
    status = 'healthy'
    lastAttemptStatus = 'initialized'
    deployedAt = (& $Context.Now).ToString('o')
    releaseCommit = $null
    backupPath = $null
    deploymentDurationSeconds = 0
    failureReason = $null
    healthCheckResults = @()
    failedReleases = [ordered]@{}
  }
}

function Initialize-VirgoDeploymentState {
  param(
    [Parameter(Mandatory = $true)][string]$RootPath,
    [AllowNull()][hashtable]$Adapter,
    [switch]$ReconcileImageTag,
    [switch]$Force
  )
  $context = New-VirgoContext $RootPath $null $Adapter
  Assert-VirgoRoot $context
  $lock = Enter-VirgoDeploymentLock $context
  if ($null -eq $lock) { throw 'Another deployment process is already running.' }
  try {
    if ((Test-Path -LiteralPath $context.StatePath) -and -not $Force) { throw 'deployment-state.json already exists. Use -Force only after reviewing it.' }
    $envData = Read-VirgoEnv $context.EnvPath
    if (-not $envData.Values.ContainsKey('IMAGE_TAG')) { throw 'IMAGE_TAG is missing from .env.' }
    $envTag = [string]$envData.Values['IMAGE_TAG']
    $runningTag = Get-VirgoRunningReleaseTag $context
    if ($envTag -ne $runningTag) {
      if (-not $ReconcileImageTag) { throw "Cannot initialize: .env IMAGE_TAG '$envTag' does not match running release '$runningTag'. Use -ReconcileImageTag only after verifying the running containers are authoritative." }
      Set-VirgoImageTag $context.EnvPath $envTag $runningTag
      $envTag = $runningTag
    }
    foreach ($container in $script:RequiredHealthContainers) {
      $status = Get-VirgoContainerStatus $context $container
      if ($status.State -ne 'running' -or $status.Health -ne 'healthy') { throw "Cannot initialize: $container is state=$($status.State), health=$($status.Health)." }
    }
    $tunnel = Get-VirgoContainerStatus $context 'virgo-cloudflared'
    if ($tunnel.State -ne 'running') { throw 'Cannot initialize: virgo-cloudflared is not running.' }
    $state = New-VirgoInitialState $runningTag $context
    Save-VirgoState $context.StatePath $state
    return $state
  } finally {
    $lock.Dispose()
  }
}

function Add-VirgoFailedRelease {
  param([Parameter(Mandatory = $true)]$State, [string]$Tag, [string]$Reason, [Parameter(Mandatory = $true)]$Context)
  $map = [ordered]@{}
  $existing = Get-ObjectPropertyValue $State 'failedReleases' $null
  if ($existing) {
    if ($existing -is [System.Collections.IDictionary]) {
      foreach ($key in $existing.Keys) { $map[$key] = $existing[$key] }
    } else {
      foreach ($property in $existing.PSObject.Properties) { $map[$property.Name] = $property.Value }
    }
  }
  $map[$Tag] = [ordered]@{ failedAt = (& $Context.Now).ToString('o'); reason = $Reason }
  $State.failedReleases = $map
}

function Test-VirgoFailedRelease {
  param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Tag)
  $failed = Get-ObjectPropertyValue $State 'failedReleases' $null
  if (-not $failed) { return $false }
  if ($failed -is [System.Collections.IDictionary]) { return $failed.Contains($Tag) }
  return $null -ne $failed.PSObject.Properties[$Tag]
}

function Remove-VirgoFailedRelease {
  param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Tag)
  $existing = Get-ObjectPropertyValue $State 'failedReleases' $null
  $map = [ordered]@{}
  if ($existing) {
    if ($existing -is [System.Collections.IDictionary]) {
      foreach ($key in $existing.Keys) { if ([string]$key -ne $Tag) { $map[$key] = $existing[$key] } }
    } else {
      foreach ($property in $existing.PSObject.Properties) { if ($property.Name -ne $Tag) { $map[$property.Name] = $property.Value } }
    }
  }
  $State.failedReleases = $map
}

function New-VirgoDatabaseBackup {
  param([Parameter(Mandatory = $true)]$Context, [Parameter(Mandatory = $true)][string]$TargetTag)
  $envData = Read-VirgoEnv $Context.EnvPath
  foreach ($name in @('POSTGRES_USER', 'POSTGRES_DB')) {
    if (-not $envData.Values.ContainsKey($name) -or -not $envData.Values[$name]) { throw "$name is missing from .env." }
  }
  $stamp = (& $Context.Now).ToString('yyyyMMdd-HHmmss')
  $fileName = "virgo-prod-before-$TargetTag-$stamp.dump"
  $finalPath = Join-Path $Context.BackupsPath $fileName
  $partialPath = $finalPath + '.partial'
  if (Test-Path -LiteralPath $finalPath) { throw "Backup already exists: $finalPath" }
  $containerPath = "/tmp/$fileName"
  $user = [string]$envData.Values['POSTGRES_USER']
  $database = [string]$envData.Values['POSTGRES_DB']
  try {
    Invoke-VirgoCommand $Context 'docker' @('exec', 'virgo-postgres', 'pg_dump', '-U', $user, '-d', $database, '-F', 'c', '-f', $containerPath) | Out-Null
    Invoke-VirgoCommand $Context 'docker' @('exec', 'virgo-postgres', 'test', '-s', $containerPath) | Out-Null
    Invoke-VirgoCommand $Context 'docker' @('cp', "virgo-postgres:$containerPath", $partialPath) | Out-Null
    if (-not (Test-Path -LiteralPath $partialPath -PathType Leaf) -or (Get-Item -LiteralPath $partialPath).Length -le 0) {
      throw 'docker cp completed but the host backup is missing or empty.'
    }
    Move-Item -LiteralPath $partialPath -Destination $finalPath
    Write-VirgoLog $Context "Database backup verified: $finalPath"
    return $finalPath
  } finally {
    $cleanup = Invoke-VirgoCommand $Context 'docker' @('exec', 'virgo-postgres', 'rm', '-f', $containerPath) -AllowFailure
    if ($cleanup.ExitCode -ne 0) { Write-VirgoLog $Context 'Could not remove the temporary backup inside the Postgres container.' 'WARN' }
  }
}

function Invoke-VirgoBackupRetention {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [int]$KeepCount = 20,
    [int]$KeepDays = 90
  )
  $backups = @(Get-ChildItem -LiteralPath $Context.BackupsPath -File -Filter 'virgo-prod-before-v*.dump' | Sort-Object LastWriteTimeUtc -Descending)
  if ($backups.Count -le $KeepCount) { return }
  $cutoff = (& $Context.Now).ToUniversalTime().AddDays(-$KeepDays)
  foreach ($backup in @($backups | Select-Object -Skip $KeepCount)) {
    if ($backup.LastWriteTimeUtc -ge $cutoff) { continue }
    $root = [System.IO.Path]::GetFullPath($Context.BackupsPath).TrimEnd('\') + '\'
    $candidate = [System.IO.Path]::GetFullPath($backup.FullName)
    if (-not $candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing retention outside backup root: $candidate" }
    Remove-Item -LiteralPath $candidate -Force
    Write-VirgoLog $Context "Retention removed old deployment backup: $($backup.Name)"
  }
}

function Wait-VirgoContainersHealthy {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string[]]$Containers,
    [int]$TimeoutSeconds = 120,
    [int]$PollSeconds = 5
  )
  $started = & $Context.Now
  $last = @()
  while (((& $Context.Now) - $started).TotalSeconds -le $TimeoutSeconds) {
    $last = @($Containers | ForEach-Object { Get-VirgoContainerStatus $Context $_ })
    $terminal = @($last | Where-Object { $_.State -in @('exited', 'dead', 'removing') })
    if ($terminal.Count -gt 0) { return [pscustomobject]@{ Success = $false; Results = $last; Reason = "Container stopped: $($terminal.Container -join ', ')" } }
    $notHealthy = @($last | Where-Object { $_.State -ne 'running' -or $_.Health -ne 'healthy' })
    if ($notHealthy.Count -eq 0) { return [pscustomobject]@{ Success = $true; Results = $last; Reason = $null } }
    & $Context.Sleep $PollSeconds
  }
  return [pscustomobject]@{ Success = $false; Results = $last; Reason = "Health timeout after $TimeoutSeconds seconds." }
}

function Test-VirgoApiReadiness {
  param([Parameter(Mandatory = $true)]$Context)
  $envData = Read-VirgoEnv $Context.EnvPath
  $port = if ($envData.Values.ContainsKey('API_PORT') -and $envData.Values['API_PORT']) { [string]$envData.Values['API_PORT'] } else { '3001' }
  $uri = "http://127.0.0.1:$port/health/ready"
  $response = Invoke-VirgoRequest $Context $uri @{} 10
  if (-not $response.Success -or $response.StatusCode -ne 200) { return [pscustomobject]@{ Name = 'api-readiness'; Success = $false; Detail = "HTTP $($response.StatusCode) $($response.Error)" } }
  try { $body = $response.Body | ConvertFrom-Json } catch { return [pscustomobject]@{ Name = 'api-readiness'; Success = $false; Detail = 'Invalid JSON response.' } }
  $ok = ((Get-ObjectPropertyValue $body 'status' '') -eq 'ready' -and (Get-ObjectPropertyValue $body 'database' '') -eq 'ok')
  return [pscustomobject]@{ Name = 'api-readiness'; Success = $ok; Detail = if ($ok) { 'ready/database=ok' } else { 'Unexpected readiness payload.' } }
}

function Test-VirgoContainerHttp {
  param([Parameter(Mandatory = $true)]$Context, [string]$Container, [string]$Uri, [string]$Name)
  $script = "fetch('$Uri').then(r=>{console.log(r.status);process.exit(r.status>=200&&r.status<400?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
  $result = Invoke-VirgoCommand $Context 'docker' @('exec', $Container, 'node', '-e', $script) -AllowFailure
  return [pscustomobject]@{ Name = $Name; Success = ($result.ExitCode -eq 0); Detail = (@($result.Output) -join ' ') }
}

function Test-VirgoPublicEndpoint {
  param([Parameter(Mandatory = $true)]$Context, [string]$Name, [string]$Uri, [switch]$RequireReadyJson)
  $response = Invoke-VirgoRequest $Context $Uri @{} 20
  $success = $response.Success -and $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  if ($success -and $RequireReadyJson) {
    try {
      $body = $response.Body | ConvertFrom-Json
      $success = (Get-ObjectPropertyValue $body 'status' '') -eq 'ok'
    } catch { $success = $false }
  }
  return [pscustomobject]@{ Name = $Name; Success = $success; Detail = "HTTP $($response.StatusCode)" }
}

function Test-VirgoSmoke {
  param([Parameter(Mandatory = $true)]$Context)
  $results = @()
  $results += Test-VirgoApiReadiness $Context
  $results += Test-VirgoContainerHttp $Context 'virgo-web' 'http://127.0.0.1:3000/' 'web-local'
  $results += Test-VirgoContainerHttp $Context 'virgo-dashboard' 'http://127.0.0.1:3002/' 'dashboard-local'
  $envData = Read-VirgoEnv $Context.EnvPath
  if ($envData.Values.ContainsKey('PUBLIC_API_URL') -and $envData.Values['PUBLIC_API_URL']) {
    $results += Test-VirgoPublicEndpoint $Context 'api-public-live' ($envData.Values['PUBLIC_API_URL'].TrimEnd('/') + '/health/live') -RequireReadyJson
  }
  if ($envData.Values.ContainsKey('WEB_APP_URL') -and $envData.Values['WEB_APP_URL']) {
    $results += Test-VirgoPublicEndpoint $Context 'web-public' ($envData.Values['WEB_APP_URL'].TrimEnd('/') + '/')
  }
  if ($envData.Values.ContainsKey('PUBLIC_SITE_URL') -and $envData.Values['PUBLIC_SITE_URL']) {
    $results += Test-VirgoPublicEndpoint $Context 'site-public' ($envData.Values['PUBLIC_SITE_URL'].TrimEnd('/') + '/')
  }
  $tunnel = Get-VirgoContainerStatus $Context 'virgo-cloudflared'
  $results += [pscustomobject]@{ Name = 'cloudflared-running'; Success = ($tunnel.State -eq 'running'); Detail = "state=$($tunnel.State)" }
  return $results
}

function Invoke-VirgoTargetedPull {
  param([Parameter(Mandatory = $true)]$Context)
  Invoke-VirgoCommand $Context 'docker' @('compose', '-f', $Context.ComposePath, 'pull', 'api', 'web', 'dashboard') | Out-Null
}

function Invoke-VirgoMigration {
  param([Parameter(Mandatory = $true)]$Context)
  Invoke-VirgoCommand $Context 'docker' @('compose', '-f', $Context.ComposePath, 'run', '--rm', '--no-deps', 'api', 'node', 'dist/database/migrate-cli.js') | Out-Null
}

function Invoke-VirgoApplicationStart {
  param([Parameter(Mandatory = $true)]$Context, [int]$TimeoutSeconds = 120, [int]$PollSeconds = 5)
  Invoke-VirgoCommand $Context 'docker' @('compose', '-f', $Context.ComposePath, 'up', '-d', '--no-deps', '--force-recreate', 'api') | Out-Null
  $apiHealth = Wait-VirgoContainersHealthy $Context @('virgo-api', 'virgo-postgres') $TimeoutSeconds $PollSeconds
  if (-not $apiHealth.Success) { throw "API deployment health failed: $($apiHealth.Reason)" }
  $ready = Test-VirgoApiReadiness $Context
  if (-not $ready.Success) { throw "API readiness failed: $($ready.Detail)" }
  Invoke-VirgoCommand $Context 'docker' @('compose', '-f', $Context.ComposePath, 'up', '-d', '--no-deps', '--force-recreate', 'web', 'dashboard') | Out-Null
  $health = Wait-VirgoContainersHealthy $Context $script:RequiredHealthContainers $TimeoutSeconds $PollSeconds
  if (-not $health.Success) { throw "Application health failed: $($health.Reason)" }
  $smoke = @()
  $failed = @()
  foreach ($attempt in 1..3) {
    $smoke = @(Test-VirgoSmoke $Context)
    $failed = @($smoke | Where-Object { -not $_.Success })
    if ($failed.Count -eq 0) { break }
    if ($attempt -lt 3) {
      Write-VirgoLog $Context "Smoke attempt $attempt failed; retrying in 5 seconds." 'WARN'
      & $Context.Sleep 5
    }
  }
  if ($failed.Count -gt 0) { throw "Smoke tests failed: $((@($failed | ForEach-Object { $_.Name + '=' + $_.Detail })) -join '; ')" }
  return [pscustomobject]@{ Health = $health.Results; Smoke = $smoke }
}

function Test-VirgoLocalImages {
  param([Parameter(Mandatory = $true)]$Context, [string]$Tag)
  foreach ($entry in $script:ExpectedImages.GetEnumerator()) {
    $result = Invoke-VirgoCommand $Context 'docker' @('image', 'inspect', "$($entry.Value):$Tag") -AllowFailure
    if ($result.ExitCode -ne 0) { return $false }
  }
  return $true
}

function Invoke-VirgoRollback {
  param([Parameter(Mandatory = $true)]$Context, [string]$FailedTag, [string]$PreviousTag, [int]$TimeoutSeconds, [int]$PollSeconds)
  Write-VirgoLog $Context "Rolling application containers back from $FailedTag to $PreviousTag. Database migrations are NOT reversed." 'WARN'
  $currentEnv = (Read-VirgoEnv $Context.EnvPath).Values['IMAGE_TAG']
  if ($currentEnv -ne $PreviousTag) { Set-VirgoImageTag $Context.EnvPath $currentEnv $PreviousTag }
  if (-not (Test-VirgoLocalImages $Context $PreviousTag)) { Invoke-VirgoTargetedPull $Context }
  return Invoke-VirgoApplicationStart $Context $TimeoutSeconds $PollSeconds
}

function Get-VirgoReleaseDecision {
  param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$LatestTag)
  if ([string](Get-ObjectPropertyValue $State 'status' '') -eq 'critical') { return [pscustomobject]@{ Deploy = $false; Reason = 'Deployment state is critical; operator review is required.' } }
  $current = [string](Get-ObjectPropertyValue $State 'lastSuccessful' '')
  if (-not (Test-VirgoTag $current)) { return [pscustomobject]@{ Deploy = $false; Reason = 'lastSuccessful is not a valid semantic release tag.' } }
  if ((ConvertTo-VirgoVersion $LatestTag) -le (ConvertTo-VirgoVersion $current)) { return [pscustomobject]@{ Deploy = $false; Reason = "No newer release than $current." } }
  if (Test-VirgoFailedRelease $State $LatestTag) { return [pscustomobject]@{ Deploy = $false; Reason = "$LatestTag previously failed and is suppressed." } }
  return [pscustomobject]@{ Deploy = $true; Reason = "$LatestTag is newer than $current." }
}

function Invoke-VirgoDeployment {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [Parameter(Mandatory = $true)][string]$RootPath,
    [string]$Repository = 'flareawesome17/virgo',
    [switch]$AllowDowngrade,
    [switch]$ForceRetry,
    [switch]$DryRun,
    [string]$Source = 'manual',
    [int]$HealthTimeoutSeconds = 120,
    [int]$HealthPollSeconds = 5,
    [AllowNull()][hashtable]$Adapter
  )
  if (-not (Test-VirgoTag $Tag)) { throw "Invalid release tag '$Tag'. Expected vMAJOR.MINOR.PATCH." }
  $baseContext = New-VirgoContext $RootPath $null $Adapter
  if (-not $DryRun) { Assert-VirgoRoot $baseContext }
  $timestamp = (& $baseContext.Now).ToString('yyyyMMdd-HHmmss')
  $logPath = if ($DryRun) { $null } else { Join-Path $baseContext.LogsPath "deploy-$Tag-$timestamp.log" }
  $context = New-VirgoContext $RootPath $logPath $Adapter
  if ($DryRun) {
    foreach ($required in @($context.ComposePath, $context.EnvPath, $context.StatePath)) {
      if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required production file missing: $required" }
    }
  }
  Write-VirgoLog $context "Deployment requested: source=$Source target=$Tag dryRun=$DryRun"

  $lock = $null
  if (-not $DryRun) {
    $lock = Enter-VirgoDeploymentLock $context
    if ($null -eq $lock) {
      Write-VirgoLog $context 'Another deployment process holds deployment.lock; exiting without action.' 'WARN'
      return [pscustomobject]@{ ExitCode = 0; Status = 'locked'; Tag = $Tag; LogPath = $logPath }
    }
  }

  $started = & $context.Now
  try {
    $state = Read-VirgoState $context.StatePath
    $current = Assert-VirgoConsistentState $context $state
    if ([string](Get-ObjectPropertyValue $state 'status' '') -eq 'critical') { throw 'Deployment state is critical. Resolve the incident before another deployment.' }
    if ($Tag -eq $current) {
      Write-VirgoLog $context "$Tag is already running; no action required."
      return [pscustomobject]@{ ExitCode = 0; Status = 'unchanged'; Tag = $Tag; LogPath = $logPath }
    }
    if ((ConvertTo-VirgoVersion $Tag) -lt (ConvertTo-VirgoVersion $current) -and -not $AllowDowngrade) {
      throw "$Tag is older than $current. Manual downgrade requires -AllowDowngrade."
    }
    if ((Test-VirgoFailedRelease $state $Tag) -and -not $ForceRetry) {
      throw "$Tag previously failed. Use -ForceRetry only after reviewing and correcting the failure."
    }

    $release = Get-VirgoReleaseByTag $context $Repository $Tag
    if ((Get-ObjectPropertyValue $release 'draft' $true) -or (Get-ObjectPropertyValue $release 'prerelease' $true)) { throw "$Tag is not a published production release." }
    $readiness = Test-VirgoReleaseReady $context $release $Tag
    if (-not $readiness.Ready) {
      Write-VirgoLog $context "Release is not deployable yet: $($readiness.Reason)" 'WARN'
      return [pscustomobject]@{ ExitCode = 0; Status = 'not-ready'; Tag = $Tag; Reason = $readiness.Reason; LogPath = $logPath }
    }

    if ($DryRun) {
      Write-VirgoLog $context "DRY RUN current=$current target=$Tag"
      Write-VirgoLog $context 'DRY RUN would back up virgo-postgres with pg_dump before changing IMAGE_TAG.'
      Write-VirgoLog $context "DRY RUN would update only IMAGE_TAG=$Tag in .env."
      Write-VirgoLog $context 'DRY RUN would pull: api, web, dashboard.'
      Write-VirgoLog $context 'DRY RUN would run: docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/database/migrate-cli.js'
      Write-VirgoLog $context 'DRY RUN would recreate: api, then web and dashboard; cloudflared/postgres/pgAdmin remain untouched.'
      Write-VirgoLog $context 'DRY RUN would check Docker health, local API readiness, local web/dashboard, public API/web/site, and cloudflared state.'
      return [pscustomobject]@{ ExitCode = 0; Status = 'dry-run'; Tag = $Tag; Current = $current; LogPath = $null }
    }

    $state.previous = $current
    $state.lastAttempted = $Tag
    $state.status = 'deploying'
    $state.lastAttemptStatus = 'running'
    $state.failureReason = $null
    Save-VirgoState $context.StatePath $state

    $backupPath = $null
    $tagChanged = $false
    $applicationChanged = $false
    try {
      $backupPath = New-VirgoDatabaseBackup $context $Tag
      $state.backupPath = $backupPath
      Save-VirgoState $context.StatePath $state

      Set-VirgoImageTag $context.EnvPath $current $Tag
      $tagChanged = $true
      Invoke-VirgoTargetedPull $context
      Invoke-VirgoMigration $context

      $applicationChanged = $true
      $verification = Invoke-VirgoApplicationStart $context $HealthTimeoutSeconds $HealthPollSeconds

      $state.current = $Tag
      $state.previous = $current
      $state.lastSuccessful = $Tag
      $state.lastAttempted = $Tag
      $state.status = 'healthy'
      $state.lastAttemptStatus = 'success'
      $state.deployedAt = (& $context.Now).ToString('o')
      $state.releaseCommit = $null
      $state.backupPath = $backupPath
      $state.deploymentDurationSeconds = [math]::Round(((& $context.Now) - $started).TotalSeconds, 3)
      $state.failureReason = $null
      $state.healthCheckResults = @($verification.Health) + @($verification.Smoke)
      Remove-VirgoFailedRelease $state $Tag
      Save-VirgoState $context.StatePath $state
      Invoke-VirgoBackupRetention $context
      Write-VirgoLog $context "Deployment successful: $Tag"
      return [pscustomobject]@{ ExitCode = 0; Status = 'healthy'; Tag = $Tag; Previous = $current; BackupPath = $backupPath; LogPath = $logPath }
    } catch {
      $failure = $_.Exception.Message
      Write-VirgoLog $context "Deployment failed for ${Tag}: $failure" 'ERROR'
      Add-VirgoFailedRelease $state $Tag $failure $context
      $state.lastAttempted = $Tag
      $state.failureReason = $failure
      $state.backupPath = $backupPath
      $state.deploymentDurationSeconds = [math]::Round(((& $context.Now) - $started).TotalSeconds, 3)

      if (-not $applicationChanged) {
        if ($tagChanged) {
          try { Set-VirgoImageTag $context.EnvPath $Tag $current } catch { Write-VirgoLog $context "Failed to restore IMAGE_TAG after pre-deploy failure: $($_.Exception.Message)" 'ERROR'; $state.status = 'critical'; $state.lastAttemptStatus = 'critical'; Save-VirgoState $context.StatePath $state; return [pscustomobject]@{ ExitCode = 2; Status = 'critical'; Tag = $Tag; Reason = $failure; LogPath = $logPath } }
        }
        $state.current = $current
        $state.lastSuccessful = $current
        $state.status = 'healthy'
        $state.lastAttemptStatus = 'failed-before-start'
        Save-VirgoState $context.StatePath $state
        return [pscustomobject]@{ ExitCode = 1; Status = 'failed-before-start'; Tag = $Tag; Previous = $current; BackupPath = $backupPath; Reason = $failure; LogPath = $logPath }
      }

      $state.status = 'rolling-back'
      $state.lastAttemptStatus = 'rolling-back'
      Save-VirgoState $context.StatePath $state
      try {
        $rollback = Invoke-VirgoRollback $context $Tag $current $HealthTimeoutSeconds $HealthPollSeconds
        $state.current = $current
        $state.lastSuccessful = $current
        $state.status = 'healthy'
        $state.lastAttemptStatus = 'rolled-back'
        $state.healthCheckResults = @($rollback.Health) + @($rollback.Smoke)
        Save-VirgoState $context.StatePath $state
        Write-VirgoLog $context "Rollback succeeded; $current is healthy. Database migrations were not reversed." 'WARN'
        return [pscustomobject]@{ ExitCode = 1; Status = 'rolled-back'; Tag = $Tag; Previous = $current; BackupPath = $backupPath; Reason = $failure; LogPath = $logPath }
      } catch {
        $rollbackFailure = $_.Exception.Message
        $state.status = 'critical'
        $state.lastAttemptStatus = 'rollback-failed'
        $state.failureReason = "Deployment: $failure | Rollback: $rollbackFailure"
        $states = @()
        foreach ($container in @($script:RequiredHealthContainers + 'virgo-cloudflared')) { $states += Get-VirgoContainerStatus $context $container }
        $state.healthCheckResults = $states
        Save-VirgoState $context.StatePath $state
        Write-VirgoLog $context "CRITICAL: rollback to $current failed: $rollbackFailure" 'ERROR'
        return [pscustomobject]@{ ExitCode = 2; Status = 'critical'; Tag = $Tag; Previous = $current; BackupPath = $backupPath; Reason = $state.failureReason; LogPath = $logPath }
      }
    }
  } finally {
    if ($lock) { $lock.Dispose() }
  }
}

Export-ModuleMember -Function @(
  'Test-VirgoTag',
  'ConvertTo-VirgoVersion',
  'New-VirgoContext',
  'Read-VirgoEnv',
  'Read-VirgoState',
  'Save-VirgoState',
  'Enter-VirgoDeploymentLock',
  'Get-LatestVirgoProductionRelease',
  'Get-VirgoReleaseByTag',
  'Test-VirgoReleaseReady',
  'Test-VirgoFailedRelease',
  'Get-VirgoReleaseDecision',
  'Initialize-VirgoDeploymentState',
  'Invoke-VirgoDeployment'
)
