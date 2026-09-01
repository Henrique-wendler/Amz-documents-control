# Estado da migração MockStore → PostgreSQL

O frontend opera temporariamente em modo híbrido durante a migração incremental. A arquitetura aprovada para módulos migrados é:

`Component → Service → Repository → Supabase`

Componentes não acessam o Supabase diretamente. Services mantêm as regras de aplicação, repositories encapsulam persistência e mapeamento `snake_case ↔ camelCase`, e nomes, contadores e relações enriquecidas continuam derivados.

## Estado atual aprovado

| Fonte | Módulos |
|---|---|
| Supabase local | Auth/MFA, profiles/permissions, Proprietários, Fazendas, Matrículas, OwnershipLinks, Documentos, referências de arquivos, CAR, Operações, Garantias e itens de garantia |
| MockStore | Relatórios e Dashboard |

Consulta Geral usa Supabase também para Operações e Garantias. Os Drawers imobiliários resolvem seus vínculos por UUID a partir dos repositories reais. Dashboard e Relatórios permanecem no MockStore nesta etapa. Não há dual-write.

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
- O MockStore é mono-organização e continua restrito aos módulos ainda não migrados. Supabase Auth, RLS e `organization_id` já protegem os módulos migrados.
- Datas atuais são strings; precisam de validação e conversão distinta para `date` e `timestamptz`.
- Números JavaScript serão convertidos para `numeric`; parsing deve evitar arredondamento de dinheiro e área.
- O MockStore não possui `created_by`, `updated_by`, `version`, `deleted_at` ou `deleted_by`.
- Bancos, tipos documentais e tipos de garantia são texto no mock e viram catálogos/FKs.
- Contadores e ViewModels continuam derivados; não há colunas para totais de proprietários, matrículas, operações ou anexos.
- Status internos permanecem em inglês; a tradução para português continua sendo responsabilidade de apresentação.
- Os repositories Supabase mantêm a cadeia aprovada `Component → Service → Repository → Supabase`, sem componentes consultando tabelas diretamente.

## Próximas etapas da migração

1. Manter os módulos já migrados exclusivamente no Supabase, sem fallback ou dual-write no MockStore.
2. Atualizar o Dashboard somente quando suas fontes restantes estiverem estabilizadas.
3. Migrar Relatórios somente após as fontes necessárias estarem estabilizadas.
4. Reconciliar IDs, FKs, status, datas e duplicidades antes de importar qualquer dado real.
5. Não criar dual-write nem novos mocks paralelos durante a transição.

## Pendências e ambiente local

- **HP permanece pendente:** não existe campo ou regra aprovada no PostgreSQL; o frontend não deve persistir valor alternativo.
- **CAB permanece pendente:** significado, entidade e regras ainda não foram definidos.
- Organizações fictícias inativadas são apenas resíduos identificados dos testes no Supabase local; não representam tenants reais nem dados de negócio.
- Antes da entrada de dados reais, o banco de desenvolvimento poderá ser recriado integralmente pelas migrations para remover resíduos locais e confirmar um estado limpo e reproduzível.
