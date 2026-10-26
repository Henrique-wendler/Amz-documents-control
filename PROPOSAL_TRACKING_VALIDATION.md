# Validação — Acompanhamento gerencial de propostas

Data: 26/10/2026.

## Escopo e baseline

- Repositório: `Henrique-wendler/Amz-documents-control`.
- Branch: `feature/proposal-approval-tracking`.
- Base: `origin/main`, atualizada por fetch, HEAD `5bf1e28ed603e412176eac5c001a2e01682dfb20`.
- Implementação em worktree isolado, pois o checkout original contém outro trabalho em andamento. Os arquivos desse checkout foram preservados.
- Somente web + Supabase. Nenhuma alteração no repositório `AmazonAgro-Propostas`, nos seus documentos/exportadores, parser BASA, catálogo, Drive, numeração ou instalador.
- Nenhum commit, push, merge ou migration em ambiente remoto/produção.

## Schema e migration

Nova migration: `supabase/migrations/202610260019_proposal_approval_tracking.sql`.
A sequência existente 001–018 foi preservada. Nenhuma migration antiga foi editada.

Nova tabela `public.operation_approval_tracking`:

| Coluna | Definição |
| --- | --- |
| `operation_id` | UUID, chave primária; no máximo um acompanhamento por operação |
| `organization_id` | UUID obrigatório, FK para a organização |
| `approval_deadline` | DATE nullable, finita; sem prazo automático |
| `approval_status` | `pending`, `approved`, `rejected`, `cancelled` |
| `approved_at`, `rejected_at`, `cancelled_at` | Timestamp da decisão atual, mantido pelo servidor; decisões anteriores preservadas no audit_log |
| `responsible_profile_id`, `technician_profile_id` | UUIDs nullable com FKs compostas organizacionais |
| `responsible_name_snapshot`, `technician_name_snapshot` | Nomes históricos, até 200 caracteres |
| `delay_reason`, `delay_notes` | Texto livre opcional, limites de 500/4.000 caracteres |
| `last_follow_up_at` | Atualizado pelo servidor ao salvar o acompanhamento |
| `desktop_proposal_id` | UUID nullable reservado para identificação futura; sem integração implementada |
| `created_at`, `created_by`, `updated_at`, `updated_by`, `version` | Metadata e versionamento seguindo os triggers existentes |

FK `(organization_id, operation_id)` referencia `operations(organization_id, id)`.
FKs dos participantes referenciam `profiles(organization_id, id)`; foi adicionada somente a constraint UNIQUE organizacional necessária em `profiles`.
Há índices para organização/prazo pendente, técnico e responsável.
Não foi criada uma segunda operação. Não existem colunas de valor, quantidade, dias de atraso ou booleano de atraso na tabela.
Os valores continuam exclusivamente em `operation_financials.amount`.
O status geral de `operations` não é alterado por aprovação/rejeição/cancelamento do acompanhamento.

A adoção é explícita pelo gestor: operações existentes sem acompanhamento aparecem em uma busca limitada a 20 resultados. Operações ainda não acompanhadas não são classificadas silenciosamente como propostas pendentes ou sem prazo.

## Regras oficiais

Timezone operacional: `America/Araguaina`, já usada pelo sistema.
A data do relatório é `(statement_timestamp() at time zone 'America/Araguaina')::date`, calculada no servidor.
O cliente não fornece organização nem data de referência da apuração.

```text
atrasada = approval_status = 'pending' AND approval_deadline < data_operacional

para pending com prazo:
  dias_atraso = max(data_operacional - approval_deadline, 0)
para os demais casos:
  dias_atraso = 0

valor_nao_ganho = SUM(operation_financials.amount)
                 somente das propostas atualmente atrasadas
```

