import { supabaseCatalogAdministrationRepository } from "../repositories/supabaseCatalogAdministrationRepository";
import type { CatalogDraft, CatalogEntry, CatalogKind } from "../types/catalogAdministration";

const normalizeText = (value?: string) => value?.trim().replace(/\s+/g, " ") || undefined;

const normalizeDraft = (kind: CatalogKind, draft: CatalogDraft): CatalogDraft => {
  const name = normalizeText(draft.name);
  if (!name || name.length > 160) throw new Error("Informe um nome válido com até 160 caracteres.");

  const shortName = normalizeText(draft.shortName);
  if (shortName && shortName.length > 80) throw new Error("A sigla deve ter até 80 caracteres.");

  const code = normalizeText(draft.code)?.toLocaleUpperCase("pt-BR");
  if (code && code.length > 80) throw new Error("O código deve ter até 80 caracteres.");

  return {
    name,
    status: draft.status,
    shortName: kind === "financialInstitutions" ? shortName : undefined,
    code: kind === "documentTypes" ? code : undefined,
    requiresExpiration: kind === "documentTypes" ? Boolean(draft.requiresExpiration) : undefined,
  };
};

export const catalogAdministrationService = {
  list: () => supabaseCatalogAdministrationRepository.list(),

  create(kind: CatalogKind, draft: CatalogDraft) {
    return supabaseCatalogAdministrationRepository.create(kind, normalizeDraft(kind, draft));
  },

  update(entry: CatalogEntry, draft: CatalogDraft) {
    return supabaseCatalogAdministrationRepository.update(entry.kind, entry.id, entry.version, normalizeDraft(entry.kind, draft));
  },

  toggleStatus(entry: CatalogEntry) {
    return this.update(entry, {
      name: entry.name,
      shortName: entry.shortName,
      code: entry.code,
      requiresExpiration: entry.requiresExpiration,
      status: entry.status === "active" ? "inactive" : "active",
    });
  },
};
