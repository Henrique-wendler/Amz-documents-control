"""Build identity and a fail-closed audit of the generated onedir distribution."""
from __future__ import annotations

import argparse
from hashlib import sha256
import importlib.metadata
import json
from pathlib import Path
import re
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]


def release_identity() -> dict[str, str]:
    values = runpy.run_path(str(ROOT / "src/amazon_agro/version.py"))
    version = values["__version__"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Release version must be MAJOR.MINOR.PATCH.")
    return {"version": version, "name": values["APP_NAME"],
            "executable": values["EXECUTABLE_NAME"], "publisher": values["PUBLISHER"],
            "app_id": values["APP_ID"]}


def validate_build_environment() -> dict[str, str]:
    import struct
    import sqlalchemy
    from sqlalchemy.util._has_cython import HAS_CYEXTENSION
    if sys.platform != "win32" or struct.calcsize("P") != 8 or sys.version_info[:2] != (3, 12):
        raise RuntimeError("The first release requires a Windows x64 Python 3.12 build environment.")
    if importlib.metadata.version("amazon-agro-desktop") != release_identity()["version"]:
        raise RuntimeError("Installed project metadata is stale. Rebuild with -PrepareEnvironment.")
    if HAS_CYEXTENSION or list(Path(sqlalchemy.__file__).parent.rglob("*.pyd")):
        raise RuntimeError("SQLAlchemy must be installed from source with DISABLE_SQLALCHEMY_CEXT=1.")
    return {name: importlib.metadata.version(name) for name in
            ("PyInstaller", "pyinstaller-hooks-contrib", "PySide6", "SQLAlchemy", "openpyxl", "pywin32")}


def distribution_manifest(distribution: Path) -> dict:
    distribution = distribution.resolve()
    template = ROOT / "src/amazon_agro/templates/modelo_proposta.xlsx"
    expected_template = "_internal/amazon_agro/templates/modelo_proposta.xlsx"
    identity = release_identity()
    required = [identity["executable"] + ".exe", expected_template,
                "_internal/amazon_agro/resources/AmazonAgroLogo.png",
                "_internal/python312.dll", "_internal/PySide6/plugins/platforms/qwindows.dll"]
    for relative in required:
        if not (distribution / relative).is_file():
            raise FileNotFoundError(f"Required distribution resource is absent: {relative}")
    entries = []
    for path in sorted(distribution.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(distribution).as_posix()
        suffix = path.suffix.lower()
        if suffix in {".xlsx", ".xlsm", ".db", ".sqlite", ".sqlite3", ".log", ".pdf", ".docx", ".csv"} or suffix.startswith((".sqlite", ".db-")):
            if relative != expected_template:
                raise ValueError(f"Private/runtime data cannot be distributed: {relative}")
        if path.name.lower() in {"config.json", "direct_url.json", ".env"} or path.name.lower().startswith(".env."):
            raise ValueError(f"Personal configuration cannot be distributed: {relative}")
        if any(part.lower() in {"sources", "exports", "downloads", "fixtures", "tests", ".tmp"}
               for part in path.relative_to(distribution).parts):
            raise ValueError(f"Unexpected development data in distribution: {relative}")
        if "sqlalchemy" in relative.lower() and suffix in {".pyd", ".dll"}:
            raise ValueError(f"Optional SQLAlchemy native extension found: {relative}")
        if relative.startswith("_internal/amazon_agro/") and relative not in {
            expected_template, "_internal/amazon_agro/resources/AmazonAgro.ico",
            "_internal/amazon_agro/resources/AmazonAgroLogo.png"
        }:
            raise ValueError(f"Application resource is not on the release allowlist: {relative}")
        entries.append({"path": relative, "bytes": path.stat().st_size,
                        "sha256": sha256(path.read_bytes()).hexdigest()})
    packaged_template = distribution / expected_template
    if sha256(packaged_template.read_bytes()).digest() != sha256(template.read_bytes()).digest():
        raise ValueError("Packaged template differs from the authorized source template.")
    logo = ROOT / "src/amazon_agro/resources/AmazonAgroLogo.png"
    if sha256((distribution / "_internal/amazon_agro/resources/AmazonAgroLogo.png").read_bytes()).digest() != sha256(logo.read_bytes()).digest():
        raise ValueError("Packaged logo differs from the authorized source logo.")
    return {"release": identity, "build_tools": validate_build_environment(),
            "bytes": sum(item["bytes"] for item in entries), "file_count": len(entries),
            "template_unchanged": True, "sqlalchemy_pure_python": True, "files": entries}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", action="store_true")
    parser.add_argument("--check-environment", action="store_true")
    parser.add_argument("--audit", type=Path)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    if options.audit:
        result = distribution_manifest(options.audit)
    else:
        result = release_identity()
        if options.check_environment:
            result["tools"] = validate_build_environment()
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if options.output:
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
