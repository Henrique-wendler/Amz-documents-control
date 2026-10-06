"""Approved FNO/OF shares derive exclusively from the monetary amounts."""
from dataclasses import fields
from decimal import Decimal

import pytest
from openpyxl import load_workbook
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QLabel

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal
from amazon_agro.exporters.excel import OpenpyxlExcelProposalExporter
from amazon_agro.exporters.formatting import format_percentage_fixed
from amazon_agro.exporters.pdf import SpreadsheetPdfProposalExporter
from amazon_agro.exporters.pdf_backends import PdfBackendSelector
from amazon_agro.repositories.fake_properties import FakePropertyRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.export_service import ExportValidationError, ProposalExportService
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.pages import ProposalPage
from test_business_definitions import proposal_with_parcels
from test_hotfix_finalization import app
from test_pdf_export import FakeBackend


@pytest.mark.parametrize("total,fno,of,fno_text,of_text", [
    ("2000000", "1500000", "500000", "75,00%", "25,00%"),
    ("0", "0", "0", "0,00%", "0,00%"),
    ("0", "1", "2", "0,00%", "0,00%"),
    ("2000000", "0", "0", "0,00%", "0,00%"),
    ("2000000", "1200000", "500000", "60,00%", "25,00%"),
    ("1000.01", "750.01", "250.00", "75,00%", "25,00%"),
    ("0.03", "0.01", "0.02", "33,33%", "66,67%"),
    ("3.00", "1.01", "1.99", "33,67%", "66,33%"),
])
def test_financing_shares_use_decimal_total_and_round_only_for_presentation(total, fno, of, fno_text, of_text):
    proposal = Proposal(valor_total=Decimal(total), valor_fno=Decimal(fno), valor_of=Decimal(of),
                        recursos_proprios=Decimal("300000"), classificacao_da_percentual=Decimal("99"))
    for amount, percentage, expected in ((proposal.valor_fno, proposal.fno_percentage, fno_text),
                                         (proposal.valor_of, proposal.of_percentage, of_text)):
        assert isinstance(percentage, Decimal)
        assert percentage == (amount / proposal.valor_total * Decimal("100") if proposal.valor_total else Decimal("0"))
        assert format_percentage_fixed(percentage) == expected
    if total == "0.03":
        assert proposal.fno_percentage != proposal.fno_percentage.quantize(Decimal("0.01"))


def test_financing_ui_updates_readonly_labels_on_keyboard_and_each_amount_change(app):
    page = ProposalPage()
    page.show()
    for key, value in (("valor_total", "2000000"), ("valor_fno", "1500000"), ("valor_of", "500000")):
        control = page.spins[key]
        control.setFocus()
        QTest.keyClick(control, Qt.Key.Key_A, Qt.KeyboardModifier.ControlModifier)
        QTest.keyClicks(control, value)
    assert all(isinstance(label, QLabel) for label in page.financing_shares.values())
    assert page.financing_shares["valor_fno"].text() == "Participação FNO: 75,00%"
    assert page.financing_shares["valor_of"].text() == "Participação OF: 25,00%"
    page.spins["valor_fno"].setValue(Decimal("1200000"))
    assert page.financing_shares["valor_fno"].text() == "Participação FNO: 60,00%"
    page.spins["valor_total"].setValue(Decimal("4000000"))
    assert page.financing_shares["valor_fno"].text() == "Participação FNO: 30,00%"
    assert page.financing_shares["valor_of"].text() == "Participação OF: 12,50%"
    page.spins["valor_of"].setValue(Decimal("1000000"))
    assert page.financing_shares["valor_of"].text() == "Participação OF: 25,00%"
    page.spins["valor_total"].setValue(Decimal("0"))
    assert all(label.text().endswith("0,00%") for label in page.financing_shares.values())
    page.close()


