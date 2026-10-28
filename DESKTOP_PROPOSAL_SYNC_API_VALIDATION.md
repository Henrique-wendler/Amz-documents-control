# FASE 2 — API central de sincronização de propostas desktop

Validação local em 28/10/2026. Branch `feature/desktop-proposal-sync-api`, criada de `main` no commit `587d7620486e682b99a727ec9d6c53e959e9fd56`. Esta fase não aplica migrations nem publica funções remotamente, não modifica o desktop e não faz commit/push.

## Fronteira de segurança

`POST /functions/v1/sync-desktop-proposal` exige Bearer JWT válido, confirmado por `auth.getUser(token)`, e somente depois confere o papel `authenticated` do token e lê AAL com o helper existente `verifiedJwtHasAal2`. Tokens de papel privilegiado/servidor não são sessões de usuário aceitas. Exige AAL2, profile ativo, organização ativa/não excluída, role ativa e `desktop_proposals.sync`. O tenant e o ator vêm exclusivamente desse contexto autenticado.

A permission nova é concedida inicialmente a `admin` e `manager`, seguindo o padrão atual de autoria de operações/financeiro. `operator` e `viewer` não recebem grant automático. Uma role aprovada pode receber apenas a permission dedicada, sem ganhar acesso geral a valores financeiros nem depender de `financial.write`/`operations.write`. Os testes exercitam essa role restrita. Se os usuários finais do desktop forem `operator`, será necessária decisão de negócio antes da ativação da sincronização; esta revisão não concede essa permission automaticamente.

O arquivo de configuração da nova função usa `verify_jwt=false` para que o próprio handler padronize 401/403. Isso não permite acesso anônimo: toda chamada POST passa obrigatoriamente por `getUser` e AAL2 antes da leitura/gravação de dados. As configurações das funções anteriores e o fluxo de MFA existente permanecem iguais.

O client privilegiado usa exclusivamente as variáveis do runtime Edge. Nenhuma chave administrativa é entregue ao desktop/frontend. A RPC `sync_desktop_proposal` tem EXECUTE apenas para `service_role`, valida novamente ator/profile/org/role/permission e não pode ser invocada por JWT de usuário, inclusive administrador. O ator passado à RPC é obtido do JWT validado pela Edge, nunca do body.

A tabela de integração tem RLS habilitada e forçada, grants diretos revogados inclusive de `service_role`, nenhuma policy permissiva e uma policy restritiva AAL2. A função SECURITY DEFINER com search_path vazio é a fronteira única de gravação. O contexto transacional de auditoria é estabelecido somente dentro dessa RPC privilegiada e restaurado antes da resposta; não há bypass global de triggers/RLS nem desativação de constraints.

## Contrato v1

Body JSON estrito: todas as 13 propriedades abaixo devem existir, sem propriedades adicionais. Limite do corpo: 16 KiB UTF-8. `Content-Type: application/json` obrigatório.

| Propriedade | Regra |
|---|---|
| `sync_id` | UUID v4; normalizado para minúsculas |
| `proposal_number` | Texto não vazio, até 100 caracteres; preserva o número local |
| `proponent_name` | Texto até 200 caracteres |
| `created_at`, `updated_at` | Timestamp ISO com timezone, até 6 casas fracionárias, ou null para histórico desconhecido; atualização não pode preceder criação conhecida |
| `created_by_technician_name` | Snapshot textual até 200 caracteres ou null para histórico desconhecido |
| `responsible_name`, `technician_name`, `bank` | Texto até 200 caracteres; banco não pode ficar vazio |
| `purpose` | Texto até 500 caracteres |
| `total_value`, `fno_value`, `of_value` | Strings decimais exatas, não negativas, compatíveis com numeric(15,2) |

Caracteres de controle e Unicode malformado são recusados com 400; pares Unicode válidos continuam aceitos. Os textos são aparados no banco. Rascunhos parcialmente preenchidos podem enviar textos vazios e valores zero; número/banco continuam necessários para criar o vínculo central com segurança. Não se inventam datas nem técnico criador para propostas antigas. Datas/identidade histórica conhecidas permanecem imutáveis após o primeiro vínculo.

Dinheiro não passa por float: Edge usa validação decimal/BigInt e PostgreSQL usa numeric. Limite máximo: `9999999999999.99`. Casas extras são aceitas somente quando forem zeros exatos (`12.3400` → `12.34`); arredondamento implícito, expoentes, números JSON e negativos são recusados.

`organization_id`, `created_by`, `updated_by`, `operation_id`, status/prazos/notas gerenciais ou qualquer outra propriedade fora do contrato retornam `400 invalid_payload`.

