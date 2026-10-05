"""Portable build-contract tests. No compiler or Office required for the suite."""
import importlib.util
from importlib import metadata
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tomllib

import pytest

from amazon_agro.config.resources import resource_path
from amazon_agro.config.settings import default_data_dir
from amazon_agro.version import __version__, APP_ID
from amazon_agro.app.smoke import configure_smoke

DESKTOP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("package_support", DESKTOP / "scripts/package_support.py")
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def test_release_identity_is_shared_and_version_is_dynamic():
    config = tomllib.loads((DESKTOP / "pyproject.toml").read_text(encoding="utf-8"))
    assert config["project"]["dynamic"] == ["version"]
    assert config["tool"]["setuptools"]["dynamic"]["version"]["attr"] == "amazon_agro.version.__version__"
    identity = support.release_identity()
    assert identity["version"] == __version__
    assert identity["app_id"] == APP_ID
    assert identity["executable"] == "AmazonAgroPropostas"


def test_provisional_icon_contains_windows_sizes_and_is_wired_to_setup():
    resources = DESKTOP / "packaging/resources"
    svg = (resources / "AmazonAgro.svg").read_text(encoding="utf-8")
    assert "<svg" in svg and "provisório" in svg
    png = (resources / "AmazonAgro.png").read_bytes()
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    icon = (resources / "AmazonAgro.ico").read_bytes()
    reserved, kind, count = struct.unpack_from("<HHH", icon)
    assert (reserved, kind, count) == (0, 1, 7)
    sizes = []
    for index in range(count):
        width, height, _, _, _, _, length, offset = struct.unpack_from(
            "<BBBBHHII", icon, 6 + 16 * index
        )
        sizes.append((width or 256, height or 256))
        assert icon[offset:offset + length].startswith(b"\x89PNG\r\n\x1a\n")
    assert sizes == [(size, size) for size in (16, 24, 32, 48, 64, 128, 256)]
    installer = (DESKTOP / "packaging/AmazonAgroPropostas.iss").read_text(encoding="utf-8")
    assert "SetupIconFile={#AppIcon}" in installer
    assert "UninstallDisplayIcon={app}\\{#ExeName}.exe" in installer
    assert installer.count('IconFilename: "{app}\\{#ExeName}.exe"') == 2


def test_build_script_queries_sqlalchemy_version_through_powershell():
    """Execute only the actual version assignment, never the packaging script."""
    powershell = shutil.which("powershell.exe") if os.name == "nt" else None
    if powershell is None:
        pytest.skip("PowerShell is required for the Windows build-script regression")
    script = r"""
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $env:AMAZON_AGRO_BUILD_SCRIPT, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Invalid build-script syntax.' }
$assignments = $ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left.Extent.Text -eq '$sqlalchemyVersion'
}, $true)
if ($assignments.Count -ne 1) { throw 'Expected one SQLAlchemy version assignment.' }
$PythonPath = $env:AMAZON_AGRO_TEST_PYTHON
Invoke-Expression $assignments[0].Extent.Text
if ($LASTEXITCODE -ne 0 -or -not $sqlalchemyVersion) {
    throw 'SQLAlchemy version query failed.'
}
Write-Output $sqlalchemyVersion
"""
    environment = os.environ.copy()
    environment["AMAZON_AGRO_BUILD_SCRIPT"] = str(DESKTOP / "scripts/build_windows.ps1")
    environment["AMAZON_AGRO_TEST_PYTHON"] = sys.executable
    result = subprocess.run(
        [powershell, "-NoProfile", "-NonInteractive", "-Command", script],
        env=environment, capture_output=True, text=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip() == metadata.version("SQLAlchemy")


def test_frozen_resources_ignore_current_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path / "bundle/_internal"), raising=False)
    assert resource_path("templates", "modelo_proposta.xlsx") == tmp_path / "bundle/_internal/amazon_agro/templates/modelo_proposta.xlsx"
    assert resource_path("resources", "AmazonAgro.ico") == tmp_path / "bundle/_internal/amazon_agro/resources/AmazonAgro.ico"


