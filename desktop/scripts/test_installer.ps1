[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InstallerPath,
    [string]$EvidenceDirectory,
    [switch]$TestPdf
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$desktopRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = [IO.Path]::GetFullPath((Join-Path $desktopRoot '..'))
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
if ([IO.Path]::GetFileName($InstallerPath) -notmatch '^AmazonAgroPropostas-Setup-\d+\.\d+\.\d+\.exe$') {
    throw 'Supply the generated Amazon Agro installer, not an arbitrary executable.'
}
if (-not $EvidenceDirectory) { $EvidenceDirectory = Join-Path $projectRoot ('.tmp\stage5\install-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
if (Test-Path -LiteralPath $EvidenceDirectory) { throw 'Evidence directory must be new.' }
$applicationDir = Join-Path $env:LOCALAPPDATA 'Programs\Amazon Agro Propostas'
$uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{3590E8D8-D4A1-4B90-A182-3E9E5B7D5FA8}_is1'
foreach ($registryRoot in @('HKCU:', 'HKLM:')) {
    if (Test-Path -LiteralPath ($registryRoot + '\' + $uninstallKey)) {
        throw 'A release is already installed. Run acceptance in a test account/machine; this script will not remove an existing installation.'
    }
}
if (Test-Path -LiteralPath $applicationDir) { throw 'Install directory already exists; preserving it.' }
$programs = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
$shortcut = Join-Path $programs 'Amazon Agro Propostas\Amazon Agro Propostas.lnk'
if (Test-Path -LiteralPath $shortcut) { throw 'Start Menu shortcut already exists; preserving it.' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null

function Get-TreeFingerprint([string]$Directory) {
    if (-not (Test-Path -LiteralPath $Directory)) { return @{files=0; sha256='absent'} }
    $records = @(Get-ChildItem -LiteralPath $Directory -File -Recurse | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($Directory.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    })
    $bytes = [Text.Encoding]::UTF8.GetBytes(($records -join "`n"))
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $digest = [BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
    return @{files=$records.Count; sha256=$digest}
}

function Install-Release([string]$LogName) {
    $arguments = @('/SP-', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER',
        ('/DIR="' + $applicationDir + '"'), ('/LOG="' + (Join-Path $EvidenceDirectory $LogName) + '"'))
    $process = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Setup failed: $($process.ExitCode). Inspect its log." }
}

$actualData = Join-Path $env:LOCALAPPDATA 'AmazonAgro'
$beforeData = Get-TreeFingerprint $actualData
$report = [ordered]@{ok=$false; install_mode='current_user'; directory=$applicationDir; real_user_data_before=$beforeData}
try {
    Install-Release 'setup-install.log'
    $executable = Join-Path $applicationDir 'AmazonAgroPropostas.exe'
    $uninstaller = Join-Path $applicationDir 'unins000.exe'
    if (-not (Test-Path -LiteralPath $executable) -or -not (Test-Path -LiteralPath $uninstaller)) { throw 'Installed executable/uninstaller absent.' }
    if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Installer did not create the Start Menu shortcut.' }
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($shortcut)
    if ($link.TargetPath -ne $executable) { throw 'Start Menu shortcut points to a different executable.' }
    $report.installed_ok = $true
    $report.start_menu_shortcut = $shortcut
    $smokeDirectory = Join-Path $EvidenceDirectory 'installed-smoke'
    $arguments = @('--smoke-test', ('"' + $smokeDirectory + '"'))
    if ($TestPdf) { $arguments += '--smoke-pdf' }
    $previousPath = $env:PATH
    try {
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        # Launch the installed Start Menu .lnk itself, not a copy in dist.
        $process = Start-Process -FilePath $shortcut -ArgumentList $arguments -WorkingDirectory $env:TEMP -WindowStyle Hidden -PassThru
        if (-not $process -or -not $process.WaitForExit(240000)) { throw 'Start Menu smoke did not finish. Inspect the installed app before removing it.' }
        if ($process.ExitCode -ne 0) { throw "Installed app smoke failed: $($process.ExitCode)" }
    } finally { $env:PATH = $previousPath }
    $smoke = Get-Content -LiteralPath (Join-Path $smokeDirectory 'report.json') -Raw | ConvertFrom-Json
    if (-not $smoke.ok -or -not $smoke.frozen -or $smoke.executable -ne $executable) { throw 'Installed/Start Menu smoke report did not pass.' }
    $report.start_menu_ok = $true
    $report.installed_smoke = $smoke
    $syntheticData = Join-Path $smokeDirectory 'localappdata\AmazonAgro'
    $syntheticBefore = Get-TreeFingerprint $syntheticData
    Install-Release 'setup-reinstall.log'
    $syntheticAfterReinstall = Get-TreeFingerprint $syntheticData
    if ($syntheticBefore.sha256 -ne $syntheticAfterReinstall.sha256) { throw 'Reinstall changed proposal/configuration data.' }
    $report.same_app_id_reinstall_ok = $true
    $uninstallArguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
        ('/LOG="' + (Join-Path $EvidenceDirectory 'setup-uninstall.log') + '"'))
    $process = Start-Process -FilePath $uninstaller -ArgumentList $uninstallArguments -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
    if (Test-Path -LiteralPath $executable) { throw 'Uninstaller left the installed executable.' }
    if (Test-Path -LiteralPath $shortcut) { throw 'Uninstaller left the Start Menu shortcut.' }
    $afterData = Get-TreeFingerprint $actualData
    $syntheticAfter = Get-TreeFingerprint $syntheticData
    if ($beforeData.sha256 -ne $afterData.sha256 -or $syntheticBefore.sha256 -ne $syntheticAfter.sha256) { throw 'User data fingerprint changed; investigate before release.' }
    $report.uninstall_ok = $true
    $report.localappdata_preserved = $true
    $report.real_user_data_after = $afterData
    $report.synthetic_user_data_preserved = ($syntheticBefore.files -gt 0)
    $report.ok = $true
} catch {
    $report.error = $_.Exception.Message
    throw
} finally {
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'installation-report.json') -Encoding utf8
}
Write-Output "Installation, Start Menu, reinstall and uninstall passed. Evidence: $EvidenceDirectory"
