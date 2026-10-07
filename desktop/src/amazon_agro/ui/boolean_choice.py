"""Shared, keyboard-accessible yes/no controls and lightweight conditional fields."""
from PySide6.QtCore import QPropertyAnimation, Signal
from PySide6.QtWidgets import (
    QButtonGroup, QGraphicsOpacityEffect, QHBoxLayout, QRadioButton, QWidget,
)


class BooleanChoice(QWidget):
    changed = Signal(bool)

    def __init__(self, label: str) -> None:
        super().__init__()
        self.setObjectName("booleanChoice")
        self.setAccessibleName(label)
        row = QHBoxLayout(self)
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(0)
        self.group = QButtonGroup(self)
        self.group.setExclusive(True)
        self.yes = QRadioButton("Sim")
        self.no = QRadioButton("Não")
        for button, value in ((self.yes, 1), (self.no, 0)):
            button.setAccessibleName(f"{label} {'Sim' if value else 'Não'}")
            button.setMinimumWidth(66)
            self.group.addButton(button, value)
            row.addWidget(button)
        self.no.setChecked(True)
        self.group.idToggled.connect(self._toggled)

    def _toggled(self, _id: int, checked: bool) -> None:
        if checked:
            self.changed.emit(self.value())

    def value(self) -> bool:
        return self.yes.isChecked()

    def setValue(self, value: bool) -> None:
        (self.yes if value else self.no).setChecked(True)


class ConditionalFields(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("conditionalFields")
        self._opacity = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity)
        self._fade = QPropertyAnimation(self._opacity, b"opacity", self)
        self._fade.setDuration(120)

    def setExpanded(self, expanded: bool) -> None:
        was_hidden = self.isHidden()
        self._fade.stop()
        self.setVisible(expanded)
        self.setEnabled(expanded)
        if expanded and was_hidden and self.window().isVisible():
            self._fade.setStartValue(0.0)
            self._fade.setEndValue(1.0)
            self._fade.start()
        else:
            self._opacity.setOpacity(1.0)
