from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from amazon_agro.config.resources import resource_path


def _template_labels() -> dict[str, dict[str, str]]:
    return {
        "xlsx": {
            "1": "GARANTIA",
            "2": "OBJETO DE CRÉDITO",
            "3": "ALIENAÇÃO FIDUCIÁRIA",
        },
        "docx": {
            "1": "HIPOTECA",
            "2": "OBJETO DE CRÉDITO",
            "3": "ALIENAÇÃO FIDUCIÁRIA",
        },
    }


@dataclass(slots=True)
class AppSettings:
    first_run_completed: bool = False
    default_technician: str = ""
    xlsx_template_path: str = ""
    # Kept only to read older configuration files; directory sources supersede it.
    property_spreadsheet_path: str = ""
    property_source_type: str = "directory"
    property_source_directory: str = ""
    property_file_patterns: list[str] = field(default_factory=lambda: ["*.xlsx", "*.xlsm"])
    property_excluded_files: list[str] = field(default_factory=lambda: ["Demandas - Amazon Agro.xlsx"])
    property_recursive: bool = False
    property_profile_name: str = "BASA Ambiental"
    property_profile_options: dict[str, object] = field(default_factory=dict)
    property_profiles: dict[str, dict[str, object]] = field(default_factory=dict)
    property_profile_rules: list[dict[str, str]] = field(default_factory=list)
    property_file_profiles: dict[str, str] = field(default_factory=dict)
    default_output_dir: str = ""
    default_city: str = "Palmas"
    technicians: list[str] = field(default_factory=list)
    banks: list[str] = field(default_factory=lambda: ["Banco da Amazônia"])
    agencies: list[str] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    awaiting_options: list[str] = field(default_factory=list)
    property_classifications: dict[str, str] = field(default_factory=lambda: {
        "1": "Classe 1 — Garantia/Hipoteca (confirmar)",
        "2": "Objeto de crédito",
        "3": "Alienação fiduciária",
    })
    property_classification_labels: dict[str, dict[str, str]] = field(
        default_factory=_template_labels
    )
    _source_path: Path | None = field(default=None, init=False, repr=False)

    @classmethod
    def load(cls, path: Path | None = None) -> AppSettings:
        path = path or default_config_path()
        if not path.exists():
            settings = cls()
            settings._source_path = path.resolve()
            return settings
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("A configuração deve ser um objeto JSON.")
        # Migrate configurations saved before the local-folder source was named
        # source_directory. The old key is accepted but never written again.
        if "source_directory" in raw:
            raw["property_source_directory"] = raw.pop("source_directory")
        unknown = set(raw) - {item.name for item in fields(cls) if item.init}
        if unknown:
            raise ValueError(f"Configurações desconhecidas: {', '.join(sorted(unknown))}")
        settings = cls(**raw)
        settings._source_path = path.resolve()
        settings._validate_labels()
        return settings

    def _validate_labels(self) -> None:
        codes = {"1", "2", "3"}
        if codes - set(self.property_classifications):
            raise ValueError("Configure as classificações 1, 2 e 3 dos imóveis.")
        for template in ("xlsx", "docx"):
            labels = self.property_classification_labels.get(template, {})
            if codes - set(labels):
                raise ValueError(
                    f"Configure as classificações 1, 2 e 3 do template {template}."
                )

    def classification_labels(self, template: str) -> dict[str, str]:
        self._validate_labels()
        return self.property_classification_labels[template]

    def template_path(self) -> Path:
        if not self.xlsx_template_path:
            return resource_path("templates", "modelo_proposta.xlsx")
        path = Path(self.xlsx_template_path).expanduser()
        if path.is_absolute():
            return path
        base = self._source_path.parent if self._source_path else default_config_path().parent
        return base / path

    def output_dir(self) -> Path:
        if not self.default_output_dir:
            return default_data_dir() / "exports"
        path = Path(self.default_output_dir).expanduser()
        if path.is_absolute():
            return path
        base = self._source_path.parent if self._source_path else default_config_path().parent
        return base / path

    def source_directory(self) -> Path | None:
        if not self.property_source_directory.strip():
            return None
        path = Path(self.property_source_directory).expanduser()
        if path.is_absolute():
            return path
        base = self._source_path.parent if self._source_path else default_config_path().parent
        return base / path

    def save(self, path: Path | None = None) -> None:
        destination = path or self._source_path or default_config_path()
        destination.parent.mkdir(parents=True, exist_ok=True)
        values = {
            item.name: getattr(self, item.name)
            for item in fields(self)
            if item.init and item.name not in {"property_spreadsheet_path", "property_source_directory"}
        }
        values["source_directory"] = self.property_source_directory
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_text(json.dumps(values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
        self._source_path = destination


def default_data_dir() -> Path:
    root = os.environ.get("LOCALAPPDATA")
    return (Path(root) if root else Path.home() / ".local" / "share") / "AmazonAgro"


def default_config_path() -> Path:
    configured = os.environ.get("AMAZON_AGRO_CONFIG")
    return Path(configured).expanduser() if configured else default_data_dir() / "config.json"
