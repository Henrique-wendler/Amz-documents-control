# File Gateway

Worker Node.js/TypeScript executado dentro da rede da empresa para sincronizar arquivos do bucket privado do Supabase para uma segunda cópia local. O tráfego é exclusivamente HTTPS de saída: o Gateway não expõe porta, endpoint ou compartilhamento SMB à internet.

## Fluxo

```text
File Gateway → HTTPS outbound → Edge Function file-gateway → Supabase/PostgreSQL/Storage
             → diretório temporário → SHA-256 → publicação local atômica
             → attachment_locations (network_share) + file_access_log
```

A Edge Function autentica a instância, deriva sua organização no banco, concede um lease e autoriza uma URL de download de curta duração. O worker nunca recebe `service_role`, senha PostgreSQL ou credencial de usuário final.

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

O teste integrado é restrito a Supabase e PostgreSQL locais. Ele requer a Edge Function local já servida e variáveis `TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY` e `TEST_DATABASE_URL` apenas no processo de teste:

```powershell
npm run test:integration
```

O harness usa a conexão PostgreSQL administrativa exclusivamente para criar e remover fixtures fictícias. Essa capacidade não faz parte do runtime do Gateway.

## Consistência e recuperação

O destino segue `<organization_uuid>/<document_uuid>/<attachment_uuid>/<object_uuid>`, sem PII ou nome original. Downloads são gravados como `.partial-<uuid>` no mesmo diretório do destino, conferidos por tamanho e SHA-256 e publicados por hard link atômico, sem sobrescrita. Volumes sem suporte à operação falham com `atomic_publish_unsupported`.

Arquivo existente com hash e tamanho iguais é aceito idempotentemente; conteúdo diferente gera conflito e permanece intacto. Claims abandonados voltam à fila após expiração do lease. Falhas recebem backoff persistido e respeitam o máximo de tentativas. Temporários são removidos no `finally`; uma falha posterior à publicação é retomada sem novo download.

Eventos `FILE_SYNC_STARTED`, `FILE_SYNCED` e `FILE_SYNC_FAILED` são gravados sem segredo, URL assinada, Authorization ou caminho absoluto. O banco armazena apenas a referência relativa da cópia local.

## Serviço Windows futuro

O projeto não instala serviço automaticamente. Na implantação, empacote o build e registre `npm run start:poll` ou `node dist/index.js --poll` com o gerenciador de serviços aprovado pela empresa, usando conta dedicada, acesso mínimo ao diretório e secret store do ambiente. Valide previamente suporte do volume/compartilhamento à publicação atômica e políticas de backup, retenção e monitoramento.
