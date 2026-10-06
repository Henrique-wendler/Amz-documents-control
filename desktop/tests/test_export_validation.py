from decimal import Decimal

from amazon_agro.config.settings import AppSettings
from amazon_agro.domain.models import (
    Participant, Proposal, ProposalProperty, PropertyClassification,
)
from amazon_agro.repositories.fake_properties import FakePropertyRepository
from amazon_agro.services.export_validator import ProposalExportValidator


def valid_proposal() -> Proposal:
    return Proposal(
        numero_proposta="123", proponente="João da Silva",
        cpf_cnpj="123.456.789-00", tecnico="Maria Técnica",
        finalidade="Custeio", cidade="Palmas", valor_total=Decimal("1000"),
    )


def test_validator_reports_missing_required_fields() -> None:
    result = ProposalExportValidator(
        AppSettings(), FakePropertyRepository()
    ).validate(Proposal())
    assert not result.ok
    assert "Informe o proponente." in result.errors
    assert "Informe o CPF/CNPJ do proponente." in result.errors
    assert "Informe um valor total maior que zero." in result.errors


def test_validator_does_not_invent_bank_specific_requirements() -> None:
    proposal = valid_proposal()
    assert ProposalExportValidator(
        AppSettings(), FakePropertyRepository()
    ).validate(proposal).ok


def test_template_specific_classification_labels() -> None:
    settings = AppSettings()
    assert settings.classification_labels("xlsx")["1"] == "HIPOTECA"
    assert settings.classification_labels("docx")["1"] == "HIPOTECA"
    assert PropertyClassification.CLASS_1.value == "1"


def test_validator_enforces_template_capacity() -> None:
    proposal = valid_proposal()
    proposal.participants = [
        Participant(proposal.id, f"Pessoa {index}") for index in range(8)
    ]
    proposal.properties = [
        ProposalProperty(proposal.id, f"PROPERTY-{index}", PropertyClassification.CLASS_1)
        for index in range(5)
    ]
    result = ProposalExportValidator(
        AppSettings(), FakePropertyRepository()
    ).validate(proposal)
    assert any("até 7 participantes" in error for error in result.errors)
    assert not any("até 4 imóveis" in error for error in result.errors)


def test_template_path_relative_to_config_file(tmp_path) -> None:
    import json

    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({"xlsx_template_path": "templates/model.xlsx"}),
        encoding="utf-8",
    )
    settings = AppSettings.load(config_path)
    assert settings.template_path() == tmp_path / "templates" / "model.xlsx"
