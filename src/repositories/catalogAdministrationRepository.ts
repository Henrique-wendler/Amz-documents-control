import type { CatalogAdministrationData, CatalogDraft, CatalogEntry, CatalogKind } from "../types/catalogAdministration";

export interface CatalogAdministrationRepository {
  list(): Promise<CatalogAdministrationData>;
  create(kind: CatalogKind, draft: CatalogDraft): Promise<CatalogEntry>;
  update(kind: CatalogKind, id: string, expectedVersion: number, draft: CatalogDraft): Promise<CatalogEntry>;
}

export class CatalogConcurrencyError extends Error {
  constructor() {
    super("Este catálogo foi alterado por outro usuário. Atualize os dados antes de salvar novamente.");
    this.name = "CatalogConcurrencyError";
  }
}
