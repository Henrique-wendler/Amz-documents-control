# Homologação — Proposal Approval Tracking

Data-base: **27/10/2026**, timezone **America/Araguaina**.
Branch: `feature/proposal-approval-tracking`.
Código funcional validado: `62b24ce16e0457856dc1a3bf595d3450cf1cfe78`.
Projeto Supabase: `sistema-rural-staging-clean` — `iglciwizbxtkfwlboihe`.
Preview manager: <https://amazon-agro-staging-9eqkg0gvt-amzagro.vercel.app/acompanhamento-propostas>.
Preview dos perfis restritos: <https://amazon-agro-staging-git-feature-proposal-approva-491fdf-amzagro.vercel.app/acompanhamento-propostas>.

**Resultado: QA técnico e visual concluído nos quatro perfis, sem merge.**

## Diagnóstico dos 26 atrasos

A inspeção foi restrita à organização sintética `a6102600-0000-4000-8000-000000000001`, nome `QA Acompanhamento 2026-10-26 A`.

- Antes: **31 operations e 31 acompanhamentos**, números únicos QA-TRACK-001 a 031.
- Duplicados: **zero**. As linhas foram criadas pelo mesmo preparo controlado, sem acúmulo por reexecuções.
- Havia **22 linhas extras de paginação**, QA-TRACK-010 a 031, com valor zero e prazo 26/10/2026.
- Em 27/10, essas 22 linhas e a QA-TRACK-004 (também com prazo 26/10) passaram legitimamente a atrasadas. Somadas às três financeiras, produziram **26**.
- As três financeiras passaram a 7, 2 e 11 dias: soma 20. Com 23 linhas de um dia, a média ficou **43/26 = 1,653846…**, exibida como **1,7 dias**. Maior atraso: 11.
- O valor não ganho continuou R$ 1.750.000,00 porque as linhas adicionais valiam zero.
- O filtro padrão pending mostrava 28 registros; o total sem filtro era 31.

A listagem anterior com número, criação/autoria, snapshots, prazo, status e valor foi preservada em `.tmp/proposal-tracking-closeout-20261027/before.json`, ignorado pelo Git. Nenhuma fórmula de KPI foi alterada.

## Limpeza e fixture idempotente

Arquivos de QA:

- `scripts/qa/proposal-tracking-fixture.mjs`: cenário e SQL determinísticos;
- `scripts/qa/prepare-proposal-tracking-staging.mjs`: execução explícita e protegida;
- `scripts/qa/proposal-tracking-fixture.test.mjs`: regressões unitárias e Postgres local;
- `scripts/qa/verify-proposal-tracking-http.mjs`: verificação real de permissões/RLS.

A preparação exige projeto e data de referência explícitos. O ref aprovado é allowlisted; o script confirma o ID/nome da organização sintética, a migration 023 e a data operacional. Não aceita referência histórica diferente do dia do servidor silenciosamente.

A limpeza usa somente os UUIDs conhecidos 010–031, dentro do tenant sintético, e exige número/purpose de paginação e valor zero. Remove tracking → financials → operations em **uma transação**. FKs restritivas fazem rollback se outro módulo depender dessas linhas. Operação desconhecida ou perfis ambíguos abortam a execução.

As nove operações canônicas usam UUIDs e números fixos. Upserts atualizam somente campos diferentes, preservando criação/autoria e evitando versões/eventos novos em reexecução sem mudanças. `audit_log`, Auth users, roles, permissions, bancos e outras organizações não são apagados ou recriados.

### Três execuções reais

| Execução | Operations | Tracking | Linhas extras removidas | Fingerprint completo |
| --- | --- | --- | --- | --- |
| 1 | 9 | 9 | 22 | 25578d20773d78cb4e52af2730f51597 |
| 2 | 9 | 9 | 0 | 25578d20773d78cb4e52af2730f51597 |
| 3 | 9 | 9 | 0 | 25578d20773d78cb4e52af2730f51597 |

O fingerprint inclui dados e metadados. Depois das edições humanas de QA/restauração, os campos canônicos foram restaurados e o histórico/versionamento avançou legitimamente; isso não é duplicação nem quebra da idempotência demonstrada acima.

### Comandos

