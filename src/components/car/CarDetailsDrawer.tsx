import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { Dismiss24Regular, Edit20Regular } from "@fluentui/react-icons";
import type { CarDetailsViewModel } from "../../types/car";
import { StatusBadge } from "../StatusBadge";

interface Props { record?: CarDetailsViewModel; open: boolean; onClose: () => void; onEdit: () => void; }
const labels = { active: "Ativo", pending: "Pendente", inactive: "Inativo" } as const;
const displayDate = (value: string) => value.includes("/") ? value : new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

export function CarDetailsDrawer({ record, open, onClose, onEdit }: Props) {
  const car = record?.car;
  return <Drawer className="search-result-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar detalhes" icon={<Dismiss24Regular />} onClick={onClose} />}>Detalhes do CAR</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody>{car ? <div className="drawer-record"><div className="drawer-record__identity"><span className="farm-type-label">Cadastro Ambiental Rural</span><h2>{car.number}</h2><p>{car.farmName} · {car.farmLocation}</p><StatusBadge status={labels[car.status]} /></div>
      <section className="drawer-record__section"><h3>Identificação</h3><dl className="drawer-record__details"><div><dt>Número CAR</dt><dd>{car.number}</dd></div><div><dt>Número do recibo</dt><dd>{car.receiptNumber || "—"}</dd></div><div><dt>Situação</dt><dd><StatusBadge status={labels[car.status]} /></dd></div></dl></section>
      <section className="drawer-record__section"><h3>Vínculos</h3><dl className="drawer-record__details"><div><dt>Fazenda</dt><dd>{record?.farm?.name ?? "—"}</dd></div><div><dt>Matrícula</dt><dd>{record?.registration?.number ?? "Sem vínculo"}</dd></div><div><dt>Proprietário do CAR</dt><dd>{record?.owner?.name ?? "Não informado"}</dd></div></dl></section>
      <section className="drawer-record__section"><h3>Auditoria</h3><dl className="drawer-record__details"><div><dt>Cadastrado em</dt><dd>{displayDate(car.createdAt)}</dd></div><div><dt>Atualizado em</dt><dd>{displayDate(car.updatedAt)}</dd></div></dl></section>
    </div> : null}</DrawerBody>
    <DrawerFooter><Button appearance="primary" icon={<Edit20Regular />} disabled={!car} onClick={onEdit}>Editar</Button><Button appearance="secondary" onClick={onClose}>Fechar</Button></DrawerFooter>
  </Drawer>;
}
