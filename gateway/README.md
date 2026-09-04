# File Gateway

Worker Node.js/TypeScript executado dentro da rede da empresa para sincronizar arquivos entre o bucket privado e a raiz local autorizada. Cloud → local cria a segunda cópia corporativa; local → Cloud ocorre somente sob demanda para uma referência persistida. O tráfego é exclusivamente HTTPS de saída: o Gateway não expõe porta, endpoint ou compartilhamento SMB à internet.

## Fluxo

```text
File Gateway → HTTPS outbound → Edge Function file-gateway → Supabase/PostgreSQL/Storage
             → diretório temporário → SHA-256 → publicação local atômica
             → attachment_locations (network_share) + file_access_log

Usuário files.manage → document-files → remote_copy_jobs
File Gateway → resolve referência persistida dentro da raiz → SHA-256
             → upload privado temporariamente autorizado → attachment_locations (supabase_storage)
```

A Edge Function autentica a instância, deriva sua organização no banco, concede um lease e autoriza URLs curtas de download ou upload. O worker nunca recebe `service_role`, senha PostgreSQL ou credencial de usuário final. O pedido local → Cloud contém somente UUIDs no frontend; o caminho físico é resolvido pelo Gateway a partir da referência persistida.

## Configuração

Na pasta `gateway/`:

```powershell
npm ci
Copy-Item .env.example .env
```

Preencha o `.env` local e carregue as variáveis no processo pelo mecanismo operacional escolhido. O executável não lê arquivos `.env` por conta própria. Variáveis obrigatórias:

- `GATEWAY_SUPABASE_URL`: origem do Supabase; HTTPS é obrigatório em produção.
- `GATEWAY_INSTANCE_ID`: UUID provisionado em `file_gateway_instances`.
- `GATEWAY_TOKEN`: segredo aleatório exclusivo da instância.
- `GATEWAY_ROOT_PATH`: diretório absoluto dedicado à cópia local.

As demais variáveis controlam lote, polling, timeouts, retries, backoff, limite de tentativas e duração do lease. A raiz de um drive inteiro é rejeitada; a raiz de um compartilhamento UNC dedicado é aceita. Para um compartilhamento Windows, conceda acesso ao usuário restrito que executará futuramente o serviço; não grave usuário ou senha SMB neste arquivo.

| Variável | Finalidade | Regra |
|---|---|---|
| `GATEWAY_SUPABASE_URL` | Origem do backend Supabase | HTTPS obrigatório em produção; sem barra final |
| `GATEWAY_INSTANCE_ID` | Identificação da instância provisionada | UUID vinculado a uma única organização |
| `GATEWAY_TOKEN` | Secret dedicado da instância | Somente no secret store/ambiente local; nunca em log ou Git |
| `GATEWAY_ROOT_PATH` | Raiz dedicada local ou UNC | Caminho absoluto; raiz de drive é rejeitada |
| `GATEWAY_TEMP_PATH` | Staging de downloads | Opcional; padrão `<root>/.gateway-tmp`; deve estar no mesmo volume/share |
| `GATEWAY_BATCH_SIZE` | Itens reclamados por ciclo | 1–50 |
| `GATEWAY_POLL_INTERVAL_MS` | Intervalo entre ciclos | 5 segundos–1 hora |
| `GATEWAY_REQUEST_TIMEOUT_MS` | Timeout das chamadas ao backend | 1–300 segundos |
| `GATEWAY_DOWNLOAD_TIMEOUT_MS` | Timeout de transferência | 1–900 segundos |
| `GATEWAY_MAX_REQUEST_RETRIES` | Retries HTTP limitados | 0–10 |
| `GATEWAY_RETRY_BASE_MS` | Base do backoff exponencial | 100 ms–60 segundos |
| `GATEWAY_MAX_SYNC_ATTEMPTS` | Limite persistido de tentativas | 1–100 |
| `GATEWAY_LEASE_SECONDS` | Duração do lease | 30–3.600 segundos |
| `GATEWAY_MAX_UPLOAD_BYTES` | Limite local→Cloud | Até 50 MB no worker e nunca acima do limite efetivo do backend/bucket |

Uma raiz UNC dedicada, como `\\servidor\SistemaRural-Homologacao`, é aceita. O exemplo é apenas documental. Não coloque usuário ou senha no UNC e não mapeie letra de unidade dependente de sessão interativa para um serviço Windows.

O token deve ser gerado em ambiente administrativo seguro. Somente seu SHA-256 hexadecimal é persistido em `file_gateway_instances`; o valor bruto fica no secret store/ambiente da máquina do Gateway. Não coloque nenhum dos dois no React, logs, audit trail ou Git.

## Build, teste e execução

```powershell
npm run build
npm test
npm run health
npm start
npm run start:poll
```

