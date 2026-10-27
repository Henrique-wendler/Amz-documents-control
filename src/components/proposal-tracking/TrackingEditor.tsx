import { useEffect, useState } from "react";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@fluentui/react-components";
import {
  approvalLabels,
  trackingDate,
} from "../../services/proposalTrackingPresentation";
import { emptyTrackingDraft } from "../../services/proposalTrackingServiceCore";
import { proposalTrackingService } from "../../services/proposalTrackingService";
import type {
  ApprovalStatus,
  TrackingAccess,
  TrackingDraft,
  TrackingEntry,
  TrackingOption,
} from "../../types/proposalTracking";
interface Props {
  entry?: TrackingEntry;
  profiles: TrackingOption[];
  access: TrackingAccess;
  onClose: () => void;
  onSaved: () => void;
}
export function TrackingEditor({
  entry,
  profiles,
  access,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<TrackingDraft>(
    entry ?? emptyTrackingDraft(),
  );
  const [operationId, setOperationId] = useState(entry?.operationId ?? "");
  const [operations, setOperations] = useState<TrackingOption[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (entry) return;
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      proposalTrackingService
        .searchOperations(query, access)
        .then((result) => {
          if (active) setOperations(result);
        })
        .catch(() => {
          if (active) setError("Não foi possível buscar as operações.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [entry, query, access]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await proposalTrackingService.save(
        operationId,
        entry?.version ?? null,
        draft,
        access,
      );
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar o acompanhamento.",
      );
    } finally {
      setSaving(false);
    }
  };
  const peopleField = (kind: "technician" | "responsible", label: string) => {
    const idField =
      kind === "technician" ? "technicianProfileId" : "responsibleProfileId";
    const nameField =
      kind === "technician" ? "technicianName" : "responsibleName";
    return (
      <div className="tracking-person-field">
        <Field label={label}>
          <Select
            value={draft[idField]}
            onChange={(_, data) =>
              setDraft((current) => ({
                ...current,
                [idField]: data.value,
                [nameField]:
                  profiles.find((p) => p.id === data.value)?.name ??
                  current[nameField],
              }))
            }
          >
            <option value="">Sem vínculo com perfil</option>
            {draft[idField] &&
              !profiles.some((p) => p.id === draft[idField]) && (
                <option value={draft[idField]}>
                  {draft[nameField]} (perfil original)
                </option>
              )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={`Nome de referência — ${label.toLocaleLowerCase("pt-BR")}`}
        >
          <Input
            value={draft[nameField]}
            disabled={Boolean(draft[idField])}
            maxLength={200}
            onChange={(_, data) =>
              setDraft((current) => ({ ...current, [nameField]: data.value }))
            }
          />
        </Field>
      </div>
    );
  };
  return (
    <Drawer
      className="search-result-drawer"
      type="overlay"
      position="end"
      size="medium"
      open
      onOpenChange={(_, data) => {
        if (!data.open && !saving) onClose();
      }}
    >
      <DrawerHeader>
        <DrawerHeaderTitle>
          {entry
            ? `Acompanhamento ${entry.operationNumber}`
            : "Adicionar acompanhamento"}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form
          id="proposal-tracking-form"
          className="tracking-editor"
          onSubmit={submit}
        >
          {!entry && (
            <>
              <Field
                label="Buscar operação por número"
                hint="Até 20 operações sem acompanhamento. Refine a busca se necessário."
              >
                <Input
                  value={query}
                  maxLength={100}
                  onChange={(_, data) => {
                    setQuery(data.value);
                    setOperationId("");
                  }}
                />
              </Field>
              <Field label="Operação existente" required>
                <Select
                  value={operationId}
                  disabled={searching}
                  onChange={(_, data) => setOperationId(data.value)}
                >
                  <option value="">
                    {searching ? "Buscando…" : "Selecione a operação"}
                  </option>
                  {operations.map((operation) => (
                    <option key={operation.id} value={operation.id}>
                      {operation.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field
            label="Data limite para aprovação"
            hint="Sem data, a proposta não será considerada atrasada."
          >
            <Input
              type="date"
              value={draft.approvalDeadline}
              onChange={(_, data) =>
                setDraft((current) => ({
                  ...current,
                  approvalDeadline: data.value,
                }))
              }
            />
          </Field>
          <Field label="Situação da aprovação">
            <Select
              value={draft.approvalStatus}
              onChange={(_, data) =>
                setDraft((current) => ({
                  ...current,
                  approvalStatus: data.value as ApprovalStatus,
                }))
              }
            >
              {Object.entries(approvalLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {peopleField("technician", "Técnico")}
          {peopleField("responsible", "Responsável")}
          <Field label="Motivo do atraso">
            <Input
              value={draft.delayReason}
              maxLength={500}
              onChange={(_, data) =>
                setDraft((current) => ({ ...current, delayReason: data.value }))
              }
            />
          </Field>
          <Field label="Observações do acompanhamento">
            <Textarea
              value={draft.delayNotes}
              maxLength={4000}
              resize="vertical"
              onChange={(_, data) =>
                setDraft((current) => ({ ...current, delayNotes: data.value }))
              }
            />
          </Field>
          <p>
            Ao salvar, a data do último acompanhamento será atualizada. Os nomes
            de referência preservam o histórico.
          </p>
          {entry && (
            <p>
              Último acompanhamento: {trackingDate(entry.lastFollowUpAt ?? "")}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button
          appearance="primary"
          type="submit"
          form="proposal-tracking-form"
          disabled={saving || (!entry && !operationId)}
        >
          {saving ? "Salvando…" : "Salvar acompanhamento"}
        </Button>
        <Button disabled={saving} onClick={onClose}>
          Cancelar
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}
