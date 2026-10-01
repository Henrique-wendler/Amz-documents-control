"""Incremental synchronization from a directory into the SQLite catalogue."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path

from amazon_agro.config.settings import AppSettings
from amazon_agro.integrations.workbook_discovery import (
    DiscoveredWorkbook, PropertyWorkbookDiscovery,
)
from amazon_agro.integrations.workbook_inspector import NeedsConfigurationError
from amazon_agro.integrations.workbook_parser import PARSER_VERSION, PropertyWorkbookParser
from amazon_agro.integrations.workbook_profile import PropertyWorkbookProfile
from amazon_agro.repositories.sqlite_property_catalog import (
    CatalogStats, SQLitePropertyCatalogRepository,
)


@dataclass(frozen=True, slots=True)
class SyncEvent:
    file: str
    action: str
    status: str


@dataclass(frozen=True, slots=True)
class SyncReport:
    events: tuple[SyncEvent, ...]
    stats: CatalogStats


def _fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


class PropertyCatalogSyncService:
    def __init__(
        self, catalog: SQLitePropertyCatalogRepository,
        discovery: PropertyWorkbookDiscovery | None = None,
        parser: PropertyWorkbookParser | None = None,
    ) -> None:
        self.catalog = catalog
        self.discovery = discovery or PropertyWorkbookDiscovery()
        self.parser = parser or PropertyWorkbookParser()

    @staticmethod
    def _profile_for(
        file: DiscoveredWorkbook, settings: AppSettings,
    ) -> tuple[PropertyWorkbookProfile, str]:
        matched: set[str] = set()
        exact = settings.property_file_profiles.get(file.relative_path)
        if exact:
            matched.add(exact)
        else:
            for rule in settings.property_profile_rules:
                if not isinstance(rule, dict) or not rule.get("pattern") or not rule.get("profile"):
                    raise NeedsConfigurationError("Regra de perfil de arquivo inválida.")
                if fnmatch(file.relative_path.casefold(), rule["pattern"].casefold()):
                    matched.add(rule["profile"])
        if len(matched) > 1:
            raise NeedsConfigurationError("Mais de um perfil corresponde ao arquivo.")
        name = next(iter(matched)) if matched else settings.property_profile_name
        if name == settings.property_profile_name:
            options = settings.property_profiles.get(name, settings.property_profile_options)
        else:
            options = settings.property_profiles.get(name)
            if options is None:
                raise NeedsConfigurationError("Perfil atribuído ao arquivo não configurado.")
        try:
            profile = PropertyWorkbookProfile.configured(name, options)
        except (TypeError, ValueError) as error:
            raise NeedsConfigurationError("Configuração de perfil inválida.") from error
        signature = hashlib.sha256(
            json.dumps({"parser_version": PARSER_VERSION, "profile": asdict(profile)},
                       sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        return profile, signature

    def synchronize(self, settings: AppSettings) -> SyncReport:
        if settings.property_source_type != "directory":
            raise ValueError("Tipo de fonte de imóveis ainda não suportado.")
        directory = settings.source_directory()
        if directory is None:
            raise ValueError("Configure a pasta das planilhas de imóveis.")
        discovered = self.discovery.discover(
            directory, settings.property_file_patterns, settings.property_recursive,
            settings.property_excluded_files,
        )
        events: list[SyncEvent] = []
        seen = {str(file.path) for file in discovered}
        for file in discovered:
            previous = self.catalog.get_source(file.path)
            try:
                fingerprint = _fingerprint(file.path)
            except OSError:
                self.catalog.record_issue(
                    file, "", "ERROR", settings.property_profile_name, "",
                    "Não foi possível ler o arquivo."
                )
                events.append(SyncEvent(file.relative_path, "ERROR", "ERROR"))
                continue
            try:
                profile, profile_signature = self._profile_for(file, settings)
            except NeedsConfigurationError as error:
                self.catalog.record_issue(
                    file, fingerprint, "NEEDS_CONFIGURATION",
                    settings.property_profile_name, "", str(error),
                )
                events.append(SyncEvent(
                    file.relative_path, "NEEDS_CONFIGURATION", "NEEDS_CONFIGURATION"
                ))
                continue
            if (
                previous and previous.fingerprint == fingerprint
                and previous.profile_signature == profile_signature
                and previous.status == "OK"
            ):
                self.catalog.mark_unchanged(str(file.path))
                events.append(SyncEvent(file.relative_path, "UNCHANGED", "OK"))
                continue
            action = "NEW" if previous is None else "MODIFIED"
            try:
                parsed = self.parser.parse(file.path, file.relative_path, profile)
                if _fingerprint(file.path) != fingerprint:
                    raise OSError("Arquivo modificado durante a leitura.")
                self.catalog.replace_source(file, fingerprint, parsed, profile_signature)
                events.append(SyncEvent(file.relative_path, action, "OK"))
            except NeedsConfigurationError as error:
                self.catalog.record_issue(
                    file, fingerprint, "NEEDS_CONFIGURATION", profile.name,
                    profile_signature, str(error)
                )
                events.append(SyncEvent(file.relative_path, "NEEDS_CONFIGURATION",
                                        "NEEDS_CONFIGURATION"))
            except Exception as error:
                self.catalog.record_issue(
                    file, fingerprint, "ERROR", profile.name, profile_signature,
                    f"Não foi possível processar o arquivo ({type(error).__name__}).",
                )
                events.append(SyncEvent(file.relative_path, "ERROR", "ERROR"))
        for old in self.catalog.list_sources():
            if old.path not in seen and old.status != "REMOVED":
                self.catalog.mark_removed(old.path)
                events.append(SyncEvent(old.relative_path, "REMOVED", "REMOVED"))
        return SyncReport(tuple(events), self.catalog.stats())
