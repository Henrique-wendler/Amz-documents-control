import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { Dismiss24Regular, Edit20Regular, Open20Regular } from "@fluentui/react-icons";
import { formatArea, formatCurrency, formatIsoDate } from "../../services/searchUtils";
import type { FarmDetailsViewModel } from "../../types/fazenda";
import { StatusBadge } from "../StatusBadge";
import { getDocumentValidityStatus } from "../../data/mock/selectors";

interface FarmDetailsDrawerProps { record?: FarmDetailsViewModel; open: boolean; onClose: () => void; onEdit: () => void; onSeeAllOperations: () => void; }
const operationStatus = { under_review: "Em análise", active: "Ativa", completed: "Concluída", cancelled: "Cancelada" } as const;
const documentStatus = { active: "Ativo", expiring: "A vencer", expired: "Vencido", inactive: "Inativo" } as const;
const carStatus = { active: "Ativo", pending: "Em análise", inactive: "Inativo" } as const;

export function FarmDetailsDrawer({ record, open, onClose, onEdit, onSeeAllOperations }: FarmDetailsDrawerProps) {
  const farm = record?.farm;
  return <Drawer className="search-result-drawer farm-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar detalhes" icon={<Dismiss24Regular />} onClick={onClose} />}>Detalhes da fazenda</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody>{farm ? <div className="drawer-record farm-details">
      <div className="drawer-record__identity"><span className="farm-type-label">Imóvel rural</span><h2>{farm.name}</h2><p>{farm.location || "Zona rural"} · {farm.municipality} / {farm.state}</p><StatusBadge status={farm.status === "active" ? "Ativa" : "Inativa"} /></div>
      <section className="drawer-record__section"><h3>Informações principais</h3><dl className="drawer-record__details"><div><dt>Município / UF</dt><dd>{farm.municipality} / {farm.state}</dd></div><div><dt>Área total</dt><dd>{formatArea(farm.totalArea)}</dd></div><div><dt>Área de reserva</dt><dd>{formatArea(farm.reserveArea ?? 0)}</dd></div><div><dt>Área consolidada</dt><dd>{formatArea(farm.consolidatedArea ?? 0)}</dd></div></dl></section>
      <section className="drawer-record__section"><h3>Vínculos do imóvel</h3><div className="farm-link-metrics"><span><strong>{farm.registrationCount}</strong><small>Matrículas</small></span><span><strong>{farm.ownerCount}</strong><small>Proprietários</small></span><span><strong>{farm.activeOperationCount}</strong><small>Operações ativas</small></span><span><strong>{farm.documentCount}</strong><small>Documentos</small></span></div></section>
      <section className="drawer-record__section"><h3>Matrículas vinculadas</h3>{record.registrations.length ? <div className="farm-detail-list">{record.registrations.map((registration) => <div key={registration.id}><span><strong>Matrícula {registration.number}</strong><small>Área registral: {formatArea(registration.legalArea ?? 0)} · HP: {registration.hp || "—"}</small></span><StatusBadge status={registration.status === "active" ? "Ativa" : "Inativa"} /></div>)}</div> : <p className="farm-drawer__empty">Nenhuma matrícula vinculada.</p>}</section>
      <section className="drawer-record__section"><h3>Proprietários</h3>{record.owners.length ? <div className="farm-detail-list">{record.owners.map((owner) => <div key={owner.id}><span><strong>{owner.name}</strong><small>{owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica"} · {owner.document}</small></span><StatusBadge status={owner.status === "active" ? "Ativo" : "Inativo"} /></div>)}</div> : <p className="farm-drawer__empty">Nenhum proprietário vinculado.</p>}</section>
      <section className="drawer-record__section"><div className="farm-detail-heading"><h3>Operações</h3>{record.operations.length > 3 ? <Button appearance="subtle" size="small" icon={<Open20Regular />} onClick={onSeeAllOperations}>Ver todas</Button> : null}</div>{record.operations.length ? <div className="farm-detail-list">{record.operations.slice(0, 3).map((operation) => <div key={operation.id}><span><strong>{operation.number} · {operation.bank}</strong><small>{operation.purpose || "Sem finalidade informada"} · {formatCurrency(operation.value)}</small></span><StatusBadge status={operationStatus[operation.status]} /></div>)}</div> : <p className="farm-drawer__empty">Nenhuma operação vinculada.</p>}</section>
      <section className="drawer-record__section"><h3>Documentos rurais</h3>{record.documents.length ? <div className="farm-detail-list">{record.documents.map((document) => <div key={document.id}><span><strong>{document.type}</strong><small>{document.number || "Sem número"} · Validade: {formatIsoDate(document.expirationDate)}</small></span><StatusBadge status={documentStatus[getDocumentValidityStatus(document)]} /></div>)}</div> : <p className="farm-drawer__empty">Nenhum documento vinculado.</p>}</section>
      <section className="drawer-record__section"><h3>Cadastro Ambiental Rural</h3>{record.cars.length ? <div className="farm-detail-list">{record.cars.map((car) => <div key={car.id}><span><strong>{car.number}</strong><small>Recibo: {car.receiptNumber || "—"}</small></span><StatusBadge status={carStatus[car.status]} /></div>)}</div> : <p className="farm-drawer__empty">Nenhum CAR vinculado.</p>}</section>
      <section className="drawer-record__section"><h3>Observações</h3><p className="farm-drawer__notes">{farm.notes || "Nenhuma observação registrada."}</p></section>
      <section className="drawer-record__section"><h3>Auditoria</h3><dl className="drawer-record__details"><div><dt>Cadastrada em</dt><dd>{farm.createdAt}</dd></div><div><dt>Atualizada em</dt><dd>{farm.updatedAt}</dd></div></dl></section>
    </div> : null}</DrawerBody>
    <DrawerFooter><Button appearance="primary" icon={<Edit20Regular />} disabled={!farm} onClick={onEdit}>Editar</Button><Button appearance="secondary" onClick={onClose}>Fechar</Button></DrawerFooter>
  </Drawer>;
}

