"""Optional local setup; changes are committed only on Finish."""
import logging
from copy import deepcopy
from dataclasses import fields
from pathlib import Path

from PySide6.QtWidgets import (
    QFileDialog, QFormLayout, QHBoxLayout, QLabel, QLineEdit, QMessageBox,
    QPushButton, QVBoxLayout, QWizard, QWizardPage,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.exporters.pdf_backends import PdfBackendSelector

logger = logging.getLogger(__name__)


class FolderField(QLineEdit):
    def browse(self) -> None:
        selected = QFileDialog.getExistingDirectory(self, "Escolher pasta", self.text())
        if selected:
            self.setText(selected)


def folder_row(field: FolderField) -> QHBoxLayout:
    row = QHBoxLayout()
    row.addWidget(field)
    button = QPushButton("Procurar")
    button.clicked.connect(field.browse)
    row.addWidget(button)
    return row


class FirstRunWizard(QWizard):
    def __init__(self, settings: AppSettings, parent=None, selector=None) -> None:
        super().__init__(parent)
        self.settings = settings
        self.selector = selector or PdfBackendSelector()
        self.setWindowTitle("Amazon Agro — Configuração inicial")
        self.resize(680, 470)
        self.setWizardStyle(QWizard.WizardStyle.ModernStyle)
        self.setButtonText(QWizard.WizardButton.BackButton, "Voltar")
        self.setButtonText(QWizard.WizardButton.NextButton, "Próximo")
        self.setButtonText(QWizard.WizardButton.CancelButton, "Configurar depois")
        self.setButtonText(QWizard.WizardButton.FinishButton, "Criar primeira proposta")
        welcome = self._page("Amazon Agro", "Gerador de Propostas")
        welcome.layout().addWidget(self._text(
            "Utilize este aplicativo para preencher propostas de financiamento e gerar arquivos Excel e PDF.\n\n"
            "Os dados de imóveis podem ser consultados nas planilhas compartilhadas sincronizadas pelo Google Drive for Desktop."
        ))
        welcome.setButtonText(QWizard.WizardButton.NextButton, "Começar configuração")
        drive = self._page("Pasta das planilhas de imóveis", "Selecione a pasta sincronizada pelo Google Drive for Desktop que contém as planilhas BASA.")
        self.source = FolderField(settings.property_source_directory)
        self.source.setAccessibleName("Pasta das planilhas de imóveis")
        drive.layout().addLayout(folder_row(self.source))
        skip = QPushButton("Pular por enquanto")
        skip.clicked.connect(self._skip_source)
        drive.layout().addWidget(skip)
        output = self._page("Pasta das propostas", "Escolha onde os documentos deverão ser salvos por padrão. Você poderá alterar depois.")
        self.output = FolderField(str(settings.output_dir()))
        self.output.setAccessibleName("Pasta padrão das propostas")
        output.layout().addLayout(folder_row(self.output))
        pdf = self._page("Geração de PDF", "Detecção automática dos conversores deste computador")
        self.pdf_status = self._text("")
        pdf.layout().addWidget(self.pdf_status)
        pdf.layout().addWidget(self._text("A geração de Excel (XLSX) funciona independentemente do conversor de PDF."))
        defaults = self._page("Padrões", "Estes valores serão usados nas novas propostas.")
        form = QFormLayout()
        self.city = QLineEdit(settings.default_city)
        self.technician = QLineEdit(settings.default_technician)
        form.addRow("Cidade padrão", self.city)
        form.addRow("Técnico padrão", self.technician)
        defaults.layout().addLayout(form)
        finish = self._page("Configuração concluída", "Tudo pronto para começar sua proposta.")
        finish.layout().addWidget(self._text("As preferências serão salvas neste computador ao finalizar."))
        self.currentIdChanged.connect(self._page_changed)

    @staticmethod
    def _text(value: str) -> QLabel:
        label = QLabel(value)
        label.setWordWrap(True)
        return label

    def _page(self, title: str, subtitle: str) -> QWizardPage:
        page = QWizardPage()
        page.setTitle(title)
        page.setSubTitle(subtitle)
        QVBoxLayout(page)
        self.addPage(page)
        return page

    def _skip_source(self) -> None:
        self.source.clear()
        self.next()

    def _page_changed(self, index: int) -> None:
        if index == 3:
            available = {backend.name for backend in self.selector.available_backends()}
            self.pdf_status.setText("\n\n".join([
                f"Microsoft Excel: {'✓ Encontrado' if 'Excel COM' in available else '✗ Não encontrado'}",
                f"LibreOffice: {'✓ Encontrado' if 'LibreOffice' in available else '✗ Não encontrado'}",
                "PDF disponível" if available else "PDF indisponível",
            ]))

    def validateCurrentPage(self) -> bool:
        if self.currentId() == 1 and self.source.text().strip():
            if not Path(self.source.text().strip()).expanduser().is_dir():
                QMessageBox.warning(self, "Pasta de imóveis", "Selecione uma pasta existente ou use Pular por enquanto.")
                return False
        if self.currentId() == 2 and not self.output.text().strip():
            QMessageBox.warning(self, "Pasta das propostas", "Informe a pasta de saída.")
            return False
        return True

    def accept(self) -> None:
        candidate = deepcopy(self.settings)
        candidate.property_source_directory = self.source.text().strip()
        candidate.default_output_dir = self.output.text().strip()
        candidate.default_city = self.city.text().strip()
        candidate.default_technician = self.technician.text().strip()
        candidate.first_run_completed = True
        try:
            candidate.output_dir().mkdir(parents=True, exist_ok=True)
            candidate.save()
        except Exception:
            logger.exception("Falha ao salvar configuração inicial")
            QMessageBox.warning(self, "Configuração não salva", "Não foi possível criar a pasta ou salvar as preferências. Confira as permissões e tente novamente.")
            return
        for field in fields(candidate):
            setattr(self.settings, field.name, getattr(candidate, field.name))
        super().accept()
