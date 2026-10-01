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

    @property
    def ok(self) -> bool:
        return not self.errors


class ProposalExportValidator:
    def __init__(self, settings: AppSettings, properties: PropertyRepository) -> None:
        self.settings = settings
        self.properties = properties

    def validate(self, proposal: Proposal) -> ValidationResult:
        errors: list[str] = []
        try:
            proposal.validate()
        except ValueError as error:
            errors.append(str(error))
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
        if (
            not isinstance(proposal.valor_total, Decimal)
            or not proposal.valor_total.is_finite()
            or proposal.valor_total <= 0
        ):
            errors.append("Informe um valor total maior que zero.")
        if len(proposal.participants) > len(PARTICIPANT_ROWS):
            errors.append(
                f"O modelo suporta até {len(PARTICIPANT_ROWS)} participantes; "
                f"a proposta possui {len(proposal.participants)}."
            )
        if len(proposal.properties) > len(PROPERTY_ROWS):
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
                errors.append(
                    "A exportação de fazenda com várias matrículas selecionadas "
                    "depende de regra de negócio ainda pendente."
                )
            elif link.property_name_snapshot and link.selected_parcels:
                continue
            else:
                property_item = self.properties.get_by_external_id(link.property_external_id)
                if isinstance(property_item, RuralProperty):
                    errors.append("Selecione as matrículas da fazenda antes de exportar.")
                elif property_item is None:
                    errors.append(
                        f"Imóvel {link.property_external_id} não encontrado na fonte configurada."
                    )
        return ValidationResult(tuple(dict.fromkeys(errors)))
