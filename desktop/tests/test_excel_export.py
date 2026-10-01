from copy import copy
from datetime import date
from decimal import Decimal
from hashlib import sha256

import pytest
from openpyxl import load_workbook

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import (
    Participant, ParticipantType, Proposal, ProposalProperty,
    PropertyClassification,
)
from amazon_agro.exporters.excel import OpenpyxlExcelProposalExporter
from amazon_agro.exporters.excel_map import EXCEL_FIELD_MAP, PDF_PRINT_AREA
from amazon_agro.repositories.fake_properties import FakePropertyRepository


def filled_proposal() -> Proposal:
    proposal = Proposal(
        numero_proposta="12345", agencia="Palmas Centro",
        proponente="João da Silva", cpf_cnpj="123.456.789-00",
        tecnico="Maria Técnica", porte="Pequeno", finalidade="Custeio",
        descricao="Cultivo de cacau", fonte="FNO", cidade="Palmas",
        data_proposta=date(2026, 9, 29),
        recursos_proprios=Decimal("100000.00"),
        percentual_recursos_proprios=Decimal("12.50"),
        valor_total=Decimal("1234567.89"),
        valor_fno=Decimal("900000.00"),
        classificacao_da_percentual=Decimal("7"),
        astec_fno_financiada=True,
        astec_fno_percentual=Decimal("2.50"),
        laudo_abc_financiado=False,
        valor_of=Decimal("234567.89"),
        astec_of_financiada=True,
        astec_of_percentual=Decimal("1.25"),
    )
    proposal.participants = [
        Participant(
            proposal.id, "João da Silva", "123.456.789-00",
            ParticipantType.MAIN_ISSUER,
        ),
        Participant(
            proposal.id, "Ana Souza", "987.654.321-00",
            ParticipantType.GUARANTOR,
        ),
    ]
    proposal.properties = [
        ProposalProperty(proposal.id, "DEMO-001", PropertyClassification.CLASS_1),
        ProposalProperty(
            proposal.id, "DEMO-002", PropertyClassification.CREDIT_OBJECT,
        ),
    ]
    return proposal


def test_xlsx_integration_fills_mapped_cells_and_preserves_template(tmp_path) -> None:
    settings = AppSettings()
    template = settings.template_path()
    original_bytes = template.read_bytes()
    source = load_workbook(template)
    proposal = filled_proposal()
    destination = tmp_path / "output.xlsx"

    OpenpyxlExcelProposalExporter(
        settings, FakePropertyRepository()
    ).export(proposal, destination)

    assert sha256(template.read_bytes()).digest() == sha256(original_bytes).digest()
    output = load_workbook(destination)
    source_sheet, sheet = source.active, output.active
    assert output.sheetnames == source.sheetnames
    assert sheet["K3"].value == "12345"
    assert sheet["K2"].value == "Palmas Centro"
    assert sheet["A6"].value == "João da Silva"
    assert sheet["D6"].value == "123.456.789-00"
    assert sheet["I6"].value == "Maria Técnica"
    assert sheet["F6"].value == "1 participante(s)"
    assert sheet["A9"].value == "João da Silva"
    assert sheet["I10"].value == "987.654.321-00"
    assert sheet["M10"].value == 4
    assert sheet["A15"].value is None
    assert sheet["I15"].value is None
    assert sheet["M15"].value is None
    assert sheet["A21"].value == "Custeio"
    assert sheet["C21"].value == "Cultivo de cacau"
    assert sheet["G21"].value == "Sim"
    assert sheet["H21"].value == pytest.approx(0.125)
    assert sheet["H21"].number_format == "0.##%"
    assert sheet["I21"].value == "FNO"
    assert sheet["K21"].value == "R$ 1.234.567,89"
    assert sheet["A23"].value == "R$ 900.000,00"
    assert sheet["D23"].value == pytest.approx(0.07)
    assert sheet["D23"].number_format == "0.##%"
    assert sheet["F23"].value == "Sim"
    assert sheet["I23"].value == pytest.approx(0.025)
    assert sheet["J23"].value == "Não"
    assert sheet["M23"].value is None
    assert sheet["A25"].value == "R$ 234.567,89"
    assert sheet["F25"].value == "Sim"
    assert sheet["I25"].value == pytest.approx(0.0125)
    assert sheet["A28"].value == "Imóvel demonstrativo A"
    assert sheet["E28"].value == "Palmas"
    assert sheet["I28"].value == "MAT-001"
    assert sheet["K28"].value == 1
    assert sheet["K29"].value == 2
    assert sheet["A32"].value == "1 - GARANTIA"
    assert sheet["A33"].value is None
    assert sheet["A34"].value == "TÉCNICO RESPONSÁVEL: Maria Técnica"
    assert sheet["A35"].value == "Palmas, 29 de setembro de 2026"
    assert "recursos_proprios" not in EXCEL_FIELD_MAP
    assert {cell.value for row in sheet.iter_rows(min_row=33, max_row=35, max_col=13)
            for cell in row if cell.value is not None} == {
        "TÉCNICO RESPONSÁVEL: Maria Técnica",
        "Palmas, 29 de setembro de 2026",
    }
    assert all(cell.value is None for row in sheet.iter_rows(min_row=36)
               for cell in row)
    assert EXCEL_FIELD_MAP["valor_total"] == "K21"

    assert {str(item) for item in sheet.merged_cells.ranges} == {
        str(item) for item in source_sheet.merged_cells.ranges
    }
    assert {
        key: dim.width for key, dim in sheet.column_dimensions.items()
    } == {
        key: dim.width for key, dim in source_sheet.column_dimensions.items()
    }
    assert {
        key: dim.height for key, dim in sheet.row_dimensions.items()
    } == {
        key: dim.height for key, dim in source_sheet.row_dimensions.items()
    }
    for source_row in source_sheet:
        for before in source_row:
            after = sheet[before.coordinate]
            if before._style is None:
                assert after._style is None
            else:
                assert after._style is not None
                assert before._style.fontId == after._style.fontId
                assert before._style.fillId == after._style.fillId
                assert before._style.borderId == after._style.borderId
                assert before._style.alignmentId == after._style.alignmentId
                assert before._style.protectionId == after._style.protectionId
    for coordinate in ("A2", "A6", "A15", "A21", "K21", "A28", "K28", "A32"):
        before, after = source_sheet[coordinate], sheet[coordinate]
        assert copy(before.font) == copy(after.font)
        assert copy(before.border) == copy(after.border)
        assert copy(before.fill) == copy(after.fill)
        assert copy(before.alignment) == copy(after.alignment)
    assert len(sheet._images) == len(source_sheet._images)
    assert sheet.page_setup.orientation == source_sheet.page_setup.orientation
    assert sheet.page_setup.scale == source_sheet.page_setup.scale
    assert sheet.print_area == source_sheet.print_area
    assert "$A$1:$M$35" in str(sheet.print_area)
    assert PDF_PRINT_AREA == "A1:M35"
    assert sheet.sheet_properties.pageSetUpPr.fitToPage is True
    assert sheet.page_setup.fitToWidth == sheet.page_setup.fitToHeight == 1
    assert len(sheet.row_breaks.brk) == 0
    assert sheet.page_margins == source_sheet.page_margins


