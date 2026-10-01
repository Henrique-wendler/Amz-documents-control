from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler

from PySide6.QtCore import QLocale
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


def main() -> int:
    app = QApplication(sys.argv)
    QLocale.setDefault(QLocale(QLocale.Language.Portuguese, QLocale.Country.Brazil))
    try:
        _configure_logging()
        settings = AppSettings.load()
        repository = SQLiteProposalRepository(default_data_dir() / "proposals.sqlite3")
        properties = SQLitePropertyCatalogRepository(default_data_dir() / "properties.sqlite3")
        properties.search_enabled = settings.source_directory() is not None
        sync_service = PropertyCatalogSyncService(properties)
        service = ProposalService(repository, properties)
        validator = ProposalExportValidator(settings, properties)
        excel = OpenpyxlExcelProposalExporter(settings, properties)
        pdf = SpreadsheetPdfProposalExporter(PdfBackendSelector())
        export_service = ProposalExportService(repository, validator, excel, pdf)
        app.aboutToQuit.connect(repository.engine.dispose)
        app.aboutToQuit.connect(properties.close)
        window = MainWindow(
            service, settings, export_service, validator, properties, sync_service
        )
        window.show()
    except Exception as error:
        QMessageBox.critical(None, "Falha ao iniciar", str(error))
        return 1
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
