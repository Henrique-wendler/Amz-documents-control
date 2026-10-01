"""Unified local property catalogue, independent of source workbooks."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from amazon_agro.domain.models import (
    BRAZILIAN_STATES, PropertyLocalEnrichment, PropertyParcel, RuralProperty,
)
from amazon_agro.integrations.workbook_discovery import DiscoveredWorkbook
from amazon_agro.integrations.workbook_parser import ParsedWorkbook
from amazon_agro.integrations.workbook_profile import normalized


@dataclass(frozen=True, slots=True)
class SourceFileRecord:
    path: str
    relative_path: str
    name: str
    size: int
    fingerprint: str
    modified_at: str
    synchronized_at: str
    status: str
    profile: str
    profile_signature: str
    last_error: str = ""


@dataclass(frozen=True, slots=True)
class CatalogStats:
    files: int
    properties: int
    parcels: int
    warnings: int
    synchronized_at: str


class SQLitePropertyCatalogRepository:
    def __init__(self, db_path: Path) -> None:
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.search_enabled = True
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS source_files (
                path TEXT PRIMARY KEY, relative_path TEXT NOT NULL,
                name TEXT NOT NULL, size INTEGER NOT NULL,
                fingerprint TEXT NOT NULL, modified_at TEXT NOT NULL,
                synchronized_at TEXT NOT NULL, status TEXT NOT NULL,
                profile TEXT NOT NULL, profile_signature TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS rural_properties (
                external_id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL REFERENCES source_files(path),
                active INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL, municipality TEXT NOT NULL, state TEXT NOT NULL,
                owner_name TEXT NOT NULL, owner_document TEXT NOT NULL,
                ccir TEXT NOT NULL, itr TEXT NOT NULL, car TEXT NOT NULL,
                source_file TEXT NOT NULL, source_profile TEXT NOT NULL,
                extra_fields TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rural_properties_source
                ON rural_properties(source_path, active);
            CREATE TABLE IF NOT EXISTS property_parcels (
                external_id TEXT PRIMARY KEY,
                property_external_id TEXT NOT NULL REFERENCES rural_properties(external_id)
                    ON DELETE CASCADE,
                sequence INTEGER NOT NULL,
                registration TEXT NOT NULL, previous_registration TEXT NOT NULL,
                area TEXT, lot_description TEXT NOT NULL, extra_fields TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_property_parcels_property
                ON property_parcels(property_external_id, sequence);
            CREATE TABLE IF NOT EXISTS property_local_enrichment (
                property_id TEXT PRIMARY KEY,
                municipality TEXT NOT NULL,
                state TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS property_search USING fts5(
                external_id UNINDEXED, searchable,
                tokenize='unicode61 remove_diacritics 2'
            );
        """)
        columns = {
            row[1] for row in self.connection.execute("PRAGMA table_info(source_files)")
        }
        if "profile_signature" not in columns:
            self.connection.execute(
                "ALTER TABLE source_files ADD COLUMN profile_signature TEXT NOT NULL DEFAULT ''"
            )
            self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    @staticmethod
    def _source_values(
        file: DiscoveredWorkbook, fingerprint: str, status: str,
        profile: str, profile_signature: str, error: str = "",
    ) -> tuple[object, ...]:
        return (
            str(file.path), file.relative_path, file.name, file.size, fingerprint,
            file.modified_at.isoformat(), datetime.now(timezone.utc).isoformat(),
            status, profile, profile_signature, error,
        )

    def get_source(self, path: Path | str) -> SourceFileRecord | None:
        row = self.connection.execute(
            "SELECT * FROM source_files WHERE path=?", (str(path),)
        ).fetchone()
        return SourceFileRecord(**dict(row)) if row else None

    def list_sources(self) -> list[SourceFileRecord]:
        rows = self.connection.execute(
            "SELECT * FROM source_files ORDER BY relative_path COLLATE NOCASE"
        ).fetchall()
        return [SourceFileRecord(**dict(row)) for row in rows]

    def _upsert_source(
        self, file: DiscoveredWorkbook, fingerprint: str, status: str,
        profile: str, profile_signature: str, error: str = "",
    ) -> None:
        self.connection.execute("""
            INSERT INTO source_files VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                relative_path=excluded.relative_path, name=excluded.name,
                size=excluded.size, fingerprint=excluded.fingerprint,
                modified_at=excluded.modified_at,
                synchronized_at=excluded.synchronized_at, status=excluded.status,
                profile=excluded.profile,
                profile_signature=excluded.profile_signature,
                last_error=excluded.last_error
        """, self._source_values(
            file, fingerprint, status, profile, profile_signature, error
        ))

    def replace_source(
        self, file: DiscoveredWorkbook, fingerprint: str, parsed: ParsedWorkbook,
        profile_signature: str,
    ) -> None:
        with self.connection:
            self._upsert_source(
                file, fingerprint, "OK", parsed.profile_name, profile_signature,
                "\n".join(parsed.warnings),
            )
            ids = [row[0] for row in self.connection.execute(
                "SELECT external_id FROM rural_properties WHERE source_path=?",
                (str(file.path),),
            )]
            for external_id in ids:
                self.connection.execute(
                    "DELETE FROM property_search WHERE external_id=?", (external_id,)
                )
            self.connection.execute(
                "DELETE FROM rural_properties WHERE source_path=?", (str(file.path),)
            )
            for property_item in parsed.properties:
                self.connection.execute("""
                    INSERT INTO rural_properties VALUES (
                        ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                """, (
                    property_item.external_id, str(file.path), property_item.name,
                    property_item.municipality, property_item.state,
                    property_item.owner_name, property_item.owner_document,
                    property_item.ccir, property_item.itr, property_item.car,
                    property_item.source_file, property_item.source_profile,
                    json.dumps(property_item.extra_fields, ensure_ascii=False),
                ))
                for sequence, parcel in enumerate(property_item.parcels):
                    self.connection.execute("""
                        INSERT INTO property_parcels VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        parcel.external_id, property_item.external_id, sequence,
                        parcel.registration, parcel.previous_registration,
                        str(parcel.area) if parcel.area is not None else None,
                        parcel.lot_description,
                        json.dumps(parcel.extra_fields, ensure_ascii=False),
                    ))
                self._refresh_search(property_item.external_id)

    def _refresh_search(self, external_id: str) -> None:
        row = self.connection.execute("""
            SELECT p.*, e.municipality AS local_municipality, e.state AS local_state
            FROM rural_properties AS p
            LEFT JOIN property_local_enrichment AS e ON e.property_id=p.external_id
            WHERE p.external_id=?
        """, (external_id,)).fetchone()
        if row is None:
            return
        parcels = self.connection.execute("""
            SELECT registration, previous_registration, lot_description, extra_fields
            FROM property_parcels WHERE property_external_id=?
        """, (external_id,)).fetchall()
        searchable = " ".join((
            row["name"], row["municipality"], row["state"],
            row["local_municipality"] or "", row["local_state"] or "",
            row["owner_name"], row["owner_document"], row["ccir"],
            row["itr"], row["car"], row["source_file"],
            *(" ".join((parcel["registration"], parcel["previous_registration"],
                        parcel["lot_description"],
                        *json.loads(parcel["extra_fields"]).values())) for parcel in parcels),
        ))
        self.connection.execute("DELETE FROM property_search WHERE external_id=?", (external_id,))
        self.connection.execute(
            "INSERT INTO property_search(external_id, searchable) VALUES (?, ?)",
            (external_id, searchable),
        )

    def save_local_enrichment(
        self, property_id: str, municipality: str, state: str,
    ) -> PropertyLocalEnrichment:
        municipality = " ".join(municipality.split())
        state = state.strip().upper()
        if not municipality or state not in BRAZILIAN_STATES:
            raise ValueError("Informe município e UF válidos.")
        exists = self.connection.execute(
            "SELECT 1 FROM rural_properties WHERE external_id=? AND active=1",
            (property_id,),
        ).fetchone()
        if exists is None:
            raise ValueError("Fazenda não encontrada no catálogo ativo.")
        item = PropertyLocalEnrichment(
            property_id, municipality, state, datetime.now(timezone.utc)
        )
        with self.connection:
            self.connection.execute("""
                INSERT INTO property_local_enrichment VALUES (?, ?, ?, ?)
                ON CONFLICT(property_id) DO UPDATE SET
                    municipality=excluded.municipality, state=excluded.state,
                    updated_at=excluded.updated_at
            """, (property_id, municipality, state, item.updated_at.isoformat()))
            self._refresh_search(property_id)
        return item

    def get_local_enrichment(self, property_id: str) -> PropertyLocalEnrichment | None:
        row = self.connection.execute(
            "SELECT * FROM property_local_enrichment WHERE property_id=?", (property_id,)
        ).fetchone()
        return PropertyLocalEnrichment(
            row["property_id"], row["municipality"], row["state"],
            datetime.fromisoformat(row["updated_at"]),
        ) if row else None

    def record_issue(
        self, file: DiscoveredWorkbook, fingerprint: str,
        status: str, profile: str, profile_signature: str, error: str,
    ) -> None:
        with self.connection:
            self._upsert_source(
                file, fingerprint, status, profile, profile_signature, error
            )

    def mark_removed(self, path: str) -> None:
        with self.connection:
            self.connection.execute("""
                UPDATE source_files SET status='REMOVED',
                    synchronized_at=? WHERE path=?
            """, (datetime.now(timezone.utc).isoformat(), path))
            self.connection.execute(
                "UPDATE rural_properties SET active=0 WHERE source_path=?", (path,)
            )

    def mark_unchanged(self, path: str) -> None:
        with self.connection:
            self.connection.execute(
                "UPDATE source_files SET synchronized_at=? WHERE path=?",
                (datetime.now(timezone.utc).isoformat(), path),
            )

    def get_by_external_id(self, external_id: str) -> RuralProperty | None:
        row = self.connection.execute(
            "SELECT p.*, s.status AS source_status, "
            "e.municipality AS local_municipality, e.state AS local_state "
            "FROM rural_properties AS p "
            "JOIN source_files AS s ON s.path=p.source_path "
            "LEFT JOIN property_local_enrichment AS e ON e.property_id=p.external_id "
            "WHERE p.external_id=?",
            (external_id,),
        ).fetchone()
        if row is None:
            return None
        parcels = self.connection.execute("""
            SELECT * FROM property_parcels WHERE property_external_id=?
            ORDER BY sequence
        """, (external_id,)).fetchall()
        return RuralProperty(
            external_id=row["external_id"], name=row["name"],
            municipality=row["local_municipality"] or row["municipality"],
            state=row["local_state"] or row["state"],
            owner_name=row["owner_name"], owner_document=row["owner_document"],
            ccir=row["ccir"], itr=row["itr"], car=row["car"],
            source_file=row["source_file"], source_profile=row["source_profile"],
            source_status=row["source_status"],
            extra_fields=json.loads(row["extra_fields"]),
            parcels=[PropertyParcel(
                external_id=parcel["external_id"],
                property_external_id=external_id,
                registration=parcel["registration"],
                previous_registration=parcel["previous_registration"],
                area=Decimal(parcel["area"]) if parcel["area"] is not None else None,
                lot_description=parcel["lot_description"],
                extra_fields=json.loads(parcel["extra_fields"]),
            ) for parcel in parcels],
        )

    def search(self, query: str) -> list[RuralProperty]:
        if not self.search_enabled:
            return []
        words = normalized(query).split()
        if words:
            expression = " AND ".join(f'"{word}"*' for word in words)
            rows = self.connection.execute("""
                SELECT DISTINCT p.external_id FROM property_search
                JOIN rural_properties AS p
                    ON p.external_id=property_search.external_id
                WHERE property_search MATCH ? AND p.active=1
                ORDER BY p.name COLLATE NOCASE
            """, (expression,)).fetchall()
        else:
            rows = self.connection.execute("""
                SELECT external_id FROM rural_properties WHERE active=1
                ORDER BY name COLLATE NOCASE
            """).fetchall()
        return [item for row in rows
                if (item := self.get_by_external_id(row[0])) is not None]

    def stats(self) -> CatalogStats:
        connection = self.connection
        return CatalogStats(
            files=connection.execute(
                "SELECT count(*) FROM source_files WHERE status!='REMOVED'"
            ).fetchone()[0],
            properties=connection.execute(
                "SELECT count(*) FROM rural_properties WHERE active=1"
            ).fetchone()[0],
            parcels=connection.execute("""
                SELECT count(*) FROM property_parcels AS q
                JOIN rural_properties AS p ON p.external_id=q.property_external_id
                WHERE p.active=1
            """).fetchone()[0],
            warnings=connection.execute("""
                SELECT count(*) FROM source_files
                WHERE status IN ('ERROR', 'NEEDS_CONFIGURATION')
                   OR (status='OK' AND last_error!='')
            """).fetchone()[0],
            synchronized_at=connection.execute(
                "SELECT coalesce(max(synchronized_at), '') FROM source_files"
            ).fetchone()[0],
        )
