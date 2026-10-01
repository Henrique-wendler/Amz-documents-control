from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from amazon_agro.exporters.contracts import ExcelProposalExporter, PdfProposalExporter
from amazon_agro.exporters.formatting import proposal_filename_stem
from amazon_agro.repositories.contracts import ProposalRepository
from amazon_agro.services.export_validator import ProposalExportValidator


logger = logging.getLogger(__name__)
ExportKind = Literal["xlsx", "pdf", "both"]


class ExportValidationError(ValueError):
    def __init__(self, errors: tuple[str, ...]) -> None:
        self.errors = errors
        super().__init__("\n".join(errors))


@dataclass(frozen=True, slots=True)
class ExportResult:
    xlsx_path: Path | None = None
    pdf_path: Path | None = None


class ProposalExportService:
    def __init__(
        self,
        proposals: ProposalRepository,
        validator: ProposalExportValidator,
        excel: ExcelProposalExporter,
        pdf: PdfProposalExporter,
    ) -> None:
        self.proposals = proposals
        self.validator = validator
        self.excel = excel
        self.pdf = pdf

    def generate_excel(self, proposal_id: str, destination_dir: Path) -> ExportResult:
        return self._generate(proposal_id, destination_dir, "xlsx")

    def generate_pdf(self, proposal_id: str, destination_dir: Path) -> ExportResult:
        return self._generate(proposal_id, destination_dir, "pdf")

    def generate_both(self, proposal_id: str, destination_dir: Path) -> ExportResult:
        return self._generate(proposal_id, destination_dir, "both")

    def _generate(
        self, proposal_id: str, destination_dir: Path, kind: ExportKind
    ) -> ExportResult:
        proposal = self.proposals.get(proposal_id)
        if proposal is None:
            raise ValueError("Operação salva não encontrada.")
        validation = self.validator.validate(proposal)
        if not validation.ok:
            raise ExportValidationError(validation.errors)
        destination_dir = Path(destination_dir)
        if not destination_dir.is_dir():
            raise NotADirectoryError(f"Pasta de destino não encontrada: {destination_dir}")
        stem = proposal_filename_stem(
            proposal.numero_proposta, proposal.proponente
        )
        final_xlsx = destination_dir / f"{stem}.xlsx" if kind != "pdf" else None
        final_pdf = destination_dir / f"{stem}.pdf" if kind != "xlsx" else None
        for path in (final_xlsx, final_pdf):
            if path is not None and path.exists():
                raise FileExistsError(f"O arquivo já existe: {path}")
        logger.info(
            "Iniciando exportação %s; template=%s; destino=%s",
            kind, self.validator.settings.template_path(), destination_dir,
        )
        created: list[Path] = []
        try:
            with TemporaryDirectory(prefix=".amazon-agro-export-", dir=destination_dir) as tmp:
                temporary_dir = Path(tmp)
                temporary_xlsx = temporary_dir / f"{stem}.xlsx"
                self.excel.export(proposal, temporary_xlsx)
                temporary_pdf = None
                if final_pdf is not None:
                    temporary_pdf = temporary_dir / f"{stem}.pdf"
                    self.pdf.export(temporary_xlsx, temporary_pdf)
                for source, target in (
                    (temporary_xlsx, final_xlsx), (temporary_pdf, final_pdf),
                ):
                    if source is not None and target is not None:
                        with source.open("rb") as readable, target.open("xb") as writable:
                            created.append(target)
                            shutil.copyfileobj(readable, writable)
            logger.info("Exportação %s concluída; destino=%s", kind, destination_dir)
            return ExportResult(final_xlsx, final_pdf)
        except Exception:
            for path in created:
                path.unlink(missing_ok=True)
            logger.exception("Falha na exportação %s; destino=%s", kind, destination_dir)
            raise
