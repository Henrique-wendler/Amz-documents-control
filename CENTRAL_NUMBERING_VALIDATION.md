# Numeração central de propostas

Branch: `feature/central-proposal-numbering`.
Base WEB: `9af66e5dcd3b10cbe4aa82d5e8cfddb5cf192f4f`.
Base desktop: `5fcdc9c9ac7bc54306767d42267685f4d28f9d91`.
Nenhum commit, push, PR ou instalador faz parte desta etapa.

## Contrato e autoridade

Migration **202610290026_central_proposal_numbering.sql**; migrations 001–025 permanecem intactas.
`proposal_number_sequences` controla o piso permanente por organização/ano.
`proposal_number_reservations` mantém a reserva por organização/sync_id e a unicidade por organização/número/ano/sequência.
As tabelas têm RLS habilitada e forçada, sem acesso direto de anon/authenticated/service_role.
RPCs SECURITY DEFINER concedidas somente a service_role:

- `reserve_proposal_number(actor, sync_id, created_at)`;
- `sync_desktop_proposal(actor, payload, revision, expected_version)` com o mesmo contrato público anterior.

`desktop_proposal_session_active()` retorna apenas um booleano sobre a própria sessão autenticada. Reutiliza a verificação AAL2/sessão ativa da migration 025; não expõe linhas de Auth.
A implementação de sincronização 024 foi movida para `private.sync_desktop_proposal_v1`, sem grant direto de execução, para preservar suas regras e limitar a alteração ao guard de reserva.

**POST /functions/v1/reserve-proposal-number** recebe somente `{sync_id, created_at}`.
Rejeita campos extras, UUID não v4, datas civis inválidas, ausência de timezone, conteúdo não JSON e corpo acima de 1024 bytes.
Preserva microssegundos. O cliente não escolhe organização, ator, ano ou número.
Exige Auth.getUser do token exato, JWT de usuário, AAL2, sessão ainda ativa, profile/organização/role ativos e permission real `desktop_proposals.sync`.
A matriz de permissões existente não foi alterada.

Respostas: 200 com ok/sync_id/organization_id/proposal_number/created_at/reserved_at; 400 invalid_payload; 401 authentication_required; 403 mfa_required/permission_denied; 409 sequence_exhausted ou proposal_number_reservation_mismatch; 429 rate_limited; 500 internal_error sem detalhes SQL.
CORS usa somente o alias canônico configurado. O cliente nativo não exige Origin.

## Concorrência, ano e imutabilidade

Advisory transaction lock por organização/sync_id (mesma chave da sincronização existente) e depois organização/ano. Contador atualizado dentro da mesma transação; constraints únicas defendem invariantes adicionais.
Retry do mesmo sync_id devolve a mesma reserva, mesmo após 9999. Uma alteração de created_at de reserva central é conflito.
O ano vem de `created_at AT TIME ZONE 'America/Araguaina'`; 2027-01-01T02:50Z pertence a 2026.
NNNN fica em 0001–9999. Ao esgotar, PN999 vira HTTP 409 sequence_exhausted.
Reservas não podem ser alteradas ou excluídas. Abandono não devolve número.
Operações manuais não podem tomar números reservados; números válidos dessas operações também avançam o piso, que não recua após exclusão.
Operações ligadas a propostas desktop não podem ter seu número alterado pela web.

## Compatibilidade conservadora

O backfill copia números canônicos válidos já sincronizados sem modificar qualquer linha histórica.
O bootstrap bloqueia escritas em desktop_proposals/operations até instalar os guards, evitando inserções entre a leitura inicial e a criação dos triggers. O piso inicial considera tanto desktop_proposals quanto operations, incluindo registros excluídos logicamente; números fora do formato estrito são ignorados no cálculo.
Não há preenchimento de buracos. Identidades históricas canônicas fora do formato permanecem aceitas por grandfathering exato, sem numeração nova.

