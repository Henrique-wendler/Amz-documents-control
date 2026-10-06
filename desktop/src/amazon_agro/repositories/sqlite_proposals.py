from __future__ import annotations

from dataclasses import fields
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import (
    Boolean, Column, ForeignKey, ForeignKeyConstraint, Integer, MetaData, String,
    Table, create_engine,
    delete, event, insert, select, update,
)
from sqlalchemy.engine import Engine, URL

from amazon_agro.domain.models import (
    Participant, ParticipantType, Proposal, ProposalProperty, ProposalPropertyParcel,
    PropertyClassification,
)
from amazon_agro.repositories.contracts import ProposalSummary


_MONEY = {"valor_total", "recursos_proprios", "valor_fno", "valor_of", "laudo_abc_valor"}
_PERCENT = {
    "percentual_recursos_proprios", "classificacao_da_percentual",
    "astec_fno_percentual", "laudo_abc_percentual", "astec_of_percentual",
}
_BOOLEAN = {
    "astec_fno_financiada", "laudo_abc_financiado", "astec_of_financiada",
}
_SCALAR = [item.name for item in fields(Proposal) if item.name not in {"participants", "properties"}]
_METADATA = MetaData()
_PROPOSALS = Table(
    "proposals", _METADATA,
    Column("id", String, primary_key=True),
    *[
        Column(name, Boolean if name in _BOOLEAN else String, nullable=False
               if name not in {"astec_fno_percentual", "laudo_abc_percentual", "astec_of_percentual", "laudo_abc_valor"}
               else True)
        for name in _SCALAR if name != "id"
    ],
)
_PARTICIPANTS = Table(
    "participants", _METADATA,
    Column("id", String, primary_key=True),
    Column("proposal_id", String, ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False),
    Column("nome", String, nullable=False),
    Column("cpf_cnpj", String, nullable=False),
    Column("tipo", String, nullable=False),
)
_PROPERTY_LINKS = Table(
    "proposal_properties", _METADATA,
    Column("proposal_id", String, ForeignKey("proposals.id", ondelete="CASCADE"), primary_key=True),
    Column("property_external_id", String, primary_key=True),
    Column("classificacao", String, nullable=False),
    Column("property_name_snapshot", String, nullable=False, server_default=""),
    Column("municipality_snapshot", String, nullable=False, server_default=""),
    Column("state_snapshot", String, nullable=False, server_default=""),
    Column("source_file_snapshot", String, nullable=False, server_default=""),
    Column("owner_name_snapshot", String, nullable=False, server_default=""),
)
_PARCEL_LINKS = Table(
    "proposal_property_parcels", _METADATA,
    Column("proposal_id", String, primary_key=True),
    Column("property_external_id", String, primary_key=True),
    Column("parcel_external_id", String, primary_key=True),
    Column("sequence", Integer, nullable=False, server_default="0"),
    Column("registration_snapshot", String, nullable=False),
    Column("previous_registration_snapshot", String, nullable=False),
    Column("area_snapshot", String),
    Column("lot_description_snapshot", String, nullable=False),
    Column("classificacao", String, nullable=False),
    ForeignKeyConstraint(
        ["proposal_id", "property_external_id"],
        ["proposal_properties.proposal_id", "proposal_properties.property_external_id"],
        ondelete="CASCADE",
    ),
)


def _serialize(value: object) -> object:
    if isinstance(value, (Decimal, date, datetime)):
        return str(value) if isinstance(value, Decimal) else value.isoformat()
    return value


def _proposal_from_row(row: object) -> Proposal:
    values = dict(row)
    for name in _MONEY:
        values[name] = Decimal(values[name]) if values[name] is not None else None
    for name in _PERCENT:
        values[name] = Decimal(values[name]) if values[name] is not None else None
    values["data_proposta"] = date.fromisoformat(values["data_proposta"])
    values["created_at"] = datetime.fromisoformat(values["created_at"])
    values["updated_at"] = datetime.fromisoformat(values["updated_at"])
    return Proposal(**values)


