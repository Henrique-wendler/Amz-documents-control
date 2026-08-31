import { useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { Checkmark20Regular, Copy20Regular, Key20Regular, LockClosed20Regular, ShieldKeyhole20Regular } from "@fluentui/react-icons";
import { useAuth } from "../contexts/AuthContext";

const normalizeCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export function MfaPage() {
  const {
    stage,
    mfaEnrollment,
    loading,
    startMfaEnrollment,
    verifyMfaEnrollment,
    verifyMfaChallenge,
    cancelMfa,
  } = useAuth();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [copyMessage, setCopyMessage] = useState<string>();
  const enrollment = stage === "mfa_enrollment";

  const startEnrollment = async () => {
    setMessage(undefined);
    const result = await startMfaEnrollment();
    if (!result.success) setMessage(result.error);
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(undefined);
    const result = enrollment
      ? await verifyMfaEnrollment(code)
      : await verifyMfaChallenge(code);
    if (!result.success) {
      setMessage(result.error);
      setCode("");
    }
  };

  const copySecret = async () => {
    if (!mfaEnrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(mfaEnrollment.secret);
      setCopyMessage("Chave copiada.");
    } catch {
      setCopyMessage("Não foi possível copiar. Selecione a chave manualmente.");
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="mfa-title">
        <div className="login-panel__brand">
          <span>Proteção adicional</span>
          <strong>Autenticação em duas etapas</strong>
        </div>
        <div className="login-panel__content mfa-panel__content">
          <header>
            <span className="login-panel__eyebrow">MFA · Aplicativo autenticador</span>
            <h1 id="mfa-title">{enrollment ? "Configurar autenticador" : "Confirmar código"}</h1>
            <p>
              {enrollment
                ? "Vincule um aplicativo autenticador para concluir o acesso seguro."
                : "Informe o código temporário exibido no seu aplicativo autenticador."}
            </p>
          </header>

          {message ? <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}

          {enrollment && !mfaEnrollment ? (
            <div className="mfa-start">
              <span><ShieldKeyhole20Regular /></span>
              <p>O acesso será liberado após a confirmação do primeiro código TOTP.</p>
              <Button appearance="primary" size="large" disabled={loading} onClick={() => void startEnrollment()}>
                {loading ? <Spinner size="tiny" label="Preparando" /> : "Configurar autenticador"}
              </Button>
            </div>
          ) : (
            <form className="login-form" onSubmit={(event) => void verify(event)}>
              {enrollment && mfaEnrollment ? (
                <div className="mfa-enrollment">
                  <div className="mfa-enrollment__qr">
                    <img src={mfaEnrollment.qrCode} width="250" height="250" alt="QR Code para configurar o aplicativo autenticador" />
                  </div>
                  <div className="mfa-enrollment__instructions">
                    <strong>1. Leia o QR Code</strong>
                    <span>Use Google Authenticator, Microsoft Authenticator ou aplicativo compatível.</span>
                  </div>
                  <div className="mfa-enrollment__manual">
                    <strong>Não conseguiu escanear o QR Code?</strong>
                    <span>Use a chave TOTP abaixo para configurar o autenticador manualmente.</span>
                    <Field label="Chave manual">
                      <div className="mfa-enrollment__copy-row">
                        <Input className="mfa-secret" aria-label="Chave manual do autenticador" type="text" readOnly value={mfaEnrollment.secret} contentBefore={<Key20Regular />} />
                        <Button type="button" appearance="secondary" icon={copyMessage === "Chave copiada." ? <Checkmark20Regular /> : <Copy20Regular />} onClick={() => void copySecret()}>
                          Copiar chave
                        </Button>
                      </div>
                    </Field>
                    {copyMessage ? <span className="mfa-enrollment__copy-status" role="status">{copyMessage}</span> : null}
                  </div>
                </div>
              ) : null}
              <Field label="Código de 6 dígitos" required>
                <Input
                  aria-label="Código de 6 dígitos"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  contentBefore={<LockClosed20Regular />}
                  value={code}
                  onChange={(_, data) => setCode(normalizeCode(data.value))}
                />
              </Field>
              <Button type="submit" appearance="primary" size="large" disabled={loading || code.length !== 6}>
                {loading ? <Spinner size="tiny" label="Verificando" /> : enrollment ? "Confirmar e ativar" : "Confirmar código"}
              </Button>
            </form>
          )}

          <Button appearance="subtle" disabled={loading} onClick={() => void cancelMfa()}>
            Cancelar e sair
          </Button>
        </div>
        <footer>O código é validado pelo Supabase Auth e não é armazenado pelo sistema.</footer>
      </section>
    </main>
  );
}
