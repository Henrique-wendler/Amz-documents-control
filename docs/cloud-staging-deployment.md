# Implantação de homologação Cloud

Este guia prepara uma implantação futura em ambiente isolado. Ele não autoriza deploy, criação de recursos externos nem uso de dados reais.

## Ambientes

| Ambiente | Supabase | Frontend | Dados | Finalidade |
|---|---|---|---|---|
| `development` | stack local via Docker | servidor Vite local | exclusivamente fictícios | desenvolvimento e testes técnicos |
| `staging` | projeto Supabase Cloud exclusivo | origem HTTPS exclusiva | exclusivamente fictícios | homologação funcional e de segurança |
| `production` | projeto Cloud futuro e separado | origem HTTPS futura e separada | somente após aceite | operação real |

Projetos, Auth users, buckets, secrets, URLs e dados não são compartilhados entre ambientes. O `supabase/config.toml`, endereços loopback e Mailpit pertencem somente ao desenvolvimento local. O bundle do frontend recebe sua origem Supabase por ambiente e não depende desses endereços.

As permissões amplas de rede presentes no arquivo local não configuram o projeto Cloud. Em staging, revise as restrições de rede do banco no painel/infraestrutura aprovada, evite exposição direta desnecessária e use conexão administrativa temporária somente durante migrations e validações.

## Classificação das variáveis

### Frontend publicável

Somente estas variáveis podem usar o prefixo `VITE_` e entrar no bundle:

| Variável | Conteúdo |
|---|---|
| `VITE_SUPABASE_URL` | URL HTTPS pública do projeto Supabase do ambiente |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável/anon do mesmo projeto |

Copie `.env.example` para um arquivo local ignorado pelo Git. Nunca use `service_role`, senha PostgreSQL, token do Gateway ou outro secret com prefixo `VITE_`.

### Edge Functions

Crie fora do Git um arquivo de staging baseado em `supabase/functions/.env.example`:

| Variável | Classificação | Uso |
|---|---|---|
| `ENVIRONMENT` | configuração backend | `staging` |
| `ALLOWED_ORIGINS` | configuração backend | origens HTTPS exatas do frontend, separadas por vírgula |
| `APP_PUBLIC_URL` | configuração backend | URL HTTPS canônica do frontend para convite e recovery |
| `STORAGE_PUBLIC_URL` | configuração backend | URL HTTPS pública da API Supabase do ambiente |
| `DOCUMENT_UPLOAD_MAX_BYTES` | política backend | limite igual ou inferior ao bucket |
| `DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES` | política backend | allowlist de MIME |
| `FILE_GATEWAY_SIGNED_URL_SECONDS` | política backend | duração curta das autorizações |
| `FILE_GATEWAY_MAX_BATCH_SIZE` | política backend | limite de lote do Gateway |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo runtime Supabase às funções. A última é secreta e nunca pertence ao React, `.env.example`, seed ou log.

### File Gateway

As variáveis de `gateway/.env.example` pertencem exclusivamente à máquina do Gateway. `GATEWAY_TOKEN`, raiz SMB e temp nunca vão ao React, banco em texto puro ou Git. Em staging remoto use `NODE_ENV=production` para exigir HTTPS. O Gateway pode permanecer desabilitado: não provisione instância ativa enquanto a homologação física estiver pendente.

## Sequência de implantação futura

Execute somente depois que o projeto Cloud de staging tiver sido criado e identificado formalmente.

### 1. Vincular o projeto isolado

```powershell
$stagingProjectRef = "<project-ref-de-staging>"
npx supabase link --project-ref $stagingProjectRef
```

Confirme no terminal e no painel que o alvo é staging antes de qualquer escrita.

### 2. Revisar e aplicar migrations

```powershell
npm run check:staging:static
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
```

Não use `--include-seed`: `supabase/staging/seed.sql` é deliberadamente separado de `supabase/seed.sql` e nunca roda automaticamente. As migrations `001` a `023` devem ser o único caminho para criar schema, RLS, permissions, RPCs e bucket em um banco vazio.