- Prazo amanhã ou hoje: zero dias de atraso.
- Prazo ontem: um dia de atraso.
- 20/10/2026 → 26/10/2026: seis dias corridos.
- Prazo null: não atrasada; contabilizada em “Sem prazo definido” quando pending.
- Approved/rejected/cancelled: excluídas dos atrasos ativos e dos seus valores e agrupamentos.
- Aprovação registra `approved_at` e remove imediatamente a proposta do conjunto ativo em atraso.
- Timestamps refletem o status atual: pending deixa os três nulos; approved possui somente approved_at; rejected somente rejected_at; cancelled somente cancelled_at.
- Ao trocar de estado, o timestamp incompatível é limpo do registro atual, com valor anterior preservado no audit_log. Uma decisão nova recebe o timestamp do servidor; salvar observações sem trocar o estado preserva o timestamp da decisão.
- A constraint approval_tracking_status_timestamps_check impede combinações inválidas independentemente do trigger.
- Atualização parcial via RPC preserva os campos não informados. JSON null explícito pode limpar campo opcional. A versão esperada evita sobrescrita silenciosa.
- Nomes vinculados são obtidos de perfis da própria organização. Renomear um perfil não reescreve snapshots existentes; trocar o perfil captura o novo nome.
- Nenhum cálculo de juros, correção, multa, honorários, desconto ou receita.
- SUM usa NUMERIC PostgreSQL. Valores retornam como texto decimal; a apresentação monetária usa BigInt/Intl, preservando centavos inclusive em totais maiores que a faixa segura de Number.

## Permissões, RLS e auditoria

| Permissão | Admin | Manager | Operator | Viewer |
| --- | --- | --- | --- | --- |
| `proposal_tracking.read` | Sim | Sim | Não | Não |
| `proposal_tracking.manage` | Sim | Sim | Não | Não |
| `proposal_reports.read` | Sim | Sim | Não | Não |
| `proposal_reports.financial` | Sim | Sim | Não | Não |

- RLS habilitada, SELECT condicionado a `private.same_organization`, permissão de tracking/read/manage ou report/read e operação não excluída.
- Escrita direta REST não é concedida. Gravações passam pela RPC com validação de identidade, organização, permissão e versão.
- Funções SECURITY DEFINER usam `search_path=''` e referências qualificadas. Permissões públicas/anon são revogadas; somente as RPCs previstas recebem EXECUTE para authenticated.
- Helpers privados não ficam executáveis livremente; o helper necessário à policy SELECT recebe somente o grant requerido.
- Usuário sem `proposal_reports.read` recebe 42501 ao chamar as RPCs do dashboard, mesmo com permissões antigas de relatório ou permissão financeira isolada.
- A RPC financeira exige as duas permissões específicas: report/read para entrar e report/financial para incluir dinheiro. Sem a segunda, as chaves monetárias são omitidas dos KPIs, agrupamentos e linhas. O join financeiro também fica condicionado à autorização.
- `financial.read`, usado nas telas preexistentes de operações, não substitui `proposal_reports.financial`. Os acessos preexistentes dessas telas não foram alterados.
- Backend valida a organização do usuário autenticado; não aceita um organization_id do cliente para selecionar outro tenant.
- Auditoria integrada em `audit_log`, com ator, entidade, prazo, status, timestamps e vínculos. Alterações em texto livre e snapshots são sinalizadas como alteradas/redigidas, sem copiar seu conteúdo pessoal para o log.
- `created_at`/`created_by` preservados em update; `updated_at`/`updated_by` e version incrementados no servidor.

## RPCs e agregação

| RPC | Permissão | Resultado |
| --- | --- | --- |
| `proposal_tracking_report(p_filters, p_page, p_page_size)` | `proposal_reports.read` | KPIs, agrupamentos, detalhes paginados e contagem filtrada; dinheiro condicionado à permissão financeira específica |
| `proposal_tracking_options()` | `proposal_reports.read` | Bancos e vínculos históricos para filtros; perfis ativos para edição somente com tracking/manage |
| `proposal_tracking_operation_search(p_query)` | `proposal_tracking.manage` | Até 20 operações da organização ainda sem acompanhamento |
| `save_proposal_tracking(p_operation_id, p_expected_version, p_values)` | `proposal_tracking.manage` | Criação/atualização, controle de concorrência e auditoria |

Filtros e agregações são executados no PostgreSQL. A listagem aceita no máximo 100 linhas por página; a interface usa 25.
Ordenação: maior atraso primeiro, prazo, número e ID para desempate estável.

## Interface e arquitetura

