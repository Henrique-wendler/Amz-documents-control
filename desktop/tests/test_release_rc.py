"""Windows build gates for an unsigned, unaccepted release candidate."""

import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


DESKTOP = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe") if os.name == "nt" else None
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell is required")


FUNCTION_PRELUDE = r"""
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $env:AA_RC_BUILD, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Invalid build script.' }
foreach ($name in ($env:AA_RC_FUNCTIONS -split ',')) {
    $matches = $ast.FindAll({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq $name
    }, $true)
    if ($matches.Count -ne 1) { throw ('Expected one function: ' + $name) }
    Invoke-Expression $matches[0].Extent.Text
}
"""


def run_powershell(script: str, *, functions: tuple[str, ...], **values: Path) -> str:
    environment = os.environ.copy()
    environment["AA_RC_BUILD"] = str(DESKTOP / "scripts/build_windows.ps1")
    environment["AA_RC_FUNCTIONS"] = ",".join(functions)
    for key, value in values.items():
        environment[key] = str(value)
    result = subprocess.run(
        [POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", FUNCTION_PRELUDE + script],
        env=environment, capture_output=True, text=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()


def test_policy_classifier_requires_concrete_prelaunch_evidence():
    output = run_powershell(r"""
$policy = [InvalidOperationException]::new('Uma política de Controle de Aplicativo bloqueou este arquivo.')
$english = [InvalidOperationException]::new('An application control policy has blocked this file.')
$ordinary = [InvalidOperationException]::new('Qt platform plugin failed to load.')
$ambiguous = [InvalidOperationException]::new('Process launch failed: access denied.')
[ordered]@{
    policy = (Test-AppControlLaunchBlock $policy)
    english = (Test-AppControlLaunchBlock $english)
    ordinary = (Test-AppControlLaunchBlock $ordinary)
    ambiguous = (Test-AppControlLaunchBlock $ambiguous)
} | ConvertTo-Json -Compress
""", functions=("Test-AppControlLaunchBlock",))
    assert json.loads(output.splitlines()[-1]) == {
        "policy": True, "english": True, "ordinary": False, "ambiguous": False,
    }


def test_smoke_gate_only_accepts_policy_with_explicit_rc_flag(tmp_path):
    output = run_powershell(r"""
$buildRoot = $env:AA_RC_TEMP
function Get-RecentCodeIntegrityEvents { return @() }
function Start-Process {
    [CmdletBinding()]
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
    throw [InvalidOperationException]::new('Uma política de Controle de Aplicativo bloqueou este arquivo.')
}
$normalBlocked = $false
try { Invoke-Smoke 'synthetic.exe' 'unused' | Out-Null } catch { $normalBlocked = $true }
$rcStatus = Invoke-Smoke 'synthetic.exe' 'unused' -AllowPolicyBlock
$evidence = Get-Content -LiteralPath (Join-Path $buildRoot 'smoke-policy-evidence.json') -Raw | ConvertFrom-Json
function Start-Process {
    [CmdletBinding()]
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
    throw [InvalidOperationException]::new('Application import error.')
}
$ordinaryBlocked = $false
try { Invoke-Smoke 'synthetic.exe' 'unused' -AllowPolicyBlock | Out-Null } catch { $ordinaryBlocked = $true }
[ordered]@{
    normal_blocked = $normalBlocked
    rc_status = $rcStatus
    ordinary_blocked = $ordinaryBlocked
    evidence_status = $evidence.status
    executable_started = $evidence.executable_started
} | ConvertTo-Json -Compress
""", functions=("Test-AppControlLaunchBlock", "Get-RecentCodeIntegrityEvents", "Invoke-Smoke"), AA_RC_TEMP=tmp_path)
    assert json.loads(output.splitlines()[-1]) == {
        "normal_blocked": True,
        "rc_status": "BLOCKED_BY_POLICY",
        "ordinary_blocked": True,
        "evidence_status": "SMOKE_BLOCKED_BY_POLICY",
        "executable_started": False,
    }


def test_unsigned_rc_name_manifest_and_no_private_fields():
    output = run_powershell(r"""
$manifest = New-UnsignedRcManifest '0.1.0' 259 ('a' * 40) ('B' * 64) 'BLOCKED_BY_POLICY' ([datetime]'2026-10-05T12:00:00Z')
[ordered]@{
    normal = (Get-InstallerBaseName 'AmazonAgroPropostas' '0.1.0')
    rc = (Get-InstallerBaseName 'AmazonAgroPropostas' '0.1.0' -UnsignedRc)
    manifest = $manifest
} | ConvertTo-Json -Depth 4 -Compress
""", functions=("New-UnsignedRcManifest", "Get-InstallerBaseName"))
    result = json.loads(output)
    assert result["normal"] == "AmazonAgroPropostas-Setup-0.1.0"
    assert result["rc"] == "AmazonAgroPropostas-Setup-0.1.0-unsigned-rc"
    manifest = result["manifest"]
    assert manifest == {
        "version": "0.1.0", "release_type": "UNSIGNED_RC", "signed": False,
        "smoke_status": "BLOCKED_BY_POLICY", "automated_tests": 259,
        "frontend_build": "PASS", "static_audit": "PASS", "git_commit": "a" * 40,
        "sha256": "B" * 64, "build_timestamp": "2026-10-05T12:00:00.0000000Z",
    }
    assert not any(key in manifest for key in ("source_directory", "user_data", "proposals", "cpf_cnpj"))


def test_isolated_workspace_preserves_legacy_artifacts(tmp_path):
    old = tmp_path / "build" / "pytest"
    old.mkdir(parents=True)
    marker = old / "keep.txt"
    marker.write_text("existing artifact", encoding="utf-8")
    output = run_powershell(r"""
$one = New-IsolatedBuildWorkspace $env:AA_RC_TEMP
$two = New-IsolatedBuildWorkspace $env:AA_RC_TEMP
[ordered]@{
    first = $one.BuildRoot
    second = $two.BuildRoot
    preserved = (Test-Path -LiteralPath (Join-Path $env:AA_RC_TEMP 'build\pytest\keep.txt'))
} | ConvertTo-Json -Compress
""", functions=("New-IsolatedBuildWorkspace",), AA_RC_TEMP=tmp_path)
    result = json.loads(output)
    assert result["preserved"] is True
    assert result["first"] != result["second"]
    assert Path(result["first"]).resolve().is_relative_to(tmp_path.resolve())
    assert Path(result["second"]).resolve().is_relative_to(tmp_path.resolve())
    assert marker.read_text(encoding="utf-8") == "existing artifact"


def test_rc_build_contract_and_icon_are_explicit():
    build = (DESKTOP / "scripts/build_windows.ps1").read_text(encoding="utf-8")
    installer = (DESKTOP / "packaging/AmazonAgroPropostas.iss").read_text(encoding="utf-8")
    spec = (DESKTOP / "packaging/AmazonAgroPropostas.spec").read_text(encoding="utf-8")
    main = (DESKTOP / "src/amazon_agro/app/main.py").read_text(encoding="utf-8")
    assert "[switch]$AllowUnsignedRcWhenSmokeBlocked" in build
    assert "-AllowPolicyBlock:$AllowUnsignedRcWhenSmokeBlocked" in build
    assert "'/DInstallerSuffix=-unsigned-rc'" in build
    assert "OutputBaseFilename={#ExeName}-Setup-{#AppVersion}{#InstallerSuffix}" in installer
    assert "SetupIconFile={#AppIcon}" in installer
    assert "IconFilename: \"{app}\\{#ExeName}.exe\"" in installer
    assert 'icon=str(icon) if icon.is_file() else None' in spec
    assert 'window.setWindowIcon(app.windowIcon())' in main
    assert (DESKTOP / "packaging/resources/AmazonAgro.ico").is_file()
    assert "Get-AuthenticodeSignature" in build
    assert "--audit" in build and "--junitxml=" in build
