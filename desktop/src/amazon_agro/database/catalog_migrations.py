"""Additive, transactional migrations for the local catalogue only."""

import sqlite3


def migrate_catalog(connection: sqlite3.Connection) -> bool:
    with connection:
        connection.execute("BEGIN")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS catalog_schema_migrations (
                version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
            )
        """)
        if connection.execute(
            "SELECT 1 FROM catalog_schema_migrations WHERE version=1"
        ).fetchone():
            return False
        connection.execute("""
            CREATE TABLE property_owners (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE parcel_owners (
                parcel_id TEXT NOT NULL REFERENCES property_parcels(external_id) ON DELETE CASCADE,
                owner_id TEXT NOT NULL REFERENCES property_owners(id),
                sequence INTEGER NOT NULL,
                source_names TEXT NOT NULL, source_documents TEXT NOT NULL,
                PRIMARY KEY (parcel_id, owner_id)
            )
        """)
        connection.execute("CREATE INDEX idx_parcel_owners_owner ON parcel_owners(owner_id)")
        connection.execute("""
            ALTER TABLE rural_properties
            ADD COLUMN owners_normalized INTEGER NOT NULL DEFAULT 0
        """)
        # Legacy aggregate values cannot establish membership of each parcel.
        # Preserve them for offline compatibility and request a source re-read.
        connection.execute("UPDATE source_files SET profile_signature=''")
        connection.execute("""
            INSERT INTO catalog_schema_migrations VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        """)
    return True
