"""Amazon Agro desktop palette, lightweight cards and accessible field states."""

STYLESHEET = """
QWidget {
    color: #263b31; background-color: #f4f6f7;
    font-family: 'Segoe UI'; font-size: 13px;
}
QMainWindow, QDialog, QWizard, QWizardPage { background-color: #f4f6f7; }
QWidget#settingsPage { background-color: #ffffff; }
QLabel { background: transparent; }
QFrame#appHeader { background: #ffffff; border: 1px solid #e2e8e4; border-radius: 10px; }
QLabel#brand { font-size: 19px; font-weight: 700; color: #20563b; }
QLabel#pageTitle { font-size: 22px; font-weight: 700; color: #20563b; margin: 2px 0 6px; }
QLabel#cardTitle { font-size: 15px; font-weight: 600; color: #20563b; margin-bottom: 3px; }
QLabel#sectionTitle { font-size: 11px; font-weight: 700; color: #617369; }
QLabel#mutedText { color: #738178; font-size: 11px; }
QLabel#badge, QLabel#summaryStatus {
    background: #fff3de; color: #895414; padding: 8px 12px;
    border-radius: 7px; font-weight: 600;
}
QLabel#badge[ready="true"], QLabel#summaryStatus[ready="true"] { background: #e8f3ec; color: #20563b; }
QLabel#badge[blocked="true"], QLabel#summaryStatus[blocked="true"] { background: #fcebea; color: #a1332a; }
QLabel#summaryPending { color: #87602b; padding: 3px 2px; font-size: 12px; }
QLabel#summaryPending[blocked="true"], QLabel#validationMessage[blocked="true"] { color: #a1332a; }
QLabel#validationMessage { color: #87602b; padding: 8px; }
QFrame#summaryCard, QFrame#formCard {
    background: #ffffff; border: 1px solid #e2e8e4; border-radius: 9px;
}
QWidget#fieldContainer, QWidget#conditionalFields, QWidget#summaryHighlights { background: transparent; }
QLabel#summaryAmount { font-size: 24px; font-weight: 700; color: #20563b; }
QLabel#calculatedValue {
    color: #20563b; background: #edf5f0; border: 1px solid #e0ece4;
    padding: 8px 10px; border-radius: 6px; font-weight: 600;
}
QGroupBox {
    background: #ffffff; border: 1px solid #e2e8e4; border-radius: 9px;
    margin-top: 19px; padding: 14px 16px 12px; font-weight: 600;
}
QGroupBox::title { subcontrol-origin: margin; left: 16px; padding: 0 5px; color: #20563b; }
QPushButton {
    background: #ffffff; color: #344c3e; border: 1px solid #d5dfd8;
    border-radius: 6px; padding: 8px 13px; min-height: 20px;
}
QPushButton:hover { background: #f0f5f1; border-color: #9ebaa7; }
QPushButton:pressed { background: #e3eee6; }
QPushButton#primary { background: #286244; color: white; border-color: #286244; font-weight: 600; }
QPushButton#primary:hover { background: #205238; }
QPushButton:disabled { color: #829088; background: #f0f3f1; border-color: #e1e7e3; }
QLineEdit, QComboBox, QDateEdit, QDoubleSpinBox, QPlainTextEdit, QTableWidget {
    background: #ffffff; color: #263b31;
    border: 1px solid #cddad1; border-radius: 6px; padding: 7px;
}
QLineEdit, QComboBox, QDateEdit, QDoubleSpinBox { min-height: 20px; }
QLineEdit#moneyInput { font-size: 16px; font-weight: 600; padding: 9px 11px; }
QLineEdit:focus, QComboBox:focus, QDateEdit:focus, QDoubleSpinBox:focus,
QPlainTextEdit:focus, QPushButton:focus, QRadioButton:focus { border: 2px solid #38825a; }
QLineEdit[documentIncomplete="true"] { border: 1px solid #c58a36; }
QWidget#booleanChoice { background: #f3f6f4; border: 1px solid #d8e3dc; border-radius: 6px; }
QWidget#booleanChoice QRadioButton {
    background: transparent; color: #64776c; border: 1px solid transparent;
    border-radius: 5px; padding: 7px 12px; min-height: 20px;
}
QWidget#booleanChoice QRadioButton:checked { background: #e5f0e9; color: #20563b; border-color: #b6d0bf; font-weight: 600; }
QWidget#booleanChoice QRadioButton:hover { background: #edf3ef; }
QWidget#booleanChoice QRadioButton:focus { border: 2px solid #38825a; }
QWidget#booleanChoice QRadioButton::indicator { width: 0px; height: 0px; }
QListWidget#proposalSteps { background: #ffffff; border: 1px solid #e2e8e4; border-radius: 9px; outline: 0; }
QListWidget#proposalSteps::item { padding: 14px 12px; border-bottom: 1px solid #f1f4f2; }
QListWidget#proposalSteps::item:selected { background: #eaf3ed; color: #20563b; border-left: 3px solid #38825a; }
QListWidget#proposalSteps::item:hover { background: #f4f8f5; }
QScrollArea, QScrollArea QWidget#qt_scrollarea_viewport { border: none; background: #f4f6f7; }
QScrollBar:vertical { background: #edf1ee; width: 9px; margin: 0; }
QScrollBar::handle:vertical { background: #c5d2c9; border-radius: 4px; min-height: 26px; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QTabWidget::pane { background: #ffffff; border: 1px solid #e2e8e4; border-radius: 6px; }
QTabBar::tab { background: #edf3ef; color: #345440; border: 1px solid #e2e8e4; border-bottom: none; padding: 9px 18px; }
QTabBar::tab:selected { background: #ffffff; color: #20563b; font-weight: 700; }
QSplitter::handle { background: transparent; width: 8px; }
QStatusBar { background: #f4f6f7; color: #738178; font-size: 12px; }
"""
