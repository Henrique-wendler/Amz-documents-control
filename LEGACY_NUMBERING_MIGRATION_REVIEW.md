# Revisão de migração dos legados nunca sincronizados

## Inspeção anterior à alteração

A migration 026 já protegia concorrência, idempotência e identidade dos números centrais. O guard de sync recusava um legado desconhecido com PN404/proposal_number_not_reserved. A conciliação explícita ainda não existia. O teste central existente confirmava esse bloqueio; não foi removido nem transformado em claim automático.
A 026 já aplicada não foi editada. Nenhuma alteração foi feita nas migrations 001–026.

## Política final

A identidade é sempre organização + sync_id; número humano não identifica nem conecta duas propostas. O claim é uma ação administrativa explícita, depois do inventário de todos os PCs, e utiliza a permission real desktop_proposals.sync existente (hoje admin/manager), Auth real, sessão ativa AAL2 e profile/role/organização ativos. Não há grants individuais nem nova matriz.

| Caso | Comportamento |
|---|---|
| Número válido e livre, UUID válido e data conhecida/coerente | Registrar exatamente o número histórico; nunca obter outro número |
| Mesmo UUID, mesmo número e mesma criação | Retornar a reserva existente; nenhum contador/evento/proposta adicional |
| Mesmo número, UUID diferente | HTTP 409 legacy_proposal_number_conflict; nenhuma substituição/associação/merge |
| Mesmo UUID, número ou criação diferente | Mesmo conflito explícito; não mudar identidade |
| Cópia entre PCs com mesmo UUID e número | Claim idempotente; sync normal cria somente uma operação |
| Organizações diferentes | Reservas independentes, sem leitura/associação cross-tenant |
| Número inválido/fora do padrão, UUID ausente/inválido, data ausente/sem timezone | Inventariar e exigir revisão; API recusa; não inventar número/UUID/data |
| Ano incompatível com criação em America/Araguaina | 409 legacy_proposal_year_mismatch para identidade ainda desconhecida |
| Histórico já canônico no servidor | Backfill/grandfathering existentes preservados; não precisa de novo claim. Claim repetido só confirma identidade conhecida |

Uma ausência de confirmação local não prova que o servidor nunca recebeu a proposta (resposta pode ter sido perdida). O inventário informa already_synchronized=true quando há evidência local, ou null/desconhecido quando não há; backend_confirmation_required sinaliza essa incerteza.
Históricos sem data confiável ou com número inválido não são corrigidos por esta ferramenta. Precisam de decisão e procedimento administrativo próprios, com evidência histórica; a data atual nunca é usada como fallback. Continuam disponíveis localmente e os históricos numerados mantêm sua exportação anterior.

## Alteração necessária

Migration **202610290027_legacy_proposal_number_claims.sql**:

- permite origin=legacy_claim na reserva existente;
- cria RPC service-role-only claim_legacy_proposal_number(actor, sync_id, proposal_number, created_at);
- reutiliza private.proposal_number_actor e as mesmas advisory transaction locks da 026: organização/UUID e depois organização/ano;
- verifica ocupação por reservas, desktop_proposals e operations. Operação manual com mesmo número gera conflito, nunca associação;
- contador recebe GREATEST(last_value, sequência legada), na mesma transação da reserva/audit;
- o guard do sync mantém os mesmos 13 campos e passa a proteger também created_at de legacy_claim;
- nenhuma linha de proposta, operação ou snapshot é atualizada pelo claim.

Claim histórico abaixo do piso reconhece uma identidade que já existia; não representa nova atribuição de um buraco. Reserva central continua sempre após o maior número consumido. Exemplo: piso0055 + claim0087 → próxima0088; claim0030 nunca reduz o piso. Reservas abandonadas não podem ser excluídas/reutilizadas.

Nova Edge **claim-legacy-proposal-number**, POST JSON estrito:

```json
{"sync_id":"123e4567-e89b-42d3-a456-426614174000","proposal_number":"2026-0015","created_at":"2026-10-29T12:00:00-03:00"}
```

Nenhum organization_id, ator, role ou sequência do cliente é aceito. Org/ator vêm da sessão. Limite de corpo, rate limit, CORS canônico e respostas sem cache/detalhes SQL seguem os guards existentes. Retorno inclui apenas a identidade/reserva e origin. Auditoria PROPOSAL_LEGACY_NUMBER_CLAIMED registra ator, org, UUID, número, datas e source=legacy_migration, sem financeiro/credenciais. Retry não duplica evento.
O método desktop HttpProposalSyncClient.claim_legacy(job) é explícito e verifica que a resposta mantém o número, UUID, tenant e criação. Não é chamado pela sincronização automática. Não há botão de migração em lote na UI nesta etapa.

## Procedimento obrigatório para vários computadores

### Fase A — congelar e inventariar todos

