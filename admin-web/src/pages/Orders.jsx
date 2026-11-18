import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Modal, PhotoThumb, Spinner } from "../components/Layout";
import { useRealtime, useRealtimeRefresh } from "../realtime";
import { useToast } from "../toast";
import { brl, fmtDateTime, ORDER_STATUS, timeAgo, TYPE_ICON } from "../utils";

const QUICK_REPLIES = ["A caminho! ✦", "Chegamos em 15 minutos.", "Agendado conforme solicitado.", "Em preparo pela cozinha."];

export default function Orders() {
  const toast = useToast();
  const { newOrderIds, acknowledge, soundOn, soundUnlocked, enableSound, testSound, status } = useRealtime();
  const [open, setOpen] = useState([]);
  const [closed, setClosed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(null); // pedido sendo concluído (modal)
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const [o, c] = await Promise.all([
      api("/orders/?status=open"),
      api("/orders/?status=concluido,cancelado&today=1"),
    ]);
    if (o) setOpen(o);
    if (c) setClosed(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((e) => toast("Erro ao carregar pedidos", e.message, { type: "error" }));
    const t = setInterval(() => setTick((x) => x + 1), 30000); // atualiza "há X min"
    return () => clearInterval(t);
  }, [load, toast]);

  useRealtimeRefresh(["order.created", "order.updated"], load);

  const changeStatus = async (order, newStatus, extra = {}) => {
    try {
      await api(`/orders/${order.id}/status/`, { method: "POST", body: { status: newStatus, ...extra } });
      acknowledge(order.id);
      await load();
    } catch (e) {
      toast("Não foi possível atualizar", e.message, { type: "error" });
    }
  };

  const accept = (order) => {
    const reply = prompt("Mensagem para o hóspede (opcional):", QUICK_REPLIES[0]);
    if (reply === null) return;
    changeStatus(order, "aceito", { admin_response: reply });
  };

  const refuse = (order) => {
    const reason = prompt("Motivo (será exibido ao hóspede):", "Indisponível no momento.");
    if (reason === null) return;
    changeStatus(order, "cancelado", { admin_response: reason });
  };

  const pending = open.filter((o) => o.status === "pendente");
  const working = open.filter((o) => o.status !== "pendente");

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="ornament">Central de atendimento</div>
          <h1>Pedidos dos hóspedes</h1>
          <p>Room service, fogueira, limpeza e experiências — chegam aqui em tempo real com alerta sonoro.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={testSound}>🔔 Testar som</button>
        </div>
      </div>

      {soundOn && !soundUnlocked && (
        <div className="banner warn">
          <span>O navegador bloqueou o áudio automático. Clique para liberar o alerta sonoro de novos pedidos.</span>
          <button className="btn primary" onClick={enableSound}>🔊 Ativar alertas sonoros</button>
        </div>
      )}
      {status !== "online" && (
        <div className="banner warn">
          <span>Conexão em tempo real indisponível — atualizando automaticamente a cada 8 segundos (polling).</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="banner alert">
          <strong>🔔 {pending.length} pedido(s) aguardando atendimento!</strong>
          <span>O alerta sonoro se repete até o pedido ser aceito.</span>
        </div>
      )}

      <div className="kanban">
        <Column title="Pendentes" count={pending.length} color="var(--danger)">
          {pending.map((o) => (
            <OrderCard key={o.id} order={o} isNew={newOrderIds.has(o.id)} onSeen={() => acknowledge(o.id)}>
              <button className="btn sm primary" onClick={() => accept(o)}>Aceitar</button>
              <button className="btn sm" onClick={() => changeStatus(o, "em_andamento")}>Iniciar</button>
              <button className="btn sm danger" onClick={() => refuse(o)}>Recusar</button>
            </OrderCard>
          ))}
          {!pending.length && <div className="empty">Nenhum pedido pendente. Tudo em ordem ✦</div>}
        </Column>

        <Column title="Em atendimento" count={working.length} color="var(--warning)">
          {working.map((o) => (
            <OrderCard key={o.id} order={o}>
              {o.status === "aceito" && (
                <button className="btn sm" onClick={() => changeStatus(o, "em_andamento")}>Em andamento</button>
              )}
              <button className="btn sm success" onClick={() => setFinishing(o)}>✓ Concluir</button>
              <button className="btn sm danger" onClick={() => refuse(o)}>Cancelar</button>
            </OrderCard>
          ))}
          {!working.length && <div className="empty">Nada em andamento.</div>}
        </Column>

        <Column title="Finalizados hoje" count={closed.length} color="var(--success)">
          {closed.map((o) => (
            <OrderCard key={o.id} order={o} compact />
          ))}
          {!closed.length && <div className="empty">Nenhum pedido finalizado hoje.</div>}
        </Column>
      </div>

      {finishing && (
        <FinishModal
          order={finishing}
          onClose={() => setFinishing(null)}
          onConfirm={async (charge, reply) => {
            await changeStatus(finishing, "concluido", { charge, admin_response: reply });
            setFinishing(null);
            if (charge) toast("Lançado no consumo", `${finishing.title} · ${brl(finishing.estimated_total)}`);
          }}
        />
      )}
    </>
  );
}