Headers opcionais compatíveis com a fundação desktop da FASE 1:

- `X-Payload-Version: 1`;
- `X-Desktop-Revision`: inteiro positivo bigint, transportado como string;
- `Idempotency-Key: <sync_id>:<revision>`, quando enviado exige a revisão correspondente;
- `If-Match`: versão remota positiva, com ou sem aspas.

Resposta de sucesso inclui `success`, `ok`, `sync_id`, `organization_id`, `operation_id`, `remote_version`, `server_version`, `remote_updated_at` e `result`. Os aliases `ok`/`server_version` mantêm compatibilidade com a FASE 1 sem alterar o desktop; versões são strings para não perder precisão bigint. Não retorna valores financeiros nem informações gerenciais. Criado retorna 201; atualizado/inalterado retorna 200.

Erros: 400 `invalid_payload`; 401 `authentication_required`; 403 `mfa_required`/`permission_denied`; 404 `institution_not_found`; 409 `stale_update`/`domain_conflict`; 500 `internal_error`. Método incorreto retorna 405. Há proteção de 60 tentativas/minuto por ator no isolate e 429; não substitui rate limiting distribuído de uma implantação futura. Erros não incluem SQL, tokens ou payloads. Respostas usam `private, no-store`. Origens browser exigem allowlist exata em `ALLOWED_ORIGINS`; o cliente desktop nativo não precisa enviar Origin.

## Modelo e autoridade dos campos

Migration nova: `supabase/migrations/202610280024_desktop_proposal_synchronization.sql`. As migrations 001–023 foram comparadas com o HEAD e continuam inalteradas.

`public.desktop_proposals` mantém identidade, snapshots, FNO/OF, versão/hash do payload, revisão de origem e horários/atores centrais. Possui UNIQUE `(organization_id,sync_id)` e `operation_id` único. FK composta garante o tenant da operação; FK diferida exige acompanhamento existente ao confirmar a transação. A tabela de acompanhamento e seus contratos anteriores não são modificados.

| Origem | Destino/autoridade |
|---|---|
| `proposal_number` | `operations.operation_number`; não é renumerado e fica imutável no vínculo |
| `purpose` | `operations.purpose`, atualizado pelo desktop |
| `bank` | Instituição ativa existente do mesmo tenant, por nome/short_name com normalização de caixa e espaços |
| `total_value` | `operation_financials.amount`, única fonte de Valor Total para o dashboard |
| `fno_value`, `of_value` | `desktop_proposals`, preservados separadamente; não se infere total pela soma |
| nomes de responsável/técnico | Snapshots da integração; nunca se procuram profiles por nome |
| `created_by_technician_name` | Snapshot histórico imutável, independente do usuário autenticado que sincroniza |
| ator/tenant/timestamps centrais | Derivados no servidor |

Primeiro envio cria operação + integração + financeiro + acompanhamento na mesma transação. O acompanhamento começa pending, sem prazo/follow-up e com snapshots textuais iniciais; os IDs de profiles permanecem null. Não se vincula uma operação preexistente somente pelo número: colisão de número entre UUIDs ou com operação web retorna 409, sem apropriação silenciosa de dados.

Envios posteriores atualizam apenas snapshots/campos de autoridade do desktop e o valor financeiro. A linha de acompanhamento existente é preservada integralmente, incluindo status, prazos, approved_at/rejected_at, motivos/notas, follow-up, responsáveis/IDs/snapshots gerenciais, versão e todos os timestamps. Novos nomes vindos do desktop permanecem nos snapshots da integração e não desfazem atribuições realizadas na web. O status da operação não é alterado.

O algoritmo exato de banco compara `N(bank)` com `N(name)` ou `N(short_name)`, onde `N(s) = lower(regexp_replace(btrim(s), '[[:space:]]+', ' ', 'g'))`. Considera somente instituições ativas, não excluídas e da organização autenticada. A consulta conta IDs de instituições, não a quantidade de aliases que correspondem. Zero IDs retorna 404; exatamente um permite a operação; mais de um retorna 409. Não há busca aproximada, escolha por ordem ou fallback entre tenants.

Banco ausente retorna 404; correspondência ambígua retorna 409. Nenhuma instituição é criada automaticamente. Não há associação de entidades por nome de pessoa.

## Idempotência e concorrência

Uma advisory transaction lock por organização + UUID, seguida de row lock, serializa alterações do mesmo vínculo. Constraints e transação garantem rollback completo em conflitos de números ou FKs.

