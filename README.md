# Sistema de Gestão de Imóveis Rurais

Frontend corporativo para administrar imóveis rurais, seus proprietários, matrículas, operações financeiras, garantias, documentos, CAR e relatórios. O sistema usa Supabase/PostgreSQL como fonte única dos dados de negócio e foi estruturado para operar com isolamento por organização.

Este README apresenta o estado técnico aprovado e o caminho de onboarding para desenvolvimento local e futura transferência do sistema para outro time.

## Estado atual

- MockStore, seeds demonstrativos e selectors legados foram removidos.
- Todos os módulos de negócio usam Supabase.
- Autenticação, recuperação de senha e MFA TOTP estão funcionais.
- Administração de Usuários e Administração de Catálogos estão concluídas no escopo atual.
- O schema é reproduzido pelas migrations `001` a `012`.
- O ambiente atual é local; homologação e produção ainda não foram implantadas.

## Módulos disponíveis

| Área | Funcionalidade |
|---|---|
| Visão Geral | KPIs, alertas, gráficos e atividades derivados dos dados reais |
| Consulta Geral | Busca consolidada e deep links para os cadastros |
| Proprietários | Cadastro, edição, inativação e exclusão lógica |
| Fazendas | Cadastro, edição, vínculos e consulta detalhada |
| Matrículas | Cadastro, titularidade e vínculos com fazendas e proprietários |
| Operações e Garantias | Operações, financeiro protegido, matrículas N:N, garantias, tipos e itens |
| Documentos | Documentos rurais, validade derivada e referências de anexos |
| CAR | Cadastro Ambiental Rural por fazenda e matrícula opcional |
| Relatórios | Sete consultas consolidadas com filtros, pré-visualização e exportação PDF server-side |
| Administração de Usuários | Convites, perfis, situação e recuperação de acesso |
| Administração de Catálogos | Instituições financeiras, tipos de garantia e tipos de documento |

O armazenamento e a entrega de arquivos de negócio reais ainda não fazem parte da implementação atual. Relatórios PDF são gerados sob demanda e entregues diretamente, sem persistência permanente do arquivo.

## Arquitetura

O fluxo padrão dos módulos de negócio é:

```text
Component → Service → Repository → Supabase
```

- `Component`: apresentação e interação da interface.
- `Service`: validação e regras da aplicação.
- `Repository`: consultas, persistência e mapeamento `snake_case ↔ camelCase`.
- `Supabase`: Auth, PostgreSQL, RLS, RPCs, auditoria e serviços locais/remotos.

Componentes não acessam o cliente Supabase diretamente. Totais, contadores e ViewModels enriquecidos são derivados e não são persistidos nas entidades.

### Arquitetura administrativa

Operações administrativas que exigem capacidade privilegiada usam o fluxo:

```text
Component → Service → Repository → Edge Function → Supabase Auth/PostgreSQL
```

A função `admin-users` valida a sessão, a permission `users.manage` e o `organization_id` do usuário antes de atuar. Credenciais administrativas permanecem exclusivamente no ambiente seguro da função e nunca são enviadas ao navegador.

A Administração de Catálogos usa o fluxo padrão de repositories e é protegida por `catalogs.manage` e RLS.

## Tecnologias

- React 19
- TypeScript 5.9
- Vite 7
- Fluent UI React 9
- Supabase JS 2
- Supabase CLI, incluída como dependência de desenvolvimento
- PostgreSQL 17 no ambiente local configurado
- Docker para a stack Supabase local

## Pré-requisitos

- Git.
- Node.js e npm compatíveis com as dependências bloqueadas em `package-lock.json`. O projeto não fixa uma versão em `engines`; use uma versão LTS atual.
- Docker Desktop iniciado.
- Portas locais configuradas em `supabase/config.toml` disponíveis.

Não é necessário instalar a Supabase CLI globalmente; os comandos usam `npx` e a versão declarada pelo projeto.

## Instalação local

Na raiz do projeto:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Em sistemas Unix-like, o segundo comando equivale a:

```bash
cp .env.example .env.local
```

Preencha em `.env.local` somente:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Para o ambiente local, use a URL e a chave publicável informadas pelo comando de inicialização do Supabase. Não copie credenciais privilegiadas, senhas de banco ou tokens para arquivos do frontend.

