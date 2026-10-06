from __future__ import annotations

from decimal import Decimal

from PySide6.QtCore import QDate, QLocale, Qt, Signal
from PySide6.QtWidgets import (
    QComboBox, QDateEdit, QDoubleSpinBox, QFormLayout, QGridLayout,
    QGroupBox, QHBoxLayout, QLabel, QLineEdit, QPlainTextEdit, QPushButton,
    QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import (
    PARTICIPANT_LABELS, Participant, ParticipantType, Proposal, new_id,
)


class OperationPage(QWidget):
    changed = Signal()
    LABELS = {
        "banco": "Banco", "numero_proposta": "Nº da proposta",
        "agencia": "Agência", "proponente": "Proponente",
        "cpf_cnpj": "CPF / CNPJ", "porte": "Porte",
        "responsavel": "Responsável", "tecnico": "Técnico",
        "gerente_banco": "Gerente do banco", "finalidade": "Finalidade",
        "atividade": "Atividade", "fonte": "Fonte",
        "status": "Status / Etapa / Banco", "aguardando": "Aguardando",
        "cidade": "Cidade", "data_proposta": "Data da proposta",
    }

    def __init__(self, settings: AppSettings) -> None:
        super().__init__()
        self.controls: dict[str, QWidget] = {}
        layout = QVBoxLayout(self)
        title = QLabel("Operação")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        groups = (
            ("Dados bancários", ("banco", "agencia", "gerente_banco")),
            ("Dados do proponente", ("proponente", "cpf_cnpj", "porte")),
            ("Responsáveis", ("responsavel", "tecnico")),
            ("Operação", ("finalidade", "atividade", "fonte", "status", "aguardando")),
            ("Documento", ("numero_proposta", "cidade", "data_proposta")),
        )
        forms = {}
        for title, names in groups:
            group = QGroupBox(title)
            form = QFormLayout(group)
            form.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.AllNonFixedFieldsGrow)
            form.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
            for name in names:
                forms[name] = form
            layout.addWidget(group)
        configured = {
            "banco": settings.banks, "agencia": settings.agencies,
            "tecnico": settings.technicians, "status": settings.statuses,
            "aguardando": settings.awaiting_options,
        }
        for index, (name, label) in enumerate(self.LABELS.items()):
            if name == "data_proposta":
                control: QWidget = QDateEdit()
                control.setCalendarPopup(True)
                control.setDisplayFormat("dd/MM/yyyy")
                control.setLocale(QLocale("pt_BR"))
                control.dateChanged.connect(self.changed)
            elif name in configured:
                choice = QComboBox()
                choice.setEditable(True)
                choice.addItem("")
                choice.addItems(configured[name])
                control = choice
                choice.currentTextChanged.connect(self.changed)
            else:
                control = QLineEdit()
                control.textChanged.connect(self.changed)
            self.controls[name] = control
            control.setAccessibleName(label)
            control.setMaximumWidth(460 if name in ("proponente", "finalidade", "banco") else 300)
            forms[name].addRow(label, control)
        document = self.controls["cpf_cnpj"]
        document.setPlaceholderText("CPF ou CNPJ")
        document.textChanged.connect(self._document_feedback)
        # Group order is also keyboard order, independent of the domain field order.
        controls = [self.controls[name] for _, names in groups for name in names]
        for previous, following in zip(controls, controls[1:]):
            QWidget.setTabOrder(previous, following)
        layout.addStretch()

    def _document_feedback(self, text: str) -> None:
        control = self.controls["cpf_cnpj"]
        digits = "".join(c for c in text if c.isdigit())
        incomplete = bool(text) and len(digits) not in (11, 14)
        control.setProperty("documentIncomplete", incomplete)
        control.setToolTip("Confira o formato: CPF com 11 ou CNPJ com 14 dígitos." if incomplete else "")
        control.style().unpolish(control)
        control.style().polish(control)

    def read_into(self, proposal: Proposal) -> None:
        for name, control in self.controls.items():
            if isinstance(control, QDateEdit):
                value = control.date().toPython()
            elif isinstance(control, QComboBox):
                value = control.currentText().strip()
            else:
                value = control.text().strip()
            setattr(proposal, name, value)

    def load(self, proposal: Proposal) -> None:
        for name, control in self.controls.items():
            value = getattr(proposal, name)
            if isinstance(control, QDateEdit):
                control.setDate(QDate(value.year, value.month, value.day))
            elif isinstance(control, QComboBox):
                control.setCurrentText(str(value))
            else:
                control.setText(str(value))


