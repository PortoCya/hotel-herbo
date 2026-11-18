// Cliente HTTP do painel. Em desenvolvimento o Vite faz proxy de /api -> Django.
const API_BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "herbo_admin_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function extractMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.join(" ");
  if (data.detail) return data.detail;
  if (data.non_field_errors) return data.non_field_errors.join(" ");
  const [field, msgs] = Object.entries(data)[0] || [];
  if (field) return `${field}: ${Array.isArray(msgs) ? msgs.join(" ") : msgs}`;
  return fallback;
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  const token = getToken();
  if (token) opts.headers.Authorization = `Token ${token}`;
  if (body instanceof FormData) {
    opts.body = body; // multipart (upload de fotos) — o navegador define o boundary
  } else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}/api${path}`, opts);
  if (res.status === 401) {
    clearToken();
    if (!location.pathname.startsWith("/login")) location.href = "/login";
    throw new ApiError("Sessão expirada.", 401);
  }
  if (res.status === 204 || res.status === 304) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(extractMessage(data, `Erro ${res.status}`), res.status, data);
  return data;
}

export function wsUrl(path) {
  const base = API_BASE ? new URL(API_BASE) : window.location;
  const proto = base.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${base.host}${path}?token=${encodeURIComponent(getToken() || "")}`;
}
