from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler

from PySide6.QtCore import QLocale, QTimer, Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication, QMessageBox

from amazon_agro.config.settings import AppSettings, default_data_dir
from amazon_agro.exporters.excel import OpenpyxlExcelProposalExporter
from amazon_agro.exporters.pdf import SpreadsheetPdfProposalExporter
from amazon_agro.exporters.pdf_backends import PdfBackendSelector
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.services.export_service import ProposalExportService
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.main_window import MainWindow
from amazon_agro.ui.conversion_worker import run_conversion
from amazon_agro.config.resources import resource_path
from amazon_agro.version import APP_NAME, __version__


def _configure_logging() -> None:
    data_dir = default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        data_dir / "exports.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8"
    )
    logging.basicConfig(
        level=logging.INFO,
        handlers=[handler],
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def _hold_installer_mutex(app: QApplication) -> None:
    if sys.platform != "win32":
        return
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateMutexW(None, False, "AmazonAgroPropostasRelease")
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    app.aboutToQuit.connect(lambda: kernel.CloseHandle(handle))


def main() -> int:
    from amazon_agro.app.smoke import configure_smoke, SmokeDriver
    smoke_options = configure_smoke(sys.argv[1:])
    if smoke_options:
        QApplication.setAttribute(Qt.ApplicationAttribute.AA_DontUseNativeDialogs)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    icon = resource_path("resources", "AmazonAgro.ico")
    if icon.is_file():
        app.setWindowIcon(QIcon(str(icon)))
    QLocale.setDefault(QLocale(QLocale.Language.Portuguese, QLocale.Country.Brazil))
    try:
        _configure_logging()
        _hold_installer_mutex(app)
        settings = AppSettings.load()
        repository = SQLiteProposalRepository(default_data_dir() / "proposals.sqlite3")
        properties = SQLitePropertyCatalogRepository(default_data_dir() / "properties.sqlite3")
        properties.search_enabled = settings.source_directory() is not None
        sync_service = PropertyCatalogSyncService(properties)
        service = ProposalService(repository, properties)
        validator = ProposalExportValidator(settings, properties)
        excel = OpenpyxlExcelProposalExporter(settings, properties)
        pdf = SpreadsheetPdfProposalExporter(PdfBackendSelector(), conversion_runner=run_conversion)
        export_service = ProposalExportService(repository, validator, excel, pdf)
        app.aboutToQuit.connect(repository.engine.dispose)
        app.aboutToQuit.connect(properties.close)
        window = MainWindow(
            service, settings, export_service, validator, properties, sync_service
        )
        window.show()
        if smoke_options:
            smoke_driver = SmokeDriver(window, smoke_options, app)
            QTimer.singleShot(0, smoke_driver.run)
        else:
            QTimer.singleShot(0, window.startup)
    except Exception as error:
        logging.getLogger(__name__).exception("Falha ao iniciar aplicativo")
        if smoke_options:
            import json
            (smoke_options.directory / "report.json").write_text(
                json.dumps({"ok": False, "error": f"{type(error).__name__}: {error}"}), encoding="utf-8"
            )
            return 1
        QMessageBox.critical(None, "Falha ao iniciar", str(error))
        return 1
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