```powershell
# Plano somente leitura
node scripts/qa/prepare-proposal-tracking-staging.mjs --project-ref iglciwizbxtkfwlboihe --reference-date 2026-10-27

# Aplicação apenas no tenant QA autorizado
node scripts/qa/prepare-proposal-tracking-staging.mjs --project-ref iglciwizbxtkfwlboihe --reference-date 2026-10-27 --apply

# Testes locais; usa somente o container descartável proposal-tracking-qa
node --test scripts/qa/proposal-tracking-fixture.test.mjs
```

Em outro dia, fornecer deliberadamente a nova data operacional. Os mesmos IDs serão reutilizados com os deslocamentos documentados; a regra real continua `pending AND approval_deadline < hoje operacional`.

## Cenário canônico

| Operação | Situação | Prazo | Valor | Atraso ativo em 27/10 |
| --- | --- | --- | --- | --- |
| QA-TRACK-001 | pending | 21/10/2026 | R$ 500.000,00 | 6 |
| QA-TRACK-002 | pending | 26/10/2026 | R$ 350.000,00 | 1 |
| QA-TRACK-003 | pending | 17/10/2026 | R$ 900.000,00 | 10 |
| QA-TRACK-004 | pending | 27/10/2026 | R$ 0,00 | 0 — hoje |
| QA-TRACK-005 | pending | 28/10/2026 | R$ 0,00 | 0 — amanhã |
| QA-TRACK-006 | approved | 24/10/2026 | R$ 0,00 | 0 |
| QA-TRACK-007 | rejected | 24/10/2026 | R$ 0,00 | 0 |
| QA-TRACK-008 | cancelled | 24/10/2026 | R$ 0,00 | 0 |
| QA-TRACK-009 | pending | sem prazo | R$ 0,00 | 0 |

O caso “prazo ontem” é a mesma QA-TRACK-002 financeira de R$ 350 mil; não foi inventada uma quarta atrasada de valor zero. Total: **9 operações / 9 acompanhamentos**, dos quais **6 pending**.

## KPIs: RPC e frontend

| Indicador | RPC | UI manager |
| --- | --- | --- |
| Atrasadas | 3 | 3 |
| Valor não ganho | 1750000.00 | R$ 1.750.000,00 |
| Atraso médio | 17/3 = 5,666666… | 5,7 dias |
| Maior atraso | 10 | 10 dias |
| Sem prazo | 1 | 1 |
| Total — todas as situações | 9 | 9 registros |
| Total — filtro pending | 6 | 6 registros |

A UI mantém o arredondamento preexistente de uma casa decimal para dias. A diferença entre 5,666666… e 5,7 é exclusivamente de apresentação. Ordenação conferida: 003 → 001 → 002.

As respostas RPC foram registradas em transação SQL somente leitura com role authenticated/claims de teste do manager. Separadamente, o frontend fez as chamadas reais pela sessão AAL2 humana; a existência da sessão AAL2 e do TOTP verified foi confirmada sem obter token ou secret.

Relatórios > Operações financeiras continua representando a carteira consolidada. Acompanhamento continua representando prazos/aprovação/atrasos. Os valores financeiros da operação não são removidos ao aprovar o acompanhamento.

## Manager AAL2, auditoria e aprovação

Ações realizadas pela UI, na QA-TRACK-001, com leitura do audit_log após cada gravação:

1. Prazo 21/10 → 22/10: approval_deadline registrado; média passou a 16/3.
2. Responsável operator → manager: responsável e snapshot registrados; técnico independente.
3. Técnico manager → operator: técnico e snapshot registrados; responsável preservado.
4. Motivo e observação sintéticos: persistidos; auditoria com changed/redacted, sem copiar texto livre.
5. Status pending → approved: approval_status e approved_at registrados.

Todos os eventos funcionais conferidos possuem organização, actor manager, entidade/ID e timestamps corretos. created_at/created_by preservados. Não há chaves financeiras ou cópia de amount na auditoria do tracking. Eventos históricos permaneceram presentes após a restauração.

Após aprovação, **RPC e UI mostraram 2 atrasadas e R$ 1.250.000,00**, média 5,5 dias, máximo 10 e 1 sem prazo. A proposta aprovada mostrou 0 dias ativos; seu valor original de R$ 500 mil permaneceu na operação. approved_at foi preenchido.

