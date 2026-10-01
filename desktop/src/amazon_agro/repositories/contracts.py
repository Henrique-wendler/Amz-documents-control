from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from amazon_agro.domain.models import Proposal, Property, RuralProperty

@dataclass(frozen=True, slots=True)
class ProposalSummary:
    id: str
    numero_proposta: str
    proponente: str
    updated_at: datetime

class ProposalRepository(Protocol):
    def save(self, proposal: Proposal) -> None: ...
    def get(self, proposal_id: str) -> Proposal | None: ...
    def list_recent(self) -> list[ProposalSummary]: ...

class PropertyRepository(Protocol):
    def search(self, query: str) -> list[Property | RuralProperty]: ...
    def get_by_external_id(self, external_id: str) -> Property | RuralProperty | None: ...
