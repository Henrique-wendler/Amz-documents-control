"""Brazilian currency editing without float conversion or spin-button surprises."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

from PySide6.QtCore import Signal
from PySide6.QtGui import QValidator
from PySide6.QtWidgets import QLineEdit

from amazon_agro.exporters.formatting import format_brl


def parse_currency(text: str) -> Decimal:
    text = text.strip().removeprefix("R$").strip()
    if not text:
        return Decimal("0.00")
    if not re.fullmatch(r"(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?", text):
        raise ValueError("Informe um valor no formato brasileiro.")
    value = Decimal(text.replace(".", "").replace(",", "."))
    if value > Decimal("999999999999.99"):
        raise ValueError("Valor monetário acima do limite.")
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class _CurrencyValidator(QValidator):
    def validate(self, text, position):
        try:
            parse_currency(text)
            state = QValidator.State.Acceptable
        except (ValueError, InvalidOperation):
            state = (QValidator.State.Intermediate if re.fullmatch(r"\s*(?:R\$\s*)?[\d.,]*\s*", text)
                     else QValidator.State.Invalid)
        return state, text, position


class CurrencyInput(QLineEdit):
    valueChanged = Signal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._value = Decimal("0.00")
        self.setMaximumWidth(300)
        self.setValidator(_CurrencyValidator(self))
        self.setText(format_brl(self._value))
        self.textEdited.connect(self._edited)

    def _edited(self, text):
        try:
            value = parse_currency(text)
        except (ValueError, InvalidOperation):
            return
        if value != self._value:
            self._value = value
            self.valueChanged.emit(value)

    def value(self) -> Decimal:
        return self._value

    def setValue(self, value):
        amount = Decimal(str(value))
        if not amount.is_finite() or not Decimal(0) <= amount <= Decimal("999999999999.99"):
            raise ValueError("Valor monetário inválido.")
        amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        changed = amount != self._value
        self._value = amount
        self.setText(format_brl(amount))
        if changed:
            self.valueChanged.emit(amount)

    def focusInEvent(self, event):
        self.setText(format_brl(self._value).removeprefix("R$ "))
        super().focusInEvent(event)
        if not self._value:
            self.selectAll()

    def mousePressEvent(self, event):
        super().mousePressEvent(event)
        if not self._value:
            self.selectAll()

    def focusOutEvent(self, event):
        self._edited(self.text())
        self.setText(format_brl(self._value))
        super().focusOutEvent(event)

    def wheelEvent(self, event):
        event.ignore()
