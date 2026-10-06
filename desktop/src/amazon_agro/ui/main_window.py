from __future__ import annotations

import logging
from copy import deepcopy
from pathlib import Path
from typing import Literal

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QApplication, QDialog, QFileDialog, QHBoxLayout, QInputDialog, QLabel,
    QListWidget, QMainWindow, QMessageBox, QPushButton, QScrollArea,
    QSplitter, QStackedWidget, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal
from amazon_agro.exporters.pdf_backends import PdfBackendUnavailableError
from amazon_agro.services.export_service import ProposalExportService
from amazon_agro.services.export_validator import ProposalExportValidator
from amazon_agro.services.property_sync_service import PropertyCatalogSyncService
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.repositories.sqlite_property_catalog import SQLitePropertyCatalogRepository
from amazon_agro.ui.export_dialogs import ExportSuccessDialog, export_error_message, offer_excel
from amazon_agro.ui.onboarding import FirstRunWizard
from amazon_agro.ui.pages import OperationPage, ParticipantsPage, ProposalPage
from amazon_agro.ui.property_selection import PropertiesPage
from amazon_agro.ui.review import ReviewPage
from amazon_agro.ui.settings_dialog import SettingsDialog
from amazon_agro.ui.summary import ProposalSummaryPanel
from amazon_agro.ui.theme import STYLESHEET

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    STEPS = ("Operação", "Participantes", "Proposta", "Imóveis", "Revisão")

    def __init__(
        self, service: ProposalService, settings: AppSettings,
        export_service: ProposalExportService, export_validator: ProposalExportValidator,
        catalog: SQLitePropertyCatalogRepository,
        sync_service: PropertyCatalogSyncService,
    ) -> None:
        super().__init__()
        self.service, self.settings = service, settings
        self.export_service, self.export_validator = export_service, export_validator
        self.catalog, self.sync_service = catalog, sync_service
        self.current = Proposal()
        self.has_proposal = False
        self._loading = False
        self._exporting = False
        self._visited: set[int] = set()
        self.setWindowTitle("Amazon Agro — Gerador de Propostas")
        self.resize(1280, 720)
        self.setStyleSheet(STYLESHEET)
        root = QWidget()
        self.setCentralWidget(root)
        outer = QVBoxLayout(root)
        outer.setContentsMargins(14, 10, 14, 10)
        outer.setSpacing(10)
        toolbar = QHBoxLayout()
        toolbar.setSpacing(9)
        brand = QLabel("Amazon Agro\nGerador de Propostas")
        brand.setObjectName("brand")
        toolbar.addWidget(brand)
        self.badge = QLabel("Bem-vindo")
        self.badge.setObjectName("badge")
        toolbar.addWidget(self.badge)
        toolbar.addStretch()
        self.header_buttons = {}
        for label, callback, shortcut in (
            ("Nova proposta", self.new_proposal, "Ctrl+N"),
            ("Abrir", self.open_proposal, "Ctrl+O"),
            ("Salvar", self.save_proposal, "Ctrl+S"),
            ("Configurações", self.open_settings, "Ctrl+,"),
        ):
            button = QPushButton(label)
            button.clicked.connect(callback)
            button.setToolTip(f"{label} ({shortcut})")
            toolbar.addWidget(button)
            self.header_buttons[label] = button
            QShortcut(QKeySequence(shortcut), self, activated=callback)
        outer.addLayout(toolbar)
        self.workspace = QStackedWidget()
        outer.addWidget(self.workspace, 1)
        landing = QWidget()
        welcome = QVBoxLayout(landing)
        welcome.addStretch()
        title = QLabel("Prepare sua proposta de financiamento")
        title.setObjectName("pageTitle")
        welcome.addWidget(title, alignment=Qt.AlignmentFlag.AlignHCenter)
        for label, callback in (("+ Criar proposta", self.new_proposal), ("Abrir proposta existente", self.open_proposal)):
            button = QPushButton(label)
            if label.startswith("+"):
                button.setObjectName("primary")
            button.clicked.connect(callback)
            button.setMaximumWidth(300)
            welcome.addWidget(button, alignment=Qt.AlignmentFlag.AlignHCenter)
        welcome.addStretch()
        self.workspace.addWidget(landing)
        editor = QWidget()
        edit_layout = QVBoxLayout(editor)
        edit_layout.setContentsMargins(0, 0, 0, 0)
        edit_layout.setSpacing(9)
        self.splitter = QSplitter(Qt.Orientation.Horizontal)
        self.steps = QListWidget()
        self.steps.setObjectName("proposalSteps")
        self.steps.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.steps.addItems(self.STEPS)
        self.steps.setMinimumWidth(155)
        self.steps.setMaximumWidth(210)
        self.splitter.addWidget(self.steps)
        self.stack = QStackedWidget()
        self.operation_page = OperationPage(settings)
        self.participants_page = ParticipantsPage()
        self.proposal_page = ProposalPage()
        self.properties_page = PropertiesPage(service, settings)
        self.review_page = ReviewPage(service, settings)
        for page in (self.operation_page, self.participants_page, self.proposal_page,
                     self.properties_page, self.review_page):
            self.stack.addWidget(self._scroll(page))
        self.stack.setMinimumWidth(440)
        self.splitter.addWidget(self.stack)
        self.summary = ProposalSummaryPanel()
        self.summary_scroll = self._scroll(self.summary)
        self.summary_scroll.setMinimumWidth(260)
        self.splitter.addWidget(self.summary_scroll)
        self.splitter.setCollapsible(0, False)
        self.splitter.setCollapsible(1, False)
        self.splitter.setCollapsible(2, True)
        self.splitter.setSizes([180, 740, 330])
        for i, stretch in enumerate((14, 59, 27)):
            self.splitter.setStretchFactor(i, stretch)
        edit_layout.addWidget(self.splitter, 1)
        navigation = QHBoxLayout()
        navigation.setSpacing(8)
        for label, delta in (("Anterior", -1), ("Próximo", 1)):
            button = QPushButton(label)
            if delta == 1:
                button.setObjectName("primary")
            button.clicked.connect(lambda _checked=False, offset=delta: self.steps.setCurrentRow(
                max(0, min(len(self.STEPS) - 1, self.steps.currentRow() + offset))))
            navigation.addWidget(button)
        navigation.addStretch()
        self.summary_toggle = QPushButton("← Recolher resumo")
        self.summary_toggle.setToolTip("Mostrar ou ocultar o resumo da proposta")
        self.summary_toggle.clicked.connect(self.toggle_summary)
        navigation.addWidget(self.summary_toggle)
        edit_layout.addLayout(navigation)
        self.workspace.addWidget(editor)
        self.refresh_timer = QTimer(self)
        self.refresh_timer.setSingleShot(True)
        self.refresh_timer.setInterval(0)
        self.refresh_timer.timeout.connect(self.refresh_summary)
        for page in (self.operation_page, self.participants_page, self.proposal_page, self.properties_page):
            page.changed.connect(self._schedule_refresh)
        self.review_page.save_button.clicked.connect(self.save_proposal)
        self.review_page.excel_button.clicked.connect(lambda: self._export("xlsx"))
        self.review_page.pdf_button.clicked.connect(lambda: self._export("pdf"))
        self.review_page.both_button.clicked.connect(lambda: self._export("both"))
        self.steps.currentRowChanged.connect(self._change_step)
        self.header_buttons["Salvar"].setEnabled(False)

    @staticmethod
    def _scroll(page: QWidget) -> QScrollArea:
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(page)
        return scroll

    def startup(self) -> None:
        if not self.settings.first_run_completed:
            if FirstRunWizard(self.settings, self).exec() == QDialog.DialogCode.Accepted:
                self.catalog.search_enabled = self.settings.source_directory() is not None
                self.new_proposal()

    def open_settings(self) -> None:
        if self._exporting:
            return
        dialog = SettingsDialog(self.settings, self.catalog, self.sync_service, self)
        dialog.sources.catalog_updated.connect(self.properties_page.search)
        dialog.exec()
        self.properties_page.search()
        self.refresh_summary()

    def toggle_summary(self) -> None:
        visible = self.summary_scroll.isVisible() and self.splitter.sizes()[2] > 0
        self.summary_scroll.setVisible(not visible)
        if not visible:
            self.splitter.setSizes([190, max(440, self.width() - 530), 300])
        self.summary_toggle.setText("Mostrar resumo →" if visible else "← Recolher resumo")

    def _collect(self) -> Proposal:
        proposal = deepcopy(self.current)
        self.operation_page.read_into(proposal)
        self.proposal_page.read_into(proposal)
        proposal.participants = self.participants_page.collect(proposal.id)
        proposal.properties = self.properties_page.collect(proposal.id, strict=False)
        return proposal

    def _schedule_refresh(self) -> None:
        if not self._loading:
            self.refresh_timer.start()

    def refresh_summary(self) -> None:
        if not self.has_proposal or self._loading:
            return
        proposal = self._collect()
        validation = self.export_validator.validate(proposal)
        self.summary.update_proposal(proposal, validation)
        self.review_page.set_validation_errors(validation.errors)
        self.badge.setText("Com pendências" if not validation.ok else "Pronta para gerar")
        self.badge.setProperty("ready", validation.ok)
        self.badge.style().unpolish(self.badge)
        self.badge.style().polish(self.badge)
        for index, name in enumerate(self.STEPS):
            if index == self.steps.currentRow():
                state = "Atual"
            elif index not in self._visited:
                state = "Não visitada"
            elif index in validation.pending_steps:
                state = "Com pendência"
            else:
                state = "Completa"
            item = self.steps.item(index)
            item.setText(f"{index + 1}. {name}\n{state}")
            item.setForeground(QColor({
                "Atual": "#20563b", "Completa": "#38664b",
                "Com pendência": "#8a4d17", "Não visitada": "#637068",
            }[state]))
        if self.steps.currentRow() == 4:
            self.review_page.load(proposal)

    def _load(self, proposal: Proposal) -> None:
        self._loading = True
        try:
            self.current = proposal
            self.has_proposal = True
            self._visited = {0}
            self.operation_page.load(proposal)
            self.participants_page.load(proposal)
            self.proposal_page.load(proposal)
            self.properties_page.load(proposal)
            self.workspace.setCurrentIndex(1)
            self.header_buttons["Salvar"].setEnabled(True)
            self.steps.setCurrentRow(0)
            self.stack.setCurrentIndex(0)
        finally:
            self._loading = False
        self.refresh_summary()

    def _change_step(self, index: int) -> None:
        if index >= 0:
            self._visited.add(index)
            self.stack.setCurrentIndex(index)
            self.refresh_summary()

    def new_proposal(self) -> None:
        if self._exporting:
            return
        self._load(self.service.new_proposal(self.settings))
        self.statusBar().showMessage("Nova proposta iniciada.", 5000)

    def open_proposal(self) -> None:
        if self._exporting:
            return
        try:
            summaries = self.service.list_recent()
            if not summaries:
                QMessageBox.information(self, "Abrir proposta", "Nenhuma proposta salva.")
                return
            options = [f"{item.numero_proposta or 'Sem número'} — {item.proponente or 'Sem proponente'} — {item.id[:8]}" for item in summaries]
            choice, accepted = QInputDialog.getItem(self, "Abrir proposta", "Selecione uma proposta:", options, 0, False)
            if accepted:
                proposal = self.service.get(summaries[options.index(choice)].id)
                if proposal is None:
                    raise ValueError("A proposta selecionada não foi encontrada.")
                self._load(proposal)
        except Exception:
            logger.exception("Falha ao abrir proposta")
            QMessageBox.critical(self, "Erro ao abrir", "Não foi possível abrir a proposta salva. Consulte o log para detalhes técnicos.")

    def save_proposal(self) -> None:
        if not self.has_proposal or self._exporting:
            return
        try:
            proposal = self._collect()
            self.service.save(proposal)
            self.current = proposal
            self.refresh_summary()
            self.statusBar().showMessage("Proposta salva localmente.", 5000)
        except ValueError as error:
            QMessageBox.warning(self, "Dados inválidos", str(error))
        except Exception:
            logger.exception("Falha ao salvar proposta")
            QMessageBox.critical(self, "Erro ao salvar", "Não foi possível salvar a proposta. Confira as permissões de armazenamento; os detalhes estão no log.")

    def _export(self, kind: Literal["xlsx", "pdf", "both"]) -> None:
        if self._exporting or not self.has_proposal:
            return
        logger.info("Ação de geração recebida; formato=%s", kind)
        try:
            proposal = self._collect()
            validation = self.export_validator.validate(proposal)
            self.review_page.set_validation_errors(validation.errors)
            if not validation.ok:
                logger.info("Geração bloqueada por %d pendências", len(validation.errors))
                QMessageBox.warning(self, "Dados para exportação", "Não foi possível gerar a proposta.\n\nCampos pendentes:\n" + "\n".join(f"• {error}" for error in validation.errors))
                return
            if kind != "xlsx":
                selector = getattr(self.export_service.pdf, "selector", None)
                if selector is not None and not selector.available_backends():
                    if offer_excel(self):
                        self._export("xlsx")
                    return
            initial_dir = self.settings.output_dir()
            while not initial_dir.is_dir() and initial_dir != initial_dir.parent:
                initial_dir = initial_dir.parent
            selected_dir = QFileDialog.getExistingDirectory(self, "Escolher pasta para a proposta", str(initial_dir))
            if not selected_dir:
                self.statusBar().showMessage("Geração cancelada: nenhuma pasta selecionada.", 8000)
                return
            self._exporting = True
            self.workspace.setEnabled(False)
            for button in self.header_buttons.values():
                button.setEnabled(False)
            QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
            self.statusBar().showMessage("Gerando proposta… Aguarde a conclusão.")
            self.service.save(proposal)
            self.current = proposal
            logger.info("Proposta salva para geração; formato=%s", kind)
            generate = {"xlsx": self.export_service.generate_excel, "pdf": self.export_service.generate_pdf, "both": self.export_service.generate_both}[kind]
            result = generate(proposal.id, Path(selected_dir))
            paths = [path for path in (result.xlsx_path, result.pdf_path) if path]
            if not paths or any(not path.is_file() or path.stat().st_size == 0 for path in paths):
                raise FileNotFoundError("O exportador não retornou arquivos válidos.")
            self.statusBar().showMessage("Proposta exportada com sucesso.", 8000)
            self._finish_export()
            self.refresh_summary()
            ExportSuccessDialog(paths, self).exec()
        except PdfBackendUnavailableError:
            logger.exception("Conversor PDF indisponível durante geração")
            self._finish_export()
            if offer_excel(self):
                self._export("xlsx")
        except Exception as error:
            logger.exception("Falha na geração pela interface; formato=%s", kind)
            self._finish_export()
            label = {"xlsx": "XLSX", "pdf": "PDF", "both": "Excel e PDF"}[kind]
            self.statusBar().showMessage("Geração não concluída.", 8000)
            QMessageBox.warning(self, "Não foi possível exportar", f"Não foi possível gerar {label}.\n\nMotivo:\n{export_error_message(error)}")
        finally:
            self._finish_export()

    def _finish_export(self) -> None:
        if self._exporting:
            QApplication.restoreOverrideCursor()
            self.workspace.setEnabled(True)
            for button in self.header_buttons.values():
                button.setEnabled(True)
            self._exporting = False

    def closeEvent(self, event) -> None:
        if self._exporting:
            self.statusBar().showMessage("Aguarde a conversão terminar antes de fechar o aplicativo.")
            event.ignore()
        else:
            super().closeEvent(event)
