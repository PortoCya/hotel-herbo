/**
 * Cliente HTTP + WebSocket do App Mobile (Hotel Herbo).
 *
 * Detecta automaticamente o IP da máquina rodando o Expo (para funcionar no
 * celular físico via Expo Go na mesma rede Wi-Fi) e também permite configurar
 * manualmente o endereço do backend Django.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

const TOKEN_KEY = "@herbo_guest_token";
const API_URL_KEY = "@herbo_api_url";

function detectDefaultBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "");
  }
  // Quando aberto no Expo Go no celular, hostUri contém "<IP_DO_PC>:8081"
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:8000`;
    }
  }
  if (Platform.OS === "android") {
    // Emulador Android padrão enxerga o PC via 10.0.2.2
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
}

let currentBaseUrl = detectDefaultBaseUrl();
let authToken = null;
const etagCache = new Map();

export async function initApiStorage() {
  const [savedUrl, savedToken] = await Promise.all([
    AsyncStorage.getItem(API_URL_KEY),
    AsyncStorage.getItem(TOKEN_KEY),
  ]);
  if (savedUrl) currentBaseUrl = savedUrl.replace(/\/+$/, "");
  if (savedToken) authToken = savedToken;
  return { baseUrl: currentBaseUrl, token: authToken };
}

export function getBaseUrl() {
  return currentBaseUrl;
}

export async function setBaseUrl(url) {
  const clean = (url || "").trim().replace(/\/+$/, "") || detectDefaultBaseUrl();
  currentBaseUrl = clean;
  etagCache.clear();
  await AsyncStorage.setItem(API_URL_KEY, clean);
  return currentBaseUrl;
}

export function getToken() {
  return authToken;
}

export async function setToken(token) {
  authToken = token;
  etagCache.clear();
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    // Caso o backend tenha retornado localhost mas o celular esteja acessando via IP da LAN:
    try {
      const parsed = new URL(url);
      const base = new URL(currentBaseUrl);
      if (
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
        base.hostname !== "localhost"
      ) {
        parsed.hostname = base.hostname;
        parsed.port = base.port || "8000";
        return parsed.toString();
      }
    } catch {
      /* ignore */
    }
    return url;
  }
  return `${currentBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function buildWsUrl(path = "/ws/guest/") {
  const wsBase = currentBaseUrl.replace(/^http/, "ws");
  return `${wsBase}${path}?token=${encodeURIComponent(authToken || "")}`;
}

function parseError(data, status) {
  if (!data) return `Erro ${status}`;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.join(" ");
  if (data.detail) return data.detail;
  if (data.non_field_errors) return data.non_field_errors.join(" ");
  const first = Object.entries(data)[0];
  if (first) {
    const [k, v] = first;
    return `${k}: ${Array.isArray(v) ? v.join(" ") : v}`;
  }
  return `Erro ${status}`;
}

/**
 * Faz chamada à API do Django.
 * Suporta ETag/If-None-Match para polling ultra-leve (retorna `{notModified: true}` em 304).
 */
export async function apiFetch(path, { method = "GET", body, useEtag = false } = {}) {
  const headers = { Accept: "application/json" };
  if (authToken) headers.Authorization = `Token ${authToken}`;

  const cacheKey = `${method}:${path}`;
  if (useEtag && method === "GET" && etagCache.has(cacheKey)) {
    headers["If-None-Match"] = etagCache.get(cacheKey);
  }

  const options = { method, headers };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${currentBaseUrl}/api${path}`, options);
  if (response.status === 304) {
    return { notModified: true, data: null };
  }
  if (response.status === 204) {
    return { notModified: false, data: null };
  }

  const etag = response.headers.get("etag") || response.headers.get("ETag");
  if (etag && method === "GET") {
    etagCache.set(cacheKey, etag);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(parseError(data, response.status));
    err.status = response.status;
    throw err;
  }
  return useEtag ? { notModified: false, data } : data;
}
