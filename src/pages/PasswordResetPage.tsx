import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { Key20Regular, LockClosed20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

const validatePassword = (password: string) => {
  if (password.length < 10) return "Use pelo menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Inclua letras maiúsculas, minúsculas e números.";
  }
  return undefined;
};

export function PasswordResetPage() {
  const {
    loading,
    passwordRecoveryStatus,
    passwordRecoveryError,
    passwordRecoveryMfaRequired,
    updatePassword,
    verifyPasswordRecoveryMfa,
    finishPasswordRecovery,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const finishing = useRef(false);

  const finish = useCallback((requestNewLink = false) => {
    if (finishing.current) return;
    finishing.current = true;
    void finishPasswordRecovery(requestNewLink);
  }, [finishPasswordRecovery]);

  useEffect(() => {
    if (!completed) return undefined;
    const timeout = window.setTimeout(() => finish(), 1800);
    return () => window.clearTimeout(timeout);
  }, [completed, finish]);

  const title = passwordRecoveryStatus === "processing"
    ? "Validando link"
    : passwordRecoveryStatus === "invalid"
      ? "Link indisponível"
      : completed
        ? "Senha redefinida"
        : "Criar nova senha";
  const description = passwordRecoveryStatus === "invalid"
    ? "Solicite um novo link para recuperar o acesso à sua conta."
    : completed
      ? "Sua senha foi atualizada com segurança."
      : "Defina uma nova senha para concluir a recuperação da conta.";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = validatePassword(password);
    if (validationMessage) return setMessage(validationMessage);
    if (password !== confirmation) return setMessage("As senhas informadas não coincidem.");
    if (passwordRecoveryMfaRequired && !/^\d{6}$/.test(mfaCode)) {
      return setMessage("Informe o código de 6 dígitos do aplicativo autenticador.");
    }

    setMessage(undefined);
    if (passwordRecoveryMfaRequired) {
      const mfaResult = await verifyPasswordRecoveryMfa(mfaCode);
      if (!mfaResult.success) return setMessage(mfaResult.error);
    }
    const result = await updatePassword(password);
    if (!result.success) return setMessage(result.error);
    setPassword("");
    setConfirmation("");
    setMfaCode("");
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
            <h1 id="reset-title">{title}</h1>
            <p>{description}</p>
          </header>

          {message ? <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}

          {passwordRecoveryStatus === "processing" ? (
            <div className="password-reset-success">
              <Spinner label="Validando o link de recuperação…" />
            </div>
          ) : passwordRecoveryStatus === "invalid" ? (
            <div className="password-reset-success">
              <MessageBar intent="error"><MessageBarBody>{passwordRecoveryError}</MessageBarBody></MessageBar>
              <Button appearance="primary" size="large" onClick={() => finish(true)}>Solicitar novo link</Button>
              <Button appearance="subtle" size="large" onClick={() => finish()}>Voltar ao login</Button>
            </div>
          ) : completed ? (
            <div className="password-reset-success">
              <MessageBar intent="success"><MessageBarBody>Senha alterada. Você será direcionado para entrar novamente.</MessageBarBody></MessageBar>
              <Button appearance="primary" size="large" onClick={() => finish()}>Ir para o login</Button>
            </div>
          ) : passwordRecoveryStatus === "ready" ? (
            <form className="login-form" onSubmit={(event) => void submit(event)}>
              <Field label="Nova senha" hint="Mínimo de 10 caracteres, com maiúsculas, minúsculas e números." required>
                <Input type="password" autoComplete="new-password" contentBefore={<LockClosed20Regular />} value={password} onChange={(_, data) => setPassword(data.value)} />
              </Field>
              <Field label="Confirmar nova senha" required>
                <Input type="password" autoComplete="new-password" contentBefore={<LockClosed20Regular />} value={confirmation} onChange={(_, data) => setConfirmation(data.value)} />
              </Field>
              {passwordRecoveryMfaRequired ? (
                <Field label="Código do autenticador" hint="Informe o código atual de 6 dígitos do fator TOTP já configurado." required>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    contentBefore={<Key20Regular />}
                    value={mfaCode}
                    onChange={(_, data) => setMfaCode(data.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </Field>
              ) : null}
              <Button type="submit" appearance="primary" size="large" disabled={loading || !password || !confirmation || (passwordRecoveryMfaRequired && mfaCode.length !== 6)}>
                {loading ? <Spinner size="tiny" label="Redefinindo" /> : "Redefinir senha"}
              </Button>
              <Button type="button" appearance="subtle" size="large" disabled={loading} onClick={() => finish()}>
                Cancelar e voltar ao login
              </Button>
            </form>
          ) : null}
        </div>
        <footer>O sistema não armazena sua senha; a alteração é processada pelo Supabase Auth.</footer>
      </section>
    </main>
  );
}