- Retry com mesmo payload canônico: `unchanged`, sem duplicar operação/auditoria e sem incrementar versão/last_synced_at. Funciona mesmo com If-Match antigo após perda de ACK.
- Conteúdo novo com source_updated_at posterior: atualiza campos permitidos e incrementa versão.
- Origem anterior, ou sem updated_at quando o servidor já conhece essa data: `stale`, HTTP 409 `stale_update`, `ok=false`; nenhum dado é alterado. O desktop não deve interpretar esse conflito como ACK do payload antigo.
- Conteúdo diferente no mesmo instante, revisão de origem não crescente quando informada, If-Match divergente ou alteração de identidade/histórico: 409 `domain_conflict`.
- Histórico sem updated_at pode ser criado; para modificar conteúdo posteriormente é necessário um updated_at posterior conhecido. Não se usa o horário do recebimento como histórico de origem.
- Mesmo UUID em organizações diferentes gera vínculos independentes, conforme a chave tenant + UUID.

## Auditoria

Criação/atualização efetivas registram ator real, organização, sync_id, operation_id, created/updated, versão e timestamp em audit_log, com `source=desktop_sync`. Os snapshots/valores não são copiados para esse evento.

O trigger financeiro específico foi adaptado na migration 024: no contexto da sincronização grava apenas indicador de alteração/redação e IDs, sem amounts. Fora desse contexto conserva a auditoria financeira web anterior. A função genérica e as migrations antigas não foram alteradas. No-op/stale não geram eventos de alteração artificiais.

## Validação executada

Stack descartável `desktop-proposal-sync-qa`, apenas loopback: API 56421 e banco 56422. Reset completo 001–024, sem seeds automáticos e sem tocar nas stacks existentes. Os runners novos recusam parâmetros remotos e conferem projeto/porta local antes de operar.

| Verificação | Resultado |
|---|---|
| SQL/RLS pgTAP no reset limpo | 211 PASS: 110 anteriores de acompanhamento + 101 da integração |
| Contrato/Auth/handler da integração | 50 PASS |
| Frontend Vitest | 48 PASS |
| MFA backend | 2 PASS |
| Pendências | 12 PASS |
| Assets PDF | 1 PASS |
| Headers frontend | 4 PASS |
| Gráfico donut | 8 PASS |
| Fixtures anteriores de acompanhamento | 6 PASS, transações locais revertidas |
| Total de testes automatizados acima | 342 PASS |
| HTTP real com Auth/MFA/Edge/PostgreSQL | 73 verificações PASS, contabilizadas separadamente |
| `npm run build` | PASS; aviso de chunk acima de 500 kB, sem falha |
| `npm run check:staging:static` | PASS |
| `npm run check:encoding` | PASS |
| `git diff --check` | PASS |
| Integridade relacional local | 0 vínculos sem operação, financeiro ou acompanhamento |

HTTP usa exclusivamente contas sintéticas locais, login normal e TOTP próprio de cada conta. Service role prepara fixtures e executa a RPC no servidor; não autentica usuários em substituição a login/MFA. Nenhuma credencial é persistida nos fontes/seeds e nenhum MFA humano/remoto é alterado.

Cobertura inclui JWT ausente/inválido, AAL1, profile/org/role inativos, permission ausente, spoofing de tenant/ator/campos gerenciais, UUID/textos/datas/Decimal inválidos, banco inexistente/ambíguo, valores exatos, FNO/OF preservados, rascunho histórico, create/retry/update/stale/conflitos, compatibilidade de ACK da FASE 1, preservação integral do acompanhamento editado na web, RLS/RPC direto negado, sync sem acesso financeiro geral, auditoria sem valores e integridade de FKs. Seis POSTs idênticos concorrentes criam uma única operação; UUIDs diferentes concorrendo pelo mesmo número produzem um sucesso e um 409.

Reprodução principal, na raiz deste repositório, com Node/npm e Docker Desktop:

```powershell
npm ci
npm run test:desktop-sync
npm run test:desktop-sync:local
npm test
npm run test:mfa-backend
npm run test:pending-issues
npm run test:report-pdf
npm run test:security-headers
node --test scripts/test-report-donut.mjs
npm run build
npm run check:staging:static
npm run check:encoding
git diff --check
```

O runner principal copia migrations/tests/functions para `.tmp/desktop-proposal-sync-local`, inicia apenas a stack descartável, faz reset, executa SQL e HTTP reais e encerra o runtime Edge no finally. `--database-only` executa apenas reset/SQL. O teste histórico `node --test scripts/qa/proposal-tracking-fixture.test.mjs` mantém sua dependência anterior do container local `supabase_db_proposal-tracking-qa`; não foi modificado nesta fase.