1. Enumerar todos os PCs/bancos, incluindo cópias, backups que podem voltar a uso e bases de organizações diferentes.
2. Manter sync normal desativado e pausar criação/edição durante a janela de inventário/conciliação. Fechar o aplicativo em todos os PCs.
3. Fazer backup consistente de cada banco e preservar documentos exportados. Não copiar sessões DPAPI entre computadores.
4. Em cada PC, executar a ferramenta abaixo na base fechada e checkpointed. Ela não executa migração nem atribui UUIDs.
5. Se houver WAL/journal pendente, resolver pelo procedimento normal de fechamento/recuperação, mantendo backup; a ferramenta não faz checkpoint, apaga ou ignora WAL.

### Fase B — comparar identidades

Separar inventários por organização antes de comparar. Registrar explicitamente o tenant de destino para bases ainda não vinculadas. Comparar números e sync_ids; nome de cliente, número ou semelhança de valores nunca autorizam merge.

Para bases sem sync_id: não abrir cópias indistintamente para backfill independente. Identificar documentalmente a cópia canônica, executar a migração existente de UUID uma única vez sob backup e propagar somente cópias comprovadas dessa base migrada, sem sobrepor bases distintas. Se cópias já receberam UUIDs diferentes, tratá-las como conflito até decisão explícita; não substituir UUIDs automaticamente.

### Fase C — resolver bloqueios

Separar conflitos de número, UUID com números diferentes, datas ausentes/incoerentes e números inválidos. Mesmo número com UUIDs diferentes não é uma mesma proposta. Cópias com mesmo UUID exigem revisão de possíveis edições divergentes antes de usar o sync normal. Guardar a decisão humana e a evidência; nenhuma ferramenta deste bloco altera identidades.

### Fase D — claims explícitos e verificáveis

Um operador autorizado com sessão AAL2 usa o endpoint/método acima em um cliente administrativo que mantenha credenciais somente em memória/DPAPI. Enviar apenas as identidades válidas aprovadas no inventário, uma por vez ou em lote controlado; não colar tokens em comandos/histórico ou relatórios.
Comparar cada resposta com UUID, número, criação e organização esperados. Retry/restart repete exatamente o mesmo pedido. Diante de 409, interromper aquela identidade e voltar à revisão; não pedir número novo. Não editar diretamente tabela/SQLite para contornar conflito.
O claim não altera o banco local. Após confirmação, o cliente pode sincronizar os 13 metadados já existentes usando o mesmo número. Revalidar a lista aprovada contra a base antes de cada envio; nenhuma proposta criada/editada fora da janela deve ser incluída silenciosamente.

### Fase E — ativação controlada

Somente depois de inventários de todos os PCs, conflitos resolvidos e claims conferidos: autorizar configuração normal por tenant, validar save/reopen/export de legados e ativar sync/numeração central gradualmente. Novos drafts sem número usam somente a reserva central. Repetir inventário se uma base antiga voltar a uso. Esta revisão não ativa produção.

## Inventário somente leitura

No repositório desktop (com aplicativo fechado):

```powershell
& .venv-build/Scripts/python.exe scripts/inventory_legacy_proposals.py --output C:/QA/PC-A.json inventory C:/QA/proposals.sqlite3 --confirm-app-closed --computer-label PC-A
& .venv-build/Scripts/python.exe scripts/inventory_legacy_proposals.py --output C:/QA/comparacao.json compare C:/QA/PC-A.json C:/QA/PC-B.json
```

Os caminhos são exemplos de operação escolhidos pelo responsável, não configuração fixa. O diretório de saída deve existir e o arquivo ser novo; a ferramenta nunca substitui arquivos existentes.
Abre SQLite com mode=ro&immutable=1, query_only e trusted_schema=OFF; exige integridade e ausência de WAL/journal não vazio; confere SHA-256 antes/depois. Só lê IDs, número, criação e evidência técnica de sync. Não lê campos de proponente/documentos/financeiro para o relatório, não abre ORM, não modifica schema e não acessa rede. A validação de ano oficial é sempre feita pelo PostgreSQL em America/Araguaina, sem supor timezone do Windows.

## Validação

Resultados locais e de staging serão registrados ao concluir a revisão. Nenhum commit, push, PR, Setup ou alteração em produção faz parte desta etapa.

## Resultados finais da revisão — 2026-10-29

