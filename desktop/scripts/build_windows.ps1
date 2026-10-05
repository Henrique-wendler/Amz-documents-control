[CmdletBinding()]
param(
    [string]$PythonPath,
    [string]$IsccPath,
    [switch]$PrepareEnvironment,
    [switch]$TestPdf
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$desktopRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = [IO.Path]::GetFullPath((Join-Path $desktopRoot '..'))
$buildRoot = Join-Path $desktopRoot 'build'
$distRoot = Join-Path $desktopRoot 'dist'
$installerRoot = Join-Path $desktopRoot 'installer-output'
if (-not $PythonPath) { $PythonPath = Join-Path $desktopRoot '.venv-build\Scripts\python.exe' }
$PythonPath = [IO.Path]::GetFullPath($PythonPath)

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

function Invoke-Smoke([string]$Executable, [string]$EvidenceDirectory, [switch]$Pdf) {
    $smokeArguments = @('--smoke-test', ('"' + $EvidenceDirectory + '"'))
    if ($Pdf) { $smokeArguments += '--smoke-pdf' }
    $smokeProcess = Start-Process -FilePath $Executable -ArgumentList $smokeArguments -WorkingDirectory $env:TEMP -WindowStyle Hidden -PassThru
    if (-not $smokeProcess.WaitForExit(240000)) {
        Stop-Process -Id $smokeProcess.Id -ErrorAction SilentlyContinue
        throw 'Packaged application smoke timed out. Check the evidence log; no Office process was terminated.'
    }
    if ($smokeProcess.ExitCode -ne 0) { throw "Packaged application smoke failed: $($smokeProcess.ExitCode)" }
    $report = Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'report.json') -Raw | ConvertFrom-Json
    if (-not $report.ok -or -not $report.frozen -or -not $report.xlsx_ok -or -not $report.sqlalchemy_pure_python) { throw 'Packaged smoke report did not pass.' }
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
        $sqlalchemyVersion = & $PythonPath -c 'import importlib.metadata; print(importlib.metadata.version("SQLAlchemy"))'
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
    foreach ($artifact in @($buildRoot, $distRoot, $installerRoot)) { Remove-BuildArtifact $artifact }
    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    Invoke-Python @('-m', 'pytest', (Join-Path $desktopRoot 'tests'), ('--basetemp=' + (Join-Path $buildRoot 'pytest')), '-p', 'no:cacheprovider', '-q', '--tb=short')
    $buildPath = $env:PATH
    try {
        # Do not collect unrelated DLLs from developer tools (for example Poppler ICU).
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        Invoke-Python @('-m', 'PyInstaller', '--noconfirm', '--clean', '--workpath', (Join-Path $buildRoot 'pyinstaller'), '--distpath', $distRoot, (Join-Path $desktopRoot 'packaging\AmazonAgroPropostas.spec'))
    } finally { $env:PATH = $buildPath }
    $distribution = Join-Path $distRoot $identity.executable
    $executable = Join-Path $distribution ($identity.executable + '.exe')
    Invoke-Python @((Join-Path $PSScriptRoot 'package_support.py'), '--audit', $distribution, '--output', (Join-Path $buildRoot 'distribution-manifest.json'))
    $previousPath = $env:PATH
    try {
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        Invoke-Smoke $executable (Join-Path $buildRoot 'smoke-onedir') -Pdf:$TestPdf
    } finally { $env:PATH = $previousPath }
    if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath)) {
        Write-Warning 'Onedir and smoke passed. Inno Setup absent: no Setup was generated. Supply -IsccPath to finish.'
        return
    }
    New-Item -ItemType Directory -Path $installerRoot -Force | Out-Null
    $compilerArguments = @('/Qp', ('/DAppVersion=' + $identity.version), ('/DAppName=' + $identity.name),
        ('/DPublisher=' + $identity.publisher), ('/DExeName=' + $identity.executable),
        ('/DInstallerAppId={' + $identity.app_id), ('/DDistDir=' + $distribution),
        ('/DInstallerOutput=' + $installerRoot))
    $officialIcon = Join-Path $desktopRoot 'packaging\resources\AmazonAgro.ico'
    if (Test-Path -LiteralPath $officialIcon) { $compilerArguments += ('/DAppIcon=' + $officialIcon) }
    & $IsccPath @compilerArguments (Join-Path $desktopRoot 'packaging\AmazonAgroPropostas.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }
    $setup = Join-Path $installerRoot ($identity.executable + '-Setup-' + $identity.version + '.exe')
    $hash = Get-FileHash -LiteralPath $setup -Algorithm SHA256
    ($hash.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($setup)) | Set-Content -LiteralPath ($setup + '.sha256') -Encoding ascii
    Write-Output "Distribution: $distribution"
    Write-Output "Executable: $executable"
    Write-Output "Installer: $setup"
    Write-Output "SHA-256: $($hash.Hash)"
} finally { Pop-Location }
