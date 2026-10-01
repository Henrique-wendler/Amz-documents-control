"""Configurable rules for a family of rural-property workbooks."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", text))


def _aliases() -> dict[str, tuple[str, ...]]:
    return {
        "name": ("Fazenda", "Nome do imóvel", "Imóvel", "Propriedade"),
        "area": ("Área (há)", "Área ha", "Área", "Área hectares"),
        "registration": ("Matrículas", "Matrícula", "Registro", "Nº matrícula"),
        "previous_registration": ("Matrícula Anterior", "Registro anterior"),
        "lot_description": ("Lote/Gleba", "Lote", "Gleba"),
        "owner_name": ("Proprietário", "Proprietária", "Nome do proprietário"),
        "owner_document": ("CPF/CNPJ", "CPF", "CNPJ", "Documento do proprietário"),
        "ccir": ("CCIR",),
        "itr": ("ITR",),
        "car": ("CAR",),
        "municipality": ("Município", "Cidade"),
        "state": ("UF", "Estado"),
    }


@dataclass(frozen=True, slots=True)
class PropertyWorkbookProfile:
    name: str = "BASA Ambiental"
    sheet_selector: str = ""
    header_scan_rows: int = 20
    column_aliases: dict[str, tuple[str, ...]] = field(default_factory=_aliases)
    required_fields: tuple[str, ...] = ("name", "registration")
    property_identity_fields: tuple[str, ...] = ("source_file", "owner_document", "name")
    parcel_identity_fields: tuple[str, ...] = (
        "property_external_id", "registration", "previous_registration", "lot_description",
    )
    inherit_unmerged_property_name: bool = False
    owner_name_cell: str = ""
    owner_document_cell: str = ""

    @classmethod
    def configured(cls, name: str, options: dict[str, object] | None = None) -> PropertyWorkbookProfile:
        if not name.strip():
            raise ValueError("Informe o nome do perfil de planilhas.")
        options = options or {}
        allowed = {
            "sheet_selector", "header_scan_rows", "column_aliases", "required_fields",
            "property_identity_fields", "parcel_identity_fields",
            "inherit_unmerged_property_name", "owner_name_cell", "owner_document_cell",
        }
        unknown = set(options) - allowed
        if unknown:
            raise ValueError(f"Opções de perfil desconhecidas: {', '.join(sorted(unknown))}")
        values = dict(options)
        if "column_aliases" in values:
            supplied = values["column_aliases"]
            if not isinstance(supplied, dict):
                raise ValueError("column_aliases deve ser um objeto por campo.")
            aliases = _aliases()
            for field_name, candidates in supplied.items():
                if field_name not in aliases or not isinstance(candidates, list):
                    raise ValueError(f"Alias inválido para {field_name}.")
                aliases[field_name] = tuple(str(item) for item in candidates)
            values["column_aliases"] = aliases
        for key in ("required_fields", "property_identity_fields", "parcel_identity_fields"):
            if key in values:
                if not isinstance(values[key], (list, tuple)) or not values[key]:
                    raise ValueError(f"{key} deve ser uma lista não vazia.")
                values[key] = tuple(str(item) for item in values[key])
        profile = cls(name=name, **values)
        if profile.header_scan_rows < 1:
            raise ValueError("header_scan_rows deve ser positivo.")
        if not set(profile.required_fields) <= set(profile.column_aliases):
            raise ValueError("required_fields contém campo sem alias.")
        property_identity_allowed = {
            "source_file", "profile", "owner_document", "owner_name", "name",
            "municipality", "state", "ccir", "itr", "car",
        }
        parcel_identity_allowed = {
            "property_external_id", "registration", "previous_registration",
            "lot_description", "area",
        }
        if not set(profile.property_identity_fields) <= property_identity_allowed:
            raise ValueError("Campo de identidade de fazenda não suportado.")
        if not set(profile.parcel_identity_fields) <= parcel_identity_allowed:
            raise ValueError("Campo de identidade de matrícula não suportado.")
        used: dict[str, str] = {}
        for field_name, aliases in profile.column_aliases.items():
            for alias in aliases:
                key = normalized(alias)
                if key in used and used[key] != field_name:
                    raise ValueError("Alias de cabeçalho atribuído a mais de um campo.")
                used[key] = field_name
        return profile

    def field_for_header(self, value: object) -> str | None:
        header = normalized(value)
        if not header:
            return None
        return next((
            field_name for field_name, aliases in self.column_aliases.items()
            if header in {normalized(alias) for alias in aliases}
        ), None)
