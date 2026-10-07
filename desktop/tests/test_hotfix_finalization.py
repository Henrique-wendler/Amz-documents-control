"""Final hotfix regressions; workbook fixtures contain only anonymous data."""
from copy import deepcopy
from decimal import Decimal
from hashlib import sha256
import json
import os
import subprocess
import sys

import pytest
from openpyxl import load_workbook
from PySide6.QtWidgets import QApplication, QLabel

from amazon_agro.config.settings import AppSettings
from amazon_agro.exporters.excel import OpenpyxlExcelProposalExporter
from amazon_agro.exporters.excel_map import EXCEL_FIELD_MAP
from amazon_agro.exporters.pdf_backends import ExcelComPdfBackend
from amazon_agro.repositories.fake_properties import FakePropertyRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.pages import ProposalPage
from amazon_agro.ui.property_selection import PropertiesPage
from amazon_agro.ui.property_sources import PropertySourcesPage
from amazon_agro.ui.review import ReviewPage
from amazon_agro.ui.summary import ProposalSummaryPanel
from test_business_definitions import proposal_with_parcels
from test_property_workbooks import catalog_sync, make_book, record


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    return QApplication.instance() or QApplication([])


@pytest.mark.parametrize("value", [Decimal("7.50"), Decimal("-4"), Decimal("173")])
def test_legacy_da_reopens_and_saves_without_validation_or_data_loss(app, tmp_path, value):
    path = tmp_path / "legacy.sqlite3"
    repository = SQLiteProposalRepository(path)
    proposal = proposal_with_parcels(1)
    proposal.classificacao_da_percentual = value
    repository.save(proposal)
    repository.engine.dispose()
    repository = SQLiteProposalRepository(path)
    properties = FakePropertyRepository()
    service = ProposalService(repository, properties)
    reopened = service.get(proposal.id)
    saved_snapshots = deepcopy(reopened.properties)
    assert reopened.classificacao_da_percentual == value
    assert ProposalExportValidator(AppSettings(), properties).validate(reopened).ok
    page = ProposalPage()
    page.load(reopened)
    page.read_into(reopened)
    service.save(reopened)
    assert service.get(proposal.id).classificacao_da_percentual == value
    assert service.get(proposal.id).properties == saved_snapshots
    page.close()
    repository.engine.dispose()


def test_manual_da_absent_and_derived_shares_present_in_proposal_review_summary(app, tmp_path):
    settings, properties = AppSettings(), FakePropertyRepository()
    repository = SQLiteProposalRepository(tmp_path / "proposal.sqlite3")
    proposal = proposal_with_parcels(1)
    proposal.classificacao_da_percentual = Decimal("173")
    proposal.valor_fno = Decimal("750")
    proposal.valor_of = Decimal("250")
    page = ProposalPage()
    page.load(proposal)
    review = ReviewPage(ProposalService(repository, properties), settings)
    review.load(proposal)
    summary = ProposalSummaryPanel()
    summary.update_proposal(proposal, ProposalExportValidator(settings, properties).validate(proposal))
    assert "classificacao_da_percentual" not in page.spins
    assert "fno_percentage" not in page.spins and "of_percentage" not in page.spins
    assert page.financing_shares["valor_fno"].text() == "Participação FNO: 75,00%"
    assert page.financing_shares["valor_of"].text() == "Participação OF: 25,00%"
    texts = [label.text() for widget in (page, review, summary) for label in widget.findChildren(QLabel)]
    texts.append(review.text.toPlainText())
    assert all("CLASS. DA" not in text.upper() and "CLASSIFICAÇÃO DA" not in text.upper() for text in texts)
    for text in (review.text.toPlainText(), summary.details.text()):
        assert "Participação FNO: 75,00%" in text and "Participação OF: 25,00%" in text
    for widget in (page, review, summary):
        widget.close()
    repository.engine.dispose()


