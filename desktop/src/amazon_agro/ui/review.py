from __future__ import annotations

from decimal import Decimal

from PySide6.QtWidgets import QGridLayout, QLabel, QPlainTextEdit, QPushButton, QVBoxLayout, QWidget

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import PARTICIPANT_LABELS, Proposal
from amazon_agro.services.proposal_service import ProposalService
from amazon_agro.ui.privacy import mask_document
from amazon_agro.exporters.formatting import format_brl, format_percentage_fixed


def _display(value: object, money: bool = False) -> str:
    if isinstance(value, bool):
        return "Sim" if value else "Não"
    if isinstance(value, Decimal):
        return format_brl(value) if money else str(value).replace(".", ",")
    if value is None:
        return "—"
    return str(value) or "—"


class ReviewPage(QWidget):
    OPERATION = (
        ("Número da proposta", "numero_proposta"), ("Banco", "banco"),
        ("Agência", "agencia"), ("Proponente", "proponente"),
        ("CPF / CNPJ", "cpf_cnpj"), ("Porte", "porte"),
        ("Responsável", "responsavel"), ("Técnico", "tecnico"),
        ("Gerente do banco", "gerente_banco"), ("Finalidade", "finalidade"),
        ("Atividade", "atividade"), ("Fonte", "fonte"),
        ("Cidade", "cidade"), ("Data da proposta", "data_proposta"),
    )
    FINANCIAL = (
        ("Descrição", "descricao"), ("Valor total", "valor_total"), ("Valor FNO", "valor_fno"),
        ("Valor OF", "valor_of"), ("Possui recursos próprios?", "has_own_resources"),
        ("Participação FNO", "fno_percentage"), ("Participação OF", "of_percentage"),
        ("% recursos próprios", "own_resources_percentage"),
        ("ASTEC FNO financiada", "astec_fno_financiada"),
        ("% ASTEC FNO", "astec_fno_percentual"),
        ("Possui Laudo ABC financiado?", "laudo_abc_financiado"),
        ("% Laudo ABC", "laudo_abc_percentual"),
        ("Valor Laudo ABC", "calculated_abc_amount"),
        ("ASTEC OF financiada", "astec_of_financiada"),
        ("% ASTEC OF", "astec_of_percentual"),
    )

    def __init__(self, service: ProposalService, settings: AppSettings) -> None:
        super().__init__()
        self.service = service
        self.settings = settings
        layout = QVBoxLayout(self)
        self.text = QPlainTextEdit()
        self.text.setReadOnly(True)
        layout.addWidget(self.text)
        self.validation_label = QLabel()
        self.validation_label.setWordWrap(True)
        self.validation_label.setObjectName("validationMessage")
        layout.addWidget(self.validation_label)
        actions = QGridLayout()
        self.save_button = QPushButton("Salvar operação")
        self.excel_button = QPushButton("Gerar Excel")
        self.pdf_button = QPushButton("Gerar PDF")
        self.both_button = QPushButton("Gerar Excel + PDF")
        self.both_button.setObjectName("primary")
        for index, button in enumerate((
            self.save_button, self.excel_button, self.pdf_button, self.both_button
        )):
            actions.addWidget(button, index // 2, index % 2)
        layout.addLayout(actions)
        self.set_validation_errors(("Preencha os dados mínimos da proposta.",))

    def set_validation_errors(self, errors: tuple[str, ...], financial_errors: tuple[str, ...] = ()) -> None:
        enabled = not errors
        self.validation_label.setProperty("blocked", bool(financial_errors))
        self.validation_label.style().unpolish(self.validation_label)
        self.validation_label.style().polish(self.validation_label)
        # Actions remain reachable so a click explains pending fields.
        self.validation_label.setText(
            "Pronta para exportar." if enabled
            else "Para exportar: " + " • ".join(errors)
        )

    def load(self, proposal: Proposal) -> None:
        lines = ["REVISÃO DA PROPOSTA", "", "OPERAÇÃO"]
        lines.extend(
            f"{label}: {mask_document(proposal.cpf_cnpj) if name == 'cpf_cnpj' else _display(getattr(proposal, name))}"
            for label, name in self.OPERATION
        )
        lines.extend(["", "PARTICIPANTES"])
        if proposal.participants:
            lines.extend(
                f"{person.nome} | {mask_document(person.cpf_cnpj)} | "
                f"{int(person.tipo) if person.tipo is not None else '—'} — "
                f"{PARTICIPANT_LABELS.get(person.tipo, 'Selecione o tipo')} | ID: {person.id}"
                for person in proposal.participants
            )
        else:
            lines.append("Nenhum participante adicionado.")
        lines.extend(["", "PROPOSTA"])
        money_fields = {"valor_total", "valor_fno", "valor_of", "calculated_abc_amount"}
        for label, name in self.FINANCIAL:
            if name in {"astec_fno_percentual", "astec_of_percentual"} and not getattr(
                proposal, name.replace("percentual", "financiada")
            ):
                continue
            if not proposal.laudo_abc_financiado and name in {"laudo_abc_percentual", "calculated_abc_amount"}:
                continue
            if name == "own_resources_percentage" and not proposal.has_own_resources:
                continue
            value = getattr(proposal, name)
            text = (format_percentage_fixed(value) if value is not None and name in {"fno_percentage", "of_percentage", "own_resources_percentage", "laudo_abc_percentual", "astec_fno_percentual", "astec_of_percentual"}
                    else _display(value, name in money_fields))
            lines.append(f"{label}: {text}")
        lines.extend(["", "IMÓVEIS"])
        if proposal.properties:
            for link in proposal.properties:
                lines.append(
                    f"{link.property_name_snapshot or link.property_external_id} | "
                    f"{link.municipality_snapshot or '—'}"
                )
                for parcel in link.selected_parcels:
                    label = (self.settings.property_classifications[parcel.classificacao.value]
                             if parcel.classificacao is not None else "Classificação pendente")
                    lines.append(f"  Matrícula: {parcel.registration_snapshot} | {label}")
                if not link.selected_parcels:
                    lines.append("  Matrículas: snapshot legado; depende da fonte original.")
        else:
            lines.append("Nenhum imóvel adicionado.")
        lines.extend([
            "", "REGISTRO LOCAL",
            f"ID: {proposal.id}",
            f"Criada em: {proposal.created_at.isoformat()}",
            f"Atualizada em: {proposal.updated_at.isoformat()}",
        ])
        self.text.setPlainText("\n".join(lines))
