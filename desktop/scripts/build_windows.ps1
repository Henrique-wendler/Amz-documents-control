[CmdletBinding()]
param(
    [string]$PythonPath,
    [string]$IsccPath,
    [switch]$PrepareEnvironment,
    [switch]$TestPdf,
    [switch]$AllowUnsignedRcWhenSmokeBlocked
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$desktopRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = [IO.Path]::GetFullPath((Join-Path $desktopRoot '..'))
$buildRoot = Join-Path $desktopRoot 'build'
$distRoot = Join-Path $desktopRoot 'dist'
$installerRoot = Join-Path $desktopRoot 'installer-output'
$installerStageRoot = $installerRoot
if (-not $PythonPath) { $PythonPath = Join-Path $desktopRoot '.venv-build\Scripts\python.exe' }
$PythonPath = [IO.Path]::GetFullPath($PythonPath)

function Test-BuildCleanupAccessDenied([System.Exception]$CleanupError) {
    for ($current = $CleanupError; $null -ne $current; $current = $current.InnerException) {
        if ($current -is [System.UnauthorizedAccessException]) { return $true }
    }
    return $false
}

function New-IsolatedBuildWorkspace([string]$DesktopRoot) {
    $resolvedDesktop = [IO.Path]::GetFullPath($DesktopRoot)
    $workspaceParent = [IO.Path]::GetFullPath((Join-Path $resolvedDesktop '.build-work'))
    if (-not $workspaceParent.StartsWith($resolvedDesktop + [IO.Path]::DirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unsafe isolated build root.'
    }
    if (Test-Path -LiteralPath $workspaceParent) {
        $item = Get-Item -LiteralPath $workspaceParent
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Isolated build root cannot be a junction/link.'
        }
    } else {
        New-Item -ItemType Directory -Path $workspaceParent | Out-Null
    }
    $runRoot = Join-Path $workspaceParent ('run-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    return [pscustomobject]@{
        BuildRoot = Join-Path $runRoot 'build'
        DistRoot = Join-Path $runRoot 'dist'
        InstallerStageRoot = Join-Path $runRoot 'installer-output'
    }
}

function Test-AppControlLaunchBlock([System.Exception]$LaunchError) {
    # This is called only when Start-Process throws before returning a process.
    # A crash, import error, timeout, or invalid smoke report must not qualify.
    for ($current = $LaunchError; $null -ne $current; $current = $current.InnerException) {
        if ($current.Message -match '(?i)(?:Controle de Aplicativo bloqueou este arquivo|application control policy (?:has )?blocked this file|blocked by your organization.s application control policy)') {
            return $true
        }
        if ($current -is [System.ComponentModel.Win32Exception] -and
            $current.NativeErrorCode -eq 1260 -and
            $current.Message -match '(?i)blocked by group policy') {
            return $true
        }
    }
    return $false
}

function Get-RecentCodeIntegrityEvents([string]$Executable, [datetime]$StartedAt) {
    try {
        $name = [IO.Path]::GetFileName($Executable)
        return @(
            Get-WinEvent -FilterHashtable @{
                LogName = 'Microsoft-Windows-CodeIntegrity/Operational'
                Id = @(3033, 3077)
                StartTime = $StartedAt.AddSeconds(-5)
            } -ErrorAction Stop |
                Where-Object { $_.Message -like ('*' + $name + '*') } |
                Select-Object -First 5 -Property Id, TimeCreated
        )
    } catch {
        return @()
    }
}

function Get-InstallerBaseName([string]$Executable, [string]$Version, [switch]$UnsignedRc) {
    $suffix = if ($UnsignedRc) { '-unsigned-rc' } else { '' }
    return $Executable + '-Setup-' + $Version + $suffix
}

function New-UnsignedRcManifest(
    [string]$Version, [int]$AutomatedTests, [string]$GitCommit,
    [string]$Sha256, [string]$SmokeStatus, [datetime]$BuildTimestamp
) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$' -or $AutomatedTests -le 0 -or
        $GitCommit -notmatch '^[0-9a-fA-F]{40}$' -or $Sha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        $SmokeStatus -notin @('PASS', 'BLOCKED_BY_POLICY')) {
        throw 'Invalid unsigned RC manifest fields.'
    }
    return [ordered]@{
        version = $Version
        release_type = 'UNSIGNED_RC'
        signed = $false
        smoke_status = $SmokeStatus
        automated_tests = $AutomatedTests
        frontend_build = 'PASS'
        static_audit = 'PASS'
        git_commit = $GitCommit.ToLowerInvariant()
        sha256 = $Sha256.ToUpperInvariant()
        build_timestamp = $BuildTimestamp.ToUniversalTime().ToString('o')
    }
}

