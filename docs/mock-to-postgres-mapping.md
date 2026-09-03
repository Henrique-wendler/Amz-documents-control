# Estado da migração MockStore → PostgreSQL

O frontend concluiu a migração dos módulos funcionais para a arquitetura:

`Component → Service → Repository → Supabase`

Componentes não acessam o Supabase diretamente. Services mantêm as regras de aplicação, repositories encapsulam persistência e mapeamento `snake_case ↔ camelCase`, e nomes, contadores e relações enriquecidas continuam derivados.

## Estado atual aprovado

| Fonte | Módulos |
|---|---|
| Supabase local | Auth/MFA, profiles/permissions, Proprietários, Fazendas, Matrículas, OwnershipLinks, Documentos, referências de arquivos, CAR, Operações, Garantias, itens de garantia, Consulta Geral, Dashboard e Relatórios |
| MockStore | Removido do frontend |

Consulta Geral, Dashboard e Relatórios usam exclusivamente repositories reais. A Consulta monta um snapshot paginado das sete categorias; Dashboard e Relatórios agregam KPIs, alertas, previews e totais sem persistir valores derivados. Os Drawers imobiliários resolvem seus vínculos por UUID a partir dos repositories reais. Não há dual-write.

Supabase/PostgreSQL é a única fonte de dados de negócio. `src/data/mock/`, seus seeds, selectors e validator foram removidos depois da auditoria final de consumidores.

## Mapeamento histórico do legado removido

| Modelo legado | PostgreSQL | Divergência relevante |
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

- Os IDs de negócio ativos são UUIDs e preservam deep links e referências.
- A infraestrutura do MockStore foi removida; Supabase Auth, RLS e `organization_id` protegem todos os módulos funcionais.
- Datas usam conversão distinta para `date` civil e `timestamptz`.
- Valores JavaScript são mapeados para `numeric`, com parsing específico para dinheiro e área.
- O modelo PostgreSQL acrescenta autoria, `version` e soft delete às entidades editáveis.
- Bancos, tipos documentais e tipos de garantia são catálogos relacionais/FKs.
- Contadores e ViewModels continuam derivados; não há colunas para totais de proprietários, matrículas, operações ou anexos.
- Status internos permanecem em inglês; a tradução para português continua sendo responsabilidade de apresentação.
- Os repositories Supabase mantêm a cadeia aprovada `Component → Service → Repository → Supabase`, sem componentes consultando tabelas diretamente.
- Escritas compostas de Operações e Garantias usam RPCs PostgreSQL transacionais; entidade, financeiro e vínculos N:N não são persistidos parcialmente.

## Próximas etapas da migração

1. Manter todos os módulos exclusivamente no Supabase, sem fallback ou dual-write.
2. Manter KPIs e contadores do Dashboard derivados, sem colunas de totais persistidos.
3. Manter este documento apenas como histórico das decisões de migração.
4. Reconciliar IDs, FKs, status, datas e duplicidades antes de importar qualquer dado real.
5. Não criar dual-write nem novos mocks paralelos durante a transição.

## Pendências e ambiente local

- **HP permanece pendente:** não existe campo ou regra aprovada no PostgreSQL; o frontend não deve persistir valor alternativo.
- **CAB permanece pendente:** significado, entidade e regras ainda não foram definidos.
- Organizações fictícias inativadas são apenas resíduos identificados dos testes no Supabase local; não representam tenants reais nem dados de negócio.
- Antes da entrada de dados reais, o banco de desenvolvimento poderá ser recriado integralmente pelas migrations para remover resíduos locais e confirmar um estado limpo e reproduzível.
