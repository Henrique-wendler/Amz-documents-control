from __future__ import annotations

import logging
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import ParticipantType, Proposal, RuralProperty
from amazon_agro.exporters.excel_map import (
    CLASSIFICATION_LEGEND_CELLS, EXCEL_FIELD_MAP, PARTICIPANT_COLUMNS,
    PARTICIPANT_ROWS, PROPERTY_COLUMNS, PROPERTY_ROWS, TEMPLATE_MARKERS,
)
from amazon_agro.exporters.formatting import format_date_pt_br
from amazon_agro.exporters.excel_layout import prepare_layout
from amazon_agro.exporters.excel_pagination import property_page_rows
from amazon_agro.repositories.contracts import PropertyRepository


logger = logging.getLogger(__name__)
CURRENCY_FIELDS = ("valor_total", "valor_fno", "valor_of")
PERCENT_FIELDS = ("percentual_recursos_proprios", "fno_percentage", "of_percentage")
BOOLEAN_FIELDS = (
    "astec_fno_financiada", "laudo_abc_financiado", "astec_of_financiada",
)


class TemplateMappingError(ValueError):
    pass


def _check_template(sheet: Worksheet) -> None:
    if sheet.title != "Planilha1":
        raise TemplateMappingError("A aba esperada Planilha1 não foi encontrada.")
    for address, expected in TEMPLATE_MARKERS.items():
        if sheet[address].value != expected:
            raise TemplateMappingError(
                f"O template não corresponde ao modelo mapeado: célula {address}."
            )
    required_merges = {"A7:M7", "A26:M26", "K27:M27", "A34:M34", "A35:M35"}
    actual_merges = {str(item) for item in sheet.merged_cells.ranges}
    if not required_merges <= actual_merges:
        raise TemplateMappingError("O template possui regiões mescladas diferentes do modelo.")


def _set_percent(sheet: Worksheet, field: str, value: Decimal | None) -> None:
    cell = sheet[EXCEL_FIELD_MAP[field]]
    cell.value = value / Decimal("100") if value is not None else None
    cell.number_format = "0.00%"


