import { useEffect, useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { LockClosed20Regular, Mail20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { signIn, requestPasswordReset, loading, error: authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [informational, setInformational] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery" | "recovery-sent">("login");

  useEffect(() => {
    if (authError) {
      setMessage(authError);
      setInformational(false);
    }
  }, [authError]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(undefined);
    setInformational(false);
    const result = await signIn(email.trim(), password);
    if (!result.success) setMessage(result.error);
  };

  const requestRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(undefined);
    await requestPasswordReset(email);
    setMode("recovery-sent");
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel__brand">
          <span>Sistema de Gestão</span>
          <strong>Imóveis Rurais</strong>
        </div>
        <div className="login-panel__content">
          <header>
            <span className="login-panel__eyebrow">{mode === "login" ? "Acesso seguro" : "Recuperação de acesso"}</span>
            <h1 id="login-title">{mode === "login" ? "Entrar no sistema" : mode === "recovery" ? "Recuperar senha" : "Verifique seu e-mail"}</h1>
            <p>
              {mode === "login"
                ? "Informe suas credenciais para acessar o ambiente de gestão."
                : mode === "recovery"
                  ? "Informe seu e-mail para receber as instruções de redefinição."
                  : "Se houver uma conta correspondente, enviaremos um link seguro de redefinição."}
            </p>
          </header>

          {message ? (
            <MessageBar intent={informational ? "info" : "error"}>
              <MessageBarBody>{message}</MessageBarBody>
            </MessageBar>
          ) : null}

          {mode === "recovery-sent" ? (
            <div className="password-reset-success">
              <MessageBar intent="success">
                <MessageBarBody>Confira sua caixa de entrada e siga o link enviado.</MessageBarBody>
              </MessageBar>
              <Button appearance="primary" size="large" onClick={() => { setMode("login"); setMessage(undefined); }}>
                Voltar ao login
              </Button>
            </div>
          ) : (
            <form className="login-form" onSubmit={(event) => void (mode === "login" ? submit(event) : requestRecovery(event))}>
              <Field label="E-mail" required>
                <Input
                  type="email"
                  autoComplete="email"
                  contentBefore={<Mail20Regular />}
                  value={email}
                  onChange={(_, data) => setEmail(data.value)}
                />
              </Field>
              {mode === "login" ? (
                <Field label="Senha" required>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    contentBefore={<LockClosed20Regular />}
                    value={password}
                    onChange={(_, data) => setPassword(data.value)}
                  />
                </Field>
              ) : null}
              <Button type="submit" appearance="primary" size="large" disabled={loading || !email.trim() || (mode === "login" && !password)}>
                {loading ? <Spinner size="tiny" label={mode === "login" ? "Entrando" : "Enviando"} /> : mode === "login" ? "Entrar" : "Enviar link de recuperação"}
              </Button>
              <Button
                type="button"
                appearance="subtle"
                onClick={() => {
                  setMessage(undefined);
                  setInformational(false);
                  setMode(mode === "login" ? "recovery" : "login");
                }}
              >
                {mode === "login" ? "Esqueci minha senha" : "Voltar ao login"}
              </Button>
            </form>
          )}
        </div>
        <footer>Autenticação protegida pelo ambiente Supabase configurado.</footer>
      </section>
    </main>
  );
}
