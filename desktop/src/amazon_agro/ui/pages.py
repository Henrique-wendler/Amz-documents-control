from __future__ import annotations

from decimal import Decimal

from PySide6.QtCore import QDate, QLocale, Qt, Signal
from PySide6.QtWidgets import (
    QComboBox, QDateEdit, QDoubleSpinBox, QFormLayout, QGridLayout,
    QFrame, QGroupBox, QHBoxLayout, QLabel, QLineEdit, QPlainTextEdit, QPushButton,
    QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)

from amazon_agro.config.settings import AppSettings
from amazon_agro.ui.currency_input import CurrencyInput
from amazon_agro.domain.models import (
    PARTICIPANT_LABELS, Participant, ParticipantType, Proposal, financing_percentage, new_id,
)
from amazon_agro.exporters.formatting import format_brl, format_percentage_fixed
from amazon_agro.ui.boolean_choice import BooleanChoice, ConditionalFields


class OperationPage(QWidget):
    changed = Signal()
    LABELS = {
        "banco": "Banco", "numero_proposta": "Nº da proposta",
        "agencia": "Agência", "proponente": "Proponente",
        "cpf_cnpj": "CPF / CNPJ", "porte": "Porte",
        "responsavel": "Responsável", "tecnico": "Técnico",
        "gerente_banco": "Gerente do banco", "finalidade": "Finalidade",
        "atividade": "Atividade", "fonte": "Fonte",
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
            ("Operação", ("finalidade", "atividade", "fonte")),
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
            "tecnico": settings.technicians,
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
        kind.addItem("Selecione o tipo", None)
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


def _money_spin() -> CurrencyInput:
    return CurrencyInput()


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
        "valor_total": "Valor Total",
        "valor_fno": "Valor FNO",
        "valor_of": "Valor OF",
    }
    FLAGS = {
        "astec_fno_financiada": "ASTEC FNO financiada?",
        "astec_of_financiada": "ASTEC OF financiada?",
    }

    def __init__(self) -> None:
        super().__init__()
        self.spins: dict[str, QDoubleSpinBox | CurrencyInput] = {
            name: _money_spin() for name in self.MONEY
        }
        self.financing_shares: dict[str, QLabel] = {}
        self.flags: dict[str, BooleanChoice] = {}
        self.astec_fields: dict[str, ConditionalFields] = {}
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 14, 18, 18)
        layout.setSpacing(14)
        title = QLabel("Proposta")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        description = self._card(layout, "Descrição e Valor Total")
        self.description = QPlainTextEdit()
        self.description.setPlaceholderText("Animais, culturas, equipamentos ou outras informações")
        self.description.setFixedHeight(68)
        self.description.textChanged.connect(self.changed)
        description.addWidget(self.description)
        self._money_field(description, "valor_total")

        for source in ("fno", "of"):
            card = self._card(layout, source.upper())
            self._money_field(card, f"valor_{source}")
            self._add_astec_fields(card, source)
            if source == "fno":
                self._add_abc_fields(card)

        own = self._card(layout, "Recursos próprios")
        self.own_resources_choice = BooleanChoice("Possui recursos próprios?")
        self.own_resources_yes = self.own_resources_choice.yes
        self.own_resources_no = self.own_resources_choice.no
        self._choice_row(own, "Possui recursos próprios?", self.own_resources_choice)
        self.own_resources_fields = ConditionalFields()
        fields = QHBoxLayout(self.own_resources_fields)
        fields.setContentsMargins(0, 4, 0, 0)
        fields.addWidget(QLabel("Percentual recursos próprios"))
        percent = _percent_spin()
        percent.setAccessibleName("Percentual recursos próprios")
        self.spins["percentual_recursos_proprios"] = percent
        fields.addWidget(percent)
        fields.addStretch()
        own.addWidget(self.own_resources_fields)
        self.own_resources_choice.changed.connect(self._own_resources_toggled)
        percent.valueChanged.connect(self.changed)
        for name in self.MONEY:
            self.spins[name].valueChanged.connect(self._update_calculations)
            self.spins[name].valueChanged.connect(self.changed)
        layout.addStretch()
        self._own_resources_toggled()
        self._abc_toggled()
        self._update_calculations()

    def _money_field(self, layout: QVBoxLayout, name: str) -> None:
        label = self.MONEY[name]
        layout.addWidget(QLabel(label))
        spin = self.spins[name]
        spin.setObjectName("moneyInput")
        spin.setAccessibleName(label)
        spin.setMaximumWidth(16777215)
        layout.addWidget(spin)
        if name != "valor_total":
            share = QLabel()
            share.setObjectName("calculatedValue")
            share.setWordWrap(True)
            share.setAccessibleName(f"Participação {name.removeprefix('valor_').upper()} calculada automaticamente")
            self.financing_shares[name] = share
            layout.addWidget(share)

    def _add_astec_fields(self, layout: QVBoxLayout, source: str) -> None:
        flag = f"astec_{source}_financiada"
        choice = BooleanChoice(self.FLAGS[flag])
        self.flags[flag] = choice
        self._choice_row(layout, self.FLAGS[flag], choice)
        wrapper = ConditionalFields()
        self.astec_fields[flag] = wrapper
        fields = QHBoxLayout(wrapper)
        fields.setContentsMargins(0, 4, 0, 0)
        label = f"Percentual ASTEC {source.upper()}"
        fields.addWidget(QLabel(label))
        percent = _percent_spin()
        percent.setAccessibleName(label)
        self.spins[f"astec_{source}_percentual"] = percent
        fields.addWidget(percent)
        fields.addStretch()
        layout.addWidget(wrapper)
        choice.changed.connect(lambda enabled: wrapper.setExpanded(enabled))
        choice.changed.connect(lambda _value: self.changed.emit())
        percent.valueChanged.connect(self.changed)
        wrapper.setExpanded(choice.value())

    def _add_abc_fields(self, layout: QVBoxLayout) -> None:
        self.abc_choice = BooleanChoice("Laudo ABC financiado?")
        self.abc_group = self.abc_choice.group
        self.abc_yes, self.abc_no = self.abc_choice.yes, self.abc_choice.no
        self._choice_row(layout, "Laudo ABC financiado?", self.abc_choice)
        self.abc_fields = ConditionalFields()
        fields = QGridLayout(self.abc_fields)
        fields.setContentsMargins(0, 4, 0, 4)
        fields.setHorizontalSpacing(16)
        fields.addWidget(QLabel("Percentual Laudo ABC"), 0, 0)
        fields.addWidget(QLabel("Valor Laudo ABC"), 0, 1)
        abc_percent = _percent_spin()
        abc_percent.setAccessibleName("Percentual Laudo ABC")
        self.spins["laudo_abc_percentual"] = abc_percent
        fields.addWidget(abc_percent, 1, 0)
        self.abc_amount = QLabel()
        self.abc_amount.setObjectName("calculatedValue")
        self.abc_amount.setAccessibleName("Valor Laudo ABC calculado automaticamente sobre FNO")
        self.abc_amount.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        fields.addWidget(self.abc_amount, 1, 1)
        note = QLabel("Calculado automaticamente sobre o Valor FNO.")
        note.setObjectName("mutedText")
        note.setWordWrap(True)
        fields.addWidget(note, 2, 0, 1, 2)
        fields.setColumnStretch(0, 1)
        fields.setColumnStretch(1, 1)
        layout.addWidget(self.abc_fields)
        self.abc_choice.changed.connect(self._abc_toggled)
        abc_percent.valueChanged.connect(self._update_calculations)
        abc_percent.valueChanged.connect(self.changed)

    @staticmethod
    def _card(layout: QVBoxLayout, heading: str) -> QVBoxLayout:
        card = QFrame()
        card.setObjectName("formCard")
        content = QVBoxLayout(card)
        content.setContentsMargins(18, 14, 18, 16)
        content.setSpacing(10)
        title = QLabel(heading)
        title.setObjectName("cardTitle")
        content.addWidget(title)
        layout.addWidget(card)
        return content

    @staticmethod
    def _choice_row(layout: QVBoxLayout, label: str, choice: BooleanChoice) -> None:
        row = QHBoxLayout()
        text = QLabel(label)
        text.setWordWrap(True)
        row.addWidget(text, 1)
        row.addWidget(choice)
        layout.addLayout(row)

    def _update_calculations(self, *_args) -> None:
        total = self.spins["valor_total"].value()
        for name, label in self.financing_shares.items():
            percent = financing_percentage(self.spins[name].value(), total)
            label.setText(f"Participação {'FNO' if name == 'valor_fno' else 'OF'}: {format_percentage_fixed(percent)}")
        if hasattr(self, "abc_amount"):
            draft = Proposal(valor_fno=self.spins["valor_fno"].value(), laudo_abc_financiado=True,
                             laudo_abc_percentual=Decimal(str(self.spins["laudo_abc_percentual"].value())))
            self.abc_amount.setText(format_brl(draft.calculated_abc_amount))

    def _abc_toggled(self, *_args) -> None:
        self.abc_fields.setExpanded(self.abc_yes.isChecked())
        self._update_calculations()
        self.changed.emit()

    def _own_resources_toggled(self, *_args) -> None:
        self.own_resources_fields.setExpanded(self.own_resources_yes.isChecked())
        self.changed.emit()

    def read_into(self, proposal: Proposal) -> None:
        proposal.descricao = self.description.toPlainText().strip()
        for name in self.MONEY:
            setattr(proposal, name, self.spins[name].value())
        proposal.possui_recursos_proprios = self.own_resources_choice.value()
        proposal.percentual_recursos_proprios = (Decimal(str(self.spins["percentual_recursos_proprios"].value()))
                                                if proposal.has_own_resources else Decimal("0"))
        for name, choice in self.flags.items():
            setattr(proposal, name, choice.value())
            percent_name = name.replace("financiada", "percentual")
            previous = getattr(proposal, percent_name)
            if choice.value() or previous is None or (
                isinstance(previous, Decimal) and previous.is_finite() and 0 <= previous <= 100
            ):
                setattr(proposal, percent_name, Decimal(str(self.spins[percent_name].value())))
            # Retain out-of-range inactive legacy data without exporting it.
        proposal.laudo_abc_financiado = self.abc_yes.isChecked()
        proposal.laudo_abc_percentual = (Decimal(str(self.spins["laudo_abc_percentual"].value()))
                                        if proposal.laudo_abc_financiado else None)
        proposal.laudo_abc_valor = proposal.calculated_abc_amount

    def load(self, proposal: Proposal) -> None:
        self.description.setPlainText(proposal.descricao)
        for name, spin in self.spins.items():
            value = getattr(proposal, name)
            spin.setValue((value if isinstance(spin, CurrencyInput) else float(value)) if value is not None else 0)
        for name, choice in self.flags.items():
            choice.setValue(getattr(proposal, name))
            self.astec_fields[name].setExpanded(choice.value())
        self.own_resources_choice.setValue(proposal.has_own_resources)
        self.abc_choice.setValue(proposal.laudo_abc_financiado)
        self._own_resources_toggled()
        self._abc_toggled()