@pytest.fixture
def fake_distribution(tmp_path, monkeypatch):
    monkeypatch.setattr(support, "validate_build_environment", lambda: {"test": "synthetic"})
    distribution = tmp_path / "AmazonAgroPropostas"
    resources = {
        "AmazonAgroPropostas.exe": b"synthetic executable",
        "_internal/python312.dll": b"synthetic interpreter",
        "_internal/PySide6/plugins/platforms/qwindows.dll": b"synthetic plugin",
        "_internal/amazon_agro/templates/modelo_proposta.xlsx":
            (DESKTOP / "src/amazon_agro/templates/modelo_proposta.xlsx").read_bytes(),
    }
    for relative, contents in resources.items():
        path = distribution / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)
    return distribution


def test_manifest_requires_authorized_template_and_hashes_every_file(fake_distribution):
    manifest = support.distribution_manifest(fake_distribution)
    assert manifest["file_count"] == 4
    assert manifest["template_unchanged"]
    assert all(len(entry["sha256"]) == 64 for entry in manifest["files"])
    assert manifest["bytes"] == sum(entry["bytes"] for entry in manifest["files"])


@pytest.mark.parametrize("relative", [
    "customer.xlsx", "customer.xlsm", "proposals.sqlite3", "proposals.sqlite3-wal",
    "exports/proposal.pdf", "config.json", ".env.private", "private.log",
    "_internal/SQLAlchemy/sql/_cache_key_cy.pyd", "_internal/amazon_agro/private.json",
    "_internal/amazon_agro_desktop-0.1.0.dist-info/direct_url.json",
])
def test_manifest_rejects_private_data_or_optional_extensions(fake_distribution, relative):
    path = fake_distribution / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"synthetic forbidden content")
    with pytest.raises(ValueError):
        support.distribution_manifest(fake_distribution)


def test_manifest_rejects_missing_or_modified_template(fake_distribution):
    template = fake_distribution / "_internal/amazon_agro/templates/modelo_proposta.xlsx"
    template.write_bytes(b"unauthorized replacement")
    with pytest.raises(ValueError, match="differs"):
        support.distribution_manifest(fake_distribution)
    template.unlink()
    with pytest.raises(FileNotFoundError):
        support.distribution_manifest(fake_distribution)


def test_smoke_is_opt_in_and_cannot_reuse_user_data(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "real-user-data"))
    monkeypatch.setenv("AMAZON_AGRO_CONFIG", str(tmp_path / "real-config.json"))
    assert configure_smoke([]) is None
    assert default_data_dir() == tmp_path / "real-user-data/AmazonAgro"
    evidence = tmp_path / "evidence"
    options = configure_smoke(["--smoke-test", str(evidence), "--smoke-no-pdf"])
    assert options.no_pdf
    assert default_data_dir() == evidence / "localappdata/AmazonAgro"
    with pytest.raises(FileExistsError):
        configure_smoke(["--smoke-test", str(evidence)])


def test_real_entrypoint_smoke_without_pdf(tmp_path):
    evidence = tmp_path / "entrypoint-evidence"
    environment = os.environ.copy()
    environment["QT_QPA_PLATFORM"] = "offscreen"
    result = subprocess.run([sys.executable, "-m", "amazon_agro.app", "--smoke-test", str(evidence), "--smoke-no-pdf"],
                            env=environment, cwd=tmp_path, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads((evidence / "report.json").read_text(encoding="utf-8"))
    assert report["ok"] and report["xlsx_ok"] and report["onboarding_ok"]
    assert report["save_reopen_ok"] and report["local_source_ok"]
    assert report["pdf_unavailable_feedback"] and report["pdf_backends"] == []
    assert report["sqlite_integrity"] == "ok"


def test_installer_preserves_user_data_and_supports_upgrade_modes():
    script = (DESKTOP / "packaging/AmazonAgroPropostas.iss").read_text(encoding="utf-8")
    active_lines = "\n".join(line for line in script.splitlines() if not line.lstrip().startswith(";"))
    assert "[UninstallDelete]" not in active_lines
    assert "LOCALAPPDATA" not in active_lines
    assert "PrivilegesRequiredOverridesAllowed=dialog commandline" in active_lines
    assert "AppId={#InstallerAppId}" in active_lines
    assert "UsePreviousAppDir=yes" in active_lines