- Desktop: **655 testes PASS**, sem falhas/skips (22 regressões acrescentadas: inventário e cliente de claim).
- Backend: **530 testes PASS** = 59 frontend + 172 Node + 299 SQL (75 acrescentados: 42 contrato Edge + 33 SQL).
- Build web, staging static e git diff --check: PASS. Nenhum npm executado no desktop.
- HTTP local com Auth/MFA reais: **33 verificações PASS**; 50 claims distintos, disputa pelo mesmo número e cópia idempotente.
- Staging **iglciwizbxtkfwlboihe**: **39 verificações PASS**; 50/50 claims HTTP200, um vencedor na disputa de UUIDs diferentes e nenhum número novo em retry/cópia.
- Somente migration **202610290027** aplicada; migrations 001–026 permanecem byte a byte iguais aos arquivos anteriores à revisão.
- SHA-256 da 027 aplicada: `0edc87b2ec01749f2ca37aaa4fba2b431bce62ba7bc8150fa04cafce764acbf0`.
- Somente **claim-legacy-proposal-number v1 ACTIVE** publicada. Reserve-proposal-number continua v1, sync-desktop-proposal continua v2; seus handlers não foram redeployados. O guard SQL de sync foi estendido na 027.
- Antes/depois da migration e depois do E2E: **9 propostas, 106 reservas e 8 sequências anteriores** mantiveram exatamente suas impressões digitais.
- Duas cópias reais de banco SQLite com número **2026-0900** e mesmo UUID: claim não alterou um byte dos arquivos; restart + sync preservaram todos os dados de proposta/participantes/propriedades/parcelas e criaram uma única proposta canônica. Próxima reserva central: **2026-0901**.
- Integridade final global: zero duplicados, divergências de identidade e órfãos de operação/financeiro/acompanhamento.
- Fixtures sintéticas aposentadas: organizações e profiles inativos, usuários técnicos bloqueados e zero sessões restantes. As **60 reservas** desta rodada ficam consumidas como evidência em tenants QA inativos. Nenhuma conta humana/MFA existente foi alterada.
- Evidências técnicas sem credenciais: `.tmp/legacy-review/staging-deployment.json`, `staging-final-integrity.json`, `pytest`/Node/SQL/HTTP logs; relatório HTTP em `.tmp/central-numbering-staging/legacy-claims-report.json`.
- Produção, Vercel, templates, parser, regras financeiras e documentos reais intocados. Nenhum segredo persistido. Nenhum Setup, PR, commit ou push.

## Cobertura solicitada

1–10: claim livre, retry/cópia, conflitos por número/UUID/criação, tenants, inválidos/ano e piso maior/menor: SQL + Edge + HTTP.
11–12: 50 claims distintos e disputa do mesmo número: HTTP real local/staging.
13–16: claim seguido de sync, restart SQLite, offline/inventário e identidade já sincronizada: suíte desktop, SQL e E2E com duas cópias.
17–20: audit, RLS, AAL1, sessão revogada e permission: SQL/contrato/HTTP real.
Backfill UUID preexistente permanece coberto na suíte desktop; inventário também lê schema anterior ao backfill sem executá-lo.

## Arquivos desta revisão

Modificados em relação ao checkpoint anterior:

- `CENTRAL_NUMBERING_VALIDATION.md`
- `scripts/test-central-proposal-numbering-http.mjs`
- `package.json`
- `scripts/staging/check-static-readiness.mjs`
- `scripts/test-desktop-proposal-sync-local.mjs`
- `supabase/config.toml`

Novos nesta revisão:

- `LEGACY_NUMBERING_MIGRATION_REVIEW.md`
- `scripts/qa/legacy-proposal-number-claims.mjs`
- `scripts/test-legacy-proposal-number-claims.mjs`
- `supabase/functions/claim-legacy-proposal-number/handler.ts`
- `supabase/functions/claim-legacy-proposal-number/index.ts`
- `supabase/migrations/202610290027_legacy_proposal_number_claims.sql`
- `supabase/tests/legacy_proposal_number_claims.test.sql`

## Git final

Branch `feature/central-proposal-numbering`, HEAD `9af66e5dcd3b10cbe4aa82d5e8cfddb5cf192f4f`. Alterações apenas locais, nada staged. Commits=ZERO; pushes=ZERO. O status inclui também a implementação central anterior ainda não commitada.

```text
M package.json
 M scripts/staging/check-static-readiness.mjs
 M scripts/test-desktop-proposal-sync-local.mjs
 M supabase/config.toml
 M supabase/functions/_shared/authenticatedContext.ts
 M supabase/functions/sync-desktop-proposal/contract.ts
 M supabase/functions/sync-desktop-proposal/handler.ts
 M supabase/functions/sync-desktop-proposal/index.ts
 M supabase/tests/desktop_proposal_sync.test.sql
?? CENTRAL_NUMBERING_VALIDATION.md
?? LEGACY_NUMBERING_MIGRATION_REVIEW.md
?? scripts/qa/legacy-proposal-number-claims.mjs
?? scripts/test-central-proposal-numbering-http.mjs
?? scripts/test-central-proposal-numbering.mjs
?? scripts/test-legacy-proposal-number-claims.mjs
?? supabase/functions/claim-legacy-proposal-number/
?? supabase/functions/reserve-proposal-number/
?? supabase/migrations/202610290026_central_proposal_numbering.sql
?? supabase/migrations/202610290027_legacy_proposal_number_claims.sql
?? supabase/tests/central_proposal_numbering.test.sql
?? supabase/tests/legacy_proposal_number_claims.test.sql
```
