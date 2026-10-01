"""User-facing export outcomes, without technical exception details."""
import logging
from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QComboBox, QDialog, QDialogButtonBox, QLabel, QMessageBox, QPushButton, QVBoxLayout,
)

logger = logging.getLogger(__name__)


def export_error_message(error: Exception) -> str:
    if isinstance(error, FileExistsError):
        return "Já existe uma proposta com esse nome na pasta. Escolha outra pasta ou altere o número da proposta."
    if isinstance(error, PermissionError):
        return "Sem permissão para gravar ou arquivo em uso. Feche o arquivo, confira o acesso à pasta e tente novamente."
    if isinstance(error, (FileNotFoundError, NotADirectoryError)):
        return "A pasta de destino ou o modelo da proposta não foi encontrado. Confira os caminhos nas configurações."
    if isinstance(error, OSError):
        return "Não foi possível acessar os arquivos. Confira o espaço em disco e as permissões da pasta."
    return "Não foi possível concluir a geração. Confira o modelo e, para PDF, o conversor instalado. Os detalhes técnicos foram registrados no log."


def offer_excel(parent) -> bool:
    dialog = QMessageBox(parent)
    dialog.setWindowTitle("PDF indisponível")
    dialog.setIcon(QMessageBox.Icon.Information)
    dialog.setText("Conversão para PDF não está disponível neste computador.")
    dialog.setInformativeText("Você ainda pode gerar o arquivo Excel normalmente.")
    excel = dialog.addButton("Gerar Excel", QMessageBox.ButtonRole.AcceptRole)
    dialog.addButton("Fechar", QMessageBox.ButtonRole.RejectRole)
    dialog.exec()
    return dialog.clickedButton() is excel


class ExportSuccessDialog(QDialog):
    def __init__(self, paths: list[Path], parent=None) -> None:
        super().__init__(parent)
        self.paths = [Path(path).resolve() for path in paths if Path(path).is_file()]
        if not self.paths:
            raise FileNotFoundError("Nenhum arquivo produzido foi encontrado.")
        self.setWindowTitle("Proposta gerada")
        self.resize(620, 260)
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Proposta gerada com sucesso."))
        label = QLabel("\n\n".join(
            f"{'Excel' if p.suffix.lower() == '.xlsx' else 'PDF'}:\n{p}" for p in self.paths
        ))
        label.setTextFormat(Qt.TextFormat.PlainText)
        label.setWordWrap(True)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(label)
        self.file_choice = QComboBox()
        for path in self.paths:
            self.file_choice.addItem(path.name, path)
        self.file_choice.setVisible(len(self.paths) > 1)
        self.file_choice.setAccessibleName("Arquivo para abrir")
        layout.addWidget(self.file_choice)
        buttons = QDialogButtonBox()
        self.open_file_button = QPushButton("Abrir arquivo")
        self.open_folder_button = QPushButton("Abrir pasta")
        self.open_file_button.clicked.connect(self.open_file)
        self.open_folder_button.clicked.connect(self.open_folder)
        buttons.addButton(self.open_file_button, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton(self.open_folder_button, QDialogButtonBox.ButtonRole.ActionRole)
        buttons.addButton("Fechar", QDialogButtonBox.ButtonRole.RejectRole)
        buttons.rejected.connect(self.accept)
        layout.addWidget(buttons)

    def _open(self, path: Path) -> None:
        try:
            if not path.exists() or not QDesktopServices.openUrl(QUrl.fromLocalFile(str(path))):
                raise OSError("O sistema não abriu o destino solicitado.")
        except Exception:
            logger.exception("Falha ao abrir resultado da exportação")
            QMessageBox.warning(self, "Não foi possível abrir", "Abra o caminho indicado usando o Explorador de Arquivos.")

    def open_file(self) -> None:
        self._open(self.file_choice.currentData())

    def open_folder(self) -> None:
        self._open(self.file_choice.currentData().parent)