Rota: `/acompanhamento-propostas`.
Menu: “Acompanhamento de Propostas”, visível somente com `proposal_reports.read`.
A página protege também acesso direto à rota; ausência do menu não é o controle de segurança do banco.
Usa Fluent UI e o layout, header, sidebar, SectionCard e KpiCard existentes.

```text
ProposalTrackingPage / TrackingEditor
  → proposalTrackingService
  → ProposalTrackingRepository
  → supabaseProposalTrackingRepository
  → RPCs Supabase
```

Components não importam o cliente Supabase ou seeds.

KPIs:
1. Propostas atrasadas.
2. Valor não ganho — “Valor total das operações em atraso.”
3. Atraso médio.
4. Maior atraso.
5. Sem prazo definido.

Agrupamentos independentes por técnico e responsável, sempre sobre atraso ativo.
Agrupamento usa perfil quando há ID e snapshot textual para vínculos externos/sem perfil. Nome de referência histórico é preservado.
Listagem: número/identificação, banco, finalidade, técnico, responsável, situação, prazo, dias, valor autorizado, motivo, última atualização e edição gerencial.
O schema atual de operations não possui proponente próprio: exibe-se a identificação existente, sem inventar nome ou duplicar cadastro.
A edição mostra prazo, situação, dois vínculos independentes e nomes históricos, motivo, observações e último acompanhamento.

Filtros:
- Data limite inicial/final, inclusivas;
- técnico;
- responsável;
- banco;
- situação;
- somente atrasadas;
- sem prazo;
- busca literal por número.

Estado inicial: pending, com e sem prazo; “Somente atrasadas” permite restringir o conjunto.
Todos os indicadores respeitam os filtros aplicados. Filtrar somente atrasadas implica zero no indicador sem prazo; combinar “Somente atrasadas” e “Sem prazo” produz conjunto vazio.
O período é do prazo, não da criação, e exclui linhas sem prazo quando preenchido.

Carregamento, vazio, erro, retry, acesso negado e conflitos de edição estão tratados. Usuário somente leitura não recebe ações de edição. Após salvar/aprovar, o relatório é recarregado.
Consultas obsoletas são descartadas; a busca de operações usa debounce e limite no servidor.
Tabelas possuem rolagem horizontal e os agrupamentos passam para uma coluna abaixo de 1.200px, preservando as demais telas.

## Validação executada

Ambiente: Windows; Node 24.19.0; Supabase CLI 2.116.0; PostgreSQL local 17.6.
Projeto local isolado: `proposal-tracking-qa`, API 55421, PostgreSQL 55422.
O projeto Supabase local anterior e seus dados não foram resetados.

| Validação | Resultado |
| --- | --- |
| Migrations 001–019, banco recriado desde zero | PASS |
| Banco: pgTAP, regras, RLS, permissões, isolamento, auditoria e integridade | 103 PASS |
| Frontend/service: Vitest + Testing Library, sem substituir Fluent UI por controles fictícios | 35 PASS |
| Total das suítes SQL/frontend | 138 PASS |
| Verificações adicionais via PostgREST HTTP real local | 21 PASS |
| `npm run build` | PASS |
| `npm run check:staging:static` | PASS |
| `git diff --check` | PASS |

Os testes SQL executam fixtures sintéticos dentro de transação com rollback. Ao final não permanecem registros de acompanhamento desses fixtures.

Cobertura SQL: amanhã/hoje/ontem, exemplo de seis dias, estados terminais, prazo null, soma de 1.750.000, ausência de encargos, dois agrupamentos, todos os filtros, paginação, atualização de aprovação, metadados, concorrência, IDs de outra organização, duas organizações, anonymous, operator, viewer, read-only, tracking-only, manage-only, permissão financeira isolada e permissão financeira antiga sem autorização do novo relatório. Confirma omissão de valores em todas as partes do JSON.

Cobertura frontend/service: KPIs, tabelas, filtros, loading/vazio/erro/retry, menu/rota negados, dados financeiros ausentes, leitura sem edição, gestor alterando prazo, adoção de operação, aprovação removendo resultado, conflito, paginação, descarte de resposta obsoleta, duas pessoas independentes, período inválido, moeda exata e apresentação de DATE sem mudança de dia.

