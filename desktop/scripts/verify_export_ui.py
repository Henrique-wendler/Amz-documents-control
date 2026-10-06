"""Opt-in native Qt/export smoke check using synthetic data and isolated storage.

Run with the desktop venv and --output pointing to a new, disposable directory.
No mock exporter or dialog: QTest clicks the real buttons, and a timer chooses
the destination and dismisses actual dialogs. This is automated UI evidence,
not a substitute for a person's final visual review.
"""
import argparse
import faulthandler
from hashlib import sha256
import json
import logging
from pathlib import Path
import sqlite3
import time

from openpyxl import load_workbook
from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest, QSignalSpy
from PySide6.QtWidgets import QApplication, QFileDialog, QLineEdit, QMessageBox

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import ProposalProperty, ProposalPropertyParcel, PropertyClassification
from amazon_agro.exporters.excel import OpenpyxlExcelProposalExporter
from amazon_agro.exporters.pdf import SpreadsheetPdfProposalExporter
from amazon_agro.exporters.pdf_backends import PdfBackendSelector
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.services.export_service import ProposalExportService
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.export_dialogs import ExportSuccessDialog
from amazon_agro.ui.main_window import MainWindow
from amazon_agro.ui.conversion_worker import run_conversion


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=False)
    logging.basicConfig(filename=root / "exports.log", level=logging.INFO, encoding="utf-8")
    diagnostic = (root / "hang-trace.log").open("w", encoding="utf-8")
    faulthandler.dump_traceback_later(45, file=diagnostic)
    QApplication.setAttribute(Qt.ApplicationAttribute.AA_DontUseNativeDialogs)
    app = QApplication([])
    settings = AppSettings.load(root / "config.json")
    settings.first_run_completed = True
    repository = SQLiteProposalRepository(root / "proposals.sqlite3")
    catalog = SQLitePropertyCatalogRepository(root / "catalog.sqlite3")
    selector = PdfBackendSelector()
    validator = ProposalExportValidator(settings, catalog)
    exports = ProposalExportService(repository, validator,
        OpenpyxlExcelProposalExporter(settings, catalog),
        SpreadsheetPdfProposalExporter(selector, conversion_runner=run_conversion))
    window = MainWindow(ProposalService(repository, catalog), settings, exports,
                        validator, catalog, PropertyCatalogSyncService(catalog))
    window.show()
    window.new_proposal()
    for name, value in {
        "numero_proposta": "TEST-004", "proponente": "Proponente Exemplo",
        "cpf_cnpj": "000.000.000-00", "tecnico": "Tecnico Exemplo",
        "finalidade": "Custeio", "agencia": "Agencia Exemplo", "fonte": "FNO",
    }.items():
        control = window.operation_page.controls[name]
        (control.setCurrentText if hasattr(control, "setCurrentText") else control.setText)(value)
    window.proposal_page.spins["valor_total"].setValue(123456.78)
    window.properties_page._add_link(ProposalProperty(
        window.current.id, "synthetic-farm", PropertyClassification.CREDIT_OBJECT,
        property_name_snapshot="Fazenda Exemplo", municipality_snapshot="Palmas",
        state_snapshot="TO", selected_parcels=[ProposalPropertyParcel("parcel-example", "MAT-004")],
    ))
    window.properties_page.selected.cellWidget(0, 4).setCurrentIndex(2)
    window.steps.setCurrentRow(4)
    app.processEvents()
    template_hash = sha256(settings.template_path().read_bytes()).hexdigest()
    report = {"platform": app.platformName(), "backends": [b.name for b in selector.available_backends()], "exports": {}, "layouts": []}
    for width, height in ((1366, 768), (1920, 1080)):
        window.resize(width, height)
        app.processEvents()
        for index in range(5):
            window.steps.setCurrentRow(index)
            app.processEvents()
            scroll = window.stack.widget(index)
            assert scroll.widget().minimumSizeHint().width() <= scroll.viewport().width(), (width, index)
        report["layouts"].append({"requested": [width, height], "actual": [window.width(), window.height()]})
    window.resize(1366, 768)
    app.processEvents()
    errors = []
    for kind, button in (("xlsx", window.review_page.excel_button),
                         ("pdf", window.review_page.pdf_button), ("both", window.review_page.both_button)):
        if kind != "xlsx" and not report["backends"]:
            report["exports"][kind] = {"unavailable": True}
            continue
        output = root / kind
        output.mkdir()
        settings.default_output_dir = str(output)
        produced = []
        deadline = time.monotonic() + 150
        def handle_dialog():
            dialog = app.activeModalWidget()
            if isinstance(dialog, QFileDialog):
                dialog.setDirectory(str(output))
                dialog.findChild(QLineEdit, "fileNameEdit").setText(str(output))
                dialog.accept()
            elif isinstance(dialog, ExportSuccessDialog):
                produced.extend(dialog.paths)
                dialog.accept()
            elif isinstance(dialog, QMessageBox):
                errors.append(dialog.text())
                dialog.reject()
            elif time.monotonic() > deadline:
                if dialog:
                    dialog.reject()
                errors.append("UI smoke check timed out")
        timer = QTimer()
        timer.timeout.connect(handle_dialog)
        timer.start(100)
        spy = QSignalSpy(button.clicked)
        QTest.mouseClick(button, Qt.MouseButton.LeftButton)
        timer.stop()
        assert spy.count() == 1
        assert not errors, errors
        assert len(produced) == (2 if kind == "both" else 1), produced
        for path in produced:
            assert path.parent == output
            assert path.is_file() and path.stat().st_size > 0
            if path.suffix == ".xlsx":
                book = load_workbook(path)
                assert book.active["A6"].value == "Proponente Exemplo"
                assert book.active["A3"].value == "TEST-004"
                assert book.active["A28"].value == "Fazenda Exemplo"
                book.close()
        report["exports"][kind] = {"click_signals": spy.count(), "files": [str(p) for p in produced]}
    assert sha256(settings.template_path().read_bytes()).hexdigest() == template_hash
    report["template_unchanged"] = True
    for name in ("proposals.sqlite3", "catalog.sqlite3"):
        with sqlite3.connect(root / name) as connection:
            assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
            assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    report["sqlite_integrity"] = "ok"
    window.close()
    repository.engine.dispose()
    catalog.close()
    (root / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    faulthandler.cancel_dump_traceback_later()
    diagnostic.close()


if __name__ == "__main__":
    main()
