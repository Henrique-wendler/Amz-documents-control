from __future__ import annotations

import importlib.util
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from amazon_agro.exporters.contracts import PdfConversionBackend


logger = logging.getLogger(__name__)


class PdfBackendUnavailableError(RuntimeError):
    pass


class ExcelComPdfBackend:
    name = "Excel COM"

    def is_available(self) -> bool:
        if sys.platform != "win32" or importlib.util.find_spec("win32com") is None:
            return False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"Excel.Application\CLSID"):
                return True
        except OSError:
            return False

    def convert(self, filled_xlsx: Path, destination: Path) -> Path:
        if not self.is_available():
            raise PdfBackendUnavailableError("Excel COM não está disponível.")
        import pythoncom
        from win32com.client import DispatchEx

        application = None
        workbook = None
        pythoncom.CoInitialize()
        try:
            application = DispatchEx("Excel.Application")
            application.Visible = False
            application.DisplayAlerts = False
            workbook = application.Workbooks.Open(
                str(filled_xlsx.resolve()), UpdateLinks=0, ReadOnly=True
            )
            workbook.ExportAsFixedFormat(0, str(destination.resolve()))
        finally:
            try:
                if workbook is not None:
                    workbook.Close(SaveChanges=False)
            finally:
                try:
                    if application is not None:
                        application.Quit()
                finally:
                    # Release COM proxies before tearing down this apartment.
                    # Keeping them alive can stall CoUninitialize after Excel exits.
                    workbook = None
                    application = None
                    pythoncom.CoUninitialize()
        return destination


class LibreOfficePdfBackend:
    name = "LibreOffice"

    @staticmethod
    def _executable() -> Path | None:
        override = os.environ.get("AMAZON_AGRO_SOFFICE")
        if override and Path(override).is_file():
            return Path(override)
        found = shutil.which("soffice") or shutil.which("libreoffice")
        if found:
            return Path(found)
        for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
            root = os.environ.get(variable)
            if root:
                candidate = Path(root) / "LibreOffice" / "program" / "soffice.exe"
                if candidate.is_file():
                    return candidate
        return None

    def is_available(self) -> bool:
        return self._executable() is not None

    def convert(self, filled_xlsx: Path, destination: Path) -> Path:
        executable = self._executable()
        if executable is None:
            raise PdfBackendUnavailableError("LibreOffice não está instalado.")
        with TemporaryDirectory(prefix="amazon-agro-lo-") as temporary:
            temporary_path = Path(temporary)
            profile = (temporary_path / "profile").as_uri()
            output_dir = temporary_path / "output"
            output_dir.mkdir()
            command = [
                str(executable), f"-env:UserInstallation={profile}",
                "--headless", "--convert-to", "pdf:calc_pdf_Export",
                "--outdir", str(output_dir), str(filled_xlsx.resolve()),
            ]
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=120,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                check=False,
            )
            produced = output_dir / f"{filled_xlsx.stem}.pdf"
            if result.returncode != 0 or not produced.is_file():
                details = (result.stderr or result.stdout).strip()
                raise RuntimeError(
                    f"LibreOffice não conseguiu converter a proposta. {details}"
                )
            shutil.copyfile(produced, destination)
        return destination


class PdfBackendSelector:
    def __init__(self, backends: list[PdfConversionBackend] | None = None) -> None:
        self.backends = backends if backends is not None else [
            ExcelComPdfBackend(), LibreOfficePdfBackend(),
        ]

    def available_backends(self) -> list[PdfConversionBackend]:
        available: list[PdfConversionBackend] = []
        for backend in self.backends:
            try:
                if backend.is_available():
                    available.append(backend)
            except Exception:
                logger.exception("Falha ao verificar backend PDF %s", backend.name)
        return available