Depois, usando uma conexão administrativa temporária obtida no ambiente seguro:

```powershell
psql "$env:STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/validation/staging-readiness.sql
```

O validador é somente leitura e verifica o histórico `001–023`, 33 tabelas públicas, RLS, ausência de policy permissiva `authenticated → ALL`, policies restritivas de `aal2`, permissions críticas, bucket privado, policies de Storage, RPCs sensíveis e os `SELECT` mínimos do File Gateway. Execute-o após aplicar a Migration 023 no ambiente autorizado.

### 3. Configurar secrets e políticas das Edge Functions

Crie `supabase/functions/.env.staging` fora do Git a partir do exemplo e preencha apenas os valores do ambiente. Confirme HTTPS e CORS exato, então execute:

```powershell
npx supabase secrets set --env-file supabase/functions/.env.staging --project-ref $stagingProjectRef
```

Não inclua as variáveis reservadas `SUPABASE_*` no arquivo.

### 4. Publicar Edge Functions

Funções necessárias:

| Função | Autenticação | Responsabilidade |
|---|---|---|
| `admin-users` | JWT obrigatório | convites e administração de usuários |
| `document-files` | JWT obrigatório | upload/download privado e locations |
| `generate-report` | JWT obrigatório | PDF/XLSX e `report_log` |
| `file-gateway` | token dedicado da instância | jobs Cloud ↔ local; pode ficar sem instância ativa |

```powershell
npx supabase functions deploy admin-users document-files --project-ref $stagingProjectRef
npx supabase functions deploy generate-report --project-ref $stagingProjectRef
npx supabase functions deploy file-gateway --project-ref $stagingProjectRef --no-verify-jwt
```

`generate-report` lê fontes e logo de `assets/` para produzir PDF. O deploy dessa função exige Docker ativo e o empacotamento local da CLI; **não use `--use-api`**. Após o deploy, baixe o ZIP da função implantada e confirme que as duas fontes `.ttf`, o logo `.jpg` e a licença estão presentes em `assets/`. `check:staging:static` verifica os arquivos e a configuração no repositório, mas não comprova o conteúdo do bundle remoto. Teste PDF e XLSX no staging antes de aprovar a publicação.

