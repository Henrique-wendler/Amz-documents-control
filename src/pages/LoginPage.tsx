import { useEffect, useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { LockClosed20Regular, Mail20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { signIn, loading, error: authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [informational, setInformational] = useState(false);

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

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel__brand">
          <span>Sistema de Gestão</span>
          <strong>Imóveis Rurais</strong>
        </div>
        <div className="login-panel__content">
          <header>
            <span className="login-panel__eyebrow">Acesso seguro</span>
            <h1 id="login-title">Entrar no sistema</h1>
            <p>Informe suas credenciais para acessar o ambiente de gestão.</p>
          </header>

          {message ? (
            <MessageBar intent={informational ? "info" : "error"}>
              <MessageBarBody>{message}</MessageBarBody>
            </MessageBar>
          ) : null}

          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <Field label="E-mail" required>
              <Input
                type="email"
                autoComplete="email"
                contentBefore={<Mail20Regular />}
                value={email}
                onChange={(_, data) => setEmail(data.value)}
              />
            </Field>
            <Field label="Senha" required>
              <Input
                type="password"
                autoComplete="current-password"
                contentBefore={<LockClosed20Regular />}
                value={password}
                onChange={(_, data) => setPassword(data.value)}
              />
            </Field>
            <Button type="submit" appearance="primary" size="large" disabled={loading || !email.trim() || !password}>
              {loading ? <Spinner size="tiny" label="Entrando" /> : "Entrar"}
            </Button>
            <Button
              type="button"
              appearance="subtle"
              onClick={() => {
                setInformational(true);
                setMessage("A recuperação de senha será habilitada após a configuração do serviço de e-mail.");
              }}
            >
              Esqueci minha senha
            </Button>
          </form>
        </div>
        <footer>Autenticação protegida pelo ambiente Supabase configurado.</footer>
      </section>
    </main>
  );
}
