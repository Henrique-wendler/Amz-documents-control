from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from amazon_agro.domain.models import (
    Participant, ParticipantType, Proposal, ProposalProperty, PropertyClassification,
)
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository


def test_sqlite_round_trip_and_relationship_update(tmp_path) -> None:
    path = tmp_path / "nested" / "proposals.sqlite3"
    repository = SQLiteProposalRepository(path)
    proposal = Proposal(
        numero_proposta="2026/001", proponente="Produtor Exemplo",
        valor_total=Decimal("125000.35"), classificacao_da_percentual=Decimal("7.50"),
        astec_fno_financiada=True, astec_fno_percentual=Decimal("2.75"),
    )
    person = Participant(
        proposal.id, "Produtor Exemplo", "000.000.000-00", ParticipantType.MAIN_ISSUER,
    )
    proposal.participants.append(person)
    proposal.properties.append(ProposalProperty(
        proposal.id, "EXT-1", PropertyClassification.FIDUCIARY_ALIENATION,
    ))
    repository.save(proposal)

    reopened = SQLiteProposalRepository(path).get(proposal.id)
    assert reopened is not None
    assert reopened.valor_total == Decimal("125000.35")
    assert reopened.astec_fno_percentual == Decimal("2.75")
    assert reopened.participants == [person]
    assert reopened.properties == proposal.properties
    assert repository.list_recent()[0].id == proposal.id

    reopened.participants.clear()
    reopened.properties.clear()
    repository.save(reopened)
    updated = repository.get(proposal.id)
    assert updated is not None
    assert updated.participants == []
    assert updated.properties == []


def test_sqlite_rejects_orphan_participant(tmp_path) -> None:
    repository = SQLiteProposalRepository(tmp_path / "proposals.sqlite3")
    with pytest.raises(IntegrityError):
        with repository.engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO participants (id, proposal_id, nome, cpf_cnpj, tipo) "
                "VALUES ('p', 'missing', 'Teste', '', '1')"
            ))
