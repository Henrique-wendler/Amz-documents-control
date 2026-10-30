# Sincronização segura dos arquivos finais — validação

Data: 2026-10-30. Branch local: `feature/proposal-file-sync`.
Base WEB: `34098e7a2248054a73206d4e1245317e5e70f6b9`.
Base DESKTOP: `c3b9ab8af0eaa2bf5be99d213505c1f1e6df036a`.
Resultado automatizado da implementação: PASS local e staging. A consolidação somente WEB/BACKEND está registrada ao final; desktop e ambientes publicados permanecem inalterados nesta consolidação.

## Arquitetura e autoridade

O desktop salva e sincroniza os 13 campos existentes, obtém/persiste o número oficial e gera os documentos localmente. Após a publicação local bem-sucedida, registra cada PDF/XLSX em `proposal_file_outbox`. Uma falha de fila/upload preserva save, documentos e confirmação dos metadados. Falha de registro da fila é apresentada como aviso para gerar novamente em outra pasta.

A Edge Function `proposal-files` autoriza um PUT direto ao Storage. O backend deriva organização, proposta e caminho pelo usuário autenticado e `sync_id`; o número é somente identificação de apresentação. O servidor baixa os bytes recebidos, confere tamanho/MIME, valida a estrutura e calcula SHA-256 antes de registrar `proposal_files`. Bytes não trafegam como base64 em JSON nem são armazenados no PostgreSQL.

Google Drive continua sendo somente a pasta local BASA, em leitura. Parser revision 4, catálogo, snapshots, regras financeiras, geração, templates, logo e ícone foram preservados. Nenhum watcher, SMB, backfill por nome ou dependência de Windows Server foi adicionado.

## Migration 028, bucket e integridade

Única migration nova: `202610300028_proposal_file_storage.sql`. As migrations 001–027 não foram alteradas.

- Bucket `proposal-files`: privado, limite 25 MiB, MIME PDF/XLSX.
- `proposal_file_uploads`: autorizações rastreáveis, estado authorized/completed/failed e expiração; não contém capabilities assinadas.
- `proposal_files`: somente objetos concluídos/validados, hash, tamanho, tipo, versão, autor, origem e identidade técnica.
- FKs compostas preservam organização + desktop_proposal_id + sync_id + operation_id.
- Caminho canônico: `<organization_id>/<sync_id>/<pdf|xlsx>/<sha256>.<ext>`.
- Unique por proposta/tipo/hash e por versão; índice parcial permite no máximo um atual de cada tipo.
- Identidade/conteúdo de uma versão concluída são imutáveis. Novo hash cria versão seguinte, mantendo a anterior.
- Retry de hash já concluído retorna o mesmo registro; uma repetição histórica não promove a versão antiga, evitando rollback por retry atrasado.
- Declarações incompatíveis para o mesmo hash geram conflito, sem substituir o conteúdo.
- Objeto inválido é removido antes de marcar a tentativa como failed. Versões concluídas não são apagadas automaticamente.

## Autorização, RLS e auditoria

Upload reutiliza a permission existente `desktop_proposals.sync`, sem novos grants dessa permission. `proposal_files.read` foi concedida somente a admin/manager. A Edge verifica permission efetiva, usuário/profile/role/organização ativos, JWT real, AAL2 e sessão Auth ainda existente. Tokens privilegiados não são aceitos como sessões de usuário.

Ambas as tabelas usam FORCE RLS. Usuários não escrevem metadados/intents nem executam as RPCs de conclusão; RPCs sensíveis são exclusivas do servidor. SELECT de arquivos exige tenant + permission + sessão AAL2 viva. Uma policy restritiva bloqueia acesso direto ao bucket por anon/authenticated, inclusive diante de policies permissivas futuras.

