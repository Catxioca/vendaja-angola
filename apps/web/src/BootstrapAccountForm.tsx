import { useState, useEffect, type FormEvent } from "react";

type BootstrapResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; username: string; displayName?: string; role: string };
  context: { companyId: string; branchId: string };
};

export function BootstrapAccountForm({ apiUrl, onComplete, onCancel }: { apiUrl: string; onComplete: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    legalName: "",
    nif: "",
    branchCode: "MAIN",
    branchName: "Sede",
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    pin: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [alreadyInitialized, setAlreadyInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/api/v1/auth/bootstrap/status`)
      .then((res) => res.json())
      .then((data: { bootstrapAllowed?: boolean }) => {
        if (!active) return;
        if (data.bootstrapAllowed === false) {
          setAlreadyInitialized(true);
        }
      })
      .catch(() => {
        // Fallback gracefully if status check fails
      })
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const legalName = form.legalName.trim();
    const branchCode = form.branchCode.trim();
    const branchName = form.branchName.trim();
    const displayName = form.displayName.trim();
    const username = form.username.trim();
    const email = form.email.trim();
    const nif = form.nif.trim();
    const pin = form.pin.trim();

    if (legalName.length < 2) {
      setError("O nome da empresa deve ter pelo menos 2 caracteres.");
      return;
    }
    if (nif && nif.length < 5) {
      setError("O NIF deve ter pelo menos 5 caracteres (ou deixe em branco se não aplicável).");
      return;
    }
    if (displayName.length < 2) {
      setError("O nome completo do administrador deve ter pelo menos 2 caracteres.");
      return;
    }
    if (username.length < 3) {
      setError("O utilizador deve ter pelo menos 3 caracteres.");
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(username)) {
      setError("O nome de utilizador só pode conter letras, números, pontos (.), hífens (-) ou underscores (_). Não são permitidos espaços.");
      return;
    }
    if (form.password.length < 12) {
      setError("A password deve ter pelo menos 12 caracteres.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("As passwords não coincidem.");
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      setError("O PIN administrativo deve ter entre 4 e 6 dígitos numéricos.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: {
            legalName,
            nif: nif || undefined,
            branchCode,
            branchName,
          },
          admin: {
            displayName,
            username,
            email,
            password: form.password,
            pin: pin || undefined,
          },
        }),
      });

      const data = await response.json().catch(() => ({})) as Partial<BootstrapResponse> & {
        error?: string;
        message?: string;
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      };

      if (!response.ok || !data.accessToken || !data.context) {
        if (response.status === 409 || data.error === "bootstrap_unavailable") {
          setAlreadyInitialized(true);
          setError("A instalação já foi inicializada e já possui um administrador. Por favor, inicie sessão com uma conta existente.");
          return;
        }

        const backendMsg = data.message ||
          (data.details?.fieldErrors && Object.values(data.details.fieldErrors).flat()[0]) ||
          (data.details?.formErrors && data.details.formErrors[0]);

        setError(backendMsg || "Não foi possível criar a conta inicial. Confirme os dados e tente novamente.");
        return;
      }

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken ?? "");
      localStorage.setItem("posUser", JSON.stringify(data.user));
      localStorage.setItem("vendaja-company-id", data.context.companyId);
      localStorage.setItem("vendaja-branch-id", data.context.branchId);
      onComplete();
    } catch {
      setError("Não foi possível contactar o servidor para criar a conta inicial. Verifique a ligação à Internet.");
    } finally {
      setSaving(false);
    }
  }

  if (checkingStatus) {
    return (
      <div className="bootstrap-form">
        <p>A verificar o estado da instalação…</p>
      </div>
    );
  }

  if (alreadyInitialized) {
    return (
      <div className="bootstrap-form">
        <header>
          <p className="eyebrow">INSTALAÇÃO CONFIGURADA</p>
          <h2>Acesso Disponível</h2>
          <p>Esta instalação do VendaJá Angola já foi inicializada com uma empresa e utilizador administrador.</p>
        </header>
        <p className="info-message" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "6px", color: "#166534", margin: "16px 0" }}>
          Não é necessário criar nova empresa. Inicie sessão com o seu utilizador/email e password no ecrã de login.
        </p>
        <div className="bootstrap-actions">
          <button type="button" onClick={onCancel} style={{ width: "100%" }}>Voltar ao Login</button>
        </div>
      </div>
    );
  }

  return (
    <form className="bootstrap-form" onSubmit={submit}>
      <header>
        <p className="eyebrow">CONFIGURAÇÃO INICIAL</p>
        <h2>Criar Conta de Administrador</h2>
        <p>Este passo cria a primeira empresa, filial e conta administradora. Só pode ser executado uma vez por instalação.</p>
      </header>
      <fieldset>
        <legend>Empresa e filial</legend>
        <label>
          Nome legal
          <input required placeholder="Ex: Minha Empresa, Lda" value={form.legalName} onChange={(e) => change("legalName", e.target.value)} />
        </label>
        <label>
          NIF <small>(opcional durante bootstrap)</small>
          <input placeholder="Ex: 5001234567" value={form.nif} onChange={(e) => change("nif", e.target.value)} />
        </label>
        <label>
          Código da filial
          <input required value={form.branchCode} onChange={(e) => change("branchCode", e.target.value)} />
        </label>
        <label>
          Nome da filial
          <input required value={form.branchName} onChange={(e) => change("branchName", e.target.value)} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Administrador</legend>
        <label>
          Nome completo
          <input required placeholder="Ex: João da Silva" value={form.displayName} onChange={(e) => change("displayName", e.target.value)} />
        </label>
        <label>
          Utilizador <small>(sem espaços)</small>
          <input required minLength={3} placeholder="Ex: admin" value={form.username} onChange={(e) => change("username", e.target.value)} />
        </label>
        <label>
          E-mail
          <input required type="email" placeholder="admin@empresa.ao" value={form.email} onChange={(e) => change("email", e.target.value)} />
        </label>
        <label>
          Password forte <small>(mínimo 12 caracteres)</small>
          <input required type="password" minLength={12} placeholder="••••••••••••" value={form.password} onChange={(e) => change("password", e.target.value)} />
        </label>
        <label>
          Confirmar password
          <input required type="password" minLength={12} placeholder="••••••••••••" value={form.confirmPassword} onChange={(e) => change("confirmPassword", e.target.value)} />
        </label>
        <label>
          PIN administrativo <small>(4–6 dígitos, opcional)</small>
          <input inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} placeholder="Ex: 1234" value={form.pin} onChange={(e) => change("pin", e.target.value.replace(/\D/g, ""))} />
        </label>
      </fieldset>
      {error && <p className="error-message" role="alert" style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "10px", borderRadius: "6px", margin: "12px 0" }}>{error}</p>}
      <div className="bootstrap-actions">
        <button type="submit" disabled={saving}>{saving ? "A criar…" : "Criar empresa e administrador"}</button>
        <button type="button" onClick={onCancel} disabled={saving}>Voltar ao login</button>
      </div>
    </form>
  );
}
