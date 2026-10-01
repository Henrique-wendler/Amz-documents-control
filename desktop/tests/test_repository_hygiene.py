from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "desktop"


def test_local_database_and_customer_data_directories_are_ignored():
    paths = (
        "desktop/catalog.sqlite3",
        "desktop/catalog.sqlite3-wal",
        "desktop/data/example.xlsx",
        "desktop/sources/example.xlsm",
        "desktop/example.xlsx",
        "desktop/exports/proposal.pdf",
        "desktop/config.json",
    )
    for path in paths:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", path],
            cwd=ROOT, check=False, capture_output=True,
        )
        assert result.returncode == 0, path


def test_tests_do_not_contain_real_workbooks_or_runtime_databases():
    forbidden = {".xlsx", ".xlsm", ".sqlite", ".sqlite3", ".db"}
    assert not [
        path for path in (DESKTOP / "tests").rglob("*")
        if path.is_file() and path.suffix.casefold() in forbidden
    ]
