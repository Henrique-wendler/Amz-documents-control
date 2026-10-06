from __future__ import annotations

from datetime import datetime, timezone

from amazon_agro.config.settings import AppSettings

from amazon_agro.domain.models import (
    Participant, Proposal, ProposalPropertyParcel, Property, PropertyLocalEnrichment, RuralProperty,
)
from amazon_agro.repositories.contracts import (
    PropertyRepository, ProposalRepository, ProposalSummary,
)
from amazon_agro.services.property_search_service import PropertySearchService


class ProposalService:
    def __init__(
        self, proposals: ProposalRepository, properties: PropertyRepository
    ) -> None:
        self._proposals = proposals
        self._properties = properties
        self._search = PropertySearchService(properties)

    def new_proposal(self, settings: AppSettings) -> Proposal:
        proposal = Proposal(
            banco=settings.banks[0] if settings.banks else "",
            cidade=settings.default_city, tecnico=settings.default_technician,
        )
        proposal.participants.append(Participant(
            proposal.id, settings.default_consultancy_name,
            settings.default_consultancy_document, tipo=None,
        ))
        return proposal

    def save(self, proposal: Proposal) -> None:
        proposal.validate()
        for link in proposal.properties:
            if link.property_name_snapshot and link.selected_parcels:
                continue
            property_item = self._search.get(link.property_external_id)
            if property_item is None:
                raise ValueError(
                    f"Imóvel {link.property_external_id} não encontrado na fonte configurada."
                )
            if isinstance(property_item, RuralProperty):
                raise ValueError("Selecione as matrículas da fazenda antes de salvar.")
            link.property_name_snapshot = property_item.nome
            link.municipality_snapshot = property_item.municipio
            if property_item.matricula:
                link.selected_parcels = [ProposalPropertyParcel(
                    parcel_external_id=f"legacy:{property_item.external_id}:{property_item.matricula}",
                    registration_snapshot=property_item.matricula,
                    classificacao=link.classificacao,
                )]
        proposal.updated_at = datetime.now(timezone.utc)
        self._proposals.save(proposal)

    def get(self, proposal_id: str) -> Proposal | None:
        return self._proposals.get(proposal_id)

    def list_recent(self) -> list[ProposalSummary]:
        return self._proposals.list_recent()

    def search_properties(self, query: str) -> list[Property | RuralProperty]:
        return self._search.search(query)

    def get_property(self, external_id: str) -> Property | RuralProperty | None:
        return self._search.get(external_id)

    def save_property_local_enrichment(
        self, property_id: str, municipality: str, state: str,
    ) -> PropertyLocalEnrichment:
        save = getattr(self._properties, "save_local_enrichment", None)
        if save is None:
            raise ValueError("O catálogo atual não aceita informações locais.")
        return save(property_id, municipality, state)
