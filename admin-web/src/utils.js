export const brl = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

export function timeAgo(d) {
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const ROOM_STATUS = {
  disponivel: { label: "Disponível", color: "var(--success)" },
  ocupada: { label: "Ocupada", color: "var(--gold-500)" },
  limpeza: { label: "Em limpeza", color: "var(--info)" },
  manutencao: { label: "Manutenção", color: "var(--danger)" },
};

export const RES_STATUS = {
  reservada: { label: "Reservada", color: "var(--info)" },
  hospedado: { label: "Hospedado", color: "var(--success)" },
  finalizada: { label: "Finalizada", color: "var(--muted)" },
  cancelada: { label: "Cancelada", color: "var(--danger)" },
};

export const ORDER_STATUS = {
  pendente: { label: "Pendente", color: "var(--danger)" },
  aceito: { label: "Aceito", color: "var(--warning)" },
  em_andamento: { label: "Em andamento", color: "var(--info)" },
  concluido: { label: "Concluído", color: "var(--success)" },
  cancelado: { label: "Cancelado", color: "var(--muted)" },
};

export const TYPE_ICON = {
  servico_quarto: "🍽️",
  fogueira: "🔥",
  limpeza: "🧺",
  experiencia: "🌄",
  outro: "✳️",
};

export const CATEGORIES = [
  ["alimentacao", "Alimentação"],
  ["bebidas", "Bebidas"],
  ["experiencias", "Experiências"],
  ["servicos", "Serviços"],
  ["outros", "Outros"],
];

export const ACTIVITY_COLOR = {
  check_in: "var(--success)",
  check_out: "var(--muted)",
  reserva: "var(--info)",
  consumo_adicionado: "var(--gold-500)",
  consumo_editado: "var(--warning)",
  consumo_cancelado: "var(--danger)",
  pedido_criado: "var(--info)",
  pedido_atualizado: "var(--success)",
  pedido_cancelado: "var(--danger)",
};
