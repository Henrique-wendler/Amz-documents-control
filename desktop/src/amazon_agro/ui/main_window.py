from __future__ import annotations

from pathlib import Path
from typing import Literal

from PySide6.QtWidgets import (
    QFileDialog, QHBoxLayout, QInputDialog, QLabel, QListWidget, QMainWindow,
    QMessageBox, QPushButton, QScrollArea, QStackedWidget, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal
from amazon_agro.services.export_service import ProposalExportService
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.ui.pages import (
    OperationPage, ParticipantsPage, ProposalPage,
)
from amazon_agro.ui.property_selection import PropertiesPage
from amazon_agro.ui.property_sources import PropertySourcesPage
from amazon_agro.ui.review import ReviewPage


class MainWindow(QMainWindow):
    STEPS = (
        "Operação", "Participantes", "Proposta", "Imóveis", "Revisão",
        "Configurações > Imóveis",
    )

    def __init__(
        self, service: ProposalService, settings: AppSettings,
        export_service: ProposalExportService, export_validator: ProposalExportValidator,
        catalog: SQLitePropertyCatalogRepository,
        sync_service: PropertyCatalogSyncService,
    ) -> None:
        super().__init__()
        self.service = service
        self.settings = settings
        self.export_service = export_service
        self.export_validator = export_validator
        self.current = Proposal()
        self.setWindowTitle("Amazon Agro — Propostas")
        self.resize(1080, 760)
        root = QWidget()
        self.setCentralWidget(root)
        outer = QVBoxLayout(root)
        toolbar = QHBoxLayout()
        brand = QLabel("Amazon Agro  |  Propostas")
        brand.setObjectName("brand")
        toolbar.addWidget(brand)
        toolbar.addStretch()
        for label, callback in (
            ("Nova operação", self.new_proposal),
            ("Abrir", self.open_proposal),
            ("Salvar", self.save_proposal),
        ):
            button = QPushButton(label)
            button.clicked.connect(callback)
            toolbar.addWidget(button)
        outer.addLayout(toolbar)
        content = QHBoxLayout()
        self.steps = QListWidget()
        self.steps.addItems(self.STEPS)
        self.steps.setFixedWidth(190)
        content.addWidget(self.steps)
        self.stack = QStackedWidget()
        self.operation_page = OperationPage(settings)
        self.participants_page = ParticipantsPage()
        self.proposal_page = ProposalPage()
        self.properties_page = PropertiesPage(service, settings)
        self.review_page = ReviewPage(service, settings)
        self.sources_page = PropertySourcesPage(settings, catalog, sync_service)
        self.sources_page.catalog_updated.connect(self.properties_page.search)
        self.review_page.save_button.clicked.connect(self.save_proposal)
        self.review_page.excel_button.clicked.connect(lambda: self._export("xlsx"))
        self.review_page.pdf_button.clicked.connect(lambda: self._export("pdf"))
        self.review_page.both_button.clicked.connect(lambda: self._export("both"))
        for page in (
            self.operation_page, self.participants_page, self.proposal_page,
            self.properties_page, self.review_page, self.sources_page,
        ):
            scroll = QScrollArea()
            scroll.setWidgetResizable(True)
            scroll.setWidget(page)
            self.stack.addWidget(scroll)
        content.addWidget(self.stack, 1)
        outer.addLayout(content, 1)
        navigation = QHBoxLayout()
        navigation.addStretch()
        previous = QPushButton("Anterior")
        previous.clicked.connect(
            lambda: self.steps.setCurrentRow(max(0, self.steps.currentRow() - 1))
        )
        navigation.addWidget(previous)
        following = QPushButton("Próximo")
        following.clicked.connect(
            lambda: self.steps.setCurrentRow(
                min(len(self.STEPS) - 1, self.steps.currentRow() + 1)
            )
        )
        navigation.addWidget(following)
        outer.addLayout(navigation)
        self.steps.currentRowChanged.connect(self._change_step)
        self._load(Proposal(
            banco=settings.banks[0] if settings.banks else "",
            cidade=settings.default_city,
        ))
        self.steps.setCurrentRow(0)
        self.setStyleSheet("""
            QMainWindow, QWidget { background: #f8f6f0; color: #262a25; }
            QLabel#brand { font-size: 19px; font-weight: 700; color: #214c34; padding: 12px; }
            QLabel#pageTitle { font-size: 18px; font-weight: 700; color: #214c34; margin: 8px 0; }
            QPushButton { background: #f0eee7; border: 1px solid #ccc8be; border-radius: 5px;
                          padding: 7px 13px; }
            QPushButton:hover { background: #e3eadf; }
            QLineEdit, QComboBox, QDateEdit, QDoubleSpinBox, QPlainTextEdit, QTableWidget {
                background: #fff; border: 1px solid #d2cfc6; border-radius: 4px; padding: 4px;
            }
            QListWidget { background: #eef3ea; border: none; font-size: 14px; }
            QListWidget::item { padding: 13px; }
            QListWidget::item:selected { background: #2f6d44; color: white; }
        """)

    def _collect(self) -> Proposal:
        proposal = self.current
        self.operation_page.read_into(proposal)
        self.proposal_page.read_into(proposal)
        proposal.participants = self.participants_page.collect(proposal.id)
        proposal.properties = self.properties_page.collect(proposal.id)
        return proposal

    def _load(self, proposal: Proposal) -> None:
        self.current = proposal
        self.operation_page.load(proposal)
        self.participants_page.load(proposal)
        self.proposal_page.load(proposal)
        self.properties_page.load(proposal)
        self.review_page.load(proposal)
        self.review_page.set_validation_errors(
            self.export_validator.validate(proposal).errors
        )

    def _change_step(self, index: int) -> None:
        if index < 0:
            return
        if index == 4:
            try:
                proposal = self._collect()
                self.review_page.load(proposal)
                self.review_page.set_validation_errors(
                    self.export_validator.validate(proposal).errors
                )
            except ValueError as error:
                QMessageBox.warning(self, "Revisão", str(error))
                self.steps.blockSignals(True)
                self.steps.setCurrentRow(3)
                self.steps.blockSignals(False)
                self.stack.setCurrentIndex(3)
                return
        self.stack.setCurrentIndex(index)

    def new_proposal(self) -> None:
        self._load(Proposal(
            banco=self.settings.banks[0] if self.settings.banks else "",
            cidade=self.settings.default_city,
        ))
        self.steps.setCurrentRow(0)
        self.statusBar().showMessage("Nova operação iniciada.", 5000)

    def open_proposal(self) -> None:
        try:
            summaries = self.service.list_recent()
            if not summaries:
                QMessageBox.information(self, "Abrir operação", "Nenhuma operação salva.")
                return
            options = [
                f"{item.numero_proposta or 'Sem número'} — "
                f"{item.proponente or 'Sem proponente'} — {item.id[:8]}"
                for item in summaries
            ]
            choice, accepted = QInputDialog.getItem(
                self, "Abrir operação", "Selecione uma operação:", options, 0, False
            )
            if accepted:
                proposal = self.service.get(summaries[options.index(choice)].id)
                if proposal is None:
                    raise ValueError("A operação selecionada não foi encontrada.")
                self._load(proposal)
                self.steps.setCurrentRow(0)
        except (OSError, ValueError) as error:
            QMessageBox.critical(self, "Erro ao abrir", str(error))
        except Exception as error:
            QMessageBox.critical(self, "Erro de persistência", str(error))

    def save_proposal(self) -> None:
        try:
            proposal = self._collect()
            self.service.save(proposal)
            self.statusBar().showMessage("Operação salva localmente.", 5000)
            if self.steps.currentRow() == 4:
                self.review_page.load(proposal)
                self.review_page.set_validation_errors(
                    self.export_validator.validate(proposal).errors
                )
        except ValueError as error:
            QMessageBox.warning(self, "Dados inválidos", str(error))
        except Exception as error:
            QMessageBox.critical(self, "Erro ao salvar", str(error))

    def _export(self, kind: Literal["xlsx", "pdf", "both"]) -> None:
        try:
            proposal = self._collect()
            validation = self.export_validator.validate(proposal)
            self.review_page.set_validation_errors(validation.errors)
            if not validation.ok:
                QMessageBox.warning(
                    self, "Dados para exportação", "\n".join(validation.errors)
                )
                return
            initial_dir = self.settings.output_dir()
            while not initial_dir.is_dir() and initial_dir != initial_dir.parent:
                initial_dir = initial_dir.parent
            selected_dir = QFileDialog.getExistingDirectory(
                self, "Escolher pasta para a proposta", str(initial_dir)
            )
            if not selected_dir:
                return
            self.service.save(proposal)
            destination = Path(selected_dir)
            if kind == "xlsx":
                result = self.export_service.generate_excel(proposal.id, destination)
            elif kind == "pdf":
                result = self.export_service.generate_pdf(proposal.id, destination)
            else:
                result = self.export_service.generate_both(proposal.id, destination)
            paths = [path for path in (result.xlsx_path, result.pdf_path) if path]
            self.review_page.load(proposal)
            self.statusBar().showMessage("Proposta exportada com sucesso.", 5000)
            QMessageBox.information(
                self, "Proposta gerada", "\n".join(str(path) for path in paths)
            )
        except (OSError, ValueError) as error:
            QMessageBox.warning(self, "Não foi possível exportar", str(error))
        except Exception as error:
            QMessageBox.critical(self, "Falha na exportação", str(error))
