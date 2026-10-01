"""Literal catalogue membership and migration, using fictional source data."""

import sqlite3
from hashlib import sha256

import pytest
from PySide6.QtWidgets import QApplication

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.owner_identity import normalized_owner_document
from amazon_agro.integrations.workbook_inspector import NeedsConfigurationError
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.property_search_service import PropertySearchService
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.privacy import mask_document
from amazon_agro.ui.property_selection import PropertiesPage, PropertyDetailsDialog
from test_property_workbooks import catalog_sync, make_book, parse, record


def four_owners(path):
    return make_book(path, [
        {"Fazenda": "Fazenda Alfa" if i == 0 else None,
         "Matrículas": "MAT-A" if i == 0 else None,
         "Proprietário": f"Pessoa Exemplo {i}", "CPF/CNPJ": f"00000000{i:03d}"}
        for i in range(4)
    ], merges=(("Fazenda", 1, 4), ("Matrículas", 1, 4)))


def test_single_owner_is_normalized_without_changing_legacy_display(tmp_path):
    farm = parse(make_book(tmp_path / "single.xlsx", [record()])).properties[0]
    assert farm.owners_normalized and farm.owner_count == 1
    owner = farm.owners[0]
    assert isinstance(owner.document, str) and owner.document == "000.000.000-00"
    assert farm.owner_name == owner.name
    assert farm.parcels[0].owner_ids == (owner.id,)
    assert farm.parcels[0].owner_links[0].parcel_id == farm.parcels[0].external_id


def test_four_owners_on_one_parcel_round_trip(tmp_path):
    four_owners(tmp_path / "four.xlsx")
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        assert sync.synchronize(settings).events[0].status == "OK"
        farm = catalog.search("")[0]
        assert len(farm.parcels) == 1 and farm.owner_count == 4
        assert farm.owner_name == farm.owner_document == ""
        assert catalog.connection.execute("SELECT count(*) FROM parcel_owners").fetchone()[0] == 4
        assert catalog.connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert catalog.connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        catalog.close()


def test_document_reuses_owner_across_parcels_and_files(tmp_path):
    first = make_book(tmp_path / "a.xlsx", [record(), record(registration="MAT-2")])
    make_book(tmp_path / "b.xlsx", [record(name="Fazenda Beta", **{"CPF/CNPJ": "00000000000"})])
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        sync.synchronize(settings)
        farms = catalog.search("")
        assert len(farms) == 2
        assert len({o.id for f in farms for o in f.owners}) == 1
        assert catalog.connection.execute("SELECT count(*) FROM property_owners").fetchone()[0] == 1
        assert catalog.connection.execute("SELECT count(*) FROM parcel_owners").fetchone()[0] == 3
        # Replacing one source removes only its links; the other source keeps its owner.
        make_book(first, [record(**{"Proprietário": None, "CPF/CNPJ": None})])
        sync.synchronize(settings)
        assert catalog.connection.execute("SELECT count(*) FROM property_owners").fetchone()[0] == 1
        assert catalog.connection.execute("SELECT count(*) FROM parcel_owners").fetchone()[0] == 1
    finally:
        catalog.close()


def test_same_owners_shared_by_two_merged_parcels(tmp_path):
    path = make_book(tmp_path / "shared.xlsx", [
        {"Fazenda": "Fazenda Alfa", "Matrículas": "MAT-1", "Proprietário": "Pessoa Alfa", "CPF/CNPJ": "00000000001"},
        {"Proprietário": "Pessoa Beta", "CPF/CNPJ": "00000000002"},
        {"Matrículas": "MAT-2", "Proprietário": "Pessoa Alfa", "CPF/CNPJ": "00000000001"},
        {"Proprietário": "Pessoa Beta", "CPF/CNPJ": "00000000002"},
    ], merges=(("Fazenda", 1, 4), ("Matrículas", 1, 2), ("Matrículas", 3, 4)))
    farm = parse(path).properties[0]
    assert farm.owner_count == 2
    assert farm.parcels[0].owner_ids == farm.parcels[1].owner_ids
    assert sum(len(p.owner_links) for p in farm.parcels) == 4


