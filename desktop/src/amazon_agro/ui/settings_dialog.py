from copy import deepcopy
import logging

from PySide6.QtWidgets import (
    QDialog, QFormLayout, QLabel, QLineEdit, QMessageBox, QPushButton,
    QScrollArea, QTabWidget, QVBoxLayout, QWidget,
)
from PySide6.QtCore import Qt

from amazon_agro.ui.onboarding import FirstRunWizard, FolderField, folder_row
from amazon_agro.ui.property_sources import PropertySourcesPage


class SettingsDialog(QDialog):
    def __init__(self, settings, catalog, sync, parent=None) -> None:
        super().__init__(parent)
        self.settings = settings
        self.catalog = catalog
        self.setWindowTitle("Configurações")
        self.resize(850, 620)
        layout = QVBoxLayout(self)
        tabs = QTabWidget()
        general = QWidget()
        general.setObjectName("settingsPage")
        general_layout = QVBoxLayout(general)
        form = QFormLayout()
        form.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
        self.output = FolderField(str(settings.output_dir()))
        self.city = QLineEdit(settings.default_city)
        self.technician = QLineEdit(settings.default_technician)
        form.addRow("Pasta padrão das propostas", folder_row(self.output))
        form.addRow("Cidade padrão", self.city)
        form.addRow("Técnico padrão", self.technician)
        save = QPushButton("Salvar preferências")
        save.clicked.connect(self.save)
        form.addRow(save)
        self.feedback = QLabel()
        self.feedback.setWordWrap(True)
        form.addRow(self.feedback)
        self.repeat = QPushButton("Executar configuração inicial novamente")
        self.repeat.clicked.connect(self.run_wizard)
        form.addRow(self.repeat)
        general_layout.addLayout(form)
        general_layout.addStretch()
        tabs.addTab(general, "Geral")
        self.sources = PropertySourcesPage(settings, catalog, sync)
        self.sources.setObjectName("settingsPage")
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setWidget(self.sources)
        tabs.addTab(scroll, "Imóveis")
        layout.addWidget(tabs)
        close = QPushButton("Fechar")
        close.clicked.connect(self.accept)
        layout.addWidget(close)

    def save(self) -> None:
        candidate = deepcopy(self.settings)
        candidate.default_output_dir = self.output.text().strip()
        candidate.default_city = self.city.text().strip()
        candidate.default_technician = self.technician.text().strip()
        try:
            candidate.output_dir().mkdir(parents=True, exist_ok=True)
            candidate.save()
        except Exception:
            logging.getLogger(__name__).exception("Falha ao salvar preferências")
            QMessageBox.warning(self, "Preferências", "Não foi possível salvar. Confira a pasta e suas permissões.")
            return
        for name in ("default_output_dir", "default_city", "default_technician", "_source_path"):
            setattr(self.settings, name, getattr(candidate, name))
        self.feedback.setText("Preferências salvas. Os padrões serão usados nas novas propostas.")

    def run_wizard(self) -> None:
        wizard = FirstRunWizard(self.settings, self)
        wizard.setButtonText(wizard.WizardButton.FinishButton, "Salvar configuração")
        if wizard.exec() == QDialog.DialogCode.Accepted:
            self.output.setText(str(self.settings.output_dir()))
            self.city.setText(self.settings.default_city)
            self.technician.setText(self.settings.default_technician)
            self.sources.directory.setText(self.settings.property_source_directory)
            self.catalog.search_enabled = self.settings.source_directory() is not None
            self.sources.refresh()
