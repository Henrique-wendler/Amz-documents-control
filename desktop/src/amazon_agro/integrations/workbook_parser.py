"""Profile-driven, read-only parsing of property and registration hierarchy."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from amazon_agro.domain.models import PropertyParcel, RuralProperty
from amazon_agro.integrations.workbook_inspector import (
    NeedsConfigurationError, select_header,
)
from amazon_agro.integrations.workbook_profile import PropertyWorkbookProfile


@dataclass(frozen=True, slots=True)
class ParsedWorkbook:
    source_file: str
    profile_name: str
    owner_name: str
    owner_document: str
    properties: tuple[RuralProperty, ...]


def _text(value: object, number_format: str = "") -> str:
    if value is None:
        return ""
    if isinstance(value, int) and re.fullmatch(r"0+", number_format):
        return str(value).zfill(len(number_format))
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return " ".join(str(value).split())


def _area(value: object) -> Decimal | None:
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip().replace(" ", "")
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        result = Decimal(raw)
    except InvalidOperation as error:
        raise NeedsConfigurationError("Área de matrícula inválida para o perfil.") from error
    if not result.is_finite() or result < 0:
        raise NeedsConfigurationError("Área de matrícula inválida para o perfil.")
    return result


def _id(prefix: str, fields: tuple[str, ...], values: dict[str, str]) -> str:
    parts = []
    for field in fields:
        value = values.get(field, "")
        if field == "owner_document":
            digits = re.sub(r"\D", "", value)
            value = digits or value
        parts.append(" ".join(value.casefold().split()))
    if not any(parts):
        raise NeedsConfigurationError("Campos de identidade vazios no perfil.")
    payload = json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    return prefix + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


class PropertyWorkbookParser:
    @staticmethod
    def _vertical_merges(sheet: Worksheet) -> dict[tuple[int, int], tuple[int, int]]:
        result: dict[tuple[int, int], tuple[int, int]] = {}
        for merged in sheet.merged_cells.ranges:
            if merged.min_col != merged.max_col or merged.min_row == merged.max_row:
                continue
            for row in range(merged.min_row, merged.max_row + 1):
                result[(row, merged.min_col)] = (merged.min_row, merged.min_col)
        return result

    @staticmethod
    def _read(
        sheet: Worksheet, row: int, column: int | None,
        merges: dict[tuple[int, int], tuple[int, int]], inherit_merged: bool,
    ) -> str:
        if column is None:
            return ""
        cell = sheet.cell(row, column)
        if cell.value is None and inherit_merged:
            anchor = merges.get((row, column))
            if anchor is not None:
                cell = sheet.cell(*anchor)
        return _text(cell.value, cell.number_format)

    def parse(
        self, path: Path, relative_path: str, profile: PropertyWorkbookProfile,
    ) -> ParsedWorkbook:
        workbook = load_workbook(path, data_only=True, read_only=False)
        try:
            sheet, header = select_header(workbook, profile)
            columns = header.columns
            merges = self._vertical_merges(sheet)
            properties: dict[str, RuralProperty] = {}
            parcel_ids: set[str] = set()
            active_name = ""
            last_property_id = ""
            closed_property_ids: set[str] = set()
            owner_names: set[str] = set()
            owner_documents: set[str] = set()
            for row in range(header.row + 1, sheet.max_row + 1):
                direct_name = self._read(sheet, row, columns.get("name"), merges, True)
                registration = self._read(sheet, row, columns.get("registration"), merges, False)
                area_text = self._read(sheet, row, columns.get("area"), merges, False)
                lot = self._read(sheet, row, columns.get("lot_description"), merges, False)
                area_column = columns.get("area")
                if (
                    registration and area_column is not None
                    and (anchor := merges.get((row, area_column))) is not None
                    and anchor[0] < row
                ):
                    raise NeedsConfigurationError(
                        "Área mesclada cobre várias matrículas; configure sua interpretação."
                    )
                if not any((direct_name, registration, area_text, lot)):
                    active_name = ""
                    continue
                name = direct_name
                if not name and profile.inherit_unmerged_property_name:
                    name = active_name
                if not name:
                    raise NeedsConfigurationError(
                        "Linha de matrícula sem fazenda vinculada; configure o agrupamento."
                    )
                active_name = name
                if not registration:
                    raise NeedsConfigurationError("Linha de fazenda sem matrícula; revise o perfil.")
                owner_name = self._read(sheet, row, columns.get("owner_name"), merges, True)
                owner_document = self._read(sheet, row, columns.get("owner_document"), merges, True)
                if not owner_name and profile.owner_name_cell:
                    owner_name = _text(sheet[profile.owner_name_cell].value)
                if not owner_document and profile.owner_document_cell:
                    owner_document = _text(sheet[profile.owner_document_cell].value)
                if not owner_name:
                    raise NeedsConfigurationError("Proprietário ausente em bloco de fazenda.")
                owner_names.add(owner_name)
                if owner_document:
                    owner_documents.add(owner_document)
                details = {
                    field: self._read(sheet, row, columns.get(field), merges, True)
                    for field in ("municipality", "state", "ccir", "itr", "car")
                }
                values = {
                    "source_file": relative_path,
                    "profile": profile.name,
                    "owner_document": owner_document or owner_name,
                    "owner_name": owner_name,
                    "name": name,
                    **details,
                }
                property_id = _id("rp_", profile.property_identity_fields, values)
                if property_id != last_property_id:
                    if last_property_id:
                        closed_property_ids.add(last_property_id)
                    if property_id in closed_property_ids:
                        raise NeedsConfigurationError(
                            "Blocos separados têm a mesma identidade de fazenda."
                        )
                    last_property_id = property_id
                property_item = properties.get(property_id)
                if property_item is None:
                    property_item = RuralProperty(
                        external_id=property_id, name=name,
                        municipality=details["municipality"], state=details["state"],
                        owner_name=owner_name, owner_document=owner_document,
                        ccir=details["ccir"], itr=details["itr"], car=details["car"],
                        source_file=relative_path, source_profile=profile.name,
                    )
                    properties[property_id] = property_item
                else:
                    if (
                        property_item.owner_name != owner_name
                        or property_item.owner_document != owner_document
                    ):
                        raise NeedsConfigurationError(
                            "Dados de proprietário conflitantes no mesmo bloco."
                        )
                    for field, incoming in details.items():
                        existing = getattr(property_item, field)
                        if existing and incoming and existing != incoming:
                            raise NeedsConfigurationError(
                                "Dados conflitantes no mesmo bloco de fazenda."
                            )
                        if incoming and not existing:
                            setattr(property_item, field, incoming)
                previous = self._read(
                    sheet, row, columns.get("previous_registration"), merges, False
                )
                parcel_values = {
                    "property_external_id": property_id,
                    "registration": registration,
                    "previous_registration": previous,
                    "lot_description": lot,
                    "area": area_text,
                }
                parcel_id = _id("pc_", profile.parcel_identity_fields, parcel_values)
                if parcel_id in parcel_ids:
                    raise NeedsConfigurationError(
                        "Matrículas com identidade duplicada; revise campos do perfil."
                    )
                parcel_ids.add(parcel_id)
                property_item.parcels.append(PropertyParcel(
                    external_id=parcel_id, property_external_id=property_id,
                    registration=registration, previous_registration=previous,
                    area=_area(area_text), lot_description=lot,
                ))
            if not properties:
                raise NeedsConfigurationError("Nenhuma fazenda encontrada para o perfil.")
            return ParsedWorkbook(
                source_file=relative_path, profile_name=profile.name,
                owner_name=next(iter(owner_names)) if len(owner_names) == 1 else "",
                owner_document=next(iter(owner_documents)) if len(owner_documents) == 1 else "",
                properties=tuple(properties.values()),
            )
        finally:
            workbook.close()