O `.env.local` é ignorado pelo Git. Preserve `.env.example` sem valores sensíveis.

## Supabase local e Docker

Com o Docker iniciado, execute na raiz do projeto:

```powershell
npx supabase start
```

Esse comando inicia a stack local configurada em `supabase/config.toml`, incluindo PostgreSQL, Auth, API, Studio, Mailpit e runtime de Edge Functions. Em uma criação limpa do banco, as migrations são aplicadas na ordem numérica.

Comandos úteis:

```powershell
npx supabase status
npx supabase migration list --local
npx supabase migration up --local
npx supabase stop
```

- `status`: verifica os serviços e endereços locais.
- `migration list --local`: compara o histórico local com os arquivos do projeto.
- `migration up --local`: aplica migrations pendentes ao banco local já existente.
- `stop`: encerra a stack local.

Não use comandos destrutivos de reconstrução do banco sem confirmar que o alvo é exclusivamente local e que nenhum dado necessário precisa ser preservado.

### Migrations

As migrations ficam em `supabase/migrations/` e atualmente vão de:

```text
202608270001_core_identity.sql
...
202609030012_catalog_administration.sql
```

Elas devem ser executadas na ordem existente. Alterações de schema, RLS, functions SQL ou permissions devem ser feitas em migration incremental; migrations já aplicadas não devem ser reescritas silenciosamente.

O detalhamento de cada migration está em [`docs/database-schema.md`](docs/database-schema.md).

## Como iniciar o ambiente local

Use terminais separados.

### 1. Backend Supabase

```powershell
npx supabase start
```

### 2. Edge Functions

Na primeira configuração local, crie o arquivo de ambiente da função a partir do exemplo:

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env
```

Depois execute o runtime local; a CLI serve as funções configuradas no projeto:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
```

O arquivo contém apenas as origens autorizadas e a URL pública local usadas pelas funções; convites e recuperações também usam a URL pública. Em produção, essas URLs deverão ser HTTPS e específicas do ambiente.

### 3. Frontend

```powershell
npm run dev
```

Abra o endereço informado pelo Vite. A configuração local de Auth espera normalmente o frontend em `http://127.0.0.1:5173`.

Para conferir o build como será servido:

```powershell
npm run build
npm run preview
```

## Bootstrap local

O sistema não possui cadastro público nem criação de organização pelo frontend. O ambiente local precisa ser provisionado administrativamente com:

1. uma organização ativa;
2. um usuário fictício no Supabase Auth;
3. um `profile` ativo ligado à organização;
4. o role administrativo apropriado.

Não use dados pessoais reais no ambiente de desenvolvimento. O processo de provisionamento e as regras de bootstrap estão descritos em [`docs/database-schema.md`](docs/database-schema.md).

## Auth, MFA e recuperação

- Login por e-mail e senha usa exclusivamente Supabase Auth.
- Todas as rotas funcionais são protegidas.
- A sessão é persistida e restaurada pelo cliente Supabase.
- Profiles ausentes ou inativos bloqueiam o acesso.
- MFA usa TOTP nativo do Supabase e é exigido no fluxo atual.
- O primeiro acesso sem fator configurado conduz ao enrollment por QR Code ou chave manual temporária.
- O código TOTP é validado pelo Supabase; o segredo não é persistido pelo frontend.
- A recuperação de senha usa link por e-mail e a rota `/redefinir-senha`.
- No ambiente local, as mensagens podem ser inspecionadas no Mailpit iniciado pela stack.
- Uma sessão de recuperação não concede acesso às rotas protegidas e é encerrada ao fim do fluxo.

Não existe cadastro público, criação de organização ou troca de tenant na V1.

## Administração de Usuários

A rota `/administracao/usuarios` exige `users.manage`.

O módulo permite:

- listar usuários da organização;
- convidar usuários;
- alterar nome, perfil e situação;
- inativar e reativar acesso;
- enviar recuperação de senha;
- consultar a situação do MFA sem expor seus fatores.

A Edge Function deriva a organização do usuário autenticado. O frontend não informa nem escolhe outro tenant. Um guard transacional impede remover o último usuário ativo com capacidade de administrar usuários.

## Roles, permissions e RLS

Os roles iniciais são `admin`, `manager`, `operator` e `viewer`. A autorização não deve usar verificações hardcoded de role. O frontend consulta permissions reais por `usePermissions`, e o banco aplica a segurança efetiva por RLS.

