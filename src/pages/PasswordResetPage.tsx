import { useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { LockClosed20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

const validatePassword = (password: string) => {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Inclua letras maiúsculas, minúsculas e números.";
  }
  return undefined;
};

export function PasswordResetPage() {
  const { loading, updatePassword, finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string>();
  const [completed, setCompleted] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = validatePassword(password);
    if (validationMessage) return setMessage(validationMessage);
    if (password !== confirmation) return setMessage("As senhas informadas não coincidem.");

    setMessage(undefined);
    const result = await updatePassword(password);
    if (!result.success) return setMessage(result.error);
    setPassword("");
    setConfirmation("");
    setCompleted(true);
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="reset-title">
        <div className="login-panel__brand">
          <span>Acesso seguro</span>
          <strong>Redefinição de senha</strong>
        </div>
        <div className="login-panel__content">
          <header>
            <span className="login-panel__eyebrow">Recuperação de acesso</span>
            <h1 id="reset-title">{completed ? "Senha redefinida" : "Criar nova senha"}</h1>
            <p>{completed ? "Sua senha foi atualizada com segurança." : "Defina uma nova senha para concluir a recuperação da conta."}</p>
          </header>

          {message ? <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}

          {completed ? (
            <div className="password-reset-success">
              <MessageBar intent="success"><MessageBarBody>Senha alterada. Entre novamente usando a nova senha.</MessageBarBody></MessageBar>
              <Button appearance="primary" size="large" onClick={() => void finishPasswordRecovery()}>Voltar ao login</Button>
            </div>
          ) : (
            <form className="login-form" onSubmit={(event) => void submit(event)}>
              <Field label="Nova senha" hint="Mínimo de 10 caracteres, com maiúsculas, minúsculas e números." required>
                <Input type="password" autoComplete="new-password" contentBefore={<LockClosed20Regular />} value={password} onChange={(_, data) => setPassword(data.value)} />
              </Field>
              <Field label="Confirmar nova senha" required>
                <Input type="password" autoComplete="new-password" contentBefore={<LockClosed20Regular />} value={confirmation} onChange={(_, data) => setConfirmation(data.value)} />
              </Field>
              <Button type="submit" appearance="primary" size="large" disabled={loading || !password || !confirmation}>
                {loading ? <Spinner size="tiny" label="Redefinindo" /> : "Redefinir senha"}
              </Button>
            </form>
          )}
        </div>
        <footer>O sistema não armazena sua senha; a alteração é processada pelo Supabase Auth.</footer>
      </section>
    </main>
  );
}