function Invoke-Python([string[]]$Arguments) {
    & $PythonPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Python command failed ($LASTEXITCODE): $($Arguments[0])" }
}

function Remove-BuildArtifact([string]$ArtifactPath) {
    $resolvedArtifact = [IO.Path]::GetFullPath($ArtifactPath)
    $allowedArtifacts = @($buildRoot, $distRoot, $installerRoot)
    if ($resolvedArtifact -notin $allowedArtifacts -or
        -not $resolvedArtifact.StartsWith($desktopRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe build cleanup target: $resolvedArtifact"
    }
    if (Test-Path -LiteralPath $resolvedArtifact) {
        $item = Get-Item -LiteralPath $resolvedArtifact
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Build directory cannot be a junction/link.' }
        Remove-Item -LiteralPath $resolvedArtifact -Recurse -Force
    }
}

function Invoke-Smoke([string]$Executable, [string]$EvidenceDirectory,
                      [switch]$Pdf, [switch]$AllowPolicyBlock) {
    $smokeArguments = @('--smoke-test', ('"' + $EvidenceDirectory + '"'))
    if ($Pdf) { $smokeArguments += '--smoke-pdf' }
    $startedAt = Get-Date
    try {
        $smokeProcess = Start-Process -FilePath $Executable -ArgumentList $smokeArguments -WorkingDirectory $env:TEMP -WindowStyle Hidden -PassThru -ErrorAction Stop
    } catch {
        $launchError = $_.Exception
        if (-not $AllowPolicyBlock -or -not (Test-AppControlLaunchBlock $launchError)) { throw }
        $events = @(Get-RecentCodeIntegrityEvents $Executable $startedAt)
        $evidence = [ordered]@{
            status = 'SMOKE_BLOCKED_BY_POLICY'
            executable_started = $false
            launch_error = $launchError.Message
            code_integrity_events = @($events | ForEach-Object { [ordered]@{ id = $_.Id; timestamp = $_.TimeCreated.ToUniversalTime().ToString('o') } })
        }
        $evidence | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $buildRoot 'smoke-policy-evidence.json') -Encoding utf8
        Write-Warning 'SMOKE_BLOCKED_BY_POLICY: executable was denied before a process started; RC remains unaccepted.'
        return 'BLOCKED_BY_POLICY'
    }
    if (-not $smokeProcess.WaitForExit(240000)) {
        Stop-Process -Id $smokeProcess.Id -ErrorAction SilentlyContinue
        throw 'Packaged application smoke timed out. Check the evidence log; no Office process was terminated.'
    }
    if ($smokeProcess.ExitCode -ne 0) { throw "Packaged application smoke failed: $($smokeProcess.ExitCode)" }
    $report = Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'report.json') -Raw | ConvertFrom-Json
    if (-not $report.ok -or -not $report.frozen -or -not $report.xlsx_ok -or -not $report.sqlalchemy_pure_python) { throw 'Packaged smoke report did not pass.' }
    return 'PASS'
}

