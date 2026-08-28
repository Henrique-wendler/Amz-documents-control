import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { ArrowRight20Regular, Dismiss24Regular, Edit20Regular } from "@fluentui/react-icons";
import type { OwnerWithRelations } from "../../types/proprietario";
import { StatusBadge } from "../StatusBadge";

interface OwnerDetailsDrawerProps {
  record?: OwnerWithRelations;
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRelation: (message: string) => void;
}

export function OwnerDetailsDrawer({ record, open, canEdit, onClose, onEdit, onRelation }: OwnerDetailsDrawerProps) {
  const owner = record?.owner;
  return (
    <Drawer className="search-result-drawer owner-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar detalhes" icon={<Dismiss24Regular />} onClick={onClose} />}>Detalhes do proprietário</DrawerHeaderTitle></DrawerHeader>
      <DrawerBody>
        {owner ? <div className="drawer-record">
          <div className="drawer-record__identity">
            <span className="owner-type-label">{owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica"}</span>
            <h2>{owner.name}</h2>
            <p>{owner.document}</p>
            <StatusBadge status={owner.status === "active" ? "Ativo" : "Inativo"} />
          </div>
          <section className="drawer-record__section">
            <h3>Informações principais</h3>
            <dl className="drawer-record__details">
              <div><dt>CPF/CNPJ</dt><dd>{owner.document}</dd></div>
              <div><dt>Tipo</dt><dd>{owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica"}</dd></div>
              <div><dt>Telefone</dt><dd>{owner.phone || "—"}</dd></div>
              <div><dt>E-mail</dt><dd>{owner.email || "—"}</dd></div>
              <div><dt>Matrículas vinculadas</dt><dd>{owner.registrationCount}</dd></div>
              <div><dt>Operações vinculadas</dt><dd>{owner.operationCount}</dd></div>
            </dl>
          </section>
          <section className="drawer-record__section">
            <h3>Fazendas vinculadas</h3>
            {record?.farms.length ? <div className="drawer-relations">{record.farms.map((farm) => (
              <button type="button" key={farm.id} onClick={() => onRelation(`${farm.name} · ${farm.location}`)}>
                <span><strong>{farm.name}</strong><small>{farm.location} · {farm.area}</small></span><ArrowRight20Regular aria-hidden="true" />
              </button>
            ))}</div> : <p className="owner-drawer__empty">Nenhuma fazenda vinculada a este cadastro.</p>}
          </section>
          <section className="drawer-record__section">
            <h3>Observações</h3><p className="owner-drawer__notes">{owner.notes || "Nenhuma observação registrada."}</p>
          </section>
          <section className="drawer-record__section">
            <h3>Auditoria</h3>
            <dl className="drawer-record__details"><div><dt>Cadastrado em</dt><dd>{owner.createdAt}</dd></div><div><dt>Atualizado em</dt><dd>{owner.updatedAt}</dd></div></dl>
          </section>
        </div> : null}
      </DrawerBody>
      <DrawerFooter>{canEdit ? <Button appearance="primary" icon={<Edit20Regular />} disabled={!owner} onClick={onEdit}>Editar</Button> : null}<Button appearance="secondary" onClick={onClose}>Fechar</Button></DrawerFooter>
    </Drawer>
  );
}
