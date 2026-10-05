"""Read-only resources, independent of the working directory and install path."""
from pathlib import Path
import sys


def resource_path(*parts: str) -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        root = Path(sys._MEIPASS) / "amazon_agro"
    else:
        root = Path(__file__).resolve().parents[1]
    return root.joinpath(*parts)
