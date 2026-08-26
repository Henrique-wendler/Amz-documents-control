import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
} from "@fluentui/react-components";
import { ArrowRight20Regular, Dismiss24Regular, Open20Regular } from "@fluentui/react-icons";
import type { SearchEntityType, SearchRecord } from "../../types/consulta";
import { StatusBadge } from "../StatusBadge";
import { ResultTypeBadge } from "./ResultTypeBadge";

interface SearchResultDrawerProps {
  record?: SearchRecord;
  open: boolean;
  onClose: () => void;
  onOpenRecord: (record: SearchRecord) => void;
  onRelation: (label: string) => void;
}

const detailFields: Record<SearchEntityType, Array<{ key: string; label: string }>> = {
  owner: [
    { key: "document", label: "CPF/CNPJ" },
    { key: "ownerType", label: "Tipo" },
    { key: "phone", label: "Telefone" },
    { key: "email", label: "E-mail" },
  ],
  farm: [
    { key: "municipality", label: "Município" },
    { key: "state", label: "Estado" },
    { key: "area", label: "Área total" },
    { key: "owner", label: "Proprietário principal" },
  ],
  registration: [
    { key: "farm", label: "Fazenda" },
    { key: "legalArea", label: "Área legal" },
    { key: "hp", label: "HP" },
    { key: "certificateDate", label: "Data da certidão" },
  ],
  operation: [
    { key: "farm", label: "Fazenda" },
    { key: "registration", label: "Matrícula" },
    { key: "bank", label: "Banco" },
    { key: "purpose", label: "Finalidade" },
    { key: "value", label: "Valor" },
    { key: "startDate", label: "Data de início" },
  ],
  guarantee: [
    { key: "operation", label: "Operação" },
    { key: "registration", label: "Matrícula" },
    { key: "bank", label: "Banco" },
    { key: "value", label: "Valor" },
    { key: "expiresAt", label: "Vencimento" },
  ],
  document: [
    { key: "number", label: "Número" },
    { key: "farm", label: "Fazenda" },
    { key: "documentType", label: "Tipo" },
    { key: "issuedAt", label: "Emissão" },
    { key: "validUntil", label: "Validade" },
  ],
  car: [
    { key: "farm", label: "Fazenda" },
    { key: "owner", label: "Proprietário" },
    { key: "receipt", label: "Número do recibo" },
  ],
};

export function SearchResultDrawer({ record, open, onClose, onOpenRecord, onRelation }: SearchResultDrawerProps) {
  return (
    <Drawer className="search-result-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={(
            <Button appearance="subtle" aria-label="Fechar detalhes" icon={<Dismiss24Regular />} onClick={onClose} />
          )}
        >
          Detalhes do registro
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {record ? (
          <div className="drawer-record">
            <div className="drawer-record__identity">
              <ResultTypeBadge type={record.entityType} />
              <h2>{record.title}</h2>
              <p>{record.reference}</p>
              <StatusBadge status={record.status} />
            </div>

            <section className="drawer-record__section">
              <h3>Informações principais</h3>
              <dl className="drawer-record__details">
                {detailFields[record.entityType].map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>{record.attributes[field.key] ?? "—"}</dd>
                  </div>
                ))}
                <div><dt>Situação</dt><dd>{record.status}</dd></div>
                <div><dt>Última atualização</dt><dd>{record.updatedAt}</dd></div>
              </dl>
            </section>

            <section className="drawer-record__section">
              <h3>Vínculos</h3>
              <div className="drawer-relations">
                {record.relations.map((relation) => (
                  <button type="button" key={`${relation.label}-${relation.value}`} onClick={() => onRelation(`${relation.label}: ${relation.value}`)}>
                    <span><strong>{relation.label}</strong><small>{relation.value}</small></span>
                    <ArrowRight20Regular aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </DrawerBody>
      <DrawerFooter>
        <Button appearance="primary" icon={<Open20Regular />} disabled={!record} onClick={() => { if (record) onOpenRecord(record); }}>
          Abrir cadastro
        </Button>
        <Button appearance="secondary" onClick={onClose}>Fechar</Button>
      </DrawerFooter>
    </Drawer>
  );
}