def test_saved_shares_are_recomputed_from_amounts_without_new_database_fields(app, tmp_path):
    path = tmp_path / "proposals.sqlite3"
    repository = SQLiteProposalRepository(path)
    proposal = proposal_with_parcels(1)
    proposal.valor_total, proposal.valor_fno, proposal.valor_of = map(Decimal, ("2000000", "1500000", "500000"))
    proposal.classificacao_da_percentual = Decimal("99.11")
    repository.save(proposal)
    repository.engine.dispose()
    repository = SQLiteProposalRepository(path)
    saved = repository.get(proposal.id)
    assert saved.fno_percentage == Decimal("75") and saved.of_percentage == Decimal("25")
    assert saved.classificacao_da_percentual == Decimal("99.11")
    assert not {"fno_percentage", "of_percentage"}.intersection(field.name for field in fields(saved))
    page = ProposalPage()
    page.load(saved)
    assert page.financing_shares["valor_fno"].text().endswith("75,00%")
    assert page.financing_shares["valor_of"].text().endswith("25,00%")
    saved.valor_fno = Decimal("1200000")
    repository.save(saved)
    assert repository.get(proposal.id).fno_percentage == Decimal("60")
    page.close()
    repository.engine.dispose()


@pytest.mark.parametrize("fno,of,error", [
    ("101", "0", "O valor FNO"), ("0", "101", "O valor OF"),
    ("60", "50", "A soma dos valores FNO e OF"),
    ("60", "40", None), ("60", "25", None),
])
def test_invalid_financing_blocks_export_with_context_but_never_blocks_saving(tmp_path, fno, of, error):
    proposal = proposal_with_parcels(1)
    proposal.valor_total, proposal.valor_fno, proposal.valor_of = map(Decimal, ("100", fno, of))
    settings, properties = AppSettings(), FakePropertyRepository()
    repository = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    ProposalService(repository, properties).save(proposal)
    saved = repository.get(proposal.id)
    assert saved.valor_fno == Decimal(fno) and saved.valor_of == Decimal(of)
    validator = ProposalExportValidator(settings, properties)
    result = validator.validate(saved)
    assert result.ok == (error is None)
    if error:
        assert any(message.startswith(error) for message in result.errors)
        service = ProposalExportService(repository, validator, OpenpyxlExcelProposalExporter(settings, properties),
                                        SpreadsheetPdfProposalExporter(PdfBackendSelector([FakeBackend("Test")])))
        with pytest.raises(ExportValidationError, match=error):
            service.generate_both(proposal.id, tmp_path)
        assert not list(tmp_path.glob("*.xlsx")) and not list(tmp_path.glob("*.pdf"))
    repository.engine.dispose()


@pytest.mark.parametrize("fno,of", [("1500000", "500000"), ("1200000", "500000"), ("0", "0")])
def test_xlsx_percentages_derive_from_current_amounts_with_unambiguous_labels(tmp_path, fno, of):
    proposal = proposal_with_parcels(1)
    proposal.valor_total, proposal.valor_fno, proposal.valor_of = map(Decimal, ("2000000", fno, of))
    proposal.classificacao_da_percentual = Decimal("99.11")
    path = OpenpyxlExcelProposalExporter(AppSettings(), FakePropertyRepository()).export(proposal, tmp_path / "shares.xlsx")
    workbook = load_workbook(path)
    sheet = workbook.active
    assert sheet["A23"].value == int(fno) and sheet["A25"].value == int(of)
    assert Decimal(str(sheet["D23"].value)) == Decimal(fno) / Decimal("2000000")
    assert Decimal(str(sheet["D25"].value)) == Decimal(of) / Decimal("2000000")
    assert sheet["D23"].number_format == sheet["D25"].number_format == "0.00%"
    assert sheet["D22"].value == "PARTICIPAÇÃO FNO" and sheet["D24"].value == "PARTICIPAÇÃO OF"
    assert sheet["A3"].alignment.shrinkToFit and not sheet["A3"].alignment.wrap_text
    workbook.close()
