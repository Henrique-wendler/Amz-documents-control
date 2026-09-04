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

As demais variáveis controlam lote, polling, timeouts, retries, backoff, limite de tentativas e duração do lease. O caminho raiz não pode ser a raiz do volume. Para um compartilhamento Windows, conceda acesso ao usuário restrito que executará futuramente o serviço; não grave usuário ou senha SMB neste arquivo.

O token deve ser gerado em ambiente administrativo seguro. Somente seu SHA-256 hexadecimal é persistido em `file_gateway_instances`; o valor bruto fica no secret store/ambiente da máquina do Gateway. Não coloque nenhum dos dois no React, logs, audit trail ou Git.

## Build, teste e execução

```powershell
npm run build
npm test
npm start
npm run start:poll
```

- `npm start`: executa um ciclo e encerra.
- `npm run start:poll`: mantém polling com intervalo configurável e encerra de forma controlada em `SIGINT`/`SIGTERM`.
- `npm test`: testa o worker somente em diretórios temporários.

Os testes integrados são restritos a Supabase e PostgreSQL locais. Eles requerem a Edge Function local já servida e variáveis de teste apenas no processo:

```powershell
npm run test:integration
npm run test:phase-c
```

`test:integration` valida Cloud → local. `test:phase-c` valida local → Cloud e também requer `TEST_SUPABASE_ANON_KEY` para autenticar usuários fictícios. Os harnesses usam a conexão PostgreSQL administrativa exclusivamente para criar e remover fixtures fictícias e operam somente em diretórios temporários. Essa capacidade não faz parte do runtime do Gateway.

## Consistência e recuperação

O destino segue `<organization_uuid>/<document_uuid>/<attachment_uuid>/<object_uuid>`, sem PII ou nome original. Downloads são gravados como `.partial-<uuid>` no mesmo diretório do destino, conferidos por tamanho e SHA-256 e publicados por hard link atômico, sem sobrescrita. Volumes sem suporte à operação falham com `atomic_publish_unsupported`.

Arquivo existente com hash e tamanho iguais é aceito idempotentemente; conteúdo diferente gera conflito e permanece intacto. Claims abandonados voltam à fila após expiração do lease. Falhas recebem backoff persistido e respeitam o máximo de tentativas. Temporários são removidos no `finally`; uma falha posterior à publicação é retomada sem novo download.

Eventos `FILE_SYNC_STARTED`, `FILE_SYNCED` e `FILE_SYNC_FAILED` são gravados sem segredo, URL assinada, Authorization ou caminho absoluto. O banco armazena apenas a referência relativa da cópia local.

Na disponibilização remota, `realpath` e contenção pela raiz bloqueiam traversal e escapes por symlink/junction. O Gateway valida tamanho, MIME e SHA-256 antes do upload. Objeto Cloud existente e igual conclui idempotentemente; conteúdo divergente gera conflito e nunca é sobrescrito. Jobs usam lease, backoff e retomada após reinício. Os eventos `REMOTE_COPY_REQUESTED`, `REMOTE_COPY_STARTED`, `REMOTE_COPY_COMPLETED` e `REMOTE_COPY_FAILED` não armazenam referência física, URL ou segredo.

## Serviço Windows futuro

O projeto não instala serviço automaticamente. Na implantação, empacote o build e registre `npm run start:poll` ou `node dist/index.js --poll` com o gerenciador de serviços aprovado pela empresa, usando conta dedicada, acesso mínimo ao diretório e secret store do ambiente. Valide previamente suporte do volume/compartilhamento à publicação atômica e políticas de backup, retenção e monitoramento.
