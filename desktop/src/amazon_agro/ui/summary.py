"""Read-only live view of the current draft and shared export validation."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget

from amazon_agro.domain.models import PARTICIPANT_LABELS, Proposal
from amazon_agro.exporters.formatting import format_brl
from amazon_agro.services.export_validator import ValidationResult
from amazon_agro.ui.privacy import mask_document


class ProposalSummaryPanel(QWidget):
    def __init__(self) -> None:
        super().__init__()
        layout = QVBoxLayout(self)
        title = QLabel("Resumo da proposta")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        self.details = QLabel()
        self.status = QLabel()
        self.pending = QLabel()
        for label in (self.details, self.status, self.pending):
            label.setWordWrap(True)
            label.setTextFormat(Qt.TextFormat.PlainText)
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            layout.addWidget(label)
        self.status.setObjectName("badge")
        layout.addStretch()

    def update_proposal(self, proposal: Proposal, validation: ValidationResult) -> None:
        lines = [
            f"Proposta: {proposal.numero_proposta or '—'}",
            f"Proponente: {proposal.proponente or '—'}",
            f"CPF/CNPJ: {mask_document(proposal.cpf_cnpj)}",
            f"Banco: {proposal.banco or '—'}",
            f"Agência: {proposal.agencia or '—'}",
            f"Técnico: {proposal.tecnico or '—'}",
            f"Finalidade: {proposal.finalidade or '—'}",
            f"Valor: {format_brl(proposal.valor_total)}",
            f"Fonte: {proposal.fonte or '—'}",
            f"Cidade: {proposal.cidade or '—'}", "",
            f"Participantes ({len(proposal.participants)})",
        ]
        lines.extend(f"• {p.nome or 'Sem nome'} — {PARTICIPANT_LABELS[p.tipo]}"
                     for p in proposal.participants)
        lines.extend(["", f"Imóveis ({len(proposal.properties)})"])
        for link in proposal.properties:
            registrations = ", ".join(p.registration_snapshot for p in link.selected_parcels)
            lines.extend([
                f"• {link.property_name_snapshot or 'Imóvel selecionado'}",
                f"  {link.municipality_snapshot or 'Município não informado'} / {link.state_snapshot or '—'}",
                f"  Matrículas: {registrations or '—'}",
            ])
        self.details.setText("\n".join(lines))
        self.status.setText("✓ Proposta pronta para gerar" if validation.ok
                            else f"Proposta com pendências ({len(validation.errors)})")
        self.pending.setText("\n".join(f"• {error}" for error in validation.errors))