- `npm start`: executa um ciclo e encerra.
- `npm run start:poll`: mantém polling com intervalo configurável e encerra de forma controlada em `SIGINT`/`SIGTERM`.
- `npm run health`: executa diagnóstico sanitizado e não processa jobs.
- `npm test`: testa o worker somente em diretórios temporários.

O health check informa somente versão, backend/instância, acesso à raiz e ao temp, suporte à publicação atômica, espaço disponível quando o sistema operacional o fornece, contagens de pendências/falhas/retries e horários das últimas atividades. Ele cria marcadores vazios aleatórios, testa hard link entre temp e raiz e os remove imediatamente. Nenhum caminho completo, secret ou URL é exibido. Código de saída diferente de zero indica que a instância não está pronta para processar arquivos.

Os testes integrados são restritos a Supabase e PostgreSQL locais. Eles requerem a Edge Function local já servida e variáveis de teste apenas no processo:

```powershell
npm run test:integration
npm run test:phase-c
```

`test:integration` valida Cloud → local. `test:phase-c` valida local → Cloud e também requer `TEST_SUPABASE_ANON_KEY` para autenticar usuários fictícios. Os harnesses usam a conexão PostgreSQL administrativa exclusivamente para criar e remover fixtures fictícias e operam somente em diretórios temporários. Essa capacidade não faz parte do runtime do Gateway.

## Consistência e recuperação

O destino segue `<organization_uuid>/<document_uuid>/<attachment_uuid>/<object_uuid>`, sem PII ou nome original. Downloads são gravados como `.partial-<uuid>` no temp configurado, conferidos por tamanho e SHA-256 e publicados por hard link atômico, sem sobrescrita. Volumes sem suporte à operação falham com `atomic_publish_unsupported`.

O staging usa `GATEWAY_TEMP_PATH`; por padrão ele fica dentro da raiz para permanecer no mesmo volume. A publicação por hard link nunca faz fallback para cópia seguida de exclusão. `EXDEV` (volumes diferentes), `EPERM` e `ENOTSUP` são falhas controladas. A resolução canônica com `realpath` protege leituras locais contra traversal e escape por junction/symlink. Unicode é suportado pelo runtime; suporte a caminhos longos depende da política do Windows, do cliente SMB e do servidor e deve ser homologado fisicamente.

Arquivo existente com hash e tamanho iguais é aceito idempotentemente; conteúdo diferente gera conflito e permanece intacto. Claims abandonados voltam à fila após expiração do lease. Falhas recebem backoff persistido e respeitam o máximo de tentativas. Temporários são removidos no `finally`; uma falha posterior à publicação é retomada sem novo download.

Eventos `FILE_SYNC_STARTED`, `FILE_SYNCED` e `FILE_SYNC_FAILED` são gravados sem segredo, URL assinada, Authorization ou caminho absoluto. O banco armazena apenas a referência relativa da cópia local.

Na disponibilização remota, `realpath` e contenção pela raiz bloqueiam traversal e escapes por symlink/junction. O Gateway valida tamanho, MIME e SHA-256 antes do upload. Objeto Cloud existente e igual conclui idempotentemente; conteúdo divergente gera conflito e nunca é sobrescrito. Jobs usam lease, backoff e retomada após reinício. Os eventos `REMOTE_COPY_REQUESTED`, `REMOTE_COPY_STARTED`, `REMOTE_COPY_COMPLETED` e `REMOTE_COPY_FAILED` não armazenam referência física, URL ou segredo.

## Serviço Windows futuro

O projeto não instala serviço automaticamente. Para execução manual use `npm start`; para um worker contínuo use `npm run start:poll`. Na implantação, empacote o build e registre `node dist/index.js --poll` com o gerenciador de serviços aprovado pela empresa. Configure diretório de trabalho, variáveis por secret store, reinício após falha, timeout de encerramento e rotação/captura de stdout/stderr JSON.

Execute com conta Windows dedicada, sem login interativo e com menor privilégio. Na pasta exclusiva de homologação ela precisa listar/ler os legados e criar diretórios, temporários, hard links e arquivos finais; não precisa acesso administrativo, a outros compartilhamentos ou permissão para apagar os arquivos legados. Conceda direitos pela combinação mínima de share e NTFS. Não use credenciais pessoais, Radmin, drive mapeado por usuário ou porta SMB exposta à internet.

Logs são JSON por linha e removem recursivamente chaves sensíveis, URLs e caminhos absolutos/UNC. Ciclos registram quantidades e duração; o health agrega jobs pendentes, falhas, retries e horários recentes. Integração com coletor externo permanece opcional para homologação.

O checklist operacional está em [`../docs/file-gateway-homologation-checklist.md`](../docs/file-gateway-homologation-checklist.md).
