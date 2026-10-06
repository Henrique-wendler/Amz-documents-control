from __future__ import annotations

import logging
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import load_workbook

from amazon_agro.exporters.excel_map import PDF_PRINT_AREA
from amazon_agro.exporters.pdf_backends import (
    PdfBackendSelector, PdfBackendUnavailableError,
)


logger = logging.getLogger(__name__)


class SpreadsheetPdfProposalExporter:
    """Converts a filled workbook, using a print-ready temporary copy."""

    def __init__(self, selector: PdfBackendSelector, *, conversion_runner=None) -> None:
        self.selector = selector
        self.conversion_runner = conversion_runner

    def export(self, filled_xlsx: Path, destination: Path) -> Path:
        filled_xlsx = Path(filled_xlsx)
        destination = Path(destination)
        available = self.selector.available_backends()
        if not available:
            raise PdfBackendUnavailableError(
                "Nenhum conversor PDF encontrado. Instale Microsoft Excel com "
                "suporte COM (pywin32) ou LibreOffice."
            )
        logger.info("Iniciando PDF; pasta_origem=%s; pasta_destino=%s", filled_xlsx.parent, destination.parent)
        failures: list[str] = []
        with TemporaryDirectory(prefix="amazon-agro-pdf-") as temporary:
            print_ready = Path(temporary) / filled_xlsx.name
            shutil.copyfile(filled_xlsx, print_ready)
            workbook = load_workbook(print_ready)
            # Keep the exporter's page boundaries, including continuation areas.
            if not workbook.active.print_area:
                workbook.active.print_area = PDF_PRINT_AREA
            workbook.save(print_ready)
            for backend in available:
                logger.info("Tentando backend PDF: %s", backend.name)
                try:
                    destination.unlink(missing_ok=True)
                    if self.conversion_runner is None:
                        backend.convert(print_ready, destination)
                    else:
                        self.conversion_runner(backend, print_ready, destination)
                    if not destination.is_file() or destination.stat().st_size == 0:
                        raise RuntimeError("O conversor não produziu um PDF válido.")
                    with destination.open("rb") as stream:
                        if stream.read(4) != b"%PDF":
                            raise RuntimeError("O conversor produziu um arquivo que não é PDF.")
                    logger.info("PDF gerado com sucesso; backend=%s; pasta=%s",
                                backend.name, destination.parent)
                    return destination
                except Exception as error:
                    logger.exception("Falha no backend PDF %s", backend.name)
                    failures.append(f"{backend.name}: {error}")
                    destination.unlink(missing_ok=True)
        raise RuntimeError("Não foi possível gerar o PDF. " + " | ".join(failures))
