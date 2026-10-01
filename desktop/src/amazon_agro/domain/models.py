from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import IntEnum, StrEnum
from uuid import uuid4


class ParticipantType(IntEnum):
    MAIN_ISSUER = 1
    CUSTODIAN = 2
    SECONDARY_HOLDER = 3
    GUARANTOR = 4
    TECHNICAL_RESPONSIBLE = 5
    TECHNICAL_ASSISTANCE = 6
    MORTGAGE_INTERVENOR = 7
    SPOUSAL_CONSENT = 8


PARTICIPANT_LABELS = {
    ParticipantType.MAIN_ISSUER: "Emitente principal",
    ParticipantType.CUSTODIAN: "Fiel depositário",
    ParticipantType.SECONDARY_HOLDER: "Titular secundário",
    ParticipantType.GUARANTOR: "Avalista",
    ParticipantType.TECHNICAL_RESPONSIBLE: "Responsável técnico",
    ParticipantType.TECHNICAL_ASSISTANCE: "Assistência técnica",
    ParticipantType.MORTGAGE_INTERVENOR: "Interveniente hipotecante",
    ParticipantType.SPOUSAL_CONSENT: "Outorga conjugal",
}


class PropertyClassification(StrEnum):
    CLASS_1 = "1"
    CREDIT_OBJECT = "2"
    FIDUCIARY_ALIENATION = "3"


def new_id() -> str:
    return str(uuid4())


@dataclass(slots=True)
class Participant:
    proposal_id: str
    nome: str = ""
    cpf_cnpj: str = ""
    tipo: ParticipantType = ParticipantType.MAIN_ISSUER
    id: str = field(default_factory=new_id)


@dataclass(slots=True)
class Property:
    external_id: str
    nome: str
    municipio: str = ""
    matricula: str = ""
    extra_fields: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class PropertyParcel:
    external_id: str
    property_external_id: str
    registration: str
    previous_registration: str = ""
    area: Decimal | None = None
    lot_description: str = ""
    extra_fields: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class RuralProperty:
    external_id: str
    name: str
    municipality: str = ""
    state: str = ""
    owner_name: str = ""
    owner_document: str = ""
    ccir: str = ""
    itr: str = ""
    car: str = ""
    source_file: str = ""
    source_profile: str = ""
    source_status: str = "OK"
    extra_fields: dict[str, str] = field(default_factory=dict)
    parcels: list[PropertyParcel] = field(default_factory=list)

    @property
    def total_area(self) -> Decimal:
        return sum((parcel.area or Decimal(0) for parcel in self.parcels), Decimal(0))


BRAZILIAN_STATES = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
    "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
    "RR", "SC", "SP", "SE", "TO",
)


@dataclass(frozen=True, slots=True)
class PropertyLocalEnrichment:
    property_id: str
    municipality: str
    state: str
    updated_at: datetime


@dataclass(slots=True)
class ProposalPropertyParcel:
    parcel_external_id: str
    registration_snapshot: str
    previous_registration_snapshot: str = ""
    area_snapshot: Decimal | None = None
    lot_description_snapshot: str = ""


@dataclass(slots=True)
class ProposalProperty:
    proposal_id: str
    property_external_id: str
    classificacao: PropertyClassification
    property_name_snapshot: str = ""
    municipality_snapshot: str = ""
    state_snapshot: str = ""
    source_file_snapshot: str = ""
    owner_name_snapshot: str = ""
    selected_parcels: list[ProposalPropertyParcel] = field(default_factory=list)


@dataclass(slots=True)
class Proposal:
    id: str = field(default_factory=new_id)
    numero_proposta: str = ""
    banco: str = ""
    agencia: str = ""
    proponente: str = ""
    cpf_cnpj: str = ""
    porte: str = ""
    responsavel: str = ""
    tecnico: str = ""
    gerente_banco: str = ""
    finalidade: str = ""
    atividade: str = ""
    descricao: str = ""
    fonte: str = ""
    valor_total: Decimal = Decimal("0")
    recursos_proprios: Decimal = Decimal("0")
    percentual_recursos_proprios: Decimal = Decimal("0")
    valor_fno: Decimal = Decimal("0")
    classificacao_da_percentual: Decimal = Decimal("0")
    astec_fno_financiada: bool = False
    astec_fno_percentual: Decimal | None = None
    laudo_abc_financiado: bool = False
    laudo_abc_percentual: Decimal | None = None
    valor_of: Decimal = Decimal("0")
    astec_of_financiada: bool = False
    astec_of_percentual: Decimal | None = None
    status: str = ""
    aguardando: str = ""
    cidade: str = ""
    data_proposta: date = field(default_factory=date.today)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    participants: list[Participant] = field(default_factory=list)
    properties: list[ProposalProperty] = field(default_factory=list)

    def validate(self) -> None:
        for name in ("valor_total", "recursos_proprios", "valor_fno", "valor_of"):
            value = getattr(self, name)
            if not isinstance(value, Decimal) or not value.is_finite() or value < 0:
                raise ValueError(f"{name} deve ser um valor monetário não negativo.")
        for name in (
            "percentual_recursos_proprios", "classificacao_da_percentual",
            "astec_fno_percentual", "laudo_abc_percentual", "astec_of_percentual",
        ):
            value = getattr(self, name)
            if value is not None and (
                not isinstance(value, Decimal) or not value.is_finite() or not 0 <= value <= 100
            ):
                raise ValueError(f"{name} deve estar entre 0 e 100.")
        for flag, percent in (
            (self.astec_fno_financiada, self.astec_fno_percentual),
            (self.laudo_abc_financiado, self.laudo_abc_percentual),
            (self.astec_of_financiada, self.astec_of_percentual),
        ):
            if not flag and percent is not None:
                raise ValueError("Percentual informado para item não financiado.")
        participant_ids: set[str] = set()
        for participant in self.participants:
            if participant.proposal_id != self.id or participant.id in participant_ids:
                raise ValueError("Referência ou ID inválido em participante.")
            if not isinstance(participant.tipo, ParticipantType):
                raise ValueError("Tipo de participante inválido.")
            if not participant.nome.strip():
                raise ValueError("Informe o nome de cada participante.")
            participant_ids.add(participant.id)
        property_ids: set[str] = set()
        for link in self.properties:
            if link.proposal_id != self.id or not link.property_external_id.strip():
                raise ValueError("Referência inválida em imóvel.")
            if not isinstance(link.classificacao, PropertyClassification):
                raise ValueError("Classificação de imóvel inválida.")
            if link.property_external_id in property_ids:
                raise ValueError("Imóvel duplicado na proposta.")
            parcel_ids: set[str] = set()
            for parcel in link.selected_parcels:
                if not parcel.parcel_external_id or parcel.parcel_external_id in parcel_ids:
                    raise ValueError("Matrícula duplicada ou sem ID na proposta.")
                if not parcel.registration_snapshot.strip():
                    raise ValueError("Matrícula selecionada sem número no snapshot.")
                parcel_ids.add(parcel.parcel_external_id)
            property_ids.add(link.property_external_id)
