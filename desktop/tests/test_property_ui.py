from __future__ import annotations

from PySide6.QtWidgets import QApplication, QDialog, QInputDialog

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.property_selection import (
    PropertyDetailsDialog, PropertyLocalEnrichmentDialog, PropertiesPage,
)
from amazon_agro.ui.property_sources import PropertySourcesPage
from test_property_workbooks import make_book, record


def test_ui_selects_farm_and_specific_registration_without_showing_document(
    tmp_path, monkeypatch,
) -> None:
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    make_book(tmp_path / "farm.xlsx", [
        record(),
        record(name=None, registration="MAT-2", **{
            "Proprietário": None, "CPF/CNPJ": None,
        }),
    ], merges=(("Fazenda", 1, 2), ("Proprietário", 1, 2), ("CPF/CNPJ", 1, 2)))
    catalog = SQLitePropertyCatalogRepository(tmp_path / "catalog.sqlite3")
    settings = AppSettings(property_source_directory=str(tmp_path))
    PropertyCatalogSyncService(catalog).synchronize(settings)
    repository = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    page = PropertiesPage(ProposalService(repository, catalog), settings)
    assert page.results.rowCount() == 1
    assert page.results.item(0, 0).text() == "Fazenda Exemplo"
    assert "000.000.000-00" not in page.results.item(0, 2).text()
    page.results.setCurrentCell(0, 0)
    monkeypatch.setattr(PropertyDetailsDialog, "exec", lambda self: QDialog.DialogCode.Accepted)
    monkeypatch.setattr(
        PropertyDetailsDialog, "selected_parcels", lambda self: self.property_item.parcels[1:2]
    )
    def complete(self):
        self.municipality.setText("Palmas")
        self.state.setCurrentIndex(self.state.findData("TO"))
        return QDialog.DialogCode.Accepted
    monkeypatch.setattr(PropertyLocalEnrichmentDialog, "exec", complete)
    page.add_selected()
    assert page.selected.rowCount() == 1
    page.selected.cellWidget(0, 4).setCurrentIndex(2)
    proposal = Proposal()
    links = page.collect(proposal.id)
    assert len(links) == 1
    assert [parcel.registration_snapshot for parcel in links[0].selected_parcels] == [
        "MAT-2"
    ]
    assert links[0].state_snapshot == "TO"
    page.close()
    repository.engine.dispose()
    catalog.close()
    app.quit()


def test_source_screen_assigns_existing_profile_to_selected_file(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    app = QApplication.instance() or QApplication([])
    make_book(tmp_path / "farm.xlsx", [record()])
    catalog = SQLitePropertyCatalogRepository(tmp_path / "catalog.sqlite3")
    settings = AppSettings(property_source_directory=str(tmp_path))
    sync = PropertyCatalogSyncService(catalog)
    sync.synchronize(settings)
    settings.property_profiles = {"Outra Família": {}}
    page = PropertySourcesPage(settings, catalog, sync)
    page.table.setCurrentCell(0, 0)
    monkeypatch.setattr(
        QInputDialog, "getItem", staticmethod(lambda *args: ("Outra Família", True))
    )
    monkeypatch.setattr(page, "update_catalog", lambda: None)
    page.assign_profile()
    assert settings.property_file_profiles == {"farm.xlsx": "Outra Família"}
    page.close()
    catalog.close()
    app.quit()