def test_parcel_owners_do_not_leak_to_siblings(tmp_path):
    path = make_book(tmp_path / "different.xlsx", [
        record(**{"Proprietário": "Pessoa Alfa", "CPF/CNPJ": "00000000001"}),
        record(registration="MAT-2", **{"Proprietário": "Pessoa Beta", "CPF/CNPJ": "00000000002"}),
        record(registration="MAT-3", **{"Proprietário": None, "CPF/CNPJ": None}),
    ])
    farm = parse(path).properties[0]
    assert farm.owner_count == 2
    assert set(farm.parcels[0].owner_ids).isdisjoint(farm.parcels[1].owner_ids)
    assert farm.parcels[2].owner_ids == ()


def test_same_name_different_documents_are_distinct(tmp_path):
    path = make_book(tmp_path / "names.xlsx", [
        record(**{"CPF/CNPJ": "00000000001"}),
        record(registration="MAT-2", **{"CPF/CNPJ": "00000000002"}),
    ])
    farm = parse(path).properties[0]
    assert farm.owner_count == 2
    assert farm.owners[0].name == farm.owners[1].name


@pytest.mark.parametrize("document", ["", "não informado", "DOC-1"])
def test_equal_names_without_normalizable_document_are_not_merged(tmp_path, document):
    path = make_book(tmp_path / "no-key.xlsx", [
        record(**{"CPF/CNPJ": document}),
        record(registration="MAT-2", **{"CPF/CNPJ": document}),
    ])
    farm = parse(path).properties[0]
    assert farm.owner_count == 2
    assert farm.owner_name == farm.owner_document == ""


def test_documentless_merged_source_cell_is_one_explicit_occurrence(tmp_path):
    path = make_book(tmp_path / "merged-owner.xlsx", [
        record(**{"CPF/CNPJ": None}),
        record(registration="MAT-2", **{"Proprietário": None, "CPF/CNPJ": None}),
    ], merges=(("Proprietário", 1, 2),))
    farm = parse(path).properties[0]
    assert farm.owner_count == 1
    assert farm.parcels[0].owner_ids == farm.parcels[1].owner_ids


def test_repeated_document_keeps_literal_name_variants_on_one_link(tmp_path):
    path = make_book(tmp_path / "variants.xlsx", [
        {"Fazenda": "Fazenda Alfa", "Matrículas": "MAT-1", "Proprietário": "Pessoa Exemplo", "CPF/CNPJ": "000.000.000-01"},
        {"Proprietário": "Pessoa Exemplo Completo", "CPF/CNPJ": "00000000001"},
    ], merges=(("Fazenda", 1, 2), ("Matrículas", 1, 2)))
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        sync.synchronize(settings)
        farm = catalog.search("")[0]
        assert farm.owner_count == len(farm.parcels[0].owner_links) == 1
        link = farm.parcels[0].owner_links[0]
        assert set(link.source_names) == {"Pessoa Exemplo", "Pessoa Exemplo Completo"}
        assert set(link.source_documents) == {"000.000.000-01", "00000000001"}
        assert len(catalog.search("Completo")) == 1
    finally:
        catalog.close()


@pytest.mark.parametrize("query", ["Pessoa Exemplo 3", "00000000003", "000.000.000-03", "Pessoa"])
def test_search_service_finds_any_owner_once(tmp_path, query):
    four_owners(tmp_path / "search.xlsx")
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        sync.synchronize(settings)
        matches = PropertySearchService(catalog).search(query)
        assert len(matches) == 1 and matches[0].owner_count == 4
    finally:
        catalog.close()


