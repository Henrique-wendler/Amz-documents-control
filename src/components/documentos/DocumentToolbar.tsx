import { useState } from "react";
import { Button, Dropdown, Field, Input, Option, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { Add20Regular, Filter20Regular, Search20Regular } from "@fluentui/react-icons";
import type { DocumentFilters, DocumentOption } from "../../types/documento";

interface Props { query: string; value: DocumentFilters; types: string[]; farms: DocumentOption[]; registrations: DocumentOption[]; hasActiveFilters: boolean; onQueryChange: (value: string) => void; onChange: React.Dispatch<React.SetStateAction<DocumentFilters>>; onClear: () => void; onNew: () => void; }
const labelFor = (options: DocumentOption[], id: string, fallback: string) => options.find((item) => item.id === id)?.label ?? fallback;

export function DocumentToolbar({ query, value, types, farms, registrations, hasActiveFilters, onQueryChange, onChange, onClear, onNew }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const set = <K extends keyof DocumentFilters>(key: K, next: DocumentFilters[K]) => onChange((current) => ({ ...current, [key]: next, page: 1 }));
  return <div className="document-toolbar">
    <Field className="document-toolbar__search" label="Busca"><Input value={query} contentBefore={<Search20Regular />} placeholder="Buscar por tipo, número, fazenda, matrícula ou finalidade" onChange={(_, data) => onQueryChange(data.value)} /></Field>
    <Field label="Tipo"><Dropdown value={value.type || "Todos os tipos"} selectedOptions={[value.type]} onOptionSelect={(_, data) => set("type", data.optionValue ?? "")}><Option value="">Todos os tipos</Option>{types.map((type) => <Option key={type} value={type}>{type}</Option>)}</Dropdown></Field>
    <Field label="Situação"><Dropdown value={{ all: "Todas", active: "Vigente", expiring: "A vencer", expired: "Vencido", inactive: "Inativo" }[value.status]} selectedOptions={[value.status]} onOptionSelect={(_, data) => set("status", (data.optionValue ?? "all") as DocumentFilters["status"])}><Option value="all">Todas</Option><Option value="active">Vigente</Option><Option value="expiring">A vencer</Option><Option value="expired">Vencido</Option><Option value="inactive">Inativo</Option></Dropdown></Field>
    <Field label="Fazenda"><Dropdown value={labelFor(farms, value.farmId, "Todas as fazendas")} selectedOptions={[value.farmId]} onOptionSelect={(_, data) => { const farmId = data.optionValue ?? ""; onChange((current) => ({ ...current, farmId, registrationId: current.registrationId && registrations.find((item) => item.id === current.registrationId)?.farmId !== farmId ? "" : current.registrationId, page: 1 })); }}><Option value="">Todas as fazendas</Option>{farms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.label}</Option>)}</Dropdown></Field>
    <Popover open={advancedOpen} onOpenChange={(_, data) => setAdvancedOpen(data.open)} positioning="below-end"><PopoverTrigger disableButtonEnhancement><Button appearance={hasActiveFilters ? "primary" : "secondary"} icon={<Filter20Regular />}>Mais filtros</Button></PopoverTrigger><PopoverSurface className="document-advanced-filter"><div className="document-advanced-filter__heading"><strong>Filtros avançados</strong><span>Refine por vínculo, exercício, finalidade e vencimento</span></div><div className="document-advanced-filter__grid">
      <Field label="Matrícula"><Dropdown value={labelFor(registrations, value.registrationId, "Todas as matrículas")} selectedOptions={[value.registrationId]} onOptionSelect={(_, data) => set("registrationId", data.optionValue ?? "")}><Option value="">Todas as matrículas</Option>{registrations.filter((item) => !value.farmId || item.farmId === value.farmId).map((item) => <Option key={item.id} value={item.id}>{item.label}</Option>)}</Dropdown></Field>
      <Field label="Exercício"><Input value={value.exercise} placeholder="Ex.: 2026" onChange={(_, data) => set("exercise", data.value)} /></Field>
      <Field label="Finalidade"><Input value={value.purpose} placeholder="Contém..." onChange={(_, data) => set("purpose", data.value)} /></Field>
      <Field label="Arquivos"><Dropdown value={{ all: "Todos", with: "Com arquivo", without: "Sem arquivo" }[value.attachmentRelation]} selectedOptions={[value.attachmentRelation]} onOptionSelect={(_, data) => set("attachmentRelation", (data.optionValue ?? "all") as DocumentFilters["attachmentRelation"])}><Option value="all">Todos</Option><Option value="with">Com arquivo</Option><Option value="without">Sem arquivo</Option></Dropdown></Field>
      <Field label="Vencimento"><Dropdown value={value.expirationWindow === "all" ? "Qualquer data" : `Próximos ${value.expirationWindow} dias`} selectedOptions={[value.expirationWindow]} onOptionSelect={(_, data) => set("expirationWindow", (data.optionValue ?? "all") as DocumentFilters["expirationWindow"])}><Option value="all">Qualquer data</Option><Option value="30">Próximos 30 dias</Option><Option value="60">Próximos 60 dias</Option><Option value="90">Próximos 90 dias</Option></Dropdown></Field>
    </div><Button appearance="subtle" disabled={!hasActiveFilters} onClick={() => { onClear(); setAdvancedOpen(false); }}>Limpar todos os filtros</Button></PopoverSurface></Popover>
    <Button className="document-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={onNew}>Novo documento</Button>
  </div>;
}

