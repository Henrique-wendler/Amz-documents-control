from __future__ import annotations

from hashlib import sha256

import pytest
from PySide6.QtWidgets import QApplication, QDialog, QMessageBox

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal, ProposalProperty, PropertyClassification
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.property_selection import (
    PropertiesPage, PropertyDetailsDialog, PropertyLocalEnrichmentDialog,
)
from amazon_agro.ui.property_sources import PropertySourcesPage
from test_property_workbooks import make_book, record


def _catalog(tmp_path):
    source = make_book(tmp_path / "source.xlsx", [
        record(**{"Município": None}),
    ])
    before = sha256(source.read_bytes()).digest()
    catalog = SQLitePropertyCatalogRepository(tmp_path / "catalog.sqlite3")
    settings = AppSettings(property_source_directory=str(tmp_path))
    PropertyCatalogSyncService(catalog).synchronize(settings)
    return source, before, catalog, settings


def test_local_enrichment_persists_searches_and_preserves_source(tmp_path):
    source, _, catalog, settings = _catalog(tmp_path)
    farm = catalog.search("")[0]
    assert farm.municipality == ""
    assert farm.state == ""
    with pytest.raises(ValueError):
        catalog.save_local_enrichment(farm.external_id, "", "TO")
    with pytest.raises(ValueError):
        catalog.save_local_enrichment("missing", "Palmas", "TO")
    saved = catalog.save_local_enrichment(farm.external_id, "Palmas", "TO")
    assert saved.property_id == farm.external_id
    assert catalog.get_local_enrichment(farm.external_id).updated_at == saved.updated_at
    assert catalog.search("Palmas")[0].external_id == farm.external_id
    assert catalog.search("TO")[0].external_id == farm.external_id
    catalog.close()
    reopened = SQLitePropertyCatalogRepository(tmp_path / "catalog.sqlite3")
    farm = reopened.get_by_external_id(farm.external_id)
    assert (farm.municipality, farm.state) == ("Palmas", "TO")
    make_book(source, [record(**{"Município": None, "Área (ha)": 12.5})])
    updated_source_hash = sha256(source.read_bytes()).digest()
    PropertyCatalogSyncService(reopened).synchronize(settings)
    assert reopened.search("Palmas")[0].external_id == farm.external_id
    assert str(reopened.get_by_external_id(farm.external_id).total_area) == "12.5"
    assert sha256(source.read_bytes()).digest() == updated_source_hash
    reopened.close()


def test_enrichment_edit_does_not_change_saved_snapshot(tmp_path):
    source, before, catalog, _ = _catalog(tmp_path)
    farm = catalog.search("")[0]
    catalog.save_local_enrichment(farm.external_id, "Palmas", "TO")
    farm = catalog.get_by_external_id(farm.external_id)
    proposals = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    service = ProposalService(proposals, catalog)
    proposal = Proposal()
    proposal.properties = [ProposalProperty(
        proposal_id=proposal.id, property_external_id=farm.external_id,
        classificacao=PropertyClassification.CLASS_1,
        property_name_snapshot=farm.name, municipality_snapshot=farm.municipality,
        state_snapshot=farm.state,
    )]
    # A saved snapshot is independent of subsequent catalogue edits.
    proposals.save(proposal)
    catalog.save_local_enrichment(farm.external_id, "Araguaína", "TO")
    historical = proposals.get(proposal.id).properties[0]
    assert (historical.municipality_snapshot, historical.state_snapshot) == ("Palmas", "TO")
    assert catalog.get_by_external_id(farm.external_id).municipality == "Araguaína"
    assert not catalog.search("Palmas")
    assert catalog.search("Araguaína")
    assert sha256(source.read_bytes()).digest() == before
    proposals.engine.dispose()
    catalog.close()


def test_unavailable_directory_keeps_last_valid_catalog(tmp_path):
    source, before, catalog, settings = _catalog(tmp_path)
    property_id = catalog.search("")[0].external_id
    settings.property_source_directory = str(tmp_path / "disconnected")
    with pytest.raises(FileNotFoundError):
        PropertyCatalogSyncService(catalog).synchronize(settings)
    assert catalog.search("")[0].external_id == property_id
    assert sha256(source.read_bytes()).digest() == before
    catalog.close()


def test_unavailable_folder_selection_is_saved_without_losing_catalog(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    _, _, catalog, settings = _catalog(tmp_path)
    config = tmp_path / "config.json"
    settings.save(config)
    page = PropertySourcesPage(settings, catalog, PropertyCatalogSyncService(catalog))
    page.directory.setText(str(tmp_path / "disconnected"))
    monkeypatch.setattr(QMessageBox, "warning", lambda *args: None)
    page.update_catalog()
    assert AppSettings.load(config).property_source_directory == str(tmp_path / "disconnected")
    assert catalog.search("")
    page.close()
    catalog.close()
    app.quit()


def test_ui_requires_missing_information_and_reuses_it(tmp_path, monkeypatch):
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    source, before, catalog, settings = _catalog(tmp_path)
    proposals = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    page = PropertiesPage(ProposalService(proposals, catalog), settings)
    page.results.setCurrentCell(0, 0)
    monkeypatch.setattr(PropertyDetailsDialog, "exec", lambda self: QDialog.DialogCode.Accepted)
    calls = []
    def complete(self):
        calls.append(self.property_item.external_id)
        self.municipality.setText("Palmas")
        self.state.setCurrentIndex(self.state.findData("TO"))
        return QDialog.DialogCode.Accepted
    monkeypatch.setattr(PropertyLocalEnrichmentDialog, "exec", complete)
    page.add_selected()
    assert len(calls) == 1
    assert page.selected.item(0, 1).text() == "Palmas/TO"
    page.selected.setCurrentCell(0, 0)
    page.remove_selected()
    page.search()
    page.results.setCurrentCell(0, 0)
    page.add_selected()
    assert len(calls) == 1
    assert sha256(source.read_bytes()).digest() == before
    page.close()
    proposals.engine.dispose()
    catalog.close()
    app.quit()