Auditoria: `PROPOSAL_FILE_UPLOADED`, `PROPOSAL_FILE_VERSION_CREATED`, `PROPOSAL_FILE_DOWNLOAD_AUTHORIZED`. Guarda ator/tenant/identidade/hash/tamanho/versão/origem; não guarda URLs assinadas, JWTs, senhas, refresh, TOTP ou valores financeiros. O E2E confirmou quatro eventos de upload, quatro de versão e três de download, todos sanitizados.

## Contratos HTTP

Endpoint: `POST /functions/v1/proposal-files`, JSON pequeno e estrito; usuário autenticado com JWT e configuração pública. Origin funcional de staging: `https://amazon-agro-staging.vercel.app`.

| Action | Entrada permitida | Saída principal |
| --- | --- | --- |
| prepare | sync_id, file_kind, sha256, size_bytes, mime_type, original_filename | upload_id, identidade derivada, caminho canônico e signed_upload_url temporária ou confirmação idempotente |
| complete | upload_id | metadados do arquivo efetivamente validado |
| download | file_id, disposition inline/attachment | signed_url e expires_in=60 |

PDF: extensão/MIME, assinatura, EOF, startxref e estrutura básica. XLSX: ZIP/OpenXML, diretório central/local, CRC, descompressão limitada, partes obrigatórias, bloqueio de paths perigosos, entidades XML e conteúdo macro/embeddings. O limite expandido é 64 MiB e XML relevante tem limite de 8 MiB. Essas verificações validam formato/integridade; não executam o documento.

Erros controlados: 400 entrada inválida; 401 sessão; 403 MFA/permission; 404 proposta ainda não sincronizada/arquivo invisível; 409 expiração/conflito; 413 limite; 422 conteúdo/tamanho/MIME/hash divergente; 503 indisponibilidade temporária. Nada de mensagens internas, tokens ou capabilities em erros/logs.

PUT assinado usa `upsert=false`; caminho content-addressed não é sobrescrito. A assinatura de upload tem validade de duas horas, conforme a API instalada do Storage. Conclusão exige novamente Auth/AAL2/permissão. A URL de download dura 60 segundos; expiração real foi testada para ambos os formatos. URLs ficam somente na memória do cliente e são capacidades temporárias durante seu prazo, sem link público permanente.

## Desktop e retomada

Outbox separada: pending/uploading/synced/error, tentativas, caminho local, fingerprint, prazo de retry, lease, escopo servidor/tenant e remote_file_id. Só libera após número oficial e confirmação dos metadados nesse mesmo escopo. O worker usa a sessão normal/refresh DPAPI existente; nenhuma chave administrativa chega ao desktop.

Retry automático a cada 30 segundos, respeitando backoff de 30 segundos até uma hora e leases de cinco minutos. Encerramento interrompido retoma após expiração do lease; conclusão com lease antigo é ignorada. 401/403/AAL1 não entram em repetição agressiva; login/MFA ou ação manual permite nova tentativa. Ausência/alteração do arquivo vira erro acionável: gerar novamente. Regeneração explícita reconcilia hashes/caminhos e mantém o vínculo da pendência anterior, sem varrer pastas.

## Interface web

**Acompanhamento de Propostas → Arquivos → Arquivos da proposta**, disponível com `proposal_files.read`, independentemente da permission de editar tracking. Lista PDF/XLSX atuais, data America/Araguaina, tamanho e versão. PDF abre em aba isolada com capability temporária ou baixa; XLSX baixa. Estado vazio: “Arquivo ainda não enviado pelo aplicativo desktop.” Inclui loading, erro e atualização; sem upload manual.

Component → Service → Repository → Supabase/Edge. O componente não importa Supabase. O repositório consulta por operation_id técnico e valida URLs no mesmo projeto/bucket, HTTPS e TTL curto. Nenhuma capability é persistida pelo módulo.

A interface foi validada por testes de renderização/serviço e build local. O E2E consultou o mesmo contrato de listagem web com JWT real e baixou os bytes reais. Não houve deploy Vercel nem QA visual manual de navegador nesta etapa; a UI permanece na branch local, sem publicação Vercel nesta etapa.