def test_owner_ui_shows_all_members_and_masks_documents(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    four_owners(tmp_path / "ui.xlsx")
    catalog, sync, settings = catalog_sync(tmp_path)
    proposals = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    page = dialog = None
    try:
        sync.synchronize(settings)
        page = PropertiesPage(ProposalService(proposals, catalog), settings)
        assert page.results.rowCount() == 1
        assert page.results.item(0, 2).text() == "4 proprietários"
        farm = catalog.search("")[0]
        dialog = PropertyDetailsDialog(farm)
        text = dialog.table.item(0, 4).text()
        for index in range(4):
            document = f"00000000{index:03d}"
            assert f"Pessoa Exemplo {index}" in text
            assert document not in text and mask_document(document) in text
        assert dialog.table.rowCount() == 1 and dialog.table.columnCount() == 5
        assert dialog.selected_parcels() == farm.parcels
        assert dialog.table.rowHeight(0) >= 4 * dialog.table.fontMetrics().height()
    finally:
        if dialog:
            dialog.close()
        if page:
            page.close()
        proposals.engine.dispose()
        catalog.close()
        app.quit()


def legacy_catalog(path, source_path, *, property_id="legacy-farm", parcel_id="legacy-parcel"):
    connection = sqlite3.connect(path)
    connection.executescript("""
        CREATE TABLE source_files (
            path TEXT PRIMARY KEY, relative_path TEXT NOT NULL, name TEXT NOT NULL,
            size INTEGER NOT NULL, fingerprint TEXT NOT NULL, modified_at TEXT NOT NULL,
            synchronized_at TEXT NOT NULL, status TEXT NOT NULL, profile TEXT NOT NULL,
            profile_signature TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE rural_properties (
            external_id TEXT PRIMARY KEY, source_path TEXT NOT NULL REFERENCES source_files(path),
            active INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, municipality TEXT NOT NULL,
            state TEXT NOT NULL, owner_name TEXT NOT NULL, owner_document TEXT NOT NULL,
            ccir TEXT NOT NULL, itr TEXT NOT NULL, car TEXT NOT NULL, source_file TEXT NOT NULL,
            source_profile TEXT NOT NULL, extra_fields TEXT NOT NULL
        );
        CREATE TABLE property_parcels (
            external_id TEXT PRIMARY KEY,
            property_external_id TEXT NOT NULL REFERENCES rural_properties(external_id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL, registration TEXT NOT NULL, previous_registration TEXT NOT NULL,
            area TEXT, lot_description TEXT NOT NULL, extra_fields TEXT NOT NULL
        );
        CREATE TABLE property_local_enrichment (
            property_id TEXT PRIMARY KEY, municipality TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL
        );
    """)
    connection.execute("INSERT INTO source_files VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
        str(source_path), source_path.name, source_path.name, 1, "old", "2026-01-01", "2026-01-01",
        "OK", "BASA Ambiental", "old-profile", "",
    ))
    connection.execute("INSERT INTO rural_properties VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
        property_id, str(source_path), 1, "Fazenda Exemplo", "", "", "Pessoa Exemplo", "000.000.000-00",
        "", "", "", source_path.name, "BASA Ambiental", "{}",
    ))
    connection.execute("INSERT INTO property_parcels VALUES (?,?,?,?,?,?,?,?)", (
        parcel_id, property_id, 0, "MAT-1", "ANT-1", "10.5", "Lote A", "{}",
    ))
    connection.execute("INSERT INTO property_local_enrichment VALUES (?,?,?,?)", (
        property_id, "Cidade Exemplo", "TO", "2026-01-01",
    ))
    connection.commit()
    connection.close()


def test_existing_schema_migrates_without_inventing_parcel_membership(tmp_path):
    path = tmp_path / "catalog.sqlite3"
    legacy_catalog(path, tmp_path / "offline.xlsx")
    proposals = tmp_path / "proposals.sqlite3"
    proposals.write_bytes(b"unrelated proposal database")
    before = sha256(proposals.read_bytes()).digest()
    for attempt in range(2):
        catalog = SQLitePropertyCatalogRepository(path)
        try:
            farm = catalog.search("00000000000")[0]
            assert farm.external_id == "legacy-farm"
            assert not farm.owners_normalized and farm.owner_name == "Pessoa Exemplo"
            assert farm.parcels[0].owner_links == []
            assert farm.municipality == "Cidade Exemplo" and farm.state == "TO"
            assert catalog.connection.execute("SELECT count(*) FROM catalog_schema_migrations").fetchone()[0] == 1
            assert catalog.connection.execute("SELECT count(*) FROM property_owners").fetchone()[0] == 0
            expected = "" if attempt == 0 else "kept-on-reopen"
            assert catalog.list_sources()[0].profile_signature == expected
            catalog.connection.execute("UPDATE source_files SET profile_signature='kept-on-reopen'")
            catalog.connection.commit()
            assert catalog.connection.execute("PRAGMA foreign_key_check").fetchall() == []
        finally:
            catalog.close()
    assert sha256(proposals.read_bytes()).digest() == before


