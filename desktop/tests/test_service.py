import pytest

from amazon_agro.domain.models import Proposal, ProposalProperty, PropertyClassification
from amazon_agro.repositories.fake_properties import FakePropertyRepository
from amazon_agro.repositories.sqlite_proposals import SQLiteProposalRepository
from amazon_agro.services.proposal_service import ProposalService


def test_service_rejects_property_missing_from_source(tmp_path) -> None:
    service = ProposalService(
        SQLiteProposalRepository(tmp_path / "proposals.sqlite3"),
        FakePropertyRepository(),
    )
    proposal = Proposal()
    proposal.properties.append(
        ProposalProperty(proposal.id, "missing", PropertyClassification.CLASS_1)
    )
    with pytest.raises(ValueError, match="não encontrado"):
        service.save(proposal)
    assert service.get(proposal.id) is None


def test_service_saves_property_found_in_source(tmp_path) -> None:
    service = ProposalService(
        SQLiteProposalRepository(tmp_path / "proposals.sqlite3"),
        FakePropertyRepository(),
    )
    proposal = Proposal()
    proposal.properties.append(
        ProposalProperty(proposal.id, "DEMO-001", PropertyClassification.CLASS_1)
    )
    service.save(proposal)
    reopened = service.get(proposal.id)
    assert reopened is not None
    assert reopened.properties == proposal.properties