## Testes locais

| Suíte | Resultado |
| --- | --- |
| Desktop pytest completo | 690 PASS, preservando os 655 anteriores |
| Frontend Vitest | 73 PASS |
| Backend/contratos Node | 224 PASS, incluindo 44 novos de arquivos |
| SQL pgTAP/reset limpo 001–028 | 334 PASS, incluindo 35 novos de arquivos |
| Total web/backend automatizado | 631 PASS |
| HTTP local existente Auth/MFA/numeração/sync/tracking | 29 PASS |
| HTTP local arquivos/Storage/expiração/RLS | 43 PASS |
| npm run build; static staging; git diff --check | PASS |
| Source smoke XLSX/PDF Excel COM | PASS |

O source smoke também verificou save/reopen, responsável/técnico, identidade, ASTEC, ABC, participação FNO/OF, fonte local, template, logo e SQLite; não deixou processos Excel novos. Registrou duas entradas PDF e duas XLSX pendentes no SQLite isolado. Bytes reais do smoke passaram no validador do backend. Os testes existentes preservam paginação 1/4/5/8/9 → 1/1/2/2/3 páginas, BASA revision 4 e snapshots.

## Homologação executada

Projeto exclusivo: `iglciwizbxtkfwlboihe`. Preflight encontrou 001–027, sem drift; dry-run listou somente 028. Aplicada somente 028 e publicada somente a função nova `proposal-files`. Produção/Supabase/Vercel de produção permaneceram intocados.

E2E: 45 verificações PASS. Tenant sintético `939f16fe-57a6-4c2b-a2b3-24f98f88861a`, sync_id `855957f5-25e9-4a52-a64b-3626b345239d`, operação `509f1553-b2ae-4a5f-9384-b944e0957e52`, proposta `2026-0001`. Contas técnicas nonce `2b6214bc` usam Auth e MFA próprios em runtime; foram desativadas/banidas e ficaram com zero sessões. Nenhuma conta humana teve MFA alterado.

Desktop real → reserva/sync → exportação XLSX/Excel COM PDF → fila offline → restart → PUT assinado → hash server-side → metadata → listagem web → download e hash idêntico. Reenvio igual idempotente; regeneração resultou em versões 2 dos dois formatos. FNO 70%, OF 30%, ABC 3.500 sobre FNO 70.000 foram conferidos.

| Arquivo sintético | Versão | Bytes locais | SHA-256 validado pelo servidor |
| --- | --- | --- | --- |
| XLSX | 1 | 365671 | `bc0e04a92620f3cfd67e1f7c620f5d46ed808d0136b49a7accbf7d072104fb48` |
| PDF | 1 | 188014 | `92de3d1a7fccdd9c60e60be8db6b83e71b7ebedf2ea6d1a4c00aea916d9949b2` |
| XLSX | 2 | 365705 | `8d3a0172b339d7917b7d6dfe878e707a6b45ee9551b4885c167a1709d3b51af6` |
| PDF | 2 | 189737 | `30031941bae4349525d4d0390382c9bda3b8bcd717f7df2777bae2a047ab748d` |

Os downloads das versões iniciais tiveram SHA idêntico ao arquivo local. As novas versões foram validadas server-side e são os dois arquivos atuais. Cross-tenant, operator sem permission, AAL1, sessão revogada, RPC direta, tamanho, extensão, hash, corrupção, MIME e expiração real passaram.

Resultado final: quatro objetos válidos, quatro metadados, um atual de cada formato, zero objetos órfãos, zero metadados órfãos e zero duplicidade lógica. Históricos sintéticos foram mantidos no tenant QA inativo; objetos inválidos/incompletos do próprio QA foram removidos, sem apagar versões concluídas.

Postflight confirmou checksums das migrations históricas idênticos e fingerprints dos 11 desktop_proposals/166 reservas e sequências preexistentes idênticos ao preflight. As únicas novas identidades/dados pertencem aos tenants sintéticos desta execução.

