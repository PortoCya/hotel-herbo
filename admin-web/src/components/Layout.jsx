import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { useRealtime } from "../realtime";

export function Logo({ size = 44 }) {
  return (
    <div className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="30" fill="none" stroke="#c9a45c" strokeWidth="1.5" />
        <circle cx="46" cy="18" r="3" fill="#e2c88f" />
        <path d="M32 14 L52 48 H12 Z" fill="none" stroke="#c9a45c" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M32 14 V48 M32 28 L25 48 M32 28 L39 48" stroke="#c9a45c" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8 48 H56" stroke="#8b6b4a" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="wordmark">
        <strong>HERBO</strong>
        <span>Hotel · Glamping</span>
      </div>
    </div>
  );
}

export function Badge({ meta, children }) {
  return (
    <span className="badge" style={{ "--c": meta?.color }}>
      <span className="dot" />
      {children ?? meta?.label}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, width }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <header>
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function PhotoThumb({ src, alt = "Foto" }) {
  const [open, setOpen] = useState(false);
  if (!src) return <div className="thumb placeholder">—</div>;
  return (
    <>
      <img className="thumb" src={src} alt={alt} onClick={() => setOpen(true)} />
      {open && (
        <div className="modal-backdrop lightbox" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} />
        </div>
      )}
    </>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

function ConnectionIndicator() {
  const { status } = useRealtime();
  const map = {
    online: ["on", "Tempo real conectado"],
    polling: ["polling", "Reconectando… (modo polling)"],
    connecting: ["", "Conectando…"],
  };
  const [cls, label] = map[status] || map.connecting;
  return (
    <span className={`conn ${cls}`}>
      <span className="led" /> {label}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pendingOrders, soundOn, soundUnlocked, enableSound, toggleSound } = useRealtime();
  const pending = pendingOrders.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="ornament">✦ Painel da recepção ✦</div>
        <nav className="nav">
          <NavLink to="/" end>
            <span>🏕️ Ocupação</span>
          </NavLink>
          <NavLink to="/pedidos">
            <span>🔔 Pedidos</span>
            {pending > 0 && <span className="count pulse">{pending}</span>}
          </NavLink>
          <NavLink to="/consumo">
            <span>🧾 Consumo & Serviços</span>
          </NavLink>
          <NavLink to="/reservas">
            <span>📅 Reservas & Hóspedes</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {soundOn && !soundUnlocked ? (
            <button className="btn primary" onClick={enableSound}>🔊 Ativar alertas sonoros</button>
          ) : (
            <button className="btn sm" onClick={toggleSound}>
              {soundOn ? "🔊 Som de pedidos: ligado" : "🔇 Som de pedidos: desligado"}
            </button>
          )}
          <ConnectionIndicator />
          <div className="muted">
            Logado como <strong style={{ color: "var(--gold-300)" }}>{user?.name}</strong>
          </div>
          <button className="btn ghost sm" onClick={logout}>Sair</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
