/**
 * Paleta de cores e utilitários visuais — Hotel Herbo (Mobile)
 * Identidade: Sofisticada e rústica (verde-floresta profundo, dourado e tons de terra).
 */
import { Platform } from "react-native";

export const COLORS = {
  forest950: "#0a1a12",
  forest900: "#10261b",
  forest850: "#132d20",
  forest800: "#173527",
  forest700: "#1f4533",
  forest600: "#2b5a43",
  gold200: "#f0dfb4",
  gold300: "#e2c88f",
  gold500: "#c9a45c",
  gold700: "#9c7a3c",
  earth500: "#8b6b4a",
  clay500: "#b5734a",
  cream: "#f3ead6",
  text: "#efe6d2",
  muted: "#a6b0a0",
  line: "rgba(201, 164, 92, 0.22)",
  lineSoft: "rgba(201, 164, 92, 0.12)",
  danger: "#d0705a",
  dangerBg: "rgba(208, 112, 90, 0.15)",
  success: "#86bd8b",
  successBg: "rgba(134, 189, 139, 0.16)",
  info: "#8fb3c9",
  infoBg: "rgba(143, 179, 201, 0.16)",
  warning: "#e0b25a",
  warningBg: "rgba(224, 178, 90, 0.16)",
};

export const SERIF_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, serif",
});

export const brl = (v) => {
  const num = Number(v || 0);
  const [intPart, decPart] = num.toFixed(2).split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${formattedInt},${decPart}`;
};

export const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

export const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)} às ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export const RES_STATUS_META = {
  reservada: { label: "Reserva Confirmada", color: COLORS.info, bg: COLORS.infoBg },
  hospedado: { label: "Check-in Ativo · Hospedado", color: COLORS.success, bg: COLORS.successBg },
  finalizada: { label: "Check-out Finalizado", color: COLORS.muted, bg: "rgba(166,176,160,0.15)" },
  cancelada: { label: "Reserva Cancelada", color: COLORS.danger, bg: COLORS.dangerBg },
};

export const ORDER_STATUS_META = {
  pendente: { label: "Aguardando recepção", color: COLORS.warning, bg: COLORS.warningBg },
  aceito: { label: "Aceito pela equipe", color: COLORS.info, bg: COLORS.infoBg },
  em_andamento: { label: "Em preparo / a caminho", color: COLORS.gold300, bg: "rgba(201,164,92,0.18)" },
  concluido: { label: "Concluído", color: COLORS.success, bg: COLORS.successBg },
  cancelado: { label: "Cancelado", color: COLORS.danger, bg: COLORS.dangerBg },
};

export const REQUEST_TYPES = [
  { key: "servico_quarto", label: "Room Service", icon: "🍽️", subtitle: "Gastronomia & bebidas na tenda" },
  { key: "fogueira", label: "Fogueira", icon: "🔥", subtitle: "Acendimento & kits s'mores" },
  { key: "limpeza", label: "Arrumação", icon: "🧺", subtitle: "Limpeza, toalhas & lavanderia" },
  { key: "experiencia", label: "Experiências", icon: "🌄", subtitle: "Spa, trilhas & jantares" },
];

export const ACTIVITY_META = {
  check_in: { icon: "🏕️", color: COLORS.success },
  check_out: { icon: "✨", color: COLORS.gold300 },
  reserva: { icon: "📅", color: COLORS.info },
  consumo_adicionado: { icon: "🧾", color: COLORS.gold500 },
  consumo_editado: { icon: "✏️", color: COLORS.warning },
  consumo_cancelado: { icon: "↩️", color: COLORS.danger },
  pedido_criado: { icon: "🔔", color: COLORS.info },
  pedido_atualizado: { icon: "✅", color: COLORS.success },
  pedido_cancelado: { icon: "✕", color: COLORS.danger },
};