Evidências locais ignoradas: `.tmp/proposal-file-staging/preflight.json`, `postflight.json`, `.tmp/central-numbering-staging/proposal-files-report.json`, logs de testes e relatórios do source smoke. Nenhuma contém credenciais ou URLs assinadas. A saída de credenciais do start do Supabase local é descartada pelo harness.

## Escopo e estado Git

Segredos literais encontrados nos arquivos desta fase: nenhum; configuração administrativa somente em runtime servidor/QA. Nenhum banco, export, planilha BASA, PDF de cliente, log ou dado real será versionado.

Snapshot da validação funcional anterior à consolidação: commits 0, pushes 0, PRs 0, Setup/RC nenhum. Frontend publicado: não. Produção intocada. A consolidação WEB/BACKEND abaixo autoriza um único commit e push da branch, sem PR, merge ou deploy.

## Snapshot dos arquivos antes da consolidação

Modificados:

- `README.md`
- `package.json`
- `scripts/staging/check-static-readiness.mjs`
- `scripts/test-central-proposal-numbering-http.mjs`
- `scripts/test-desktop-proposal-sync-local.mjs`
- `src/pages/ProposalTrackingPage.tsx`
- `supabase/config.toml`
- `tests/ProposalTrackingPage.test.tsx`

Novos:

- `PROPOSAL_FILE_SYNC_VALIDATION.md`
- `scripts/qa/proposal-file-fixtures.mjs`
- `scripts/qa/proposal-files.mjs`
- `scripts/test-proposal-files.mjs`
- `src/components/proposal-tracking/ProposalFiles.tsx`
- `src/repositories/proposalFileRepository.ts`
- `src/services/proposalFileService.ts`
- `src/types/proposalFile.ts`
- `supabase/functions/proposal-files/content.ts`
- `supabase/functions/proposal-files/contract.ts`
- `supabase/functions/proposal-files/handler.ts`
- `supabase/functions/proposal-files/index.ts`
- `supabase/migrations/202610300028_proposal_file_storage.sql`
- `supabase/tests/proposal_file_storage.test.sql`
- `tests/ProposalFileService.test.ts`
- `tests/ProposalFiles.test.tsx`

```text
## feature/proposal-file-sync
 M README.md
 M package.json
 M scripts/staging/check-static-readiness.mjs
 M scripts/test-central-proposal-numbering-http.mjs
 M scripts/test-desktop-proposal-sync-local.mjs
 M src/pages/ProposalTrackingPage.tsx
 M supabase/config.toml
 M tests/ProposalTrackingPage.test.tsx
?? PROPOSAL_FILE_SYNC_VALIDATION.md
?? scripts/qa/proposal-file-fixtures.mjs
?? scripts/qa/proposal-files.mjs
?? scripts/test-proposal-files.mjs
?? src/components/proposal-tracking/ProposalFiles.tsx
?? src/repositories/proposalFileRepository.ts
?? src/services/proposalFileService.ts
?? src/types/proposalFile.ts
?? supabase/functions/proposal-files/
?? supabase/migrations/202610300028_proposal_file_storage.sql
?? supabase/tests/proposal_file_storage.test.sql
?? tests/ProposalFileService.test.ts
?? tests/ProposalFiles.test.tsx
```

Scan de todos os arquivos modificados/novos: nenhum secret literal, dado/artefato proibido ou whitespace residual. Nenhum arquivo foi staged.


## Consolidação somente WEB/BACKEND — 2026-10-30

Branch `feature/proposal-file-sync`; HEAD anterior e origin/main `34098e7a2248054a73206d4e1245317e5e70f6b9`, conferidos após fetch. Mensagem do único commit autorizado: `feat(proposals): add secure proposal file synchronization`. Tracking esperado: `origin/feature/proposal-file-sync`. SHA e resultado do push são informados no encerramento da etapa; este relatório integra o commit.