@pytest.mark.parametrize("enabled", [False, True])
def test_current_xlsx_ignores_legacy_da_and_exports_abc_with_derived_shares(app, tmp_path, enabled):
    proposal = proposal_with_parcels(1)
    proposal.classificacao_da_percentual = Decimal("99.11")
    proposal.valor_fno, proposal.valor_of = proposal.valor_total * Decimal("0.75"), proposal.valor_total * Decimal("0.25")
    proposal.laudo_abc_financiado = enabled
    proposal.laudo_abc_percentual = Decimal("3.25")
    proposal.laudo_abc_valor = Decimal("4321.09")
    page = ProposalPage()
    page.load(proposal)
    assert page.abc_yes.isChecked() == enabled
    assert page.abc_no.isChecked() != enabled
    assert page.abc_fields.isHidden() != enabled
    assert page.abc_fields.isEnabled() == enabled
    repository = SQLiteProposalRepository(tmp_path / "abc.sqlite3")
    review = ReviewPage(ProposalService(repository, FakePropertyRepository()), AppSettings())
    review.load(proposal)
    assert ("% Laudo ABC:" in review.text.toPlainText()) == enabled
    assert ("Valor Laudo ABC:" in review.text.toPlainText()) == enabled
    path = OpenpyxlExcelProposalExporter(AppSettings(), FakePropertyRepository()).export(proposal, tmp_path / "abc.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    values = {cell.value for row in sheet for cell in row}
    assert "CLASS. DA %" not in values and 0.9911 not in values
    assert "classificacao_da_percentual" not in EXCEL_FIELD_MAP
    assert sheet["I22"].value == "LAUDO ABC FINANCIADO?"
    assert sheet["K23"].value == (0.0325 if enabled else None)
    assert sheet["I25"].value == (24.375 if enabled else None)
    merges = {str(region) for region in sheet.merged_cells}
    assert {"D22:E22", "D23:E23", "D24:E24", "D25:E25"} <= merges
    assert sheet["D22"].value == "PARTICIPAÇÃO FNO"
    assert sheet["D24"].value == "PARTICIPAÇÃO OF"
    assert sheet["D23"].value == 0.75 and sheet["D25"].value == 0.25
    workbook.close()
    page.close()
    repository.engine.dispose()
    review.close()


@pytest.fixture
def anonymous_basa(tmp_path):
    # Same grouping shape as the local QA file: B:J / row 7, 12 separate
    # registration blocks grouped into 9 farms by physical document merges.
    headers = ("Fazenda", "Matrículas", "Matrícula Anterior", "Lote/Gleba",
               "Proprietário", "CPF/CNPJ", "CCIR", "ITR", "CAR")
    rows, merges = [], []
    registration = 0
    for farm, count in enumerate((2, 3, 1, 1, 1, 1, 1, 1, 1), 1):
        first = len(rows) + 1
        owner = (farm - 1) % 4 + 1
        for parcel in range(count):
            registration += 1
            start = len(rows) + 1
            rows.extend([{"Fazenda": f"Fazenda Exemplo {farm}", "Matrículas": f"MAT-{registration}",
                          "Proprietário": f"Pessoa Exemplo {owner}", "CPF/CNPJ": f"000.000.000-0{owner}",
                          "CCIR": f"CCIR-{farm}" if parcel == 0 else None,
                          "ITR": f"ITR-{farm}" if parcel == 0 else None,
                          "CAR": f"CAR-{farm}" if parcel == 0 else None}, {}])
            merges.extend((field, start, start + 1) for field in
                          ("Fazenda", "Matrículas", "Proprietário", "CPF/CNPJ"))
        merges.extend((field, first, len(rows)) for field in ("CCIR", "ITR", "CAR"))
    return make_book(tmp_path / "fonte-sem-regra-de-nome.xlsx", rows, headers=headers, header_row=7, merges=tuple(merges))


def test_basa_auto_detection_counts_readonly_and_properties_step_after_update(app, tmp_path, monkeypatch, anonymous_basa):
    catalog, sync, settings = catalog_sync(tmp_path)
    settings._source_path = tmp_path / "config.json"
    settings.property_profile_name = "Outra família"
    settings.property_profile_options = {"column_aliases": {"name": ["Estabelecimento"]}}
    repository = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    catalog.search_enabled = False
    properties = PropertiesPage(ProposalService(repository, catalog), settings)
    assert properties.results.rowCount() == 0
    page = PropertySourcesPage(settings, catalog, sync)
    page.catalog_updated.connect(properties.search)
    monkeypatch.setattr("amazon_agro.ui.property_sources.QMessageBox.information", lambda *_: None)
    before = sha256(anonymous_basa.read_bytes()).digest()
    page.update_catalog()
    assert page.table.rowCount() == 1
    assert [page.table.item(0, column).text() for column in range(5)] == [
        anonymous_basa.name, "BASA Ambiental", "OK", "9", "—"]
    stats = catalog.stats()
    assert (stats.files, stats.properties, stats.parcels, stats.warnings) == (1, 9, 12, 0)
    farms = catalog.search("")
    assert len({owner.id for farm in farms for owner in farm.owners}) == 4
    assert properties.results.rowCount() == 9
    assert settings.property_file_profiles == {}
    assert json.loads(settings._source_path.read_text(encoding="utf-8"))["source_directory"] == str(tmp_path)
    assert sync.synchronize(settings).events[0].action == "UNCHANGED"
    assert sha256(anonymous_basa.read_bytes()).digest() == before
    assert catalog.connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert catalog.connection.execute("PRAGMA foreign_key_check").fetchall() == []
    page.close()
    properties.close()
    catalog.close()
    repository.engine.dispose()


@pytest.mark.parametrize("recursive, expected", [(False, 2), (True, 3)])
def test_local_folder_xlsx_xlsm_scope_and_folder_selection_hint(app, tmp_path, recursive, expected):
    make_book(tmp_path / "local.xlsx", [record()])
    make_book(tmp_path / "local.xlsm", [record()])
    nested = tmp_path / "subpasta"
    nested.mkdir()
    make_book(nested / "nested.xlsx", [record()])
    (tmp_path / "~$temporario.xlsx").write_text("Excel temporary file", encoding="utf-8")
    catalog, sync, settings = catalog_sync(tmp_path)
    settings.property_recursive = recursive
    page = PropertySourcesPage(settings, catalog, sync)
    assert page.found.text() == f"Arquivos encontrados: {expected}"
    hints = " ".join(label.text() for label in page.findChildren(QLabel))
    assert "Selecione a pasta que contém as planilhas. Os arquivos podem não aparecer nesta janela de seleção." in hints
    assert "Pasta sincronizada pelo Google Drive for Desktop" in hints
    page.close()
    catalog.close()


PDF_READER_PYTHON = os.environ.get("AMAZON_AGRO_PDF_READER_PYTHON")


@pytest.mark.skipif(not PDF_READER_PYTHON or not ExcelComPdfBackend().is_available(),
                    reason="Native Excel COM and a Python with pypdf are required")
@pytest.mark.parametrize("enabled", [False, True])
def test_native_pdf_has_official_abc_label_and_ignores_legacy_da_and_inactive_abc(tmp_path, enabled):
    proposal = proposal_with_parcels(1)
    proposal.valor_total, proposal.valor_fno, proposal.valor_of = map(Decimal, ("2000000", "1500000", "500000"))
    proposal.classificacao_da_percentual = Decimal("99.11")
    proposal.laudo_abc_financiado = enabled
    proposal.laudo_abc_percentual = Decimal("3.25")
    proposal.laudo_abc_valor = Decimal("4321.09")
    xlsx = OpenpyxlExcelProposalExporter(AppSettings(), FakePropertyRepository()).export(proposal, tmp_path / "abc.xlsx")
    pdf = tmp_path / "abc.pdf"
    subprocess.run([sys.executable, "-c",
                    "from pathlib import Path; import sys; "
                    "from amazon_agro.exporters.pdf import SpreadsheetPdfProposalExporter; "
                    "from amazon_agro.exporters.pdf_backends import PdfBackendSelector, ExcelComPdfBackend; "
                    "SpreadsheetPdfProposalExporter(PdfBackendSelector([ExcelComPdfBackend()])).export(Path(sys.argv[1]), Path(sys.argv[2]))",
                    str(xlsx), str(pdf)], capture_output=True, text=True, check=True, timeout=120)
    result = subprocess.run([PDF_READER_PYTHON, "-c",
                             "import sys; from pypdf import PdfReader; print(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",
                             str(pdf)], capture_output=True, text=True, check=True, timeout=30,
                             encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    text = " ".join(result.stdout.split())
    assert "LAUDO ABC FINANCIADO?" in text
    assert "PARTICIPAÇÃO FNO" in text and "PARTICIPAÇÃO OF" in text
    assert "75,00%" in text and "25,00%" in text
    assert "TEST-PAGINATION" in text
    assert "CLASS. DA" not in text and "99,11" not in text
    assert ("3,25%" in text) == enabled
    assert ("48.750,00" in text) == enabled
    assert "#" not in text