O cálculo do gráfico de fazendas permanece em `supabase/functions/_shared/farmAreaChart.ts` e é importado pela pré-visualização Vite e por `generate-report`. O módulo contém apenas TypeScript e APIs JavaScript comuns aos dois runtimes. A [estrutura recomendada para Edge Functions](https://supabase.com/docs/guides/functions/development-environment#recommended-project-structure) mantém código compartilhado em `_shared` dentro de `supabase/functions`; este projeto usa o comando de deploy padrão acima, sem um fluxo de empacotamento verificado para imports externos a essa árvore. O sucesso de `functions serve` local não comprova que um módulo na raiz ou em `src/` será incluído no bundle de deploy. Mantenha essa localização até validar o empacotamento do mesmo fluxo de deploy antes de mover a fonte compartilhada.

O `file-gateway` continua autenticando a instância no próprio backend; `--no-verify-jwt` não o torna público sem o token dedicado válido.

As funções `admin-users`, `document-files` e `generate-report` validam o JWT do usuário e exigem o claim `aal2` antes de operações privilegiadas. O `file-gateway` usa exclusivamente autenticação de instância e não recebe a exceção de MFA do usuário.

### 5. Configurar Auth

No projeto de staging:

- Site URL: origem HTTPS canônica do frontend.
- Redirect URL de recovery: `<origem-https>/redefinir-senha`.
- Redirects de convite: somente origens HTTPS aprovadas.
- cadastro público global desabilitado;
- login e convite por e-mail habilitados para administração;
- MFA TOTP enrollment/verification habilitados; SMS desabilitado;
- SMTP de homologação configurado sem reutilizar credenciais de produção;
- rotação de refresh token, política de senha e rate limits revisados.

Teste que uma chamada pública de signup continua bloqueada. Convites devem partir apenas de `admin-users` por usuário com `users.manage`.

### 6. Validar Storage

Confirme que o bucket `rural-documents` existe, está privado, mantém limite/MIME das migrations e possui as quatro policies tenant-aware sobre `storage.objects`. Upload/download Cloud deve funcionar com o Gateway desligado. Não crie URL pública permanente.

### 7. Provisionar usuários e seed fictício

Crie quatro usuários fictícios pelo ambiente administrativo seguro do Auth, sem senha ou e-mail no repositório. Guarde os UUIDs retornados e execute manualmente:

```powershell
psql "$env:STAGING_DATABASE_URL" `
  -v seed_environment=staging `
  -v admin_user_id="<uuid-admin>" `
  -v manager_user_id="<uuid-manager>" `
  -v operator_user_id="<uuid-operator>" `
  -v viewer_user_id="<uuid-viewer>" `
  -f supabase/staging/seed.sql
```

O seed é idempotente, contém apenas dados sintéticos e cria uma organização, profiles, catálogos, proprietários, fazenda, matrícula, titularidade, documento, CAR, operação e garantia. Ele não cria Auth users, não recebe senhas e não provisiona File Gateway.

### 8. Construir e publicar o frontend

Em um arquivo local ignorado pelo Git, configure somente as duas variáveis publicáveis do projeto de staging:

```powershell
npm ci
npm run build
```

Publique o conteúdo de `dist/` em uma origem HTTPS. Configure fallback para `index.html` nas rotas do SPA, headers de segurança/cache do provedor e nunca sirva `.env`, sourcemaps privados ou arquivos de configuração.

No projeto Vercel, `vercel.json` mantém o fallback da SPA e aplica os headers de segurança como valores literais. Embora a [configuração programática oficial da Vercel](https://vercel.com/docs/project-configuration/vercel-ts) documente `vercel.mjs`, o fluxo de deploy observado extraiu estaticamente o export `config` e rejeitou o valor indireto da CSP como ausente. A configuração JSON evita depender dessa avaliação. Mantenha apenas um arquivo de configuração Vercel.

A CSP atual é **exclusiva de staging** e permite a origem pública exata `https://iglciwizbxtkfwlboihe.supabase.co` para Auth/API/Functions/Storage, além de sua origem WebSocket. `VITE_SUPABASE_URL` deve apontar para esse mesmo projeto. Antes de qualquer futura publicação em produção, prepare uma configuração específica para a nova origem Supabase; a configuração atual bloqueará outras origens. Não use wildcard para contornar essa restrição. `script-src` aceita somente a própria origem; `style-src 'unsafe-inline'` é necessário para os estilos injetados pelo Fluent UI e para os estilos dos gráficos. O QR de TOTP usa imagem `data:`, e o logo e as fontes da interface usam a própria origem. As fontes do PDF são incorporadas pela Edge Function. Valide os headers HTTPS e o console após cada deploy, inclusive `/redefinir-senha` com refresh, downloads PDF/XLSX via Blob e acesso aos objetos privados de Storage.

### 9. Executar smoke test

Siga [`cloud-staging-smoke-test.md`](cloud-staging-smoke-test.md). O aceite exige Auth/MFA/recovery, administração, CRUD, Dashboard/Consulta, relatórios, Storage, RLS, cross-tenant e auditoria aprovados com evidências sanitizadas.

## Rollback e separação

- Não execute rollback destrutivo sem plano e backup do próprio staging.
- Para backup de banco, bytes de Storage e ensaio de restore antes de produção, siga [`backup-restore-runbook.md`](backup-restore-runbook.md).
- Corrija schema somente com migration incremental posterior à `023`.
- Remova fixtures temporárias de tenant B e objetos de teste ao concluir.
- Produção exigirá novo projeto, novos secrets, nova origem HTTPS e novo ciclo completo de validação; nunca promova o banco de staging como produção.