class OpenpyxlExcelProposalExporter:
    def __init__(self, settings: AppSettings, properties: PropertyRepository) -> None:
        self.settings = settings
        self.properties = properties

    def export(self, proposal: Proposal, destination: Path) -> Path:
        proposal.validate()
        if len(proposal.participants) > len(PARTICIPANT_ROWS):
            raise ValueError(
                f"O modelo suporta até {len(PARTICIPANT_ROWS)} participantes."
            )
        template = self.settings.template_path()
        destination = Path(destination)
        if not template.is_file():
            raise FileNotFoundError(f"Template XLSX não encontrado: {template}")
        if template.resolve() == destination.resolve():
            raise ValueError("O arquivo de saída não pode substituir o template original.")
        if destination.exists():
            raise FileExistsError(f"O arquivo já existe: {destination}")
        logger.info("Iniciando XLSX; template=%s; pasta=%s", template, destination.parent)
        try:
            workbook = load_workbook(template)
            sheet = workbook.active
            _check_template(sheet)
            prepare_layout(sheet)
            self._fill_general(sheet, proposal)
            self._fill_participants(sheet, proposal)
            self._fill_financial(sheet, proposal)
            self._fill_properties(sheet, proposal)
            destination.parent.mkdir(parents=True, exist_ok=True)
            workbook.save(destination)
            logger.info("XLSX gerado com sucesso; pasta=%s", destination.parent)
            return destination
        except Exception:
            logger.exception("Falha na geração do XLSX; pasta=%s", destination.parent)
            raise

    def _fill_general(self, sheet: Worksheet, proposal: Proposal) -> None:
        for field in (
            "numero_proposta", "agencia", "proponente", "cpf_cnpj", "tecnico", "porte",
        ):
            sheet[EXCEL_FIELD_MAP[field]] = getattr(proposal, field) or None
        other_count = sum(
            item.tipo != ParticipantType.MAIN_ISSUER for item in proposal.participants
        )
        sheet[EXCEL_FIELD_MAP["outros_participantes"]] = (
            f"{other_count} participante(s)" if other_count else None
        )
        sheet[EXCEL_FIELD_MAP["technician_signature"]] = (
            f"TÉCNICO RESPONSÁVEL: {proposal.tecnico}"
        )
        sheet[EXCEL_FIELD_MAP["date_line"]] = format_date_pt_br(
            proposal.cidade, proposal.data_proposta
        )

    def _fill_participants(self, sheet: Worksheet, proposal: Proposal) -> None:
        for row in PARTICIPANT_ROWS:
            for column in PARTICIPANT_COLUMNS:
                sheet[f"{column}{row}"] = None
        for row, participant in zip(PARTICIPANT_ROWS, proposal.participants, strict=False):
            sheet[f"A{row}"] = participant.nome
            sheet[f"I{row}"] = participant.cpf_cnpj or None
            sheet[f"M{row}"] = int(participant.tipo)

    def _fill_financial(self, sheet: Worksheet, proposal: Proposal) -> None:
        for field in ("finalidade", "descricao", "fonte"):
            sheet[EXCEL_FIELD_MAP[field]] = getattr(proposal, field) or None
        sheet[EXCEL_FIELD_MAP["recursos_proprios_flag"]] = (
            "Sim" if proposal.recursos_proprios > 0 else "Não"
        )
        for field in CURRENCY_FIELDS:
            value = getattr(proposal, field)
            cell = sheet[EXCEL_FIELD_MAP[field]]
            cell.value = value
            cell.number_format = '"R$" #,##0.00'
        for field in PERCENT_FIELDS:
            _set_percent(sheet, field, getattr(proposal, field))
        for field in BOOLEAN_FIELDS:
            sheet[EXCEL_FIELD_MAP[field]] = (
                "Sim" if getattr(proposal, field) else "Não"
            )
        _set_percent(sheet, "laudo_abc_percentual",
                     proposal.laudo_abc_percentual if proposal.laudo_abc_financiado else None)
        cell = sheet[EXCEL_FIELD_MAP["laudo_abc_valor"]]
        cell.value = proposal.laudo_abc_valor if proposal.laudo_abc_financiado else None
        cell.number_format = '"R$" #,##0.00'

    def _fill_properties(self, sheet: Worksheet, proposal: Proposal) -> None:
        for row in PROPERTY_ROWS:
            for column in PROPERTY_COLUMNS:
                sheet[f"{column}{row}"] = None
        labels = self.settings.classification_labels("xlsx")
        for code, address in CLASSIFICATION_LEGEND_CELLS.items():
            sheet[address] = f"{code} - {labels[code]}"
        lines = []
        for link in proposal.properties:
            if link.property_name_snapshot and link.selected_parcels:
                lines.extend((
                    link.property_name_snapshot, link.municipality_snapshot,
                    parcel.registration_snapshot, parcel.classificacao,
                ) for parcel in link.selected_parcels)
            else:
                property_item = self.properties.get_by_external_id(link.property_external_id)
                if property_item is None or isinstance(property_item, RuralProperty):
                    raise ValueError(
                        f"Imóvel {link.property_external_id} sem snapshot exportável."
                    )
                lines.append((property_item.nome, property_item.municipio,
                              property_item.matricula, link.classificacao))
        pages = property_page_rows(sheet, len(lines))
        for row in (row for page in pages for row in page):
            for column in PROPERTY_COLUMNS:
                sheet[f"{column}{row}"] = None
        for row, (name, municipality, registration, classification) in zip(
            (row for page in pages for row in page), lines, strict=False,
        ):
            sheet[f"A{row}"] = name
            sheet[f"E{row}"] = municipality
            sheet[f"I{row}"] = registration
            sheet[f"K{row}"] = int(classification.value)