**Incompatibilidade inevitável:** um número local antigo que nunca chegou ao servidor não prova exclusividade entre PCs. Não o renumeramos nem reservamos outro automaticamente. Primeira sincronização sem correspondência canônica/reserva retorna 409 proposal_number_not_reserved e pede conciliação. A proposta local e suas exportações históricas permanecem disponíveis. Não existe ferramenta de conciliação automática nesta etapa.

## Auditoria e segurança

Cada reserva nova gera PROPOSAL_NUMBER_RESERVED com organização/ator, sync_id, número, horário e source=desktop_sync.
Retry não duplica o evento. Não há valores financeiros ou credenciais no evento.
O guard exige correspondência organização/sync_id/número e criação antes de delegar os mesmos 13 campos para a sincronização.
MFA, revogação de sessão, RLS, acompanhamento gerencial e autoridade financeira permanecem protegidos.
Secrets administrativos são usados apenas em memória do processo QA; nunca enviados ao desktop. Contas técnicas têm senhas e TOTP próprios temporários em memória e são aposentadas após o QA. Nenhuma conta humana ou autenticador existente é redefinido.

## Validação

As evidências operacionais detalhadas ficam em `.tmp/central-proposal-numbering-local/numbering-report.json` e `.tmp/central-numbering-staging/numbering-report.json` (ignorados pelo Git, sem credenciais).
O runner local usa exclusivamente o projeto Docker descartável central-proposal-numbering-qa, portas 594xx; não reseta outros stacks.
O runner HTTP exige --local ou --staging e restringe staging a iglciwizbxtkfwlboihe e ao Origin https://amazon-agro-staging.vercel.app.
Fixtures de reserva/auditoria são retidas em organizações QA inativas; sessões são removidas e contas técnicas bloqueadas.

Resultados finais são registrados ao concluir a suíte e homologação abaixo.

## Resultados finais — 2026-10-29

- WEB: **455 testes automatizados PASS** = 59 Vitest + 130 Node + 266 pgTAP; sem falhas/skips.
- HTTP local com Auth/MFA reais: **29 verificações PASS**, incluindo 50 requests concorrentes.
- `npm run build`, `npm run check:staging:static` e `git diff --check`: PASS.
- STAGING exclusivo: **iglciwizbxtkfwlboihe**; Origin canônico https://amazon-agro-staging.vercel.app. Nenhuma URL temporária Vercel utilizada.
- Antes: 25 migrations, 001–025, sem drift de versões/nomes. Dry-run listou somente 026.
- Aplicada somente **202610290026**. Depois: 26 migrations, 001–026.
- SHA-256 da migration aplicada: `a3a162972e457a5024999741c605f20b14842775c45335e48a61ea149e4cac8e`.
- Histórico: as **6 propostas existentes** mantiveram a impressão digital `0164f1078197bee85dd6e0025b974da7` antes/depois da migration e depois do E2E; **3 reservas legacy_backfill** criadas sem editar propostas.
- Edge: reserve-proposal-number **v1 ACTIVE**; sync-desktop-proposal **v2 ACTIVE**. Ambas fazem Auth/AAL2/sessão ativa dentro do handler. Nenhuma outra função foi publicada.
- STAGING real: **33 verificações PASS**, com usuários sintéticos e MFA independente. A primeira tentativa encontrou timeout de conexão HTTPS; todas as fixtures daquela rodada foram aposentadas. O runner recebeu retries limitados e idempotentes de transporte, foi revalidado localmente e a rodada final passou.
- Concorrência final: **50/50 HTTP 200**, zero duplicados e nenhum número consumido novamente por retry.
- Dois desktops SQLite reais: PC A **2026-0054**; PC B **2026-0055**; ambos salvaram offline sem número, reservaram, persistiram, sincronizaram e reabriram com integridade SQLite ok.
- Criar/salvar offline na virada usa relógio sintético injetado apenas no runner de QA; não altera relógio do sistema. Ano e limite são validados no PostgreSQL. A data operacional 31/12 em Araguaina é preservada mesmo com timestamp UTC em janeiro.
- Coerência de número entre reserva/desktop_proposals/operations e valores em operation_financials: PASS. Tracking alterado pela web preservado após sync: PASS. Stale: 409 sem sobrescrever versão nova.
- Isolamento RLS, chamada direta de RPC impedida, AAL1, permission e sessão revogada: PASS. Auditoria de reserva segura, um evento por número: PASS.
- Integridade global final: zero órfãos de operações, financeiro ou acompanhamento; zero divergências de números; zero duplicados.
- Organizações/profiles QA desta rodada inativos, usuários técnicos bloqueados e **zero sessões QA restantes**. **57 reservas** da rodada final permanecem consumidas como evidência no tenant QA; não são reutilizadas. As reservas de tentativas anteriores também permanecem apenas em tenants QA inativos.
- Produção, Vercel, contas humanas/MFA existentes e dados reais permaneceram intocados. Nenhum Setup, commit, push ou PR.

