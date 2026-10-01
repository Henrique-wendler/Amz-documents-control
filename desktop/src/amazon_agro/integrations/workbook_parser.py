"""Profile-driven, read-only parsing of property and registration hierarchy."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from amazon_agro.domain.models import PropertyParcel, RuralProperty
from amazon_agro.integrations.area_parser import parse_area_ha
from amazon_agro.integrations.workbook_inspector import NeedsConfigurationError, select_header
from amazon_agro.integrations.workbook_profile import PropertyWorkbookProfile


PARSER_VERSION = 2
_PARCEL_FIELDS = ("area", "previous_registration", "lot_description", "ccir", "itr", "car")
_LABELS = {
    "area": "Área", "previous_registration": "Matrícula anterior",
    "lot_description": "Lote/Gleba", "ccir": "CCIR", "itr": "ITR", "car": "CAR",
    "municipality": "Município", "state": "UF",
}


@dataclass(frozen=True, slots=True)
class ParsedWorkbook:
    source_file: str
    profile_name: str
    owner_name: str
    owner_document: str
    properties: tuple[RuralProperty, ...]
    warnings: tuple[str, ...] = ()


@dataclass
class _ParcelRecord:
    row: int
    name: str
    registration: str
    group_key: tuple[str, int]
    values: dict[str, str] = field(default_factory=dict)
    owners: set[tuple[str, str]] = field(default_factory=set)
    last_row: int = 0


def _text(value: object, number_format: str = "") -> str:
    if value is None:
        return ""
    if isinstance(value, int) and re.fullmatch(r"0+", number_format):
        return str(value).zfill(len(number_format))
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return " ".join(str(value).split())


def _id(prefix: str, fields: tuple[str, ...], values: dict[str, str]) -> str:
    parts = []
    for key in fields:
        value = values.get(key, "")
        if key == "owner_document":
            digits = re.sub(r"\D", "", value)
            value = digits or value
        parts.append(" ".join(value.casefold().split()))
    if not any(parts):
        raise NeedsConfigurationError("Campos de identidade vazios no perfil.")
    payload = json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    return prefix + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _distinct_owners(owners: set[tuple[str, str]]) -> set[tuple[str, str]]:
    """Collapse formatting differences and explicitly matching partial records.

    A blank document for the same name is not a second owner. Distinct supplied
    documents remain distinct; unrelated name-only/document-only rows are never
    paired by proximity.
    """
    canonical = {}
    for name, document in sorted(owners):
        key = (name.casefold(), re.sub(r"\D", "", document) or document.casefold())
        canonical.setdefault(key, (name, document))
    return {
        value for key, value in canonical.items()
        if not any(other != key and all(not part or part == other[index]
                                       for index, part in enumerate(key))
                   for other in canonical)
    }


class PropertyWorkbookParser:
    @staticmethod
    def _vertical_merges(sheet: Worksheet) -> dict[tuple[int, int], tuple[int, int]]:
        result = {}
        for merged in sheet.merged_cells.ranges:
            if merged.min_col != merged.max_col or merged.min_row == merged.max_row:
                continue
            for row in range(merged.min_row, merged.max_row + 1):
                result[row, merged.min_col] = (merged.min_row, merged.min_col)
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
            cell = sheet.cell(*merges.get((row, column), (row, column)))
        return _text(cell.value, cell.number_format)

    def parse(self, path: Path, relative_path: str,
              profile: PropertyWorkbookProfile) -> ParsedWorkbook:
        workbook = load_workbook(path, data_only=False, read_only=False)
        try:
            sheet, header = select_header(workbook, profile)
            columns = header.columns
            merges = self._vertical_merges(sheet)
            warnings: list[str] = []
            errors: list[str] = []
            records: dict[int, _ParcelRecord] = {}
            registration_column = columns["registration"]

            def read(row: int, key: str, inherit: bool = True) -> str:
                return self._read(sheet, row, columns.get(key), merges, inherit)

            def registration_anchor(row: int) -> int:
                return merges.get((row, registration_column), (row, registration_column))[0]

            def merged_targets(row: int, key: str) -> set[int]:
                """Registration anchors explicitly covered by this field's merge."""
                column = columns.get(key)
                anchor = merges.get((row, column))
                if anchor is None:
                    return set()
                return {
                    registration_anchor(other_row)
                    for (other_row, other_column), other_anchor in merges.items()
                    if other_column == column and other_anchor == anchor
                    and read(other_row, "registration")
                }

            active_name = ""
            active_group = 0
            previous_name = ""
            property_rows: list[int] = []
            for row in range(header.row + 1, sheet.max_row + 1):
                direct = {key: read(row, key, False) for key in columns}
                outside = [cell.coordinate for cell in sheet[row]
                           if cell.column not in columns.values() and _text(cell.value)]
                if outside:
                    warnings.append(
                        f"Linha {row}: conteúdo fora das colunas da tabela ignorado "
                        f"({', '.join(outside)})."
                    )
                formula_fields = [key for key, column in columns.items()
                                  if sheet.cell(row, column).data_type in {"f", "e"}]
                if formula_fields:
                    errors.append(f"Linha {row}: fórmula ou erro Excel em campo mapeado; "
                                  "forneça um valor verificável para importação.")
                    continue
                name = read(row, "name")
                registration = read(row, "registration")
                if not any(direct.values()) and not registration:
                    active_name = ""
                    previous_name = ""
                    continue
                if not name and profile.inherit_unmerged_property_name:
                    name = active_name
                if name:
                    active_name = name
                name_anchor = merges.get((row, columns["name"]))
                if name_anchor is not None:
                    group_key = (name, name_anchor[0])
                else:
                    if name != previous_name:
                        active_group = row
                    group_key = (name, active_group)
                previous_name = name

                if not registration:
                    unresolved = []
                    for key in _PARCEL_FIELDS:
                        if not direct.get(key):
                            continue
                        targets = merged_targets(row, key)
                        same_farm = name and targets and all(read(target, "name") == name
                                                            for target in targets)
                        if not same_farm or (key in ("area", "previous_registration", "lot_description")
                                             and len(targets) != 1):
                            unresolved.append(_LABELS[key])
                    if unresolved:
                        errors.append(f"Linha {row} possui {', '.join(unresolved)} mas nenhuma "
                                      "matrícula pôde ser determinada com segurança.")
                    if name and merged_targets(row, "name"):
                        property_rows.append(row)
                    elif any(direct.values()) and not unresolved:
                        warnings.append(f"Linha {row}: conteúdo sem campos estruturais suficientes "
                                        "ignorado; nenhuma entidade criada.")
                    continue

                anchor = registration_anchor(row)
                if not re.fullmatch(r"[A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*", registration) or registration == "0":
                    errors.append(f"Linha {anchor}: matrícula não identificável; revise o valor da célula.")
                    continue
                if not name:
                    errors.append(f"Linha {row}: matrícula sem fazenda vinculada; configure o agrupamento.")
                    continue
                record = records.setdefault(anchor, _ParcelRecord(anchor, name, registration, group_key))
                record.last_row = row
                if record.group_key != group_key:
                    errors.append(f"Linha {row}: matrícula mesclada atravessa grupos de fazenda.")
                    continue
                for key in (*_PARCEL_FIELDS, "municipality", "state"):
                    incoming = read(row, key)
                    if not incoming:
                        continue
                    if key in ("area", "previous_registration", "lot_description") and len(merged_targets(row, key)) > 1:
                        errors.append(f"Linha {row}: {_LABELS[key]} mesclada cobre várias matrículas; "
                                      "configure sua interpretação.")
                        continue
                    if key == "area":
                        area_column = columns[key]
                        area_cell = sheet.cell(*merges.get((row, area_column), (row, area_column)))
                        try:
                            incoming = format(parse_area_ha(area_cell.value), "f")
                        except ValueError as error:
                            errors.append(f"Linha {row}: {error}")
                            continue
                    previous = record.values.get(key)
                    if previous and previous != incoming:
                        errors.append(f"Linha {row}: {_LABELS[key]} conflitante no complemento da matrícula "
                                      f"iniciada na linha {anchor}.")
                    else:
                        record.values[key] = incoming
                owner_name = read(row, "owner_name")
                owner_document = read(row, "owner_document")
                if not owner_name and profile.owner_name_cell:
                    owner_name = _text(sheet[profile.owner_name_cell].value)
                if not owner_document and profile.owner_document_cell:
                    owner_document = _text(sheet[profile.owner_document_cell].value)
                if owner_name or owner_document:
                    record.owners.add((owner_name, owner_document))

            # Only a real name merge may connect property-level rows to parcels.
            for row in property_rows:
                targets = merged_targets(row, "name")
                for target in targets:
                    if target not in records:
                        continue
                    record = records[target]
                    for key in ("municipality", "state"):
                        incoming = read(row, key, False)
                        if incoming:
                            existing = record.values.get(key)
                            if existing and incoming != existing:
                                errors.append(f"Linha {row}: {_LABELS[key]} conflitante no grupo da fazenda.")
                            else:
                                record.values[key] = incoming
                    owner = (read(row, "owner_name", False), read(row, "owner_document", False))
                    if any(owner):
                        record.owners.add(owner)

            # Keep contiguous physical farm groups together, including optional
            # owner gaps. Never split a real name merge by changing owners.
            groups: list[list[_ParcelRecord]] = []
            for record in records.values():
                if not groups or groups[-1][-1].group_key != record.group_key:
                    groups.append([])
                groups[-1].append(record)
            properties: dict[str, RuralProperty] = {}
            parcel_ids: set[str] = set()
            owner_names: set[str] = set()
            owner_documents: set[str] = set()
            for group in groups:
                owners = _distinct_owners(set().union(*(record.owners for record in group)))
                multiple_parcel_owners = False
                for record in group:
                    parcel_owners = _distinct_owners(record.owners)
                    if len(parcel_owners) > 1:
                        multiple_parcel_owners = True
                        errors.append(
                            f"Linhas {record.row}–{record.last_row}: {len(parcel_owners)} proprietários "
                            "associados à mesma matrícula por mesclagem. O modelo atual aceita "
                            "um proprietário por fazenda; nenhum foi escolhido ou descartado."
                        )
                if len(owners) > 1:
                    if not multiple_parcel_owners:
                        errors.append(
                            f"Linhas {group[0].row}–{group[-1].last_row}: proprietários distintos "
                            "nas matrículas do mesmo grupo de fazenda. O modelo atual aceita "
                            "um proprietário por fazenda; configure a representação antes de importar."
                        )
                    continue
                owner_name, owner_document = next(iter(owners), ("", ""))
                if owner_name:
                    owner_names.add(owner_name)
                if owner_document:
                    owner_documents.add(owner_document)
                details = {}
                for key in ("municipality", "state", "ccir", "itr", "car"):
                    incoming = {record.values[key] for record in group if record.values.get(key)}
                    if len(incoming) > 1 and key in ("municipality", "state"):
                        errors.append(f"Linha {group[0].row}: {_LABELS[key]} conflitante no grupo de fazenda.")
                    if key in ("ccir", "itr", "car") and any(not record.values.get(key) for record in group):
                        incoming.add("")
                    details[key] = next(iter(incoming)) if len(incoming) == 1 else ""
                values = {
                    "source_file": relative_path, "profile": profile.name,
                    "owner_document": owner_document or owner_name,
                    "owner_name": owner_name, "name": group[0].name, **details,
                }
                property_id = _id("rp_", profile.property_identity_fields, values)
                if property_id in properties:
                    errors.append(f"Linha {group[0].row}: Blocos separados têm a mesma identidade de fazenda.")
                    continue
                property_item = RuralProperty(
                    external_id=property_id, name=group[0].name,
                    owner_name=owner_name, owner_document=owner_document,
                    source_file=relative_path, source_profile=profile.name, **details,
                )
                properties[property_id] = property_item
                for record in group:
                    parcel_values = {
                        "property_external_id": property_id,
                        "registration": record.registration,
                        **{key: record.values.get(key, "") for key in _PARCEL_FIELDS},
                    }
                    parcel_id = _id("pc_", profile.parcel_identity_fields, parcel_values)
                    if parcel_id in parcel_ids:
                        errors.append(f"Linha {record.row}: Matrículas com identidade duplicada; revise campos do perfil.")
                        continue
                    parcel_ids.add(parcel_id)
                    try:
                        area = parse_area_ha(record.values.get("area"))
                    except ValueError as error:
                        errors.append(f"Linha {record.row}: {error}")
                        continue
                    property_item.parcels.append(PropertyParcel(
                        external_id=parcel_id, property_external_id=property_id,
                        registration=record.registration,
                        previous_registration=record.values.get("previous_registration", ""),
                        area=area, lot_description=record.values.get("lot_description", ""),
                        extra_fields={key: record.values[key] for key in ("ccir", "itr", "car")
                                      if record.values.get(key)},
                    ))
            if errors:
                diagnostics = tuple(dict.fromkeys(errors))
                raise NeedsConfigurationError("\n".join((*diagnostics, *warnings)),
                                              diagnostics=diagnostics, warnings=tuple(warnings))
            if not properties:
                raise NeedsConfigurationError("Nenhuma fazenda com matrícula encontrada para o perfil.",
                                              warnings=tuple(warnings))
            return ParsedWorkbook(
                source_file=relative_path, profile_name=profile.name,
                owner_name=next(iter(owner_names)) if len(owner_names) == 1 else "",
                owner_document=next(iter(owner_documents)) if len(owner_documents) == 1 else "",
                properties=tuple(properties.values()), warnings=tuple(warnings),
            )
        finally:
            workbook.close()
