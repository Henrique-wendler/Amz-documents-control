from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import Proposal, RuralProperty
from amazon_agro.exporters.excel_map import PARTICIPANT_ROWS, PROPERTY_ROWS
from amazon_agro.repositories.contracts import PropertyRepository


@dataclass(frozen=True, slots=True)
class ValidationResult:
    errors: tuple[str, ...]
    pending_steps: tuple[int, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.errors


class ProposalExportValidator:
    def __init__(self, settings: AppSettings, properties: PropertyRepository) -> None:
        self.settings = settings
        self.properties = properties

    def validate(self, proposal: Proposal) -> ValidationResult:
        errors: list[str] = []
        pending_steps: set[int] = set()
        try:
            proposal.validate()
        except ValueError as error:
            errors.append(str(error))
            message = str(error).lower()
            pending_steps.add(1 if "participante" in message else 3 if any(
                word in message for word in ("imóvel", "imóveis", "matrícula")
            ) else 2)
        for value, message in (
            (proposal.numero_proposta, "Informe o número da proposta."),
            (proposal.proponente, "Informe o proponente."),
            (proposal.cpf_cnpj, "Informe o CPF/CNPJ do proponente."),
            (proposal.tecnico, "Informe o técnico responsável."),
            (proposal.finalidade, "Informe a finalidade."),
            (proposal.cidade, "Informe a cidade da proposta."),
        ):
            if not value.strip():
                errors.append(message)
                pending_steps.add(0)
        if (
            not isinstance(proposal.valor_total, Decimal)
            or not proposal.valor_total.is_finite()
            or proposal.valor_total <= 0
        ):
            errors.append("Informe um valor total maior que zero.")
            pending_steps.add(2)
        if len(proposal.participants) > len(PARTICIPANT_ROWS):
            pending_steps.add(1)
            errors.append(
                f"O modelo suporta até {len(PARTICIPANT_ROWS)} participantes; "
                f"a proposta possui {len(proposal.participants)}."
            )
        if len(proposal.properties) > len(PROPERTY_ROWS):
            pending_steps.add(3)
            errors.append(
                f"O modelo suporta até {len(PROPERTY_ROWS)} imóveis; "
                f"a proposta possui {len(proposal.properties)}."
            )
        if not self.settings.template_path().is_file():
            errors.append(
                f"Template XLSX não encontrado: {self.settings.template_path()}"
            )
        for link in proposal.properties:
            if len(link.selected_parcels) > 1:
                pending_steps.add(3)
                errors.append(
                    "A exportação de fazenda com várias matrículas selecionadas "
                    "depende de regra de negócio ainda pendente."
                )
            elif link.property_name_snapshot and link.selected_parcels:
                continue
            else:
                property_item = self.properties.get_by_external_id(link.property_external_id)
                if isinstance(property_item, RuralProperty):
                    pending_steps.add(3)
                    errors.append("Selecione as matrículas da fazenda antes de exportar.")
                elif property_item is None:
                    pending_steps.add(3)
                    errors.append(
                        f"Imóvel {link.property_external_id} não encontrado na fonte configurada."
                    )
        if errors:
            pending_steps.add(4)
        return ValidationResult(tuple(dict.fromkeys(errors)), tuple(sorted(pending_steps)))
