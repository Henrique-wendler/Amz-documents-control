"""Farm-level search and explicit parcel selection for proposals."""

from __future__ import annotations

from copy import deepcopy

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QComboBox, QDialog, QDialogButtonBox, QHBoxLayout, QLabel, QLineEdit,
    QMessageBox, QPushButton, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import (
    BRAZILIAN_STATES, Proposal, ProposalProperty, ProposalPropertyParcel, Property, PropertyClassification,
    PropertyParcel, RuralProperty,
)
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.privacy import mask_document, short_owner_name


def _area(value: object) -> str:
    return str(value).replace(".", ",") if value is not None else "—"


def _location(municipality: str, state: str) -> str:
    return f"{municipality}/{state}" if municipality and state else municipality or "—"


def _owner_summary(property_item: RuralProperty) -> str:
    if property_item.owner_count > 1:
        return f"{property_item.owner_count} proprietários"
    if property_item.owner_count == 1:
        return short_owner_name(property_item.owners[0].name)
    return short_owner_name(property_item.owner_name) if not property_item.owners_normalized else "—"


class PropertyLocalEnrichmentDialog(QDialog):
    def __init__(self, property_item: RuralProperty, adding: bool, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.property_item = property_item
        self.setWindowTitle("Informações complementares")
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel(f"Fazenda: {property_item.name}"))
        layout.addWidget(QLabel("Município *"))
        self.municipality = QLineEdit(property_item.municipality)
        layout.addWidget(self.municipality)
        layout.addWidget(QLabel("UF *"))
        self.state = QComboBox()
        self.state.addItem("Selecione...", "")
        for state in BRAZILIAN_STATES:
            self.state.addItem(state, state)
        self.state.setCurrentIndex(max(0, self.state.findData(property_item.state)))
        layout.addWidget(self.state)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        save = QPushButton("Salvar e adicionar" if adding else "Salvar")
        save.clicked.connect(self._save)
        buttons.addButton(save, QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _save(self) -> None:
        if not self.municipality.text().strip() or not self.state.currentData():
            QMessageBox.warning(self, "Informações complementares", "Informe município e UF.")
            return
        self.accept()


class PropertyDetailsDialog(QDialog):
    def __init__(self, property_item: RuralProperty, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.property_item = property_item
        self.setWindowTitle("Detalhes da fazenda")
        self.resize(900, 460)
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel(property_item.name))
        layout.addWidget(QLabel(f"Proprietários: {_owner_summary(property_item)}"))
        if not property_item.owners_normalized and (property_item.owner_name or property_item.owner_document):
            layout.addWidget(QLabel("Dados legados da fazenda. Atualize a fonte para consultar os titulares por matrícula."))
        layout.addWidget(QLabel(
            f"Município/UF: {_location(property_item.municipality, property_item.state)}  |  "
            f"CCIR: {property_item.ccir or '—'}  |  "
            f"ITR: {property_item.itr or '—'}  |  CAR: {property_item.car or '—'}"
        ))
        self.table = QTableWidget(len(property_item.parcels), 5)
        self.table.setHorizontalHeaderLabels([
            "Matrícula", "Área (ha)", "Matrícula anterior", "Lote/Gleba", "Proprietários"
        ])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setWordWrap(True)
        for row, parcel in enumerate(property_item.parcels):
            owners = []
            for link in parcel.owner_links:
                name = " / ".join(link.source_names) or "Nome não informado"
                documents = tuple(dict.fromkeys(mask_document(value) for value in link.source_documents))
                owners.append(f"{name} — {', '.join(documents) if documents else 'documento não informado'}")
            values = (
                parcel.registration, _area(parcel.area),
                parcel.previous_registration, parcel.lot_description,
                "\n".join(owners) or "—",
            )
            for column, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
                if column == 0:
                    item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                    item.setCheckState(Qt.CheckState.Checked)
                self.table.setItem(row, column, item)
        self.table.setColumnWidth(4, 340)
        self.table.resizeRowsToContents()
        layout.addWidget(self.table)
        actions = QHBoxLayout()
        all_button = QPushButton("Selecionar todas")
        all_button.clicked.connect(lambda: self._set_all(Qt.CheckState.Checked))
        none_button = QPushButton("Limpar seleção")
        none_button.clicked.connect(lambda: self._set_all(Qt.CheckState.Unchecked))
        actions.addWidget(all_button)
        actions.addWidget(none_button)
        actions.addStretch()
        layout.addLayout(actions)
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _set_all(self, state: Qt.CheckState) -> None:
        for row in range(self.table.rowCount()):
            self.table.item(row, 0).setCheckState(state)

    def selected_parcels(self) -> list[PropertyParcel]:
        return [
            self.property_item.parcels[row]
            for row in range(self.table.rowCount())
            if self.table.item(row, 0).checkState() == Qt.CheckState.Checked
        ]


class PropertiesPage(QWidget):
    changed = Signal()
    def __init__(self, service: ProposalService, settings: AppSettings) -> None:
        super().__init__()
        self.service = service
        self.settings = settings
        layout = QVBoxLayout(self)
        title = QLabel("Imóveis")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        self.note = QLabel(
            "Pesquise o catálogo local de fazendas. Configure e atualize a pasta em "
            "Configurações > Imóveis."
        )
        self.note.setWordWrap(True)
        layout.addWidget(self.note)
        search_row = QHBoxLayout()
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText(
            "Fazenda, matrícula, proprietário, documento, CCIR, ITR, CAR, lote, município ou UF"
        )
        self.search_input.returnPressed.connect(self.search)
        search_row.addWidget(self.search_input)
        search_button = QPushButton("Pesquisar")
        search_button.clicked.connect(self.search)
        search_row.addWidget(search_button)
        layout.addLayout(search_row)
        self.results = QTableWidget(0, 6)
        self.results.setHorizontalHeaderLabels([
            "Fazenda", "Município/UF", "Proprietários", "Matrículas", "Área total (ha)", "Origem"
        ])
        self.results.horizontalHeader().setStretchLastSection(True)
        layout.addWidget(self.results)
        buttons = QHBoxLayout()
        details = QPushButton("Ver detalhes")
        details.clicked.connect(self.show_details)
        buttons.addWidget(details)
        edit = QPushButton("Editar informações locais")
        edit.clicked.connect(self.edit_local_information)
        buttons.addWidget(edit)
        add = QPushButton("Adicionar")
        add.clicked.connect(self.add_selected)
        buttons.addWidget(add)
        buttons.addStretch()
        layout.addLayout(buttons)
        layout.addWidget(QLabel("Fazendas adicionadas à proposta"))
        self.selected = QTableWidget(0, 5)
        self.selected.setHorizontalHeaderLabels([
            "Fazenda", "Município", "Matrículas selecionadas", "Origem", "Classificação"
        ])
        self.selected.horizontalHeader().setStretchLastSection(True)
        layout.addWidget(self.selected)
        remove = QPushButton("Remover selecionada")
        remove.clicked.connect(self.remove_selected)
        layout.addWidget(remove)
        self.search()

    def search(self) -> None:
        matches = self.service.search_properties(self.search_input.text())
        self.results.setRowCount(0)
        for property_item in matches:
            row = self.results.rowCount()
            self.results.insertRow(row)
            if isinstance(property_item, RuralProperty):
                origin = property_item.source_file
                if property_item.source_status != "OK":
                    origin += " (último catálogo válido; origem com aviso)"
                values = (
                    property_item.name, _location(property_item.municipality, property_item.state),
                    _owner_summary(property_item),
                    str(len(property_item.parcels)), _area(property_item.total_area),
                    origin,
                )
            else:
                values = (property_item.nome, property_item.municipio or "—", "—", "1", "—", "Demonstração")
            for column, value in enumerate(values):
                cell = QTableWidgetItem(value)
                cell.setFlags(cell.flags() & ~Qt.ItemFlag.ItemIsEditable)
                self.results.setItem(row, column, cell)
            self.results.item(row, 0).setData(
                Qt.ItemDataRole.UserRole, property_item.external_id
            )

    def _current_property(self) -> Property | RuralProperty | None:
        row = self.results.currentRow()
        if row < 0:
            return None
        external_id = self.results.item(row, 0).data(Qt.ItemDataRole.UserRole)
        return self.service.get_property(external_id)

    def show_details(self) -> None:
        property_item = self._current_property()
        if isinstance(property_item, RuralProperty):
            PropertyDetailsDialog(property_item, self).exec()

    def _complete_information(self, property_item: RuralProperty, adding: bool) -> RuralProperty | None:
        dialog = PropertyLocalEnrichmentDialog(property_item, adding, self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return None
        self.service.save_property_local_enrichment(
            property_item.external_id, dialog.municipality.text(), dialog.state.currentData()
        )
        self.search()
        return self.service.get_property(property_item.external_id)

    def edit_local_information(self) -> None:
        property_item = self._current_property()
        if isinstance(property_item, RuralProperty):
            self._complete_information(property_item, False)

    def add_selected(self) -> None:
        property_item = self._current_property()
        if property_item is None:
            return
        if isinstance(property_item, RuralProperty):
            dialog = PropertyDetailsDialog(property_item, self)
            if dialog.exec() != QDialog.DialogCode.Accepted:
                return
            parcels = dialog.selected_parcels()
            if not parcels:
                QMessageBox.warning(self, "Matrículas", "Selecione pelo menos uma matrícula.")
                return
            if not property_item.municipality or not property_item.state:
                property_item = self._complete_information(property_item, True)
                if property_item is None:
                    return
            link = ProposalProperty(
                proposal_id="", property_external_id=property_item.external_id,
                classificacao=PropertyClassification.CLASS_1,
                property_name_snapshot=property_item.name,
                municipality_snapshot=property_item.municipality,
                state_snapshot=property_item.state,
                source_file_snapshot=property_item.source_file,
                owner_name_snapshot=property_item.owner_name,
                selected_parcels=[ProposalPropertyParcel(
                    parcel_external_id=parcel.external_id,
                    registration_snapshot=parcel.registration,
                    previous_registration_snapshot=parcel.previous_registration,
                    area_snapshot=parcel.area,
                    lot_description_snapshot=parcel.lot_description,
                ) for parcel in parcels],
            )
        else:
            link = ProposalProperty(
                proposal_id="", property_external_id=property_item.external_id,
                classificacao=PropertyClassification.CLASS_1,
                property_name_snapshot=property_item.nome,
                municipality_snapshot=property_item.municipio,
                selected_parcels=[ProposalPropertyParcel(
                    parcel_external_id=f"legacy:{property_item.external_id}:{property_item.matricula}",
                    registration_snapshot=property_item.matricula,
                )] if property_item.matricula else [],
            )
        self._add_link(link)

    def _add_link(self, link: ProposalProperty) -> None:
        for row in range(self.selected.rowCount()):
            existing = self.selected.item(row, 0).data(Qt.ItemDataRole.UserRole)
            if existing.property_external_id == link.property_external_id:
                return
        row = self.selected.rowCount()
        self.selected.insertRow(row)
        values = (
            link.property_name_snapshot or link.property_external_id,
            _location(link.municipality_snapshot, link.state_snapshot),
            f"{len(link.selected_parcels)} matrícula(s)",
            link.source_file_snapshot or "Demonstração/legado",
        )
        for column, value in enumerate(values):
            item = QTableWidgetItem(value)
            item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.selected.setItem(row, column, item)
        self.selected.item(row, 0).setData(Qt.ItemDataRole.UserRole, link)
        choice = QComboBox()
        choice.addItem("Selecione...", None)
        for code, label in self.settings.property_classifications.items():
            choice.addItem(f"{code} — {label}", code)
        self.selected.setCellWidget(row, 4, choice)
        choice.currentIndexChanged.connect(self.changed)
        self.changed.emit()

    def remove_selected(self) -> None:
        row = self.selected.currentRow()
        if row >= 0:
            self.selected.removeRow(row)
            self.changed.emit()

    def load(self, proposal: Proposal) -> None:
        self.selected.setRowCount(0)
        for link in proposal.properties:
            self._add_link(link)
            choice = self.selected.cellWidget(self.selected.rowCount() - 1, 4)
            choice.setCurrentIndex(choice.findData(link.classificacao.value))

    def collect(self, proposal_id: str, *, strict: bool = True) -> list[ProposalProperty]:
        links: list[ProposalProperty] = []
        for row in range(self.selected.rowCount()):
            choice = self.selected.cellWidget(row, 4)
            code = choice.currentData()
            if code is None and strict:
                raise ValueError("Selecione a classificação de cada imóvel adicionado.")
            link = deepcopy(self.selected.item(row, 0).data(Qt.ItemDataRole.UserRole))
            link.proposal_id = proposal_id
            link.classificacao = PropertyClassification(code) if code is not None else None
            links.append(link)
        return links
