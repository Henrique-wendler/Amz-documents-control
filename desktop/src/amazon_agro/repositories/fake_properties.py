from __future__ import annotations

from amazon_agro.domain.models import Property


class FakePropertyRepository:
    """Explicit demo data until the spreadsheet integration exists."""

    def __init__(self, properties: list[Property] | None = None) -> None:
        self._properties = properties if properties is not None else [
            Property("DEMO-001", "Imóvel demonstrativo A", "Palmas", "MAT-001"),
            Property("DEMO-002", "Imóvel demonstrativo B", "Porto Nacional", "MAT-002"),
        ]

    def search(self, query: str) -> list[Property]:
        term = query.casefold().strip()
        return [
            item for item in self._properties
            if term in " ".join(
                (item.external_id, item.nome, item.municipio, item.matricula)
            ).casefold()
        ]

    def get_by_external_id(self, external_id: str) -> Property | None:
        return next((item for item in self._properties if item.external_id == external_id), None)
