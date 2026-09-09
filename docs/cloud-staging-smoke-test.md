# Smoke test de homologação Cloud

Execute este checklist somente no projeto Cloud identificado como `staging`, com usuários e dados fictícios. Não use produção, dados pessoais reais ou o compartilhamento corporativo.

## Pré-voo

- [ ] `npm run check:staging:static` aprovado.
- [ ] `supabase/validation/staging-readiness.sql` aprovado.
- [ ] Migrations remotas mostram exatamente `001–016` aplicadas.
- [ ] Frontend e API usam HTTPS; navegador não apresenta mixed content.
- [ ] CORS aceita apenas a origem HTTPS de staging.
- [ ] Nenhum secret aparece no bundle, logs do navegador ou repositório.

## Auth e sessão

- [ ] Usuário sem sessão é redirecionado para `/login`.
- [ ] Login válido e inválido têm mensagens controladas.
- [ ] Signup público permanece bloqueado.
- [ ] Convite por Admin funciona e retorna somente à origem de staging.
- [ ] Enrollment e challenge MFA TOTP funcionam.
- [ ] MFA incompleto não acessa rotas protegidas.
- [ ] Recovery chega ao e-mail fictício, abre `/redefinir-senha` uma vez e permite a nova senha.
- [ ] Logout encerra sessão e reload restaura somente sessão válida.
- [ ] Profile ausente/inativo continua bloqueado.

## Administração e permissions

- [ ] Admin gerencia usuários e catálogos autorizados.
- [ ] Manager, Operator e Viewer respeitam as permissions vigentes, sem checks hardcoded por role.
- [ ] Usuário sem `users.manage` não usa Administração de Usuários.
- [ ] Usuário sem `catalogs.manage` não altera catálogos.
- [ ] Usuário comum não altera `audit_log`.

## Dados e isolamento

- [ ] CRUD aprovado para Proprietários, Fazendas, Matrículas, Documentos, CAR, Operações e Garantias.
- [ ] Relações por UUID, constraints cross-tenant e concorrência por `version` continuam válidas.
- [ ] Dashboard e Consulta Geral refletem dados reais após reload.
- [ ] Crie temporariamente uma segunda organização fictícia e um usuário próprio para o teste.
- [ ] Tenant A não lê, altera ou relaciona UUID conhecido do Tenant B.
- [ ] Remova integralmente as fixtures temporárias do Tenant B após registrar a evidência.

## Financeiro e relatórios

- [ ] Usuário com `financial.read` consulta valores permitidos.
- [ ] Usuário sem `financial.read` não recebe valores financeiros do backend.
- [ ] Os sete tipos de relatório geram PDF e XLSX com filtros e tenant corretos.
- [ ] Usuário sem permissions de relatório não exporta.
- [ ] `report_log` registra usuário, organização, tipo e formato sem secrets.

## Storage privado

- [ ] Upload permitido cria objeto em `rural-documents` e metadata/location correspondente.
- [ ] Download autorizado usa URL temporária e cache privado/no-store.
- [ ] Outro tenant não acessa o objeto mesmo conhecendo sua key.
- [ ] MIME, tamanho máximo e SHA-256 são validados.
- [ ] Usuário sem `files.read`/`files.manage` é bloqueado.
- [ ] Upload/download Cloud funciona sem instância ativa do File Gateway.
- [ ] Nenhuma URL assinada, token, object key desnecessária ou path interno aparece em logs/auditoria.

## Edge Functions

- [ ] `admin-users`, `document-files` e `generate-report` rejeitam JWT ausente/inválido.
- [ ] `file-gateway` rejeita instância/secret inválido mesmo sem verificação JWT da plataforma.
- [ ] CORS rejeita uma origem diferente da allowlist.
- [ ] Responses sensíveis usam `no-store` quando aplicável.
- [ ] Erros não revelam SQL, token, credencial ou path.

## Auditoria e encerramento

- [ ] INSERT/UPDATE/inativação relevantes geram `audit_log`.
- [ ] Alterações financeiras preservam rastreabilidade old → new e redação de PII.
- [ ] Eventos de arquivo são registrados sem path, URL assinada ou secret.
- [ ] Logs e evidências foram sanitizados.
- [ ] Objetos e fixtures descartáveis foram removidos.
- [ ] Não existe instância ativa do Gateway antes da homologação física SMB/NTFS.
- [ ] Pendências, responsáveis e decisão de aceite foram registradas.

