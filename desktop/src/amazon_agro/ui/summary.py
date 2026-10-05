"""Read-only live view of the current draft and shared export validation."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QLabel, QVBoxLayout, QWidget

from amazon_agro.domain.models import PARTICIPANT_LABELS, Proposal
from amazon_agro.exporters.formatting import format_brl
from amazon_agro.services.export_validator import ValidationResult
from amazon_agro.ui.privacy import mask_document


class ProposalSummaryPanel(QWidget):
    def __init__(self) -> None:
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(9)
        title = QLabel("Resumo da proposta")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        # Keep the combined plain-text view available to existing callers while
        # presenting the same data in short, scannable sections.
        self.details = QLabel()
        self.details.hide()
        self.identification = self._section(layout, "IDENTIFICAÇÃO")
        self.operation = self._section(layout, "OPERAÇÃO")
        self.items = self._section(layout, "ITENS")
        status_card = QFrame()
        status_card.setObjectName("summaryCard")
        status_layout = QVBoxLayout(status_card)
        status_layout.setContentsMargins(11, 9, 11, 10)
        status_layout.setSpacing(6)
        status_title = QLabel("STATUS")
        status_title.setObjectName("sectionTitle")
        status_layout.addWidget(status_title)
        self.status = QLabel()
        self.pending = QLabel()
        self.status.setObjectName("summaryStatus")
        self.pending.setObjectName("summaryPending")
        for label in (self.status, self.pending):
            label.setWordWrap(True)
            label.setTextFormat(Qt.TextFormat.PlainText)
            label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            status_layout.addWidget(label)
        layout.addWidget(status_card)
        layout.addStretch()

    @staticmethod
    def _section(layout: QVBoxLayout, heading: str) -> QLabel:
        card = QFrame()
        card.setObjectName("summaryCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(11, 9, 11, 10)
        card_layout.setSpacing(5)
        title = QLabel(heading)
        title.setObjectName("sectionTitle")
        card_layout.addWidget(title)
        body = QLabel()
        body.setWordWrap(True)
        body.setTextFormat(Qt.TextFormat.PlainText)
        body.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        card_layout.addWidget(body)
        layout.addWidget(card)
        return body

    def update_proposal(self, proposal: Proposal, validation: ValidationResult) -> None:
        identification = [
            f"Proposta: {proposal.numero_proposta or '—'}",
            f"Proponente: {proposal.proponente or '—'}",
            f"CPF/CNPJ: {mask_document(proposal.cpf_cnpj)}",
        ]
        operation = [
            f"Banco: {proposal.banco or '—'}",
            f"Agência: {proposal.agencia or '—'}",
            f"Técnico: {proposal.tecnico or '—'}",
            f"Finalidade: {proposal.finalidade or '—'}",
            f"Valor: {format_brl(proposal.valor_total)}",
            f"Fonte: {proposal.fonte or '—'}",
            f"Cidade: {proposal.cidade or '—'}",
        ]
        items = [
            f"Participantes ({len(proposal.participants)})",
        ]
        items.extend(f"• {p.nome or 'Sem nome'} — {PARTICIPANT_LABELS[p.tipo]}"
                     for p in proposal.participants)
        items.extend(["", f"Imóveis ({len(proposal.properties)})"])
        for link in proposal.properties:
            registrations = ", ".join(p.registration_snapshot for p in link.selected_parcels)
            items.extend([
                f"• {link.property_name_snapshot or 'Imóvel selecionado'}",
                f"  {link.municipality_snapshot or 'Município não informado'} / {link.state_snapshot or '—'}",
                f"  Matrículas: {registrations or '—'}",
            ])
        self.identification.setText("\n".join(identification))
        self.operation.setText("\n".join(operation))
        self.items.setText("\n".join(items))
        self.details.setText("\n".join([*identification, *operation, *items]))
        self.status.setText("✓ Proposta pronta para gerar" if validation.ok
                            else f"Proposta com pendências ({len(validation.errors)})")
        self.status.setProperty("ready", validation.ok)
        self.status.style().unpolish(self.status)
        self.status.style().polish(self.status)
        self.pending.setText("\n".join(f"• {error}" for error in validation.errors))
        self.pending.setVisible(bool(validation.errors))
