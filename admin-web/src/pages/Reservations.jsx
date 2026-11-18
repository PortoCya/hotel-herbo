import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Badge, Modal, Spinner } from "../components/Layout";
import { useRealtimeRefresh } from "../realtime";
import { useToast } from "../toast";
import { addDaysISO, brl, fmtDate, RES_STATUS, todayISO } from "../utils";

const PROFILES = [
  ["urbano", "Profissional urbano"],
  ["casal", "Casal"],
  ["familia", "Família"],
  ["outro", "Outro"],
];

export default function Reservations() {
  const toast = useToast();
  const [tab, setTab] = useState("ativas");
  const [reservations, setReservations] = useState([]);
  const [guests, setGuests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // "reservation" | "guest" | {guest}

  const load = useCallback(async () => {
    const [r, g, rm] = await Promise.all([api("/reservations/"), api("/guests/"), api("/rooms/")]);
    setReservations(r);
    setGuests(g);
    setRooms(rm.filter((x) => x.is_active));
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => toast("Erro", e.message, { type: "error" }));
  }, [load, toast]);

  useRealtimeRefresh(["reservation.changed", "room.changed", "consumption.changed"], load);

  const act = async (id, action, confirmText, okMsg) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/reservations/${id}/${action}/`, { method: "POST" });
      toast(okMsg);
      load();
    } catch (e) {
      toast("Operação não permitida", e.message, { type: "error" });
    }
  };

  if (loading) return <Spinner />;

  const filtered = reservations.filter((r) =>
    tab === "ativas"
      ? r.status === "hospedado" || r.status === "reservada"
      : tab === "historico"
      ? r.status === "finalizada" || r.status === "cancelada"
      : true
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="ornament">Recepção</div>
          <h1>Reservas & Hóspedes</h1>
          <p>Cadastre hóspedes (com login para o app mobile), crie reservas e gerencie check-in e check-out.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => setModal("guest")}>+ Novo hóspede</button>
          <button className="btn primary" onClick={() => setModal("reservation")}>+ Nova reserva</button>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === "ativas" ? "active" : ""} onClick={() => setTab("ativas")}>Reservas ativas</button>
        <button className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>Histórico</button>
        <button className={tab === "hospedes" ? "active" : ""} onClick={() => setTab("hospedes")}>
          Hóspedes ({guests.length})
        </button>
      </div>

      {tab !== "hospedes" ? (
        <div className="card">
          {filtered.length === 0 ? (
            <div className="empty">Nenhuma reserva encontrada.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th><th>Hóspede</th><th>Tenda</th><th>Período</th><th>Status</th>
                  <th className="num">Consumo</th><th className="num">Total</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>{r.guest_name}</td>
                    <td>{r.room_code} · {r.room_name}</td>
                    <td>
                      {fmtDate(r.check_in_date)} → {fmtDate(r.check_out_date)}
                      <br />
                      <small>{r.status === "hospedado" ? `Dia ${r.days_hosted} de ${r.nights}` : `${r.nights} noite(s)`}</small>
                    </td>
                    <td><Badge meta={RES_STATUS[r.status]} /></td>
                    <td className="num">{brl(r.consumption_total)}</td>
                    <td className="num">{brl(r.grand_total)}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {r.status === "reservada" && (
                        <>
                          <button className="btn sm primary" onClick={() => act(r.id, "check-in", null, "Check-in realizado ✦")}>
                            Check-in
                          </button>{" "}
                          <button className="btn sm danger" onClick={() => act(r.id, "cancel", "Cancelar esta reserva?", "Reserva cancelada")}>
                            Cancelar
                          </button>
                        </>
                      )}
                      {r.status === "hospedado" && (
                        <>
                          <Link className="btn sm" to={`/consumo?reservation=${r.id}`}>Consumo</Link>{" "}
                          <button className="btn sm danger" onClick={() => act(r.id, "check-out", `Confirmar check-out de ${r.guest_name}?`, "Check-out concluído")}>
                            Check-out
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th><th>Login no app</th><th>Telefone</th><th>Perfil</th><th>Reserva atual</th><th />
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.full_name}
                    {g.notes && <><br /><small>{g.notes}</small></>}
                  </td>
                  <td>
                    <code>{g.username}</code>
                    {g.email && <><br /><small>{g.email}</small></>}
                  </td>
                  <td>{g.phone || "—"}</td>
                  <td>{g.profile_display}</td>
                  <td>
                    {g.current_reservation ? (
                      <Badge meta={RES_STATUS[g.current_reservation.status]}>
                        {g.current_reservation.room_code} · {RES_STATUS[g.current_reservation.status]?.label}
                      </Badge>
                    ) : "—"}
                  </td>
                  <td className="num">
                    <button className="btn sm" onClick={() => setModal({ guest: g })}>Editar / Senha</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === "guest" || modal?.guest) && (
        <GuestModal
          guest={modal.guest}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {modal === "reservation" && (
        <ReservationModal
          guests={guests}
          rooms={rooms}
          onNewGuest={() => setModal("guest")}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </>
  );
}

function GuestModal({ guest, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: guest?.full_name || "",
    username: guest?.username || "",
    email: guest?.email || "",
    password: "",
    phone: guest?.phone || "",
    document: guest?.document || "",
    profile: guest?.profile || "casal",
    notes: guest?.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { ...form };
    if (guest && !body.password) delete body.password;
    try {
      await api(guest ? `/guests/${guest.id}/` : "/guests/", { method: guest ? "PATCH" : "POST", body });
      toast(guest ? "Hóspede atualizado" : "Hóspede cadastrado", `Login no app: ${form.username}`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={guest ? `Editar ${guest.full_name}` : "Novo hóspede"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" form="guest-form" disabled={busy}>Salvar</button>
        </>
      }
    >
      <form id="guest-form" className="form" onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        <label className="field">Nome completo<input value={form.full_name} onChange={set("full_name")} required /></label>
        <div className="form-row">
          <label className="field">Login no app<input value={form.username} onChange={set("username")} required placeholder="ex.: marcela" /></label>
          <label className="field">
            {guest ? "Nova senha (opcional)" : "Senha do app"}
            <input type="password" value={form.password} onChange={set("password")} required={!guest} minLength={6} />
          </label>
        </div>
        <div className="form-row">
          <label className="field">E-mail<input type="email" value={form.email} onChange={set("email")} /></label>
          <label className="field">Telefone<input value={form.phone} onChange={set("phone")} /></label>
        </div>
        <div className="form-row">
          <label className="field">Documento (CPF)<input value={form.document} onChange={set("document")} /></label>
          <label className="field">
            Perfil
            <select value={form.profile} onChange={set("profile")}>
              {PROFILES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Observações / preferências<textarea value={form.notes} onChange={set("notes")} /></label>
      </form>
    </Modal>
  );
}

function ReservationModal({ guests, rooms, onNewGuest, onClose, onSaved }) {
  const toast = useToast();
  const today = todayISO();
  const [form, setForm] = useState({
    guest: guests[0]?.id || "",
    room: rooms.find((r) => r.status === "disponivel")?.id || rooms[0]?.id || "",
    check_in_date: today,
    check_out_date: addDaysISO(today, 2),
    adults: 2,
    children: 0,
    notes: "",
    checkInNow: true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { checkInNow, ...body } = form;
      const res = await api("/reservations/", { method: "POST", body });
      if (checkInNow) await api(`/reservations/${res.id}/check-in/`, { method: "POST" });
      toast("Reserva criada", `${res.code} · ${res.guest_name}`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nova reserva"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" form="res-form" disabled={busy}>Criar reserva</button>
        </>
      }
    >
      <form id="res-form" className="form" onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        <label className="field">
          <span style={{ display: "flex", justifyContent: "space-between" }}>
            Hóspede <button type="button" className="btn sm ghost" onClick={onNewGuest}>+ Cadastrar novo</button>
          </span>
          <select value={form.guest} onChange={set("guest")} required>
            {guests.map((g) => <option key={g.id} value={g.id}>{g.full_name} ({g.username})</option>)}
          </select>
        </label>
        <label className="field">
          Tenda
          <select value={form.room} onChange={set("room")} required>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name} — {brl(r.nightly_rate)}/noite (até {r.capacity}p · {r.status_display})
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label className="field">Check-in<input type="date" value={form.check_in_date} onChange={set("check_in_date")} required /></label>
          <label className="field">Check-out<input type="date" value={form.check_out_date} onChange={set("check_out_date")} required /></label>
        </div>
        <div className="form-row">
          <label className="field">Adultos<input type="number" min="1" max="6" value={form.adults} onChange={set("adults")} /></label>
          <label className="field">Crianças<input type="number" min="0" max="6" value={form.children} onChange={set("children")} /></label>
        </div>
        <label className="field">Observações<input value={form.notes} onChange={set("notes")} /></label>
        <label className="checkbox">
          <input type="checkbox" checked={form.checkInNow} onChange={(e) => setForm((f) => ({ ...f, checkInNow: e.target.checked }))} />
          Realizar o check-in imediatamente
        </label>
      </form>
    </Modal>
  );
}
