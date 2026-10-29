# FASE 2 — homologação Desktop → Backend

Homologação técnica executada em 28/10/2026, exclusivamente no Supabase `iglciwizbxtkfwlboihe` (`sistema-rural-staging-clean`, sa-east-1).

## Baseline e drift

- Repositório: `C:/Dev/SistemaRural/front-imoveis-rurais-main`.
- Branch: `feature/desktop-proposal-sync-api`.
- HEAD usado: `57a45690138b93247662eca448a7d51d5eb15bb9`, igual a origin da mesma branch.
- Working tree limpa antes de qualquer aplicação/deploy.
- Local: migrations 001–024; homologação antes: 001–023.
- As 23 migrations remotas tiveram seu conteúdo comparado ao local por SHA-256 de tokens SQL. Somente comentários/espaços fora de literais e delimitadores de statements foram normalizados; corpos dollar-quoted foram preservados. Todas corresponderam. Hashes e fontes estão na evidência local ignorada `migration-drift-check.json`/`migrations-before.private.json`.
- Readiness anterior: PASS, 23 migrations/33 tabelas. Objetos da FASE 2 ainda não existiam.
- Dry-run confirmou somente `202610280024_desktop_proposal_synchronization.sql`, sem seeds/roles. Aplicação com `--skip-vault` e projeto explícito. Nenhum reset remoto, repair ou reaplicação de 001–023.

## Implantação e segurança

Migration history após aplicação: **001–024**, última `202610280024`.

Publicada somente `sync-desktop-proposal`, versão **1**, status **ACTIVE**:

`https://iglciwizbxtkfwlboihe.supabase.co/functions/v1/sync-desktop-proposal`

As três Edge Functions anteriores não foram republicadas. As 67 funções SQL anteriores e as 123 policies RLS anteriores mantiveram seus hashes/conteúdos. A adaptação de auditoria financeira prevista na 024 permaneceu no escopo aprovado.

`verify_jwt=false` no gateway da função nova é intencional: o handler exige `Auth.getUser` no JWT exato, papel authenticated, AAL2, profile/organização/role ativos e `desktop_proposals.sync`. A organização vem exclusivamente do profile. A RPC é exclusiva do servidor e a tabela tem RLS forçada e nenhum grant direto de leitura/escrita ao cliente.

Nenhum secret novo foi necessário. Os digests de todos os valores existentes permaneceram iguais; a implantação atualizou apenas timestamps dos secrets internos SUPABASE_*. ALLOWED_ORIGINS e os demais secrets de aplicação não foram alterados. Credenciais administrativas ficaram apenas em memória do runner de QA, nunca no Git/frontend/desktop/evidências.

Matriz mantida: admin/manager recebem `desktop_proposals.sync`; operator/viewer não. Se o desktop for utilizado por operator, continua necessária decisão de negócio antes de conceder essa permission.

## HTTP remoto real

**67 verificações PASS**, com login por senha e TOTP próprios de seis contas técnicas novas, todas identificadas como `qa-desktop-sync-20261028-api-*`. A conta de AAL1 permaneceu sem elevação. Nenhum autenticador humano ou usuário QA anterior foi reutilizado ou reiniciado.

| Cenário | Resultado |
|---|---|
| Sem JWT | 401 authentication_required |
| JWT inválido ou credencial service-role como login | 401 authentication_required |
| AAL1 | 403 mfa_required |
| AAL2 operator/viewer sem permission | 403 permission_denied |
| AAL2 manager | Create/update permitidos |
| AAL2 admin | Retry autorizado, unchanged |
| Campo extra org/ator/status/prazo/motivo/notas | 400 invalid_payload, sem mutação |
| Unicode malformado | 400 invalid_payload |
| Create canônico | 201 created; uma operação, um vínculo, um financeiro |
| Retry idêntico | 200 unchanged, sem duplicação |
| Update com data de origem posterior | 200 updated; operação e financeiro atualizados |
| Payload anterior | 409 stale_update; comparação integral do estado sem diferenças |
| Retry após perda de ACK | unchanged mesmo com If-Match anterior |
| Seis POSTs simultâneos com mesmo UUID | um created + cinco unchanged; uma linha em cada uma das três tabelas |
| Outro UUID com mesmo número | 409 domain_conflict; não anexa operação existente |
| Banco: nome oficial / short_name / caixa e espaços | Sempre a mesma instituição existente do tenant |
| Banco inexistente | 404 institution_not_found |
| Duas instituições sintéticas com nome normalizado igual | 409 domain_conflict; nenhuma escolha arbitrária |
| Tenant enviado no body | Recusado; tenant B integralmente preservado |
| Mesmo UUID em tenants diferentes | Operações e vínculos independentes |
| PostgREST direto na tabela/RPC e PATCH cross-tenant | Negados; nenhum bypass da Edge |
| Operação de outro tenant | Invisível por RLS |
| Operator consultando financeiro | Nenhum valor retornado |
| Tracking gerencial já editado na web | JSON completo idêntico após todos os updates desktop |
| Audit | Ator/tenant/UUID/operação/source corretos; payload financeiro ausente |
| Integridade | Zero vínculos sem operação, financeiro ou tracking |