function Column({ title, count, color, children }) {
  return (
    <section className="column">
      <header>
        <h3>{title}</h3>
        <span className="badge" style={{ "--c": color }}>{count}</span>
      </header>
      {children}
    </section>
  );
}

function OrderCard({ order, isNew, onSeen, compact, children }) {
  return (
    <article className={`order-card ${isNew ? "is-new" : ""}`} onMouseEnter={isNew ? onSeen : undefined}>
      <div className="top">
        <div style={{ display: "flex", gap: 12 }}>
          <div className="type-icon">{TYPE_ICON[order.request_type] || "✳️"}</div>
          <div>
            <div className="title">
              {order.quantity > 1 && `${order.quantity}× `}
              {order.title}
            </div>
            <div className="room">
              {order.room_code} · {order.room_name} — {order.guest_name}
            </div>
          </div>
        </div>
        <Badge meta={ORDER_STATUS[order.status]} />
      </div>

      {!compact && order.notes && <div className="notes">“{order.notes}”</div>}

      <div className="muted" style={{ fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>{order.type_display}</span>
        <span>⏱ {timeAgo(order.created_at)}</span>
        {order.scheduled_for && <span>📅 Para {fmtDateTime(order.scheduled_for)}</span>}
        {Number(order.estimated_total) > 0 && <span>{brl(order.estimated_total)}</span>}
        {order.charged && <span style={{ color: "var(--success)" }}>✓ lançado no consumo</span>}
      </div>

      {order.admin_response && <div className="muted" style={{ fontSize: 13 }}>💬 {order.admin_response}</div>}
      {!compact && order.photo && <PhotoThumb src={order.photo} alt={order.title} />}
      {children && <div className="actions">{children}</div>}
    </article>
  );
}

function FinishModal({ order, onClose, onConfirm }) {
  const chargeable = Number(order.estimated_total) > 0 && !order.charged;
  const [charge, setCharge] = useState(chargeable);
  const [reply, setReply] = useState("Concluído. Aproveite! ✦");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Concluir pedido"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Voltar</button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(charge, reply);
            }}
          >
            Confirmar conclusão
          </button>
        </>
      }
    >
      <div className="form">
        <p style={{ margin: 0 }}>
          <strong>{order.title}</strong> — {order.room_code} · {order.guest_name}
        </p>
        <label className="field">
          Mensagem para o hóspede
          <input value={reply} onChange={(e) => setReply(e.target.value)} />
        </label>
        {chargeable && (
          <label className="checkbox">
            <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} />
            Lançar {order.quantity}× {order.catalog_item_name} ({brl(order.estimated_total)}) no consumo do hóspede
          </label>
        )}
      </div>
    </Modal>
  );
}