Princípios obrigatórios:

- a UI pode ocultar ações sem permission, mas isso é apenas UX;
- RLS e grants continuam obrigatórios para leitura e escrita;
- valores financeiros exigem permissions específicas e não devem ser consultados quando o usuário não possui acesso;
- auditoria exige permission própria;
- administração de usuários e catálogos usa permissions administrativas distintas;
- conhecer um UUID nunca concede acesso ao registro.

Na exportação PDF, a Edge Function revalida a sessão, o profile ativo, a organização e as permissions `reports.read`, `reports.generate` e `reports.export`. Valores de Operações e Garantias só são consultados e incluídos com `financial.read` e `reports.financial`. Cada geração grava `report_log`; o PDF é devolvido diretamente com cache desabilitado e a URL temporária criada pelo frontend é revogada após o download.

## Multi-tenancy

O sistema é multi-tenant-ready e opera inicialmente com uma organização por profile.

- `profiles.organization_id` é obrigatório.
- Cada usuário pertence a exatamente uma organização na V1.
- Dados empresariais carregam `organization_id`.
- RLS exige profile ativo, permission adequada e mesma organização.
- FKs compostas evitam relações entre tenants.
- Unicidades de negócio são delimitadas pela organização quando aplicável.
- Não há seletor de organização nem usuário multi-organização nesta versão.

## Estrutura de pastas

```text
src/
  components/      componentes compartilhados e por domínio
  contexts/        AuthContext e estado global de autenticação
  hooks/           hooks de aplicação e permissions
  lib/             cliente Supabase e infraestrutura comum
  pages/           composição das rotas e fluxos de tela
  repositories/    persistência, queries e mapeamento PostgreSQL/TypeScript
  services/        regras de aplicação, validação e ViewModels
  styles/          estilos globais e responsivos
  types/           entidades, contratos e modelos de apresentação
supabase/
  functions/       Edge Functions e exemplos de configuração
  migrations/      schema incremental, RLS, RPCs e permissions
  config.toml      configuração da stack local
docs/              arquitetura, decisões e questões de negócio
```

## Padrão para novas funcionalidades

1. Leia `AGENTS.md` e os documentos em `docs/`.
2. Reutilize o design system e componentes existentes.
3. Defina entidades e contratos técnicos em inglês; mantenha a UI em português.
4. Implemente a cadeia `Component → Service → Repository → Supabase`.
5. Nunca consulte Supabase diretamente em componentes.
6. Reutilize entidades e relacione registros por IDs; não duplique nomes ou totais derivados.
7. Mapeie `snake_case` do banco para `camelCase` em repositories.
8. Preserve `organization_id`, RLS, permissions, auditoria e `version`.
9. Use o helper de data civil para colunas PostgreSQL `DATE`; não introduza timezone nessas datas.
10. Para mudanças de schema, crie migration incremental e teste somente no ambiente local/desenvolvimento isolado.
11. Inclua estados de loading, empty, error, retry e feedback conforme o padrão existente.
12. Execute o build e a validação relacional pertinente antes de concluir.

## Regras críticas de segurança

- Nunca versionar `.env`, credenciais, senhas, tokens, chaves reais ou dados pessoais reais.
- Apenas URL e chave publicável do Supabase podem ser usadas pelo frontend.
- Credenciais administrativas pertencem ao runtime seguro de backend/Edge Functions.
- Não armazenar senha, token de sessão ou segredo TOTP em tabelas, seeds ou logs da aplicação.
- Não confiar na ocultação de botões como mecanismo de autorização.
- Não desabilitar RLS para contornar falhas de acesso.
- Não aceitar `organization_id` informado pelo navegador em fluxos administrativos privilegiados.
- Preservar redação/minimização de CPF/CNPJ, telefone, e-mail, notas sensíveis e caminhos de arquivos na auditoria.
- Usar dados exclusivamente fictícios em desenvolvimento e testes.
- Não reescrever migrations ou commits anteriores.

## Build e testes

Validação mínima de código:

```powershell
npm run build
```

O comando executa o build TypeScript e Vite. Para inspecionar o artefato localmente:

```powershell
npm run preview
```

