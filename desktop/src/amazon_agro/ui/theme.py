"""Shared desktop palette and keyboard focus treatment."""

STYLESHEET = """
QWidget { color: #25372d; font-family: 'Segoe UI'; font-size: 13px; }
QMainWindow, QDialog, QWizard { background: #f4f6f3; }
QLabel#brand { font-size: 21px; font-weight: 700; color: #20563b; }
QLabel#pageTitle { font-size: 19px; font-weight: 600; margin: 8px 0; }
QLabel#badge { background: #e5eee7; padding: 7px; border-radius: 5px; }
QGroupBox { background: #ffffff; border: 1px solid #d6dfd8;
 border-radius: 6px; margin-top: 18px; padding: 16px 12px 10px; font-weight: 600; }
QGroupBox::title { subcontrol-origin: margin; left: 12px; padding: 0 5px; }
QPushButton { background: #edf2ed; border: 1px solid #bdcbbf;
 border-radius: 5px; padding: 7px 10px; min-height: 18px; }
QPushButton:hover { background: #dde9df; }
QPushButton#primary { background: #ab4d16; color: white; border-color: #ab4d16; }
QPushButton#primary:hover { background: #8d3d10; }
QPushButton:disabled { color: #69756c; background: #e5e9e5; }
QLineEdit, QComboBox, QDateEdit, QDoubleSpinBox, QPlainTextEdit, QTableWidget {
 background: white; border: 1px solid #bccabf; border-radius: 4px; padding: 5px; }
QWidget:focus { border: 2px solid #34784e; }
QLineEdit[documentIncomplete="true"] { border: 2px solid #a35b13; }
QListWidget { background: #eaf0e9; border: none; border-radius: 5px; }
QListWidget::item { padding: 13px 6px; }
QListWidget::item:selected { background: #285f3e; color: white; }
QScrollArea { border: none; background: transparent; }
QSplitter::handle { background: #d4ded4; width: 5px; }
"""
