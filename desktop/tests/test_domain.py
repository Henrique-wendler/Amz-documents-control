from decimal import Decimal

import pytest

from amazon_agro.domain.models import (
    Participant, ParticipantType, Proposal, ProposalProperty, PropertyClassification,
)


def test_participant_types_match_the_reference_models() -> None:
    assert [int(kind) for kind in ParticipantType] == list(range(1, 9))


def test_proposal_keeps_classification_on_its_property_link() -> None:
    proposal = Proposal()
    proposal.properties = [
        ProposalProperty(proposal.id, "external-1", PropertyClassification.CLASS_1)
    ]
    proposal.validate()
    assert proposal.properties[0].classificacao == PropertyClassification.CLASS_1


@pytest.mark.parametrize("value", [Decimal("-0.01"), Decimal("100.01"), Decimal("NaN")])
def test_percentages_must_be_finite_and_between_zero_and_100(value: Decimal) -> None:
    proposal = Proposal(classificacao_da_percentual=value)
    with pytest.raises(ValueError):
        proposal.validate()


def test_unfunded_item_cannot_store_a_percentage() -> None:
    proposal = Proposal(astec_fno_financiada=False, astec_fno_percentual=Decimal("5"))
    with pytest.raises(ValueError):
        proposal.validate()


def test_relationships_must_reference_the_proposal() -> None:
    proposal = Proposal()
    proposal.participants = [Participant("wrong-id", "Pessoa", tipo=ParticipantType.GUARANTOR)]
    with pytest.raises(ValueError):
        proposal.validate()