Evidências locais ignoradas pelo Git: `.tmp/desktop-proposal-sync-local/{reset.log,db-tests.log,http-report.json,edge-runtime.log}` e `.tmp/phase2-precommit-regressions/` (nova execução da revisão final). Logs de inicialização/status local podem conter chaves de desenvolvimento e não devem ser publicados. Fontes versionáveis não incluem `.tmp`, node_modules, dist, bancos, logs ou credenciais.

## Revisão final pré-commit

A revisão repetiu o reset completo 001–024, SQL/RLS, HTTP/Auth, MFA, Pendências, acompanhamento, relatórios, frontend/build, staging static, encoding e diff check. Não ficaram achados bloqueantes após as correções abaixo.

Correções restritas à fronteira nova da FASE 2:

1. Rejeição explícita de papel JWT diferente de `authenticated`, mesmo se a consulta Auth retornar usuário. As regressões com Auth stub demonstraram a ausência anterior dessa rejeição; HTTP real também confirma que service-role, anon e credencial não JWT não são login de desktop. A validação criptográfica por `getUser` continua obrigatória antes de usar claims.
2. Rejeição de surrogate Unicode isolado antes do PostgreSQL, evitando que entrada inválida chegue à persistência e produza erro 500. Regressões cobrem pares válidos e inválidos e HTTP 400, sem mudar o contrato dos 13 campos.

Matriz aprovada para esta fase:

| Role | `desktop_proposals.sync` automático |
|---|---|
| admin | Sim |
| manager | Sim |
| operator | Não; depende de decisão de negócio antes de ativar o desktop para esse perfil |
| viewer | Não |

Atomicidade foi testada por falhas injetadas **após** as escritas da operação/integração/auditoria e antes da confirmação financeira, tanto na criação quanto na atualização. Em SQL, comparou-se o JSONB completo de operações, integrações, financeiro, acompanhamento e audit_log antes/depois: igualdade integral após erro. Pelo HTTP, o erro intermediário retornou apenas `500 internal_error`, sem mensagem SQL, e não deixou operação/vínculo/evento de integração. Triggers de injeção existem apenas durante testes locais e são removidos/revertidos.

A revisão confirmou explicitamente nome oficial, short_name, caixa/espaços, banco ausente/ambíguo, exemplo financeiro `100000.00`/`70000.00`/`30000.00`, colisão entre sync_ids e uma única linha em cada uma das três tabelas após seis POSTs idênticos concorrentes. Uma tentativa PATCH direta em vínculo do tenant B com sessão A foi negada e o snapshot/versão de B permaneceu igual. O acompanhamento gerencial já alterado na web foi comparado integralmente antes/depois do sync, sem diferenças.

Migration 024 revisada: UNIQUE `(organization_id,sync_id)` e `operation_id` geram os índices de identidade; FK composta para operação e as FKs tenant-aware existentes de financeiro/tracking mantêm o tenant do vínculo. RLS habilitada/forçada, grants mínimos, permission dedicada e auditoria redigida confirmados no banco local. Todas as constraints estão validadas e os três contadores de vínculos órfãos são zero. Migrations 001–023 continuam idênticas ao HEAD base. A migration 024 não precisou ser alterada nesta revisão.

O conjunto final continua com **15 arquivos: 5 modificados e 10 novos**, nenhum staged. Código anterior de frontend, MFA, Pendências e Proposal Tracking não foi alterado. Nenhum dado real, credencial, log, banco, arquivo `.tmp`, node_modules ou dist faz parte desses arquivos. Nenhuma funcionalidade nova, deploy, commit/push ou alteração de desktop foi realizada nesta revisão.

## Arquivos desta fase

- `README.md`, `docs/database-schema.md`, `DESKTOP_PROPOSAL_SYNC_API_VALIDATION.md`;
- `package.json`, `scripts/staging/check-static-readiness.mjs`;
- `scripts/test-desktop-proposal-sync.mjs`, `scripts/test-desktop-proposal-sync-local.mjs`, `scripts/test-desktop-proposal-sync-http.mjs`;
- `supabase/config.toml`;
- `supabase/functions/_shared/authenticatedContext.ts`;
- `supabase/functions/sync-desktop-proposal/{contract.ts,handler.ts,index.ts}`;
- `supabase/migrations/202610280024_desktop_proposal_synchronization.sql`;
- `supabase/tests/desktop_proposal_sync.test.sql`.

Estado de entrega: alterações locais não commitadas na branch da fase. Nenhum deploy, push, aplicação de migration em homologação/produção ou mudança no desktop foi realizado. Integração remota e autenticação desktop efetiva dependem de etapas posteriores autorizadas.