O projeto ainda não possui script `npm test`, suíte E2E padronizada ou comando único de validação do banco. Mudanças relacionais devem ser validadas contra o Supabase local com fixtures fictícias temporárias e limpeza posterior. Testes de RLS devem contemplar permissions, isolamento de tenant, concorrência e auditoria conforme o escopo alterado.

Não execute regressão completa, automação de navegador ou screenshots em toda tarefa; faça isso somente quando solicitado ou proporcional ao risco da mudança.

## Ambientes

### Desenvolvimento

- Supabase e frontend locais.
- Docker e Mailpit locais.
- Somente dados fictícios.
- Migrations podem reconstruir o banco antes da entrada de dados reais.

### Homologação

- Ainda pendente.
- Deve usar ambiente isolado e dados sintéticos próprios.
- Deve validar fluxos de negócio, segurança, backup/restore, navegadores e critérios de aceite.

### Produção

- Ainda não implantada.
- Deve usar frontend HTTPS e Supabase Cloud configurado por ambiente.
- Exige hardening, observabilidade, backup, recuperação, política de retenção e gestão segura de secrets.

Dados e credenciais nunca devem ser compartilhados entre desenvolvimento, homologação e produção.

## Acesso remoto futuro

A arquitetura prevê:

```text
Navegador HTTPS
  → frontend React
  → Supabase Cloud com Auth/RLS
  → backend/Edge Functions para operações privilegiadas
```

URLs, callbacks e origens permitidas serão configurados por ambiente. Nenhum IP local deve ser compilado no bundle de produção. A migração para acesso remoto não deve alterar o modelo de permissions, RLS, auditoria ou isolamento por organização.

## Troubleshooting

### `npm` não é reconhecido

Instale uma versão LTS do Node.js, abra um novo terminal e execute `npm ci` na raiz.

### O frontend informa que o Supabase não está configurado

Confirme que `.env.local` existe, contém as duas variáveis públicas esperadas e reinicie `npm run dev` após qualquer mudança.

### A stack local não inicia

Confirme que o Docker Desktop está iniciado e que as portas definidas em `supabase/config.toml` estão livres. Use `npx supabase status` para verificar o estado.

### Migration pendente ou schema divergente

Execute:

```powershell
npx supabase migration list --local
npx supabase migration up --local
```

Não edite uma migration já aplicada para mascarar a divergência.

### Login funciona, mas o acesso é bloqueado

Verifique se o usuário possui `profile` ativo, organização ativa, role válido e permissions necessárias. Corrija o provisionamento; não contorne RLS.

### Convite ou administração de usuários falha

Confirme que `admin-users` está sendo servida, que `supabase/functions/.env` foi criado a partir do exemplo e que `APP_PUBLIC_URL` está incluída em `ALLOWED_ORIGINS`.

### Exportação PDF falha

Confirme que `generate-report` está sendo servida, que a origem do frontend está em `ALLOWED_ORIGINS` e que o usuário possui as permissions de leitura, geração e exportação. Para relatórios financeiros, confirme também `financial.read` e `reports.financial`.

### E-mail de recuperação não aparece localmente

Confirme o Mailpit em `npx supabase status` e verifique se a URL de retorno corresponde às URLs permitidas em `supabase/config.toml`.

### Código MFA é recusado

Confirme a sincronização de horário do computador e do aplicativo autenticador. Não remova fatores diretamente no banco.

## Limitações e roadmap

- Exportação XLSX e CSV; a implementação atual exporta somente PDF.
- Upload e armazenamento de arquivos reais; integração autorizada com storage/servidor de arquivos.
- Antivírus, retenção e backup dos arquivos.
- Hardening final para produção, incluindo headers, limites distribuídos, observabilidade e recuperação.
- Ambiente de homologação e aceite formal.
- Definição de CAB e HP.
- Decisões de negócio ainda abertas em documentos, operações, garantias, retenção e governança.

## Documentação de referência

- [`AGENTS.md`](AGENTS.md): regras permanentes para alterações no projeto.
- [`docs/database-schema.md`](docs/database-schema.md): schema, migrations, RLS, auditoria, bootstrap e arquitetura administrativa.
- [`docs/mock-to-postgres-mapping.md`](docs/mock-to-postgres-mapping.md): histórico da migração para Supabase e divergências de domínio.
- [`docs/database-open-questions.md`](docs/database-open-questions.md): decisões fechadas e questões de negócio pendentes.