class SQLiteProposalRepository:
    """SQLite storage for proposals and their ID based relationships."""

    def __init__(self, db_path: Path) -> None:
        db_path = Path(db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.engine: Engine = create_engine(URL.create("sqlite+pysqlite", database=str(db_path)))

        @event.listens_for(self.engine, "connect")
        def _enable_foreign_keys(connection: object, _record: object) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        _METADATA.create_all(self.engine)
        with self.engine.begin() as connection:
            # Legacy sqlite3 transaction control does not BEGIN for DDL. Make
            # schema additions and their data migration roll back together.
            if not connection.connection.driver_connection.in_transaction:
                connection.exec_driver_sql("BEGIN")
            proposal_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(proposals)")}
            if "laudo_abc_valor" not in proposal_columns:
                connection.exec_driver_sql("ALTER TABLE proposals ADD COLUMN laudo_abc_valor TEXT")
            existing = {
                row[1] for row in connection.exec_driver_sql(
                    "PRAGMA table_info(proposal_properties)"
                )
            }
            for name in (
                "property_name_snapshot", "municipality_snapshot", "state_snapshot",
                "source_file_snapshot", "owner_name_snapshot",
            ):
                if name not in existing:
                    connection.exec_driver_sql(
                        f"ALTER TABLE proposal_properties ADD COLUMN {name} "
                        "TEXT NOT NULL DEFAULT ''"
                    )
            parcel_columns = {
                row[1] for row in connection.exec_driver_sql(
                    "PRAGMA table_info(proposal_property_parcels)"
                )
            }
            if "sequence" not in parcel_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE proposal_property_parcels ADD COLUMN "
                    "sequence INTEGER NOT NULL DEFAULT 0"
                )
            if "classificacao" not in parcel_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE proposal_property_parcels ADD COLUMN "
                    "classificacao TEXT NOT NULL DEFAULT ''"
                )
                connection.exec_driver_sql(
                    "UPDATE proposal_property_parcels SET classificacao = ("
                    "SELECT classificacao FROM proposal_properties WHERE "
                    "proposal_properties.proposal_id = proposal_property_parcels.proposal_id "
                    "AND proposal_properties.property_external_id = "
                    "proposal_property_parcels.property_external_id)"
                )

    def save(self, proposal: Proposal) -> None:
        proposal.validate()
        values = {name: _serialize(getattr(proposal, name)) for name in _SCALAR}
        with self.engine.begin() as connection:
            exists = connection.execute(
                select(_PROPOSALS.c.id).where(_PROPOSALS.c.id == proposal.id)
            ).scalar_one_or_none()
            if exists is None:
                connection.execute(insert(_PROPOSALS).values(**values))
            else:
                connection.execute(
                    update(_PROPOSALS).where(_PROPOSALS.c.id == proposal.id).values(**values)
                )
            connection.execute(
                delete(_PARTICIPANTS).where(_PARTICIPANTS.c.proposal_id == proposal.id)
            )
            connection.execute(
                delete(_PROPERTY_LINKS).where(_PROPERTY_LINKS.c.proposal_id == proposal.id)
            )
            if proposal.participants:
                connection.execute(insert(_PARTICIPANTS), [
                    {
                        "id": person.id, "proposal_id": person.proposal_id,
                        "nome": person.nome, "cpf_cnpj": person.cpf_cnpj,
                        "tipo": str(int(person.tipo)),
                    }
                    for person in proposal.participants
                ])
            if proposal.properties:
                connection.execute(insert(_PROPERTY_LINKS), [
                    {
                        "proposal_id": link.proposal_id,
                        "property_external_id": link.property_external_id,
                        "classificacao": (link.classificacao or link.selected_parcels[0].classificacao).value,
                        "property_name_snapshot": link.property_name_snapshot,
                        "municipality_snapshot": link.municipality_snapshot,
                        "state_snapshot": link.state_snapshot,
                        "source_file_snapshot": link.source_file_snapshot,
                        "owner_name_snapshot": link.owner_name_snapshot,
                    }
                    for link in proposal.properties
                ])
                parcel_rows = [
                    {
                        "proposal_id": link.proposal_id,
                        "property_external_id": link.property_external_id,
                        "parcel_external_id": parcel.parcel_external_id,
                        "sequence": sequence,
                        "registration_snapshot": parcel.registration_snapshot,
                        "previous_registration_snapshot": parcel.previous_registration_snapshot,
                        "area_snapshot": (
                            str(parcel.area_snapshot)
                            if parcel.area_snapshot is not None else None
                        ),
                        "lot_description_snapshot": parcel.lot_description_snapshot,
                        "classificacao": parcel.classificacao.value,
                    }
                    for link in proposal.properties
                    for sequence, parcel in enumerate(link.selected_parcels)
                ]
                if parcel_rows:
                    connection.execute(insert(_PARCEL_LINKS), parcel_rows)

    def get(self, proposal_id: str) -> Proposal | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                select(_PROPOSALS).where(_PROPOSALS.c.id == proposal_id)
            ).mappings().one_or_none()
            if row is None:
                return None
            proposal = _proposal_from_row(row)
            persons = connection.execute(
                select(_PARTICIPANTS).where(_PARTICIPANTS.c.proposal_id == proposal_id)
            ).mappings()
            proposal.participants = [
                Participant(
                    id=person["id"], proposal_id=person["proposal_id"],
                    nome=person["nome"], cpf_cnpj=person["cpf_cnpj"],
                    tipo=ParticipantType(int(person["tipo"])),
                )
                for person in persons
            ]
            links = connection.execute(
                select(_PROPERTY_LINKS).where(_PROPERTY_LINKS.c.proposal_id == proposal_id)
            ).mappings()
            proposal.properties = []
            for link in links:
                parcel_rows = connection.execute(
                    select(_PARCEL_LINKS).where(
                        (_PARCEL_LINKS.c.proposal_id == proposal_id)
                        & (_PARCEL_LINKS.c.property_external_id == link["property_external_id"])
                    ).order_by(_PARCEL_LINKS.c.sequence)
                ).mappings()
                proposal.properties.append(ProposalProperty(
                    proposal_id=link["proposal_id"],
                    property_external_id=link["property_external_id"],
                    classificacao=PropertyClassification(link["classificacao"]),
                    property_name_snapshot=link["property_name_snapshot"],
                    municipality_snapshot=link["municipality_snapshot"],
                    state_snapshot=link["state_snapshot"],
                    source_file_snapshot=link["source_file_snapshot"],
                    owner_name_snapshot=link["owner_name_snapshot"],
                    selected_parcels=[ProposalPropertyParcel(
                        parcel_external_id=parcel["parcel_external_id"],
                        registration_snapshot=parcel["registration_snapshot"],
                        previous_registration_snapshot=parcel["previous_registration_snapshot"],
                        area_snapshot=(Decimal(parcel["area_snapshot"])
                                       if parcel["area_snapshot"] is not None else None),
                        lot_description_snapshot=parcel["lot_description_snapshot"],
                        classificacao=PropertyClassification(parcel["classificacao"]),
                    ) for parcel in parcel_rows],
                ))
            return proposal

    def list_recent(self) -> list[ProposalSummary]:
        with self.engine.connect() as connection:
            rows = connection.execute(
                select(
                    _PROPOSALS.c.id, _PROPOSALS.c.numero_proposta,
                    _PROPOSALS.c.proponente, _PROPOSALS.c.updated_at,
                ).order_by(_PROPOSALS.c.updated_at.desc()).limit(100)
            ).mappings()
            return [
                ProposalSummary(
                    id=row["id"], numero_proposta=row["numero_proposta"],
                    proponente=row["proponente"],
                    updated_at=datetime.fromisoformat(row["updated_at"]),
                )
                for row in rows
            ]
