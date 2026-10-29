# Recuperação administrativa de MFA — validação

Data: 29/10/2026. Repositório web `front-imoveis-rurais-main`, branch `codex/admin-mfa-recovery`, criada de `origin/main` limpo, HEAD **4d9cd2b3a15411ab22ab0dbb00907968781bf97a**. Sem commit/push. Desktop, produção Supabase e Vercel de produção não foram alterados.

## Conta QA recuperada

- Projeto staging: **iglciwizbxtkfwlboihe**.
- E-mail autorizado: `qa-proposals-20261026-manager@example.invalid`.
- User ID exato: `9ee96b15-1b1b-461c-954f-50f6058b8243`.
- Tenant sintético: `a6102600-0000-4000-8000-000000000001`, **QA Acompanhamento 2026-10-26 A**.
- Antes: **1 TOTP verified, 3 sessões**.
- Auth Admin listFactors/deleteFactor removeu somente esse fator: **0 fatores / 0 verified**.
- A conferência real encontrou as três sessões ainda presentes após deleteFactor. Não se assumiu revogação apenas pela remoção do fator.
- Login normal por senha confirmou **AAL1 e nenhum TOTP verified**. `auth.admin.signOut(..., global)` revogou as sessões dessa conta; conferência: **zero sessões** e refresh anterior rejeitado.
- Hashes de profile, organização, permissions, tracking e fatores dos outros usuários permaneceram iguais. Não houve alteração de senha, role, status ou exclusão da conta. A senha existente foi utilizada apenas em memória para o login normal; nenhum novo arquivo de credenciais foi criado.
- **Enrollment manual concluído pelo usuário**, que confirmou chegada ao dashboard. Leitura posterior no staging confirmou **1 fator verified e 1 sessão AAL2**. Não houve criação de TOTP técnico para essa conta nem leitura do novo secret.

Evidências locais ignoradas: `.tmp/admin-mfa-recovery/qa-account-preflight.json` e `qa-account-reset.json`.

## Implementação

Frontend preserva Component → Service → Repository → Supabase. Administração de Usuários ganhou os textos de status e a ação/confirmação **Redefinir MFA**, somente para alvos com fatores. A confirmação identifica o nome, explica a remoção/encerramento das sessões e exige ação explícita. Nenhuma credencial administrativa é enviada ao browser.

`admin-users` ganhou `reset_mfa`, payload estrito `{action,targetId}`, rate limit de ação sensível, JWT verificado por Auth.getUser, AAL2, profile/tenant/role ativos e **users.manage real**. A permission é conferida também pela RPC sujeita ao bloqueio de sessões. Same-tenant é derivado do profile do executor. Cross-tenant e alvo inexistente retornam 404 sanitizado. AAL1 retorna 403 mfa_required; falta de permission retorna 403. O nome da role não autoriza a ação.

Remoção usa Auth Admin listFactors/deleteFactor. Contagem de exclusões bem-sucedidas, revogação e auditoria seguem a RPC `complete_user_mfa_reset`, exclusiva de service_role. Essa RPC deriva e revalida a organização/permission do actor no banco, confirma o alvo, não muda profiles e grava `USER_MFA_RESET`. Remoção parcial não produz falso sucesso. Reset da própria conta é negado para preservar o executor AAL2; não há bloqueio por contagem de administradores.

AuthContext não precisou mudar: continua aceitando somente TOTP verified, removendo stale unverified antes de enrollment, gerando novo fator e elevando para AAL2 somente após challengeAndVerify. Sua semântica foi revalidada, inclusive login após reset e password recovery.

## Migration e staging

**025 foi tecnicamente necessária**: a auditoria anterior só aceitava outras ações, e a recuperação precisava revogar sessões e impedir confiança em JWTs antigos. A migration **202610290025_administrative_mfa_recovery.sql** criou a RPC server-only e fortaleceu `private.current_user_has_aal2()` para conferir existência/AAL/validade da sessão Auth correspondente. Não modificou 001–024, não relaxou RLS, não concedeu acesso administrativo ao browser e não criou permission por nome de role.

Preflight remoto: 001–024 alinhadas; dry-run apontou somente 025. Aplicada somente 025, usando `--skip-vault`, sem seeds/roles. Publicada somente **admin-users v2 ACTIVE, verify_jwt=true**. document-files v1, generate-report v2 e sync-desktop-proposal v1 permaneceram iguais. Estado final: 25 migrations, última 202610290025, **zero profiles órfãos**.

A UI está implementada/compilada na branch local para revisão; não foi feito deploy frontend nem reconexão Vercel. A conta QA foi reconfigurada manualmente no preview de homologação já existente.

## Resultados

