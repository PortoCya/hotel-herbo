import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  apiFetch,
  buildWsUrl,
  getToken,
  initApiStorage,
  setToken,
} from "./src/api";
import HerboLogo from "./src/components/HerboLogo";
import ConsumptionHistoryScreen from "./src/screens/ConsumptionHistoryScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RequestsCenterScreen from "./src/screens/RequestsCenterScreen";
import StayDashboardScreen from "./src/screens/StayDashboardScreen";
import { COLORS } from "./src/theme";

const POLL_INTERVAL_MS = 6000;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [stay, setStay] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [activeTab, setActiveTab] = useState("estadia"); // "estadia" | "consumo" | "pedidos"
  const [quickCat, setQuickCat] = useState("servico_quarto");
  const [refreshing, setRefreshing] = useState(false);
  const [connStatus, setConnStatus] = useState("connecting"); // "online" | "polling" | "connecting"
  const [syncBanner, setSyncBanner] = useState("");
  const bannerTimer = useRef(null);

  const showSyncFeedback = useCallback((msg) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setSyncBanner(msg);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    bannerTimer.current = setTimeout(() => setSyncBanner(""), 4000);
  }, []);

  const fetchStayAndCatalog = useCallback(async ({ force = false, silent = false } = {}) => {
    if (!getToken()) return;
    try {
      const stayRes = await apiFetch("/me/stay/", { useEtag: !force });
      if (!stayRes.notModified && stayRes.data) {
        setStay(stayRes.data);
      }
      if (force || catalog.length === 0) {
        const catData = await apiFetch("/catalog/");
        setCatalog(catData || []);
      }
    } catch (err) {
      if (err.status === 401) {
        await setToken(null);
        setUser(null);
        setStay(null);
      } else if (!silent) {
        console.warn("Falha ao sincronizar estadia:", err.message);
      }
    }
  }, [catalog.length]);

  // Inicialização: restaura token e URL salvos no celular
  useEffect(() => {
    (async () => {
      try {
        const { token } = await initApiStorage();
        if (token) {
          const me = await apiFetch("/auth/me/");
          if (me.role === "guest") {
            setUser(me.user);
            await fetchStayAndCatalog({ force: true });
          } else {
            await setToken(null);
          }
        }
      } catch {
        await setToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Conexão WebSocket em tempo real + Fallback de Polling ETag
  useEffect(() => {
    if (!user) return;
    let ws;
    let disposed = false;
    let retry = 0;
    let reconnectTimer;
    let pingTimer;

    const connectWs = () => {
      if (disposed) return;
      ws = new WebSocket(buildWsUrl("/ws/guest/"));
      ws.onopen = () => {
        retry = 0;
        setConnStatus("online");
        fetchStayAndCatalog({ silent: true });
        pingTimer = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ping" }));
        }, 25000);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "stay.updated") {
            fetchStayAndCatalog({ force: true, silent: true });
            showSyncFeedback("✦ Atualizado em tempo real pela recepção");
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (disposed) return;
        setConnStatus("polling");
        retry += 1;
        reconnectTimer = setTimeout(
          connectWs,
          Math.min(12000, 1000 * Math.pow(2, retry))
        );
      };
      ws.onerror = () => ws.close();
    };

    connectWs();

    // Polling leve com ETag (304 Not Modified quando nada mudou)
    const pollTimer = setInterval(() => {
      fetchStayAndCatalog({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      clearInterval(pollTimer);
      ws?.close();
    };
  }, [user, fetchStayAndCatalog, showSyncFeedback]);

  const handleLogin = async (username, password) => {
    const res = await apiFetch("/auth/login/", {
      method: "POST",
      body: { username, password },
    });
    if (res.role !== "guest") {
      throw new Error(
        "Esta conta pertence à administração. Use o login de hóspede (ex.: marcela / herbo123)."
      );
    }
    await setToken(res.token);
    setUser(res.user);
    setActiveTab("estadia");
    await fetchStayAndCatalog({ force: true });
  };

  const handleLogout = async () => {
    await setToken(null);
    setUser(null);
    setStay(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStayAndCatalog({ force: true });
    setRefreshing(false);
  };

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.gold500} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <StatusBar style="light" backgroundColor={COLORS.forest950} />
        {!user ? (
          <LoginScreen onLogin={handleLogin} />
        ) : (
          <View style={styles.appWrap}>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <HerboLogo size={38} showSubtitle={false} />
              <View style={styles.topRight}>
                <View style={styles.livePill}>
                  <View
                    style={[
                      styles.liveLed,
                      {
                        backgroundColor:
                          connStatus === "online" ? COLORS.success : COLORS.warning,
                      },
                    ]}
                  />
                  <Text style={styles.liveText}>
                    {connStatus === "online" ? "Ao vivo" : "Sincronizando"}
                  </Text>
                </View>
                <Pressable style={styles.logoutBtn} onPress={handleLogout}>
                  <Text style={styles.logoutText}>Sair</Text>
                </Pressable>
              </View>
            </View>

            {!!syncBanner && (
              <View style={styles.syncToast}>
                <Text style={styles.syncToastText}>{syncBanner}</Text>
              </View>
            )}

            {/* Conteúdo da Aba */}
            <View style={{ flex: 1 }}>
              {activeTab === "estadia" && (
                <StayDashboardScreen
                  stay={stay}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  onNavigateTab={setActiveTab}
                  onQuickRequest={(catKey) => {
                    setQuickCat(catKey);
                    setActiveTab("pedidos");
                  }}
                />
              )}
              {activeTab === "consumo" && (
                <ConsumptionHistoryScreen
                  stay={stay}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
              )}
              {activeTab === "pedidos" && (
                <RequestsCenterScreen
                  stay={stay}
                  catalog={catalog}
                  initialCategory={quickCat}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  onOrderCreated={async () => {
                    await fetchStayAndCatalog({ force: true });
                    showSyncFeedback("🔔 Solicitação enviada para a recepção!");
                  }}
                />
              )}
            </View>

            {/* Barra de Navegação Inferior */}
            <View style={styles.bottomBar}>
              {[
                { key: "estadia", label: "Minha Tenda", icon: "⛺" },
                {
                  key: "consumo",
                  label: "Consumo & Histórico",
                  icon: "🧾",
                  badge: stay?.summary?.active_items || 0,
                },
                {
                  key: "pedidos",
                  label: "Solicitações",
                  icon: "🔔",
                  badge: stay?.summary?.open_orders || 0,
                },
              ].map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.navItem, isActive && styles.navItemActive]}
                    onPress={() => setActiveTab(tab.key)}
                  >
                    <View style={styles.navIconRow}>
                      <Text style={styles.navIcon}>{tab.icon}</Text>
                      {tab.badge > 0 && (
                        <View style={styles.navBadge}>
                          <Text style={styles.navBadgeText}>{tab.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.forest950,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.forest950,
    alignItems: "center",
    justifyContent: "center",
  },
  appWrap: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.forest900,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.forest950,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  liveLed: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600",
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  logoutText: {
    color: COLORS.gold300,
    fontSize: 12,
    fontWeight: "700",
  },
  syncToast: {
    backgroundColor: "rgba(201, 164, 92, 0.22)",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gold500,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  syncToastText: {
    color: COLORS.gold200,
    fontSize: 12,
    fontWeight: "700",
  },
  bottomBar: {
    flexDirection: "row",
    backgroundColor: COLORS.forest900,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: "rgba(201, 164, 92, 0.14)",
  },
  navIconRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  navIcon: {
    fontSize: 18,
  },
  navBadge: {
    backgroundColor: COLORS.gold500,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  navBadgeText: {
    color: COLORS.forest950,
    fontSize: 10,
    fontWeight: "700",
  },
  navLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  navLabelActive: {
    color: COLORS.gold200,
    fontWeight: "700",
  },
});
