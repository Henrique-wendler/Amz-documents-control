"""Shared desktop palette, cards, and keyboard focus treatment."""

STYLESHEET = """
QWidget {
    color: #25372d; background-color: #f4f6f3;
    font-family: 'Segoe UI'; font-size: 13px;
}
QMainWindow, QDialog, QWizard, QWizardPage { background-color: #f4f6f3; }
QWidget#settingsPage { background-color: #ffffff; }
QLabel { background: transparent; }
QLabel#brand { font-size: 20px; font-weight: 700; color: #20563b; }
QLabel#pageTitle { font-size: 19px; font-weight: 700; color: #20563b; margin: 2px 0 6px; }
QLabel#sectionTitle { font-size: 11px; font-weight: 700; color: #38664b; }
QLabel#badge {
    background: #fff1da; color: #744512; padding: 7px 11px;
    border-radius: 6px; font-weight: 600;
}
QLabel#badge[ready="true"] { background: #e3efe5; color: #20563b; }
QLabel#summaryStatus {
    background: #fff1da; color: #744512; padding: 9px;
    border-radius: 5px; font-weight: 600;
}
QLabel#summaryStatus[ready="true"] { background: #e3efe5; color: #20563b; }
QLabel#summaryPending { color: #6a461c; padding: 3px 2px; }
QFrame#summaryCard {
    background: #ffffff; border: 1px solid #d9e2da; border-radius: 7px;
}
QFrame#summaryCard QLabel { background: transparent; }
QGroupBox {
    background: #ffffff; border: 1px solid #d9e2da; border-radius: 7px;
    margin-top: 17px; padding: 11px 12px 9px; font-weight: 600;
}
QGroupBox::title { subcontrol-origin: margin; left: 12px; padding: 0 5px; color: #20563b; }
QPushButton {
    background: #edf2ed; color: #25372d; border: 1px solid #bdcbbf;
    border-radius: 5px; padding: 7px 11px; min-height: 18px;
}
QPushButton:hover { background: #dde9df; }
QPushButton#primary { background: #ab4d16; color: white; border-color: #ab4d16; }
QPushButton#primary:hover { background: #8d3d10; }
QPushButton:disabled { color: #69756c; background: #e5e9e5; }
QLineEdit, QComboBox, QDateEdit, QDoubleSpinBox, QPlainTextEdit, QTableWidget {
    background: #ffffff; color: #25372d;
    border: 1px solid #bccabf; border-radius: 4px; padding: 5px;
}
QWidget:focus { border: 2px solid #34784e; }
QLineEdit[documentIncomplete="true"] { border: 2px solid #a35b13; }
QListWidget#proposalSteps { background: #eaf0e9; border: none; border-radius: 6px; }
QListWidget#proposalSteps::item { padding: 9px 7px; }
QListWidget#proposalSteps::item:selected { background: #285f3e; color: white; border-radius: 4px; }
QScrollArea, QScrollArea QWidget#qt_scrollarea_viewport { border: none; background: #f4f6f3; }
QTabWidget::pane { background: #ffffff; border: 1px solid #d9e2da; border-radius: 6px; }
QTabBar::tab {
    background: #e9efea; color: #345440; border: 1px solid #d9e2da;
    border-bottom: none; padding: 9px 18px;
}
QTabBar::tab:selected { background: #ffffff; color: #20563b; font-weight: 700; }
QSplitter::handle { background: #d4ded4; width: 5px; }
"""
