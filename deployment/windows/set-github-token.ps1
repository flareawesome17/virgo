[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$RootPath = $PSScriptRoot,
  [string]$Repository = 'flareawesome17/virgo',
  [switch]$Clear
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($RootPath)
$secretsPath = Join-Path $root 'secrets'
$tokenPath = Join-Path $secretsPath 'github-releases-token.dpapi'

if ($Clear) {
  if ($PSCmdlet.ShouldProcess($tokenPath, 'Remove the encrypted GitHub Releases token')) {
    if (Test-Path -LiteralPath $tokenPath) { Remove-Item -LiteralPath $tokenPath -Force }
  }
  return
}

if (-not $PSCmdlet.ShouldProcess($tokenPath, 'Validate and store a read-only GitHub Releases token encrypted for this Windows account')) {
  return
}

$secure = Read-Host 'Fine-grained GitHub token (single repository, Contents: read)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if (-not $plain) { throw 'Token cannot be empty.' }
  $headers = @{
    Accept = 'application/vnd.github+json'
    Authorization = "Bearer $plain"
    'User-Agent' = 'Virgo-Production-Deployment-Worker-Setup'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  try {
    Invoke-WebRequest -Uri "https://api.github.com/repos/$Repository/releases?per_page=1" -Headers $headers -UseBasicParsing -TimeoutSec 20 | Out-Null
  } catch {
    throw "GitHub token validation failed. Confirm repository access and Contents: read permission. $($_.Exception.Message)"
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $plain = $null
}

if (-not (Test-Path -LiteralPath $secretsPath -PathType Container)) { [System.IO.Directory]::CreateDirectory($secretsPath) | Out-Null }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $secretsPath '/inheritance:r' '/grant:r' "$identity`:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the secrets directory ACL.' }

$ciphertext = $secure | ConvertFrom-SecureString
$temp = Join-Path $secretsPath ('.github-token.' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
  [System.IO.File]::WriteAllText($temp, $ciphertext + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  & icacls.exe $temp '/inheritance:r' '/grant:r' "$identity`:F" 'SYSTEM:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the encrypted token file ACL.' }
  if (Test-Path -LiteralPath $tokenPath) { [System.IO.File]::Replace($temp, $tokenPath, $null, $true) }
  else { [System.IO.File]::Move($temp, $tokenPath) }
} catch {
  throw
} finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
}

Write-Host "GitHub Releases API access verified. Token stored with Windows DPAPI at $tokenPath"
Write-Host 'The token can be decrypted only by this Windows account on this machine.'
