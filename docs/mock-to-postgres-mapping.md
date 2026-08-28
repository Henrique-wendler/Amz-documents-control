# Mapeamento MockStore → PostgreSQL

Este documento descreve compatibilidade futura. Nenhuma alteração foi feita no React, services, selectors, seeds ou MockStore.

| MockStore | PostgreSQL | Divergência relevante |
|---|---|---|
| `Owner` | `owners` | `type` vira `owner_type`; `document` vira `document_number`; banco acrescenta organização, autoria, versão e soft delete. |
| `Farm` | `farms` | Mesmos dados de negócio; banco acrescenta organização, autoria, versão e soft delete. |
| `Registration` | `registrations` | `farmId` vira FK; `hp` não foi modelado por estar pendente. |
| `OwnershipLink` | `ownership_links` | `co-owner` vira `co_owner`; banco valida soma concorrente, datas, tenant, versão e soft delete. |
| `Operation` | `operations` + `operation_registrations` + `operation_financials` | `farmId` deixa de ser relação exclusiva; `registrationId` passa a N:N; `bank` vira `institution_id`; `value` fica em tabela financeira; banco inclui `end_date` e `notes`. |
| `Guarantee` | `guarantees` + `guarantee_type_links` + `guarantee_registrations` + `guarantee_financials` | `type` e `registrationId` deixam de ser únicos; `bank` é derivado da operação; `value` é protegido em tabela financeira. |
| `GuaranteeItem` | `guarantee_items` | Estrutura equivalente, com tenant, autoria, versão e soft delete. |
| `RuralDocument` | `rural_documents` + `document_types` | `type` vira FK configurável; `exercise` vira `exercise_year`; validade é derivada; `cab` não foi modelado. |
| `DocumentAttachment` | `document_attachments` | Acrescenta storage type, MIME, checksum, status, autoria, versão e soft delete; referência não pode carregar credenciais. |
| `CarRecord` | `car_records` | `number` vira `car_number`; `ownerId` não vira FK: o modelo aprovado usa `declared_owner_name`; banco valida fazenda/matrícula. |
| `Activity` | `audit_log` e futura activity view | Mock armazena `userName` e ações de UI; banco registra `actor_user_id`, ação, diff redigido, request/context. Uma view de atividade amigável permanece futura. |

## Divergências transversais

- IDs atuais são strings sem garantia de UUID; a migração exigirá tabela de correspondência legado → UUID para preservar deep links e referências.
- O MockStore é mono-organização e não possui Auth/RLS; PostgreSQL torna `organization_id` obrigatório nas entidades sensíveis.
- Datas atuais são strings; precisam de validação e conversão distinta para `date` e `timestamptz`.
- Números JavaScript serão convertidos para `numeric`; parsing deve evitar arredondamento de dinheiro e área.
- O MockStore não possui `created_by`, `updated_by`, `version`, `deleted_at` ou `deleted_by`.
- Bancos, tipos documentais e tipos de garantia são texto no mock e viram catálogos/FKs.
- Contadores e ViewModels continuam derivados; não há colunas para totais de proprietários, matrículas, operações ou anexos.
- Status internos permanecem em inglês; a tradução para português continua sendo responsabilidade de apresentação.
- O futuro `SupabaseRepository` deve manter a cadeia `Component → Service → Selectors/ViewModels → Repository`, sem componentes consultando tabelas diretamente.

## Estratégia de migração futura

1. Congelar e validar uma cópia fictícia/anonimizada do MockStore.
2. Criar mapeamentos de IDs, catálogos e organização antes das entidades dependentes.
3. Migrar owners/farms/registrations/ownership; depois operações/garantias; por fim documentos/CAR.
4. Reconciliar percentuais, FKs, status, datas e duplicidades antes de ativar constraints.
5. Comparar selectors/ViewModels entre os dois repositórios em ambiente de development/staging.
6. Só substituir o MockStore após aceite explícito; não há dual-write definido neste pacote.