Revisão confirmou somente os arquivos de sincronização de propostas, metadata/Storage privado/RLS/permissões, contratos, versionamento/integridade, interface, testes, QA e documentação. Nenhum arquivo sensível, dado real, export, banco, log, .tmp, .env ou artefato de build será incluído. A credencial administrativa referenciada em código existe somente no ambiente servidor/runtime; não há valor secreto no cliente ou nos fixtures.

Migration: 001–027 intactas, somente 028 nova, nenhuma adicional. Comparação somente de leitura com `supabase_migrations.schema_migrations` em `iglciwizbxtkfwlboihe`: os 32 statements aplicados correspondem exatamente ao arquivo local, com apenas separadores/comentários externos ignorados. SHA-256 do arquivo UTF-8 normalizado em LF: `ade87693ce57c617dcb34b9a75c3d76f4d76766411dd68ca8ded243d94a71f09`. Nenhuma migration foi reaplicada nesta consolidação.

Homologação anterior preservada: 631 testes web/backend PASS; E2E staging 45 PASS; build/static PASS; hashes local/download idênticos; zero órfãos e zero duplicidades lógicas. Checks desta consolidação: 44 testes Node proposal-files PASS, 28 testes frontend focados PASS e 4 testes de headers/CSP PASS (76 no total); npm run build PASS, static staging PASS e git diff --check PASS. A proteção Git de deploy foi conferida por comparação JSON com a base, mantendo headers/CSP/rewrites e restringindo somente esta branch. Não repete o E2E pesado nem publica funções/schema.

Para impedir que o push autorizado acione um preview automático, `vercel.json` inclui exclusivamente `git.deploymentEnabled["feature/proposal-file-sync"]=false`. O repositório já registra status Vercel em commits de feature branches; a regra usa a configuração oficial [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration). Não altera headers, CSP, rewrites, as demais branches ou configurações remotas dos projetos Vercel. Não houve deploy manual, reconexão de Git ou alteração remota de Vercel.

Desktop repo: nenhuma alteração nesta consolidação. Supabase produção, Vercel produção/staging e serviços homologados: nenhuma mutação. PR e merge: não autorizados, não executados. Nenhum ajuste após o push.

Arquivos explícitos da consolidação (25, incluindo a proteção de deploy):

- `PROPOSAL_FILE_SYNC_VALIDATION.md`
- `README.md`
- `package.json`
- `scripts/qa/proposal-file-fixtures.mjs`
- `scripts/qa/proposal-files.mjs`
- `scripts/staging/check-static-readiness.mjs`
- `scripts/test-central-proposal-numbering-http.mjs`
- `scripts/test-desktop-proposal-sync-local.mjs`
- `scripts/test-proposal-files.mjs`
- `src/components/proposal-tracking/ProposalFiles.tsx`
- `src/pages/ProposalTrackingPage.tsx`
- `src/repositories/proposalFileRepository.ts`
- `src/services/proposalFileService.ts`
- `src/types/proposalFile.ts`
- `supabase/config.toml`
- `supabase/functions/proposal-files/content.ts`
- `supabase/functions/proposal-files/contract.ts`
- `supabase/functions/proposal-files/handler.ts`
- `supabase/functions/proposal-files/index.ts`
- `supabase/migrations/202610300028_proposal_file_storage.sql`
- `supabase/tests/proposal_file_storage.test.sql`
- `tests/ProposalFileService.test.ts`
- `tests/ProposalFiles.test.tsx`
- `tests/ProposalTrackingPage.test.tsx`
- `vercel.json`

Scan pré-commit dos 25 arquivos: secrets reais ZERO, URLs assinadas persistidas ZERO, artefatos/dados proibidos ZERO. Somente nomes de variáveis de ambiente/contrato e fixtures sintéticos aparecem no código. Nenhum arquivo do desktop foi modificado nesta consolidação.
