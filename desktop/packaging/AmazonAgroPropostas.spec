from pathlib import Path
import runpy

from PyInstaller.utils.hooks import copy_metadata
from PyInstaller.utils.win32.versioninfo import (
    VSVersionInfo, FixedFileInfo, StringFileInfo, StringTable, StringStruct,
    VarFileInfo, VarStruct,
)
from sqlalchemy.util._has_cython import HAS_CYEXTENSION
import sqlalchemy
import PySide6

root = Path(SPECPATH).resolve().parent
identity = runpy.run_path(str(root / "src/amazon_agro/version.py"))
version = identity["__version__"]
numeric_version = tuple(int(part) for part in version.split(".")) + (0,)
sqlalchemy_root = Path(sqlalchemy.__file__).parent
if HAS_CYEXTENSION or list(sqlalchemy_root.rglob("*.pyd")):
    raise RuntimeError("Build requires a pure-Python SQLAlchemy installation. See BUILD WINDOWS.")

icon = root / "packaging/resources/AmazonAgro.ico"
datas = [(str(root / "src/amazon_agro/templates/modelo_proposta.xlsx"), "amazon_agro/templates")]
# Keep one compatible app-local MSVC runtime available before Python/Qt startup.
# The Python interpreter's runtime may be older than the Qt wheel's runtime.
qt_directory = Path(PySide6.__file__).parent
runtime_names = {"vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll",
                 "msvcp140_1.dll", "msvcp140_2.dll", "msvcp140_codecvt_ids.dll", "concrt140.dll"}
runtime_binaries = [(str(path), ".") for path in qt_directory.glob("*.dll")
                    if path.name.lower() in runtime_names]
if icon.is_file():
    datas.append((str(icon), "amazon_agro/resources"))
for distribution in ("amazon-agro-desktop", "SQLAlchemy", "openpyxl", "PySide6", "pywin32"):
    for source, target in copy_metadata(distribution):
        source = Path(source)
        for path in source.rglob("*"):
            if path.is_file() and path.name not in {"direct_url.json", "RECORD", "REQUESTED", "INSTALLER"}:
                datas.append((str(path), str(Path(target) / path.relative_to(source).parent)))

version_info = VSVersionInfo(
    ffi=FixedFileInfo(filevers=numeric_version, prodvers=numeric_version,
        mask=0x3F, flags=0, OS=0x40004, fileType=1, subtype=0, date=(0, 0)),
    kids=[StringFileInfo([StringTable("041604B0", [
        StringStruct("CompanyName", identity["PUBLISHER"]),
        StringStruct("FileDescription", identity["APP_NAME"]),
        StringStruct("FileVersion", version),
        StringStruct("ProductName", identity["APP_NAME"]),
        StringStruct("ProductVersion", version),
        StringStruct("OriginalFilename", identity["EXECUTABLE_NAME"] + ".exe"),
    ])]), VarFileInfo([VarStruct("Translation", [1046, 1200])])],
)

a = Analysis(
    [str(root / "packaging/entrypoint.py")], pathex=[str(root / "src")],
    binaries=runtime_binaries, datas=datas,
    hiddenimports=["sqlalchemy.dialects.sqlite", "pythoncom", "pywintypes",
                   "win32com.client", "win32api", "win32process", "PySide6.QtTest"],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=["pytest", "_pytest", "PyQt5", "PyQt6", "PySide2", "tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True,
    name=identity["EXECUTABLE_NAME"], debug=False, bootloader_ignore_signals=False,
    strip=False, upx=False, console=False, disable_windowed_traceback=False,
    version=version_info, icon=str(icon) if icon.is_file() else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False,
               name=identity["EXECUTABLE_NAME"])
