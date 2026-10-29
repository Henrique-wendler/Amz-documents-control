# Recuperação administrativa de MFA

O procedimento atende perda ou troca de celular do **mesmo usuário**. Exige um executor com `users.manage`, perfil/organização ativos e sessão AAL2. A organização é derivada no backend; o navegador envia somente `action=reset_mfa` e `targetId`.

## Operação

1. Confirmar a identidade do solicitante pelos procedimentos internos da organização.
2. Abrir **Administração → Usuários** e localizar a conta correta.
3. Conferir o status **MFA configurado** / **MFA não configurado**. Um fator incompleto pode existir sem MFA configurado.
4. Em **Ações → Redefinir MFA**, conferir o nome na confirmação e confirmar **Redefinir MFA**.
5. Orientar o usuário a entrar novamente com sua própria senha, abrir **Configurar autenticador**, cadastrar o novo QR/chave manual no seu aplicativo e confirmar o código atual.
6. Somente após `challengeAndVerify` válido o fator fica verified e a sessão chega a AAL2.

A ação aparece quando há algum fator, inclusive incompleto. Backend mantém resposta controlada quando já não há fatores. Nenhum factor ID, secret ou token é exibido na administração. O novo secret existe apenas no fluxo temporário de enrollment e é descartado da UI após confirmação/cancelamento; não vai para configuração, SQLite, audit ou logs da aplicação.

## Efeito e limites

O reset remove os fatores via Supabase Auth Admin e encerra as sessões do **alvo**. Não altera senha, nome, profile, status, role, permissions, organização, propostas ou acompanhamento gerencial. O executor permanece autenticado em AAL2.

A própria conta do executor não pode ser redefinida por essa ação: outro administrador autorizado deve realizá-la. Isso preserva a sessão do executor e não é uma restrição de último administrador. A conta do último administrador pode ser recuperada por outro usuário com `users.manage`, inclusive um gestor com essa permission real.

Cada conclusão gera `USER_MFA_RESET`: organização derivada, actor_user_id, entity_id do alvo, created_at, `removed_factor_count.new` e outcome complete/partial. Não inclui senha, tokens, seeds ou IDs dos fatores. Se a remoção externa falhar parcialmente, sessões são revogadas e a contagem efetivamente removida é auditada; a interface recebe erro controlado. Falha de auditoria não é apresentada como sucesso.

A migration 025 acrescenta uma RPC exclusiva do servidor para concluir revogação/auditoria atomicamente. A verificação compartilhada de RLS passa a exigir também uma sessão real AAL2 em `auth.sessions` correspondente ao `session_id` do JWT; um JWT antigo assinado não conserva acesso após a revogação. Não há fallback para AAL1 ou token sem sessão. O próprio profile segue legível em AAL1 conforme a policy anterior, para permitir enrollment.

## Troca de funcionário

- **Perdeu/trocou celular:** recuperar MFA da mesma identidade, após confirmar a identidade do solicitante.
- **Funcionário saiu:** inativar a conta antiga e criar/convidar uma nova conta. O novo funcionário define a própria senha e configura seu próprio MFA.
- Nunca renomear a conta histórica de João para Maria para reaproveitar identidade ou auditoria.

## Diagnóstico e suporte

Não pedir senha, QR ou secret ao usuário. Não criar autenticador técnico em uma conta de uso humano. Se não existir outro usuário autorizado, a recuperação excepcional deve ser feita em runtime administrativo seguro, limitada a um user_id/e-mail/tenant previamente verificados, usando Auth Admin. Não executar scripts de QA contra dados reais.

O QA remoto optativo desta implementação usa `node scripts/qa/admin-mfa-recovery-staging.mjs --staging`. O único projeto aceito é `iglciwizbxtkfwlboihe`. O runner cria identidades sintéticas próprias, usa credenciais somente em memória, encerra essas contas por IDs conhecidos e grava apenas evidências sanitizadas em `.tmp`. Ele não recupera a conta humana/QA manual preexistente.

Validação e estado de publicação: [ADMIN_MFA_RECOVERY_VALIDATION.md](../ADMIN_MFA_RECOVERY_VALIDATION.md).

Referências oficiais: [Auth Admin deleteFactor](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor), [sessões e JWTs](https://supabase.com/docs/guides/auth/sessions), [verificação da sessão no Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/auth.go).