Push-Location $projectRoot
try {
    if ($PrepareEnvironment) {
        if (-not (Test-Path -LiteralPath $PythonPath)) {
            $developmentPython = Join-Path $desktopRoot '.venv\Scripts\python.exe'
            if (-not (Test-Path -LiteralPath $developmentPython)) { throw 'Create the development venv first or supply an existing build PythonPath.' }
            & $developmentPython -m venv (Join-Path $desktopRoot '.venv-build')
            if ($LASTEXITCODE -ne 0) { throw 'Could not create build venv.' }
        }
        Invoke-Python @('-m', 'pip', 'install', '-e', ($desktopRoot + '[dev,excel-com,packaging]'))
$sqlalchemyVersion = (& $PythonPath -c "import importlib.metadata as metadata; print(metadata.version('SQLAlchemy'))").Trim()
if ($LASTEXITCODE -ne 0 -or -not $sqlalchemyVersion) {
    throw 'Could not determine SQLAlchemy version.'}
            $previousCext = $env:DISABLE_SQLALCHEMY_CEXT
        try {
            $env:DISABLE_SQLALCHEMY_CEXT = '1'
            Invoke-Python @('-m', 'pip', 'install', '--force-reinstall', '--no-binary=SQLAlchemy', '--no-cache-dir', ('SQLAlchemy==' + $sqlalchemyVersion))
        } finally { $env:DISABLE_SQLALCHEMY_CEXT = $previousCext }
    }
    if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'Build venv absent. Use -PrepareEnvironment or supply -PythonPath.' }
    Invoke-Python @((Join-Path $PSScriptRoot 'package_support.py'), '--check-environment')
    $identityJson = & $PythonPath (Join-Path $PSScriptRoot 'package_support.py') --metadata
    if ($LASTEXITCODE -ne 0) { throw 'Could not load release identity.' }
    $identity = $identityJson | ConvertFrom-Json
    if (-not $IsccPath) {
        $isccCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
        if ($isccCommand) { $IsccPath = $isccCommand.Source }
        foreach ($candidate in @(
            (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
            (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
        )) { if (-not $IsccPath -and (Test-Path -LiteralPath $candidate)) { $IsccPath = $candidate } }
    }
    if ($AllowUnsignedRcWhenSmokeBlocked) {
        # A unique project-owned workspace avoids inherited ACLs on old build
        # output and leaves the previous validated Setup untouched.
        $workspace = New-IsolatedBuildWorkspace $desktopRoot
        $buildRoot = $workspace.BuildRoot
        $distRoot = $workspace.DistRoot
        $installerStageRoot = $workspace.InstallerStageRoot
    } else {
        try {
            foreach ($artifact in @($buildRoot, $distRoot, $installerRoot)) { Remove-BuildArtifact $artifact }
        } catch {
            if (-not (Test-BuildCleanupAccessDenied $_.Exception)) { throw }
            $workspace = New-IsolatedBuildWorkspace $desktopRoot
            $buildRoot = $workspace.BuildRoot
            $distRoot = $workspace.DistRoot
            $installerStageRoot = $workspace.InstallerStageRoot
            Write-Warning 'Legacy build output has an external ACL; using a fresh project-owned build workspace.'
        }
    }
    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    $junitReport = Join-Path $buildRoot 'pytest-results.xml'
    Invoke-Python @('-m', 'pytest', (Join-Path $desktopRoot 'tests'), ('--basetemp=' + (Join-Path $buildRoot 'pytest')), ('--junitxml=' + $junitReport), '-p', 'no:cacheprovider', '-q', '--tb=short')
    [xml]$testResults = Get-Content -LiteralPath $junitReport -Raw
    $testCount = [int]$testResults.testsuites.testsuite.tests
    if ($testCount -le 0) { throw 'Pytest did not report a positive test count.' }
    if ($AllowUnsignedRcWhenSmokeBlocked) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; no unsigned RC can be produced.' }
        & git diff --check
        if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed; no unsigned RC can be produced.' }
    }
    $buildPath = $env:PATH
    try {
        # Do not collect unrelated DLLs from developer tools (for example Poppler ICU).
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        Invoke-Python @('-m', 'PyInstaller', '--noconfirm', '--clean', '--workpath', (Join-Path $buildRoot 'pyinstaller'), '--distpath', $distRoot, (Join-Path $desktopRoot 'packaging\AmazonAgroPropostas.spec'))
    } finally { $env:PATH = $buildPath }
    $distribution = Join-Path $distRoot $identity.executable
    $executable = Join-Path $distribution ($identity.executable + '.exe')
    Invoke-Python @((Join-Path $PSScriptRoot 'package_support.py'), '--audit', $distribution, '--output', (Join-Path $buildRoot 'distribution-manifest.json'))
    if ($AllowUnsignedRcWhenSmokeBlocked) {
        $iconResource = Join-Path $distribution '_internal\amazon_agro\resources\AmazonAgro.ico'
        if (-not (Test-Path -LiteralPath $iconResource)) { throw 'Unsigned RC is missing the packaged application icon.' }
    }
    $previousPath = $env:PATH
    try {
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        $smokeStatus = Invoke-Smoke $executable (Join-Path $buildRoot 'smoke-onedir') -Pdf:$TestPdf -AllowPolicyBlock:$AllowUnsignedRcWhenSmokeBlocked
    } finally { $env:PATH = $previousPath }
    if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath)) {
        if ($AllowUnsignedRcWhenSmokeBlocked) { throw 'Inno Setup is required to produce the unsigned RC.' }
        Write-Warning 'Onedir and smoke passed. Inno Setup absent: no Setup was generated. Supply -IsccPath to finish.'
        return
    }
    New-Item -ItemType Directory -Path $installerStageRoot -Force | Out-Null
    $compilerArguments = @('/Qp', ('/DAppVersion=' + $identity.version), ('/DAppName=' + $identity.name),
        ('/DPublisher=' + $identity.publisher), ('/DExeName=' + $identity.executable),
        ('/DInstallerAppId={' + $identity.app_id), ('/DDistDir=' + $distribution),
        ('/DInstallerOutput=' + $installerStageRoot))
    $officialIcon = Join-Path $desktopRoot 'packaging\resources\AmazonAgro.ico'
    if ($AllowUnsignedRcWhenSmokeBlocked -and -not (Test-Path -LiteralPath $officialIcon)) {
        throw 'Unsigned RC requires AmazonAgro.ico in packaging/resources.'
    }
    if (Test-Path -LiteralPath $officialIcon) { $compilerArguments += ('/DAppIcon=' + $officialIcon) }
    if ($AllowUnsignedRcWhenSmokeBlocked) { $compilerArguments += '/DInstallerSuffix=-unsigned-rc' }
    & $IsccPath @compilerArguments (Join-Path $desktopRoot 'packaging\AmazonAgroPropostas.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }
    $baseName = Get-InstallerBaseName $identity.executable $identity.version -UnsignedRc:$AllowUnsignedRcWhenSmokeBlocked
    $stagedSetup = Join-Path $installerStageRoot ($baseName + '.exe')
    if (-not (Test-Path -LiteralPath $stagedSetup)) { throw 'Inno Setup did not produce the expected installer.' }
    if ($AllowUnsignedRcWhenSmokeBlocked) {
        if ((Get-AuthenticodeSignature -LiteralPath $executable).Status -ne 'NotSigned' -or
            (Get-AuthenticodeSignature -LiteralPath $stagedSetup).Status -ne 'NotSigned') {
            throw 'Unsigned RC mode requires an unsigned EXE and Setup.'
        }
    }
    if ($installerStageRoot -ne $installerRoot) {
        if (Test-Path -LiteralPath $installerRoot) {
            $outputItem = Get-Item -LiteralPath $installerRoot
            if ($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installer output cannot be a junction/link.' }
        } else { New-Item -ItemType Directory -Path $installerRoot | Out-Null }
        $setup = Join-Path $installerRoot ($baseName + '.exe')
        Copy-Item -LiteralPath $stagedSetup -Destination $setup -Force
    } else { $setup = $stagedSetup }
    $hash = Get-FileHash -LiteralPath $setup -Algorithm SHA256
    if ($installerStageRoot -ne $installerRoot -and
        $hash.Hash -ne (Get-FileHash -LiteralPath $stagedSetup -Algorithm SHA256).Hash) {
        throw 'Copied installer hash does not match the staged Setup.'
    }
    ($hash.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($setup)) | Set-Content -LiteralPath ($setup + '.sha256') -Encoding ascii
    if ($AllowUnsignedRcWhenSmokeBlocked) {
        $gitCommit = (& git rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Could not read the Git commit for the RC manifest.' }
        $manifest = New-UnsignedRcManifest $identity.version $testCount $gitCommit $hash.Hash $smokeStatus (Get-Date)
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $installerRoot ($baseName + '.manifest.json')) -Encoding utf8
        Write-Output "Release type: UNSIGNED_RC; smoke status: $smokeStatus; acceptance: PENDING"
    }
    Write-Output "Distribution: $distribution"
    Write-Output "Executable: $executable"
    Write-Output "Installer: $setup"
    Write-Output "SHA-256: $($hash.Hash)"
} finally { Pop-Location }