O cenário foi restaurado pelo fixture: 9/9, pending novamente, KPIs 3 / R$ 1.750.000,00 / 17/3 / 10 / 1. A aprovação anterior e seu timestamp continuam no audit_log.

Na automação do campo date, duas tentativas de fill não emitiram a alteração controlada; geraram apenas eventos de acompanhamento. A interação nativa de teclado persistiu o prazo corretamente. Não foi identificado defeito funcional do aplicativo nesse caso; os eventos adicionais foram preservados.

## Perfis e isolamento

| Perfil | Backend real Auth/MFA/HTTP | Frontend |
| --- | --- | --- |
| manager | Sessão AAL2 confirmada; RPC/UI com dinheiro; cinco edições auditadas | PASS |
| report-no-financial | 200, financial_access=false; nenhuma chave/valor monetário no JSON; escrita 403; financials/audit sem linhas | PASS: Acesso restrito, sem dinheiro na tabela, sem Adicionar/Editar |
| no-report | RPC 403; tracking sem linhas; sem proposal_reports.read | PASS: menu ausente e rota direta negada no preview autenticado |
| operator | RPC 403; tracking sem linhas; permissões gerenciais/financeiras não concedidas | PASS: menu ausente e rota direta negada no preview autenticado |
| tenant-b-manager | Somente sua operação B; leitura do tenant A vazia; escrita em A 403 | Não houve edição de B |

Foram executadas **27 verificações HTTP reais**, com autenticação normal, TOTP exclusivo por conta e AAL2. Nenhuma autenticação de usuário com service role. O manager foi validado pela sessão humana no navegador.

Antes da passagem para QA humano, as contas report-no-financial/no-report/operator tinham fatores técnicos verified usados nesses testes de API. O usuário autorizou explicitamente remover somente esses fatores. Foram confirmados zero TOTP e preservados os fatores do manager e do tenant B; MFA/AAL2 e permissões não mudaram. Novos autenticadores são cadastrados pelo usuário. O fixture de dados nunca modifica Auth/MFA.

O verificador HTTP exige arquivo local ignorado de credenciais técnicas próprias. Após o cadastro humano, não reutilizar seeds técnicos removidos nem copiar os novos secrets para o repositório. A execução registrada acima ocorreu antes dessa transferência de MFA. Para repetir depois do cadastro humano, usar `--interactive-mfa`: o verificador solicita apenas o código atual de cada conta, descobre seu fator verified pelo login normal e não grava código/secret. Não cria ou remove fatores.

## Regressão e escopo

| Suíte/verificação | Resultado |
| --- | --- |
| Frontend Vitest/RTL, incluindo 13 de Auth/MFA | 48 PASS |
| SQL/RLS local | 110 PASS |
| MFA backend | 2 PASS |
| Fixture determinístico/guards/Postgres | 6 PASS |
| Pendências | 12 PASS |
| PDF assets | 1 PASS |
| Headers | 4 PASS |
| Donut | 8 PASS |
| Total de testes automatizados | **191 PASS** |
| HTTP remoto | **27 verificações PASS** |
| npm run build | PASS |
| npm run check:staging:static | PASS |
| UTF-8 / git diff --check | PASS |

Nenhuma alteração funcional em src/, migrations, exportadores, desktop ou regras de negócio. Nenhum schema reaplicado na homologação e nenhuma ação em produção. Alterações versionadas limitadas a ferramentas/testes/documentação de QA. Sem merge em main.

Evidências sanitizadas em `.tmp/proposal-tracking-closeout-20261027/`: before.json, idempotency.json, canonical-before-edits.json, audit-1..5, canonical-restored.json, audit-verification.json, ui-evidence.json, http-security.json e http-readonly.json. Credenciais, logs, tokens e secrets não entram no commit.

Observação cosmética preexistente: o texto mostra “1 dias”. Não afeta cálculo, autorização ou persistência; foi preservado para não ampliar este fechamento.

Integridade final confirmada: 9 operations, 9 acompanhamentos, 9 financials; zero órfãos de tracking/financials; carteira R$ 1.750.000,00. Os quatro usuários humanos concluíram enrollment com TOTP verified. As sessões foram testadas sequencialmente: no-report e report-no-financial foram desconectados ao trocar de perfil; manager e operator permaneceram em AAL2 ao final.
