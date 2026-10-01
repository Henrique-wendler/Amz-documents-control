from pathlib import Path
from typing import Protocol

from amazon_agro.domain.models import Proposal


class ExcelProposalExporter(Protocol):
    def export(self, proposal: Proposal, destination: Path) -> Path: ...


class PdfProposalExporter(Protocol):
    def export(self, filled_xlsx: Path, destination: Path) -> Path: ...


class PdfConversionBackend(Protocol):
    name: str

    def is_available(self) -> bool: ...

    def convert(self, filled_xlsx: Path, destination: Path) -> Path: ...
