import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Logo } from "../components/Layout";
import { alertSound } from "../sound";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    alertSound.unlock(); // aproveita o clique para liberar o áudio do navegador
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card form" onSubmit={submit}>
        <Logo size={72} />
        <div className="divider">PAINEL DA RECEPÇÃO</div>
        {error && <div className="error-box">{error}</div>}
        <label className="field">
          Usuário ou e-mail
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <small>A liberdade de acampar com a sofisticação de um hotel.</small>
      </form>
    </div>
  );
}
