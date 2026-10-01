"""Property search API over the unified local catalogue."""

from __future__ import annotations

from amazon_agro.domain.models import Property, RuralProperty
from amazon_agro.repositories.contracts import PropertyRepository


class PropertySearchService:
    def __init__(self, properties: PropertyRepository) -> None:
        self.properties = properties

    def search(self, query: str) -> list[Property | RuralProperty]:
        return self.properties.search(query)

    def get(self, external_id: str) -> Property | RuralProperty | None:
        return self.properties.get_by_external_id(external_id)