Payload canônico usou somente dados sintéticos: UUID `d61028f2-0000-4000-8000-000000000001`, número `QA-SYNC-2026-0001`, Cliente QA Sync, Técnico QA, Responsável QA e banco previamente criado no tenant sintético. Valores iniciais obtidos exatamente: Total `100000.00`, FNO `70000.00`, OF `30000.00`. Update: Total `120000.25`, FNO `80000.25`, OF `30000.00`; o Total não foi inferido pela soma.

O tracking foi editado pela RPC web existente: prazo 27/10/2026, status approved, motivo/observação QA e responsável por ID. Após a sincronização, a linha inteira manteve status, prazos, approved_at/rejected_at, motivos/notas, follow-up, responsáveis, timestamps e versão. Snapshots do desktop continuaram separados.

## Regressões após a implantação

- **342 testes automatizados PASS**, incluindo 211 SQL/RLS, 50 do contrato/Auth da integração, 48 frontend, 2 MFA backend, 12 Pendências, 1 assets PDF, 4 headers, 8 donut e 6 fixtures de acompanhamento.
- SQL/RLS executados em stack **local descartável**, com reset local 001–024. A primeira tentativa sobre o banco local com fixtures HTTP anteriores exigiu esse reset; a execução limpa passou integralmente. Nenhum teste de reset/fault injection foi executado remotamente.
- Proposal Tracking remoto: relatório/KPIs do tenant e edição gerencial aprovados; operator continua negado.
- Pendências remoto: resumo e listagem por admin AAL2 aprovados; AAL1 recusado.
- Reports remoto: PDF e XLSX de operações gerados pelo serviço existente, binários válidos e report_log com IDs registrados na evidência. Esta verificação é de backend/arquivo, sem nova aprovação visual de layout.
- `npm run build`, staging static, encoding e `git diff --check`: PASS.
- O roteiro somente leitura `supabase/validation/staging-readiness.sql` foi atualizado para 024/34 tabelas e a fronteira nova de grants/RPC/permissões, e executado novamente na homologação.

## Encerramento dos fixtures

Esta rodada usou exclusivamente organizações `a61028f2-0000-4000-8000-000000000001` e `a61028f2-0000-4000-8000-000000000002`, identificadas como QA Desktop Sync API 2026-10-28 A/B. IDs de usuários, bancos, UUIDs e operações constam em `fixture-identities.json`.

A instituição ambígua foi inativada. Os seis logins técnicos foram bloqueados, cinco profiles inativados e os dois tenants sintéticos inativados. O último profile admin foi preservado para respeitar a constraint existente de último administrador; seu login também está bloqueado e o tenant inativo impede acesso. Nenhuma constraint, MFA ou RLS foi relaxada. Uma tentativa de inativar todos os profiles foi revertida integralmente por essa proteção e substituída pelo encerramento compatível com a regra.

Três vínculos sintéticos e suas operações/financeiros/tracking/auditoria foram preservados como evidência nos tenants inativos. Não houve limpeza genérica nem alteração em tenant real ou nas contas QA anteriores.

## Evidências e estado final

Evidências locais ignoradas: `.tmp/desktop-sync-staging-20261028/` — comparação de migrations, dry-run/aplicação/deploy, schema e secrets antes/depois, `http-staging-report.json`, `qa-cleanup.json`, regressões e PDF/XLSX sintéticos. Não publicar dumps privados ou arquivos de acesso de desenvolvimento. Os relatórios não contêm senhas, tokens ou chaves.

Homologação: migration 024 aplicada, Edge v1 ativa, Auth/AAL2 e permission aprovados; backend apto ao próximo teste autorizado da integração. Nenhuma alteração funcional foi feita nesta etapa. Permanecem locais apenas este relatório e a atualização do roteiro de readiness, sem commit/push.

Não houve merge em main, alteração do desktop, publicação web, acesso a produção ou reconexão Git do Vercel de produção. A integração efetiva/autenticação desktop permanece para outra fase; não há declaração de GO para produção.