| Suíte | Resultado |
|---|---|
| Frontend Vitest completo | **59 PASS** |
| Novo handler MFA (HTTP/SDK isolados; código real do entrypoint) | **27 PASS** |
| SQL completo 001–025 / pgTAP | **235 PASS** (211 anteriores + 24 novos) |
| Regressão MFA backend existente | **2 PASS** |
| Regressão contrato/handler desktop-sync existente | **50 PASS** |
| Total local dessas suítes | **373 PASS**, sem skips |
| Build React/TypeScript | **PASS** |
| Staging static / UTF-8 / git diff --check | **PASS** |
| Ensaio real staging | **21 checks PASS** |

O ensaio remoto `.tmp/admin-mfa-recovery/staging-mvthshvy.json` verificou: AAL1/403 mfa_required; operator sem users.manage; cross-tenant e inexistente/404; tenant enviado pelo cliente recusado; admin AAL2 removendo um fator; JWT antigo sem permissions; refresh antigo inválido; executor AAL2 preservado; profile/role/organização intactos; novo login AAL1/enrollment; seed novo e challenge/verify AAL2; gestor com users.manage real removendo três fatores (verified/unverified); zero fatores idempotente; auditoria exata para contagens **1,3,0** e atores corretos; ausência de credenciais; sessões do alvo zero; executor ativo; lista sem usuário de outro tenant e integridade relacional.

A role `manager` padrão não tinha `users.manage` no staging. Para o caso permitido, o runner criou a role sintética `qa_mfa_manager_mvthshvy` com essa única permission, atribuída somente ao gestor técnico da rodada. Nenhum grant da role manager padrão ou de outra role existente foi alterado. O caso comprovou autorização pela permission real, independentemente do nome da role.

As **cinco contas técnicas novas** da rodada foram banidas/inativadas e os dois tenants novos ficaram inativos. Nenhum MFA da conta QA manual ou de outras contas anteriores foi tocado no ensaio. Cleanup: `.tmp/admin-mfa-recovery/cleanup-mvthshvy.json`. Estado remoto final: `staging-final.json`.

O reset local inicialmente encontrou uma reserva de porta do Windows em 56411–56510. O stack descartável de MFA usou 584xx, sem alterar configuração do app. Todos os testes SQL passaram nesse stack. A suíte frontend emite aviso de teardown do Keyborg; o build mantém aviso de tamanho do bundle. Nenhum deles é falha de teste ou foi tratado alterando segurança.

## Procedimento e limites

[Procedimento administrativo](docs/admin-mfa-recovery.md): perdeu/trocou celular → mesma identidade; funcionário saiu → inativar conta antiga/criar nova, com MFA próprio. Nunca reaproveitar identidade histórica entre funcionários.

Permanece pendente apenas a revisão desta entrega antes de commit/push e eventual publicação da UI web. Não há alteração de desktop, Setup/RC, produção ou liberação para produção nesta etapa.

## Arquivos / Git

Os arquivos abaixo são fonte, testes ou documentação. `.tmp/`, logs, runtime QA e evidências privadas permanecem ignorados. Nenhum segredo foi identificado nos candidatos; service_role/PAT, senhas, access/refresh tokens e seeds não foram gravados no código ou em novos arquivos de credenciais.

| Estado | Arquivo |
|---|---|
| M | `README.md` |
| M | `package.json` |
| M | `scripts/staging/check-static-readiness.mjs` |
| M | `scripts/test-desktop-proposal-sync-local.mjs` |
| M | `src/components/administracao/UserGrid.tsx` |
| M | `src/pages/UsersPage.tsx` |
| M | `src/repositories/supabaseUserAdministrationRepository.ts` |
| M | `src/repositories/userAdministrationRepository.ts` |
| M | `src/services/userAdministrationService.ts` |
| M | `src/types/userAdministration.ts` |
| M | `supabase/functions/admin-users/index.ts` |
| M | `supabase/tests/desktop_proposal_sync.test.sql` |
| M | `supabase/tests/proposal_approval_tracking.test.sql` |
| M | `tests/AuthContextMfa.test.tsx` |
| Novo | `ADMIN_MFA_RECOVERY_VALIDATION.md` |
| Novo | `docs/admin-mfa-recovery.md` |
| Novo | `scripts/qa/admin-mfa-recovery-staging.mjs` |
| Novo | `scripts/test-admin-mfa-recovery.mjs` |
| Novo | `supabase/migrations/202610290025_administrative_mfa_recovery.sql` |
| Novo | `supabase/tests/admin_mfa_recovery.test.sql` |
| Novo | `tests/UserMfaRecovery.test.tsx` |
| Novo | `tests/userMfaRecoveryRepository.test.ts` |

HEAD permanece no baseline informado, sem staged, commit ou push. Os testes SQL antigos receberam somente sessões/claims sintéticos coerentes com a nova checagem; o aplicativo desktop e seu repositório não mudaram.