### Reprodução local

Com Docker Desktop ativo e dependências instaladas:

```powershell
npm test
npm run test:proposal-tracking:db
npm run build
npm run check:staging:static
git diff --check
```

`test:proposal-tracking:db` prepara `.tmp/proposal-tracking-local`, copia a sequência de migrations, troca somente o identificador/portas da configuração local, inicia a instância separada, executa `supabase db reset --local` e `supabase test db`. O reset é exclusivamente desse projeto descartável.
Logs locais ignorados pelo Git: `.tmp/proposal-tracking-local/{start,reset,db-tests}.log`, `.tmp/frontend-tests-final.log`, `.tmp/build-final.log` e `.tmp/staging-final.log`. Logs de inicialização do Supabase podem conter credenciais locais geradas; não devem ser versionados nem publicados.

## Revisão final pré-commit — 26/10/2026

### Estado e limites

- Confirmados os mesmos 26 arquivos esperados: seis modificados e vinte novos, todos fora de staging.
- Branch e HEAD base continuam os indicados acima. As migrations 001–018 foram comparadas por SHA-256 e permaneceram idênticas.
- Nesta revisão foram alterados somente a migration 019 ainda não publicada, seu teste SQL e este relatório. Sem funcionalidade nova ou alteração no desktop.

### Correções encontradas

1. O trigger anterior conservava timestamps de decisões anteriores no registro corrente, permitindo pending com approved_at ou approved com rejected_at. O trigger passou a manter apenas o timestamp compatível com o status atual, com CHECK próprio. Os valores antigos continuam registrados no audit_log. Há regressões para reabertura, troca entre estados terminais, preservação do timestamp em simples acompanhamento e rejeição de combinações inválidas pelo CHECK mesmo com trigger desabilitado exclusivamente no fixture de teste.
2. O helper privado usado pela policy de leitura passou a validar explicitamente auth.uid(), organização e permissão de tracking/read/manage ou report/read. Um operator sem essas permissões não consegue consultar nem a existência de uma operação por esse helper.

### Resultado da revisão de segurança

- PK 1:1, organização obrigatória, FKs compostas, UNIQUE de apoio em profiles, índices de prazo e vínculos, CHECKs, metadados, versão, RLS e grants mínimos revisados.
- As quatro RPCs públicas SECURITY DEFINER usam search_path vazio e o guard central de auth.uid(), organização ativa do perfil e permissão explícita. Não existe organization_id controlado pelo cliente na seleção de dados.
- O helper da policy valida identidade, organização e permissões. Os triggers privados não têm EXECUTE para clientes; são alcançados pela escrita RPC validada. O helper privado que produz linhas financeiras não é executável por authenticated nem exposto no PostgREST.
- Escrita direta REST continua negada, preservando auditoria, metadata e controle de versão. As permissões padrão de admin/manager/operator/viewer foram revalidadas, assim como as barreiras do menu, rota e service/repository/RPC.
- Independência de técnico e responsável e a preservação dos snapshots foram revalidadas pelos testes SQL e frontend.
- Auditoria cobre prazo, status, timestamps, vínculos, motivo e observações. Texto livre/snapshots continuam redigidos na trilha; não há campos de valores financeiros na auditoria do acompanhamento.

### Inspeção de RPC real por HTTP

Foram usados somente usuários, organizações e operações sintéticos na instância local isolada, com JWTs de teste gerados em memória.

- Report/read sem report/financial: HTTP 200 e financial_access=false; nenhuma chave amount/overdue_amount_total em KPIs, grupos, linhas ou metadados/opções. Valores sentinela financeiros também ausentes do JSON bruto. O caso inclui permissão financeira antiga das operações, que não substitui a específica do novo relatório.
- Gestor autorizado: soma exata de R$ 1.750.000,00 sobre as três operações atrasadas.
- Segunda organização: somente sua própria operação no RPC e no SELECT REST protegido por RLS.
- Tentativa de editar operação de outra organização: HTTP 403 / 42501.
- Tentativa de escolher organization_id pelo filtro: HTTP 400.
- Operator, permissão financeira isolada sem report/read e read-only tentando gravar: HTTP 403.
- PATCH direto na tabela: HTTP 403; operator fazendo SELECT REST recebe zero linhas.
- Tentativa de chamar helper financeiro privado por RPC: HTTP 404, não exposto.