def test_migrated_catalog_reloads_owners_and_keeps_property_enrichment(tmp_path):
    source = make_book(tmp_path / "farm.xlsx", [record()])
    expected = parse(source).properties[0]
    db_path = tmp_path / "catalog.sqlite3"
    legacy_catalog(db_path, source, property_id=expected.external_id, parcel_id=expected.parcels[0].external_id)
    catalog = SQLitePropertyCatalogRepository(db_path)
    try:
        report = PropertyCatalogSyncService(catalog).synchronize(AppSettings(property_source_directory=str(tmp_path)))
        assert report.events[0].action == "MODIFIED" and report.events[0].status == "OK"
        farm = catalog.get_by_external_id(expected.external_id)
        assert farm.owner_count == len(farm.parcels[0].owner_links) == 1
        assert farm.owners_normalized
        assert farm.municipality == "Cidade Exemplo" and farm.state == "TO"
        assert farm.parcels[0].external_id == expected.parcels[0].external_id
    finally:
        catalog.close()


def test_foreign_keys_and_unique_relationship_reject_orphans_and_duplicates(tmp_path):
    four_owners(tmp_path / "constraints.xlsx")
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        sync.synchronize(settings)
        farm = catalog.search("")[0]
        link = farm.parcels[0].owner_links[0]
        for parcel_id, owner_id in (("missing", link.owner_id), (link.parcel_id, "missing"),
                                   (link.parcel_id, link.owner_id)):
            with pytest.raises(sqlite3.IntegrityError), catalog.connection:
                catalog.connection.execute("INSERT INTO parcel_owners VALUES (?,?,?,?,?)", (
                    parcel_id, owner_id, 0, "[]", "[]",
                ))
    finally:
        catalog.close()


def test_ambiguous_owner_document_continuation_still_blocks(tmp_path):
    path = make_book(tmp_path / "ambiguous-owner.xlsx", [
        {"Fazenda": "Fazenda Alfa", "Matrículas": "MAT-1", "Proprietário": "Pessoa Exemplo", "CPF/CNPJ": "00000000001"},
        {"CPF/CNPJ": "00000000002"}, {},
    ], merges=(("Fazenda", 1, 3), ("Matrículas", 1, 3), ("Proprietário", 1, 3)))
    with pytest.raises(NeedsConfigurationError, match="associação ambígua"):
        parse(path)


@pytest.mark.parametrize("value,expected", [
    ("000.000.000-01", "00000000001"), ("00.000.000/0000-01", "00000000000001"),
    ("CPF: 00000000001", ""), ("0000000000", ""), ("", ""),
])
def test_document_normalization_is_conservative(value, expected):
    assert normalized_owner_document(value) == expected


def test_workbook_summary_never_selects_owner_from_only_one_of_its_farms(tmp_path):
    path = make_book(tmp_path / "mixed.xlsx", [
        record(name="Fazenda Alfa", **{"CPF/CNPJ": "00000000001"}),
        record(name="Fazenda Beta", registration="MAT-2", **{"CPF/CNPJ": "00000000002"}),
        record(name="Fazenda Beta", registration="MAT-3", **{"CPF/CNPJ": "00000000003"}),
    ])
    parsed = parse(path)
    assert len(parsed.owners) == 3
    assert parsed.owner_name == parsed.owner_document == ""


def test_failed_owner_replace_rolls_back_catalog_and_links(tmp_path):
    from amazon_agro.domain.models import ParcelOwner

    path = four_owners(tmp_path / "atomic.xlsx")
    catalog, sync, settings = catalog_sync(tmp_path)
    try:
        sync.synchronize(settings)
        original = catalog.search("")[0]
        broken = parse(path)
        broken.properties[0].parcels[0].owner_links.append(ParcelOwner("missing", "missing"))
        discovered = sync.discovery.discover(tmp_path, ["*.xlsx"])[0]
        with pytest.raises(ValueError, match="Referência de proprietário"):
            catalog.replace_source(discovered, "changed", broken, "changed")
        assert catalog.search("")[0] == original
        assert catalog.get_source(path).fingerprint != "changed"
        assert catalog.connection.execute("SELECT count(*) FROM parcel_owners").fetchone()[0] == 4
    finally:
        catalog.close()