## Correspondência com a entrega solicitada

1–2. Branch WEB feature/central-proposal-numbering; base/HEAD 9af66e5dcd3b10cbe4aa82d5e8cfddb5cf192f4f.
3–5. Migration 026, duas tabelas, RPCs e Edge descritos acima.
6–9. Contrato estrito, locks transacionais, idempotência e America/Araguaina validados.
10–12. Backfill/grandfathering, auditoria segura, RLS e permissions preservados; conciliação conservadora dos legados nunca sincronizados está documentada.
13–17. Testes locais, migration/Edge em staging, E2E e estado final registrados acima.
18–30. Implementação, testes e smoke desktop detalhados no CENTRAL_NUMBERING_VALIDATION.md do repositório AmazonAgro-Propostas.
31. Nenhuma credencial real foi gravada em código, banco desktop, evidências ou Git. O runner usa secrets somente em memória; .tmp é ignorado.
32. Produção intocada; nenhum deploy Vercel.
33. git diff --check PASS nos dois repositórios.
34. Árvores possuem somente alterações locais desta etapa; nada staged. Status completo abaixo.
35–36. Arquivos modificados/novos abaixo.
37. Commits realizados: **ZERO**; HEAD continua na base.
38. Pushes realizados: **ZERO**.

## Arquivos modificados (9)

- `package.json`
- `scripts/staging/check-static-readiness.mjs`
- `scripts/test-desktop-proposal-sync-local.mjs`
- `supabase/config.toml`
- `supabase/functions/_shared/authenticatedContext.ts`
- `supabase/functions/sync-desktop-proposal/contract.ts`
- `supabase/functions/sync-desktop-proposal/handler.ts`
- `supabase/functions/sync-desktop-proposal/index.ts`
- `supabase/tests/desktop_proposal_sync.test.sql`

## Arquivos novos (7)

- `CENTRAL_NUMBERING_VALIDATION.md`
- `scripts/test-central-proposal-numbering-http.mjs`
- `scripts/test-central-proposal-numbering.mjs`
- `supabase/functions/reserve-proposal-number/handler.ts`
- `supabase/functions/reserve-proposal-number/index.ts`
- `supabase/migrations/202610290026_central_proposal_numbering.sql`
- `supabase/tests/central_proposal_numbering.test.sql`

## Git status final

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
?? scripts/test-central-proposal-numbering-http.mjs
?? scripts/test-central-proposal-numbering.mjs
?? supabase/functions/reserve-proposal-number/
?? supabase/migrations/202610290026_central_proposal_numbering.sql
?? supabase/tests/central_proposal_numbering.test.sql
```

## Revisão posterior de legados nunca sincronizados

A conciliação explícita e o inventário multi-PC foram acrescentados na migration 027, sem editar a 026. A regra anterior de bloquear sync desconhecido permanece; não há claim automático. Política e validação atuais: [LEGACY_NUMBERING_MIGRATION_REVIEW.md](LEGACY_NUMBERING_MIGRATION_REVIEW.md).
