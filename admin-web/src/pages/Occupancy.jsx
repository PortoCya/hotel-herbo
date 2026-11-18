import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Badge, Spinner } from "../components/Layout";
import { useRealtimeRefresh } from "../realtime";
import { useToast } from "../toast";
import { brl, fmtDate, RES_STATUS, ROOM_STATUS } from "../utils";

export default function Occupancy() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [s, r, a] = await Promise.all([
      api("/dashboard/"),
      api("/rooms/"),
      api("/reservations/?status=reservada"),
    ]);
    setStats(s);
    setRooms(r);
    setArrivals(a.sort((x, y) => x.check_in_date.localeCompare(y.check_in_date)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => toast("Erro ao carregar", e.message, { type: "error" }));
  }, [load, toast]);

  useRealtimeRefresh(["reservation.changed", "room.changed", "order.created", "order.updated", "consumption.changed"], load);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await load();
    } catch (e) {
      toast("Não foi possível concluir", e.message, { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  const checkIn = (res) =>
    run(`in-${res.id}`, () => api(`/reservations/${res.id}/check-in/`, { method: "POST" }), `Check-in de ${res.guest_name} realizado ✦`);

  const checkOut = (room) => {
    const res = room.current_reservation;
    if (!confirm(`Confirmar check-out de ${res.guest_name} (${room.name})?`)) return;
    run(`out-${res.id}`, () => api(`/reservations/${res.id}/check-out/`, { method: "POST" }), `Check-out de ${res.guest_name} concluído`);
  };

  const setRoomStatus = (room, status) =>
    run(`st-${room.id}`, () => api(`/rooms/${room.id}/set-status/`, { method: "POST", body: { status } }));

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="ornament">Visão geral</div>
          <h1>Ocupação das tendas</h1>
          <p>Controle de check-in, check-out e status de cada acomodação glamping.</p>
        </div>
        <Link className="btn primary" to="/reservas">+ Nova reserva</Link>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <div className="label">Taxa de ocupação</div>
          <div className="value">{stats.occupancy_rate}%</div>
          <div className="hint">{stats.rooms_occupied} de {stats.rooms_total} tendas</div>
        </div>
        <div className="card stat">
          <div className="label">Hóspedes na casa</div>
          <div className="value">{stats.guests_in_house}</div>
          <div className="hint">{stats.checkins_today} chegada(s) hoje · {stats.checkouts_today} saída(s)</div>
        </div>
        <div className="card stat">
          <div className="label">Pedidos em aberto</div>
          <div className="value">{stats.orders_open}</div>
          <div className="hint">{stats.orders_pending} aguardando aceite</div>
        </div>
        <div className="card stat">
          <div className="label">Consumo lançado hoje</div>
          <div className="value" style={{ fontSize: 30 }}>{brl(stats.consumption_today)}</div>
          <div className="hint">{stats.rooms_cleaning} em limpeza · {stats.rooms_maintenance} manutenção</div>
        </div>
      </div>

      <div className="grid rooms">
        {rooms.map((room) => {
          const meta = ROOM_STATUS[room.status];
          const res = room.current_reservation;
          return (
            <div key={room.id} className="card room-card" style={{ "--status-color": meta.color }}>
              <div className="head">
                <div>
                  <div className="code">{room.code} · {room.category_display}</div>
                  <h3>{room.name}</h3>
                </div>
                <Badge meta={meta} />
              </div>

              {res ? (
                <>
                  <div className="guest">{res.guest_name}</div>
                  <div className="meta">
                    <span>📆 Dia {res.days_hosted} da estadia</span>
                    <span>Saída {fmtDate(res.check_out_date)}</span>
                    {res.pending_orders > 0 && <span style={{ color: "var(--danger)" }}>🔔 {res.pending_orders} pedido(s)</span>}
                  </div>
                </>
              ) : (
                <div className="meta">
                  <span>👥 até {room.capacity} pessoas</span>
                  <span>{brl(room.nightly_rate)} / noite</span>
                </div>
              )}

              <div className="actions">
                {res && (
                  <>
                    <Link className="btn sm" to={`/consumo?reservation=${res.id}`}>🧾 Consumo</Link>
                    <button className="btn sm danger" disabled={busy === `out-${res.id}`} onClick={() => checkOut(room)}>
                      Check-out
                    </button>
                  </>
                )}
                {room.status === "limpeza" && (
                  <button className="btn sm success" onClick={() => setRoomStatus(room, "disponivel")}>✓ Limpeza concluída</button>
                )}
                {room.status === "disponivel" && (
                  <button className="btn sm ghost" onClick={() => setRoomStatus(room, "manutencao")}>Manutenção</button>
                )}
                {room.status === "manutencao" && (
                  <button className="btn sm success" onClick={() => setRoomStatus(room, "disponivel")}>Liberar tenda</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-title">
        <h2>Próximas chegadas</h2>
      </div>
      <div className="card">
        {arrivals.length === 0 ? (
          <div className="empty">Nenhuma reserva aguardando check-in.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reserva</th><th>Hóspede</th><th>Tenda</th><th>Período</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {arrivals.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.guest_name}</td>
                  <td>{r.room_code} · {r.room_name}</td>
                  <td>{fmtDate(r.check_in_date)} → {fmtDate(r.check_out_date)} ({r.nights} noites)</td>
                  <td><Badge meta={RES_STATUS[r.status]} /></td>
                  <td className="num">
                    <button className="btn sm primary" disabled={busy === `in-${r.id}`} onClick={() => checkIn(r)}>
                      Fazer check-in
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