Evidências locais, ignoradas pelo Git:

- .tmp/precommit-review-20261026/http-security-report.json — 21 verificações PASS;
- .tmp/precommit-review-20261026/rpc-readonly.json — resposta bruta sem valores monetários;
- .tmp/precommit-review-20261026/rpc-manager.json — resposta financeira autorizada;
- .tmp/precommit-review-20261026/rpc-other-organization.json — resposta isolada da segunda organização;
- .tmp/precommit-review-20261026/http-cleanup-db-tests.log — fixtures removidos por reset isolado e suíte SQL 103 PASS repetida;
- .tmp/precommit-review-20261026/{frontend-tests,build,staging-static}.log — 35 testes frontend, build e staging PASS.

As evidências HTTP não contêm tokens, segredos ou chaves de acesso. Os logs locais de inicialização do Supabase continuam ignorados e não devem ser publicados.

A sequência 001–019 foi reaplicada desde zero; SQL 103 PASS, frontend 35 PASS, build PASS, staging estático PASS e git diff --check PASS. Nenhuma migration foi executada em produção. Exportação gerencial XLSX/PDF, integração desktop e QA manual em staging continuam pendentes.

## Limitações, riscos e próximos passos

1. Exportação gerencial XLSX/PDF fica para a próxima subetapa. O generate-report atual tem sete tipos fixos, modelos de filtros e regras financeiras próprias. A extensão deve reutilizar generate-report/report_log e as permissões novas, com testes próprios, sem um gerador paralelo no navegador.
2. Integração desktop → web não implementada. Futuro endpoint/Edge Function autenticado deverá usar identificador externo, deduplicação e reserva do número oficial no servidor para múltiplos desktops. Numeração local AAAA-NNNN pode colidir entre máquinas; não foi alterada aqui.
3. Migration e deploy remotos pendentes de revisão. Este relatório confirma testes locais; não confirma publicação em produção nem QA manual autenticado em staging.
4. Build informa chunk acima de 500kB. Otimização de bundle pode ser avaliada separadamente.
5. npm audit apontou dois alertas high em dependências de desenvolvimento: Vite 7.3.6 e source-map-js 1.2.1. Essas versões constam do package-lock no HEAD base e não foram atualizadas neste módulo; remediação precisa de etapa de manutenção própria.
6. Os testes podem emitir avisos de sourcemaps ausentes em pacotes Fluent UI/Griffel/Tabster. As bibliotecas reais foram carregadas e os testes passaram.
7. Nenhum defeito funcional identificado nos testes executados. QA manual da nova página em staging permanece pendente, após revisão e aplicação controlada da migration.

## Arquivos alterados

A lista abaixo inclui fonte, migration, testes e documentação; nenhum build, dado real, segredo, banco ou log é preparado para commit.

- `PROPOSAL_TRACKING_VALIDATION.md`
- `package-lock.json`
- `package.json`
- `scripts/staging/check-static-readiness.mjs`
- `scripts/test-proposal-tracking-local.mjs`
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/proposal-tracking/TrackingEditor.tsx`
- `src/components/proposal-tracking/TrackingGroups.tsx`
- `src/pages/ProposalTrackingPage.tsx`
- `src/repositories/proposalTrackingRepository.ts`
- `src/repositories/supabaseProposalTrackingRepository.ts`
- `src/services/proposalTrackingPresentation.ts`
- `src/services/proposalTrackingService.ts`
- `src/services/proposalTrackingServiceCore.ts`
- `src/styles/global.css`
- `src/types/proposalTracking.ts`
- `supabase/migrations/202610260019_proposal_approval_tracking.sql`
- `supabase/tests/proposal_approval_tracking.test.sql`
- `tests/ProposalTrackingPage.test.tsx`
- `tests/SidebarTracking.test.tsx`
- `tests/proposalTrackingPresentation.test.ts`
- `tests/proposalTrackingService.test.ts`
- `tests/setup.ts`
- `tests/trackingFixtures.ts`
- `vitest.config.ts`
