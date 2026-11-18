/**
 * Camada de tempo real do painel admin.
 *
 * 1. Conecta em ws://<host>/ws/admin/?token=... (Django Channels).
 * 2. Ao receber "order.created" -> toca o ALERTA SONORO (HTML5 audio), mostra
 *    toast, notificação do sistema e destaca o pedido.
 * 3. Enquanto houver pedidos PENDENTES, o som é repetido a cada 30s até
 *    alguém aceitar o pedido (garante atendimento imediato).
 * 4. Se o WebSocket cair, entra em modo POLLING (a cada 8s, com ETag/304) e
 *    tenta reconectar com backoff exponencial.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, wsUrl } from "./api";
import { alertSound } from "./sound";
import { useToast } from "./toast";
import { TYPE_ICON } from "./utils";

const RealtimeContext = createContext(null);
const POLL_MS = 8000;
const REMINDER_MS = 30000;
const BASE_TITLE = "Hotel Herbo · Painel";

export function RealtimeProvider({ children }) {
  const toast = useToast();
  const [status, setStatus] = useState("connecting"); // online | polling | connecting
  const [pendingOrders, setPendingOrders] = useState([]);
  const [newOrderIds, setNewOrderIds] = useState(() => new Set());
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("herbo_sound") !== "0");
  const [soundUnlocked, setSoundUnlocked] = useState(alertSound.unlocked);

  const listeners = useRef(new Set());
  const knownPending = useRef(null); // ids já conhecidos (null = ainda não carregado)
  const soundOnRef = useRef(soundOn);
  const pendingRef = useRef(pendingOrders);
  soundOnRef.current = soundOn;
  pendingRef.current = pendingOrders;

  useEffect(() => alertSound.onChange(setSoundUnlocked), []);

  const emit = useCallback((msg) => listeners.current.forEach((fn) => fn(msg)), []);
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  // ---- Anúncio de novo pedido (som + toast + notificação) -----------------
  const announce = useCallback(
    (order) => {
      if (!order?.id) return;
      if (!knownPending.current) knownPending.current = new Set();
      if (knownPending.current.has(order.id)) return;
      knownPending.current.add(order.id);

      if (soundOnRef.current) alertSound.play();
      setNewOrderIds((s) => new Set(s).add(order.id));
      const title = `${TYPE_ICON[order.request_type] || "🔔"} Novo pedido · ${order.room_code}`;
      const body = `${order.guest_name}: ${order.quantity > 1 ? order.quantity + "x " : ""}${order.title}`;
      toast(title, body, { duration: 10000 });
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        try {
          new Notification(title, { body, icon: "/favicon.svg", tag: `order-${order.id}` });
        } catch {
          /* ignore */
        }
      }
    },
    [toast]
  );

  const refreshPending = useCallback(async () => {
    try {
      const data = await api("/orders/?status=pendente");
      if (!data) return;
      if (knownPending.current) {
        // Detecta pedidos novos também no modo polling.
        data.filter((o) => !knownPending.current.has(o.id)).forEach(announce);
      }
      knownPending.current = new Set(data.map((o) => o.id));
      setPendingOrders(data);
      setNewOrderIds((s) => new Set([...s].filter((id) => knownPending.current.has(id))));
    } catch {
      /* rede indisponível — tentaremos de novo */
    }
  }, [announce]);

  // ---- Tratamento das mensagens do WebSocket ------------------------------
  const handlerRef = useRef();
  handlerRef.current = (msg) => {
    switch (msg.event) {
      case "order.created":
        announce(msg.data);
        refreshPending();
        break;
      case "order.updated":
        refreshPending();
        break;
      default:
        break;
    }
    emit(msg);
  };

  // ---- Conexão WebSocket com reconexão automática -------------------------
  useEffect(() => {
    let ws;
    let retry = 0;
    let disposed = false;
    let pingTimer;
    let reconnectTimer;

    const connect = () => {
      if (disposed) return;
      setStatus((s) => (s === "online" ? "connecting" : s));
      ws = new WebSocket(wsUrl("/ws/admin/"));
      ws.onopen = () => {
        retry = 0;
        setStatus("online");
        refreshPending();
        emit({ event: "resync" });
        pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 25000);
      };
      ws.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data));
        } catch {
          /* mensagem inválida */
        }
      };
      ws.onclose = (e) => {
        clearInterval(pingTimer);
        if (disposed) return;
        setStatus("polling");
        if (e.code === 4401) return; // token inválido
        retry += 1;
        reconnectTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry));
      };
      ws.onerror = () => ws.close();
    };

    refreshPending();
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [emit, refreshPending]);

  // ---- Fallback: polling enquanto o WebSocket estiver fora ----------------
  useEffect(() => {
    if (status === "online") return;
    const t = setInterval(() => {
      refreshPending();
      emit({ event: "poll" });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [status, refreshPending, emit]);

  // ---- Lembrete sonoro enquanto houver pedido pendente --------------------
  useEffect(() => {
    const t = setInterval(() => {
      if (soundOnRef.current && pendingRef.current.length > 0) alertSound.play();
    }, REMINDER_MS);
    return () => clearInterval(t);
  }, []);

  // ---- Título da aba piscando com a contagem ------------------------------
  useEffect(() => {
    const n = pendingOrders.length;
    if (!n) {
      document.title = BASE_TITLE;
      return;
    }
    let flip = false;
    const t = setInterval(() => {
      flip = !flip;
      document.title = flip ? `🔔 (${n}) Pedido${n > 1 ? "s" : ""} pendente${n > 1 ? "s" : ""}` : BASE_TITLE;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = BASE_TITLE;
    };
  }, [pendingOrders.length]);

  const enableSound = useCallback(async () => {
    localStorage.setItem("herbo_sound", "1");
    setSoundOn(true);
    await alertSound.unlock();
    await alertSound.play();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      localStorage.setItem("herbo_sound", on ? "0" : "1");
      if (!on) alertSound.unlock();
      return !on;
    });
  }, []);

  const acknowledge = useCallback((id) => {
    setNewOrderIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const value = {
    status,
    pendingOrders,
    newOrderIds,
    acknowledge,
    subscribe,
    soundOn,
    soundUnlocked,
    enableSound,
    toggleSound,
    testSound: () => alertSound.play(),
    refreshPending,
  };
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Recarrega dados da página quando chegam eventos relevantes (ou no polling). */
export function useRealtimeRefresh(events, callback) {
  const { subscribe } = useRealtime();
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const key = events.join(",");
  useEffect(() => {
    const wanted = new Set([...key.split(","), "poll", "resync"]);
    let timer;
    return subscribe((msg) => {
      if (!wanted.has(msg.event)) return;
      clearTimeout(timer); // debounce: vários eventos seguidos = 1 recarga
      timer = setTimeout(() => cbRef.current(msg), 150);
    });
  }, [key, subscribe]);
}