def test_xlsx_rejects_more_than_seven_participants(tmp_path) -> None:
    proposal = filled_proposal()
    proposal.participants = [
        Participant(proposal.id, f"Pessoa {index}") for index in range(8)
    ]
    with pytest.raises(ValueError, match="até 7 participantes"):
        OpenpyxlExcelProposalExporter(
            AppSettings(), FakePropertyRepository()
        ).export(proposal, tmp_path / "overflow.xlsx")


def test_xlsx_keeps_recursos_proprios_as_indicator_without_monetary_footer(tmp_path) -> None:
    proposal = filled_proposal()
    proposal.recursos_proprios = Decimal("0")
    proposal.percentual_recursos_proprios = Decimal("0")
    destination = tmp_path / "no-own-funds.xlsx"

    OpenpyxlExcelProposalExporter(
        AppSettings(), FakePropertyRepository()
    ).export(proposal, destination)

    sheet = load_workbook(destination).active
    assert sheet["G21"].value == "Não"
    assert sheet["H21"].value == 0
    assert sheet["A34"].value == "TÉCNICO RESPONSÁVEL: Maria Técnica"
    assert sheet["A35"].value == "Palmas, 29 de setembro de 2026"
    assert all(
        "RECURSOS PRÓPRIOS" not in str(cell.value)
        for row in sheet.iter_rows(min_row=33, max_row=35, max_col=13)
        for cell in row if cell.value is not None
    )


def test_xlsx_rejects_more_than_four_properties(tmp_path) -> None:
    proposal = filled_proposal()
    proposal.properties = [
        ProposalProperty(proposal.id, f"X-{index}", PropertyClassification.CLASS_1)
        for index in range(5)
    ]
    with pytest.raises(ValueError, match="até 4 imóveis"):
        OpenpyxlExcelProposalExporter(
            AppSettings(), FakePropertyRepository()
        ).export(proposal, tmp_path / "overflow.xlsx")




def test_xlsx_rejects_wrong_template_structure(tmp_path) -> None:
    from amazon_agro.exporters.excel import TemplateMappingError

    workbook = load_workbook(AppSettings().template_path())
    workbook.active["A7"] = "Outro modelo"
    wrong_template = tmp_path / "wrong.xlsx"
    workbook.save(wrong_template)
    settings = AppSettings(xlsx_template_path=str(wrong_template))
    with pytest.raises(TemplateMappingError, match="A7"):
        OpenpyxlExcelProposalExporter(
            settings, FakePropertyRepository()
        ).export(filled_proposal(), tmp_path / "out.xlsx")