class ParticipantsPage(QWidget):
    changed = Signal()
    def __init__(self) -> None:
        super().__init__()
        layout = QVBoxLayout(self)
        title = QLabel("Participantes")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Nome", "CPF / CNPJ", "Tipo"])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setColumnWidth(0, 290)
        self.table.setColumnWidth(1, 160)
        self.table.itemChanged.connect(self.changed)
        layout.addWidget(self.table)
        actions = QHBoxLayout()
        for label, callback in (
            ("Adicionar participante", self.add_participant),
            ("Editar", self.edit_selected),
            ("Remover", self.remove_selected),
        ):
            button = QPushButton(label)
            button.clicked.connect(lambda _checked=False, action=callback: action())
            actions.addWidget(button)
        actions.addStretch()
        layout.addLayout(actions)

    def add_participant(self, participant: Participant | None = None) -> None:
        row = self.table.rowCount()
        self.table.insertRow(row)
        name = QTableWidgetItem(participant.nome if participant else "")
        name.setData(Qt.ItemDataRole.UserRole, participant.id if participant else new_id())
        self.table.setItem(row, 0, name)
        self.table.setItem(
            row, 1, QTableWidgetItem(participant.cpf_cnpj if participant else "")
        )
        kind = QComboBox()
        kind.addItem("Selecione o tipo (provisório)", None)
        for value, label in PARTICIPANT_LABELS.items():
            kind.addItem(f"{int(value)} — {label}", int(value))
        if participant:
            kind.setCurrentIndex(kind.findData(int(participant.tipo) if participant.tipo is not None else None))
        else:
            kind.setCurrentIndex(kind.findData(int(ParticipantType.MAIN_ISSUER)))
        self.table.setCellWidget(row, 2, kind)
        kind.currentIndexChanged.connect(self.changed)
        self.table.selectRow(row)
        self.changed.emit()

    def edit_selected(self) -> None:
        row = self.table.currentRow()
        if row >= 0:
            self.table.editItem(self.table.item(row, 0))

    def remove_selected(self) -> None:
        row = self.table.currentRow()
        if row >= 0:
            self.table.removeRow(row)
            self.changed.emit()

    def load(self, proposal: Proposal) -> None:
        self.table.setRowCount(0)
        for participant in proposal.participants:
            self.add_participant(participant)

    def collect(self, proposal_id: str) -> list[Participant]:
        participants: list[Participant] = []
        for row in range(self.table.rowCount()):
            name_item = self.table.item(row, 0)
            tax_item = self.table.item(row, 1)
            kind = self.table.cellWidget(row, 2)
            participants.append(Participant(
                id=name_item.data(Qt.ItemDataRole.UserRole),
                proposal_id=proposal_id,
                nome=name_item.text().strip(),
                cpf_cnpj=tax_item.text().strip(),
                tipo=ParticipantType(kind.currentData()) if kind.currentData() is not None else None,
            ))
        return participants


def _money_spin() -> QDoubleSpinBox:
    spin = QDoubleSpinBox()
    spin.setLocale(QLocale("pt_BR"))
    spin.setMaximumWidth(300)
    spin.setDecimals(2)
    spin.setRange(0, 999_999_999_999.99)
    spin.setPrefix("R$ ")
    spin.setGroupSeparatorShown(True)
    return spin


def _percent_spin() -> QDoubleSpinBox:
    spin = QDoubleSpinBox()
    spin.setLocale(QLocale("pt_BR"))
    spin.setMaximumWidth(180)
    spin.setDecimals(2)
    spin.setRange(0, 100)
    spin.setSuffix(" %")
    return spin


class ProposalPage(QWidget):
    changed = Signal()
    MONEY = {
        "recursos_proprios": "Recursos próprios",
        "valor_total": "Valor total",
        "valor_fno": "Valor FNO",
        "valor_of": "Valor OF",
    }
    PERCENT = {
        "percentual_recursos_proprios": "Percentual recursos próprios",
        "classificacao_da_percentual": "Classificação DA %",
        "astec_fno_percentual": "Percentual ASTEC FNO",
        "laudo_abc_percentual": "Percentual Laudo ABC",
        "astec_of_percentual": "Percentual ASTEC OF",
    }
    FLAGS = {
        "astec_fno_financiada": ("ASTEC FNO financiada", "astec_fno_percentual"),
        "laudo_abc_financiado": ("Laudo ABC financiado", "laudo_abc_percentual"),
        "astec_of_financiada": ("ASTEC OF financiada", "astec_of_percentual"),
    }

    def __init__(self) -> None:
        super().__init__()
        self.spins: dict[str, QDoubleSpinBox] = {}
        self.flags: dict[str, QComboBox] = {}
        layout = QVBoxLayout(self)
        title = QLabel("Proposta")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        form = QFormLayout()
        form.setRowWrapPolicy(QFormLayout.RowWrapPolicy.WrapLongRows)
        self.description = QPlainTextEdit()
        self.description.setPlaceholderText("Animais, culturas, equipamentos ou outras informações")
        self.description.setMaximumHeight(90)
        self.description.textChanged.connect(self.changed)
        form.addRow("Descrição", self.description)
        for name, label in self.MONEY.items():
            spin = _money_spin()
            self.spins[name] = spin
            spin.valueChanged.connect(self.changed)
            form.addRow(label, spin)
        for name, label in self.PERCENT.items():
            spin = _percent_spin()
            self.spins[name] = spin
            spin.valueChanged.connect(self.changed)
            form.addRow(label, spin)
        for name, (label, percent_name) in self.FLAGS.items():
            choice = QComboBox()
            choice.addItem("Não", False)
            choice.addItem("Sim", True)
            self.flags[name] = choice
            choice.currentIndexChanged.connect(self.changed)
            form.addRow(label, choice)
            choice.currentIndexChanged.connect(
                lambda _index, selector=choice, target=self.spins[percent_name]:
                target.setEnabled(bool(selector.currentData()))
            )
            self.spins[percent_name].setEnabled(False)
        layout.addLayout(form)
        layout.addStretch()

    def read_into(self, proposal: Proposal) -> None:
        proposal.descricao = self.description.toPlainText().strip()
        for name, spin in self.spins.items():
            value = Decimal(str(spin.value())).quantize(Decimal("0.01"))
            setattr(proposal, name, value)
        for name, choice in self.flags.items():
            enabled = bool(choice.currentData())
            setattr(proposal, name, enabled)
            if not enabled:
                setattr(proposal, self.FLAGS[name][1], None)

    def load(self, proposal: Proposal) -> None:
        self.description.setPlainText(proposal.descricao)
        for name, spin in self.spins.items():
            value = getattr(proposal, name)
            spin.setValue(float(value) if value is not None else 0)
        for name, choice in self.flags.items():
            choice.setCurrentIndex(choice.findData(getattr(proposal, name)))
            self.spins[self.FLAGS[name][1]].setEnabled(bool(choice.currentData()))
