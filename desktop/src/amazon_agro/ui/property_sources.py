"""Configuration page for directory-based property workbook sources."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QCheckBox, QFileDialog, QFormLayout, QHBoxLayout, QInputDialog, QLabel, QLineEdit,
    QMessageBox, QPushButton, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.integrations.workbook_discovery import PropertyWorkbookDiscovery
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService


_STATUS = {
    "OK": "OK", "REMOVED": "Origem ausente",
    "NEEDS_CONFIGURATION": "Precisa configurar", "ERROR": "Erro",
}


class PropertySourcesPage(QWidget):
    catalog_updated = Signal()

    def __init__(
        self, settings: AppSettings, catalog: SQLitePropertyCatalogRepository,
        sync: PropertyCatalogSyncService,
    ) -> None:
        super().__init__()
        self.settings = settings
        self.catalog = catalog
        self.sync = sync
        layout = QVBoxLayout(self)
        title = QLabel("Configurações > Imóveis")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        form = QFormLayout()
        folder_row = QHBoxLayout()
        self.directory = QLineEdit(settings.property_source_directory)
        self.directory.setPlaceholderText("Pasta sincronizada pelo Google Drive for Desktop")
        folder_row.addWidget(self.directory)
        browse = QPushButton("Procurar")
        browse.clicked.connect(self.browse)
        folder_row.addWidget(browse)
        form.addRow("Pasta sincronizada pelo Google Drive for Desktop", folder_row)
        self.patterns = QLineEdit("; ".join(settings.property_file_patterns))
        form.addRow("Padrões de arquivo", self.patterns)
        self.recursive = QCheckBox("Incluir subpastas")
        self.recursive.setChecked(settings.property_recursive)
        form.addRow("Busca", self.recursive)
        self.profile = QLineEdit(settings.property_profile_name)
        form.addRow("Perfil", self.profile)
        layout.addLayout(form)
        self.found = QLabel()
        layout.addWidget(self.found)
        update = QPushButton("Atualizar catálogo")
        update.clicked.connect(self.update_catalog)
        layout.addWidget(update)
        assign = QPushButton("Atribuir perfil ao arquivo selecionado")
        assign.clicked.connect(self.assign_profile)
        layout.addWidget(assign)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Arquivo", "Perfil", "Status"])
        self.table.horizontalHeader().setStretchLastSection(True)
        layout.addWidget(self.table)
        self.summary = QLabel()
        self.summary.setWordWrap(True)
        layout.addWidget(self.summary)
        self.refresh()

    def browse(self) -> None:
        selected = QFileDialog.getExistingDirectory(
            self, "Pasta das planilhas", self.directory.text().strip()
        )
        if selected:
            self.directory.setText(selected)
            self.refresh()

    def refresh(self) -> None:
        entered = self.directory.text().strip()
        path = (
            self.settings.source_directory()
            if entered == self.settings.property_source_directory
            else Path(entered).expanduser()
        ) if entered else None
        if path is None:
            self.found.setText(
                "Nenhuma pasta configurada. A pesquisa fica desativada até atualizar uma fonte."
            )
        else:
            try:
                count = len(PropertyWorkbookDiscovery().discover(
                    path, self.settings.property_file_patterns,
                    self.settings.property_recursive, self.settings.property_excluded_files,
                ))
                self.found.setText(f"Arquivos encontrados: {count}")
            except (OSError, ValueError) as error:
                self.found.setText(str(error))
        sources = self.catalog.list_sources()
        self.table.setRowCount(len(sources))
        for row, source in enumerate(sources):
            for column, value in enumerate((
                source.relative_path, source.profile or "—", _STATUS.get(source.status, source.status)
            )):
                item = QTableWidgetItem(value)
                self.table.setItem(row, column, item)
            self.table.item(row, 2).setToolTip(source.last_error)
        stats = self.catalog.stats()
        self.summary.setText(
            f"Última sincronização: {stats.synchronized_at or '—'}\n"
            f"{stats.files} arquivo(s) • {stats.properties} fazenda(s) • "
            f"{stats.parcels} matrícula(s) • {stats.warnings} arquivo(s) com aviso"
        )

    def update_catalog(self) -> None:
        try:
            self.settings.property_source_directory = self.directory.text().strip()
            self.settings.property_file_patterns = [
                item.strip() for item in self.patterns.text().split(";") if item.strip()
            ]
            self.settings.property_recursive = self.recursive.isChecked()
            self.settings.property_profile_name = self.profile.text().strip()
            if not self.settings.property_file_patterns or not self.settings.property_profile_name:
                raise ValueError("Informe padrões de arquivo e nome do perfil.")
            # Persist the selected folder before discovery. If Drive for Desktop
            # is disconnected, the user can retry later without losing the path.
            self.settings.save()
            report = self.sync.synchronize(self.settings)
            self.catalog.search_enabled = True
            self.refresh()
            self.catalog_updated.emit()
            QMessageBox.information(
                self, "Catálogo atualizado",
                f"{len(report.events)} arquivo(s) verificados; "
                f"{report.stats.properties} fazenda(s) disponíveis."
            )
        except (OSError, ValueError) as error:
            self.refresh()
            QMessageBox.warning(self, "Fonte de imóveis", str(error))

    def assign_profile(self) -> None:
        row = self.table.currentRow()
        sources = self.catalog.list_sources()
        if row < 0 or row >= len(sources):
            QMessageBox.information(self, "Perfil", "Selecione um arquivo na tabela.")
            return
        options = list(dict.fromkeys([
            self.profile.text().strip(), *self.settings.property_profiles.keys()
        ]))
        options = [option for option in options if option]
        if not options:
            QMessageBox.warning(self, "Perfil", "Configure ao menos um perfil.")
            return
        choice, accepted = QInputDialog.getItem(
            self, "Atribuir perfil", "Perfil para este arquivo:", options, 0, False
        )
        if accepted and choice:
            self.settings.property_file_profiles[sources[row].relative_path] = choice
            self.update_catalog()
