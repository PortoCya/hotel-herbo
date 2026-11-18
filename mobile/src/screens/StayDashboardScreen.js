import React from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  brl,
  COLORS,
  fmtDate,
  ORDER_STATUS_META,
  REQUEST_TYPES,
  RES_STATUS_META,
  SERIF_FONT,
} from "../theme";

export default function StayDashboardScreen({
  stay,
  refreshing,
  onRefresh,
  onNavigateTab,
  onQuickRequest,
}) {
  const guest = stay?.guest;
  const reservation = stay?.reservation;
  const room = stay?.room;
  const summary = stay?.summary;
  const orders = stay?.orders || [];

  if (!reservation) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold500} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.greeting}>Olá, {guest?.first_name || "Hóspede"}</Text>
          <Text style={styles.subGreeting}>
            Você ainda não possui uma reserva ativa no Hotel Herbo. Procure a nossa recepção para iniciar sua experiência glamping.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const resMeta = RES_STATUS_META[reservation.status] || RES_STATUS_META.reservada;
  const openOrders = orders.filter((o) =>
    ["pendente", "aceito", "em_andamento"].includes(o.status)
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold500} />
      }
    >
      {/* Cabeçalho do Perfil & Status do Check-in (Espelho em Tempo Real) */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ornament}>✦ BEM-VINDO(A) AO HOTEL HERBO ✦</Text>
            <Text style={styles.greeting}>Olá, {guest?.first_name}</Text>
            <Text style={styles.fullName}>{guest?.full_name} · Reserva {reservation.code}</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: resMeta.bg, borderColor: resMeta.color }]}>
          <View style={[styles.dot, { backgroundColor: resMeta.color }]} />
          <Text style={[styles.statusBadgeText, { color: resMeta.color }]}>
            {resMeta.label}
          </Text>
        </View>

        {/* Indicadores de Dias de Hospedagem */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>DIAS HOSPEDADO(A)</Text>
            <Text style={styles.metricValue}>
              {reservation.status === "hospedado"
                ? `${reservation.days_hosted} ${reservation.days_hosted === 1 ? "dia" : "dias"}`
                : "Aguardando"}
            </Text>
            <Text style={styles.metricHint}>
              {reservation.nights} {reservation.nights === 1 ? "diária" : "diárias"} contratadas
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>CHECK-IN / CHECK-OUT</Text>
            <Text style={styles.metricDates}>
              {fmtDate(reservation.check_in_date)} → {fmtDate(reservation.check_out_date)}
            </Text>
            <Text style={styles.metricHint}>
              {reservation.status === "hospedado" && reservation.days_remaining !== null
                ? `Restam ${reservation.days_remaining} dia(s)`
                : reservation.status_display}
            </Text>
          </View>
        </View>
      </View>

      {/* Card da Tenda / Quarto Atual */}
      {room && (
        <View style={styles.card}>
          <View style={styles.roomHeader}>
            <View>
              <Text style={styles.roomCode}>{room.code} · {room.category_display.toUpperCase()}</Text>
              <Text style={styles.roomName}>{room.name}</Text>
            </View>
            <View style={styles.tentIconBox}>
              <Text style={{ fontSize: 24 }}>⛺</Text>
            </View>
          </View>
          {!!room.description && <Text style={styles.roomDesc}>{room.description}</Text>}
          {room.amenities_list?.length > 0 && (
            <View style={styles.amenitiesWrap}>
              {room.amenities_list.map((am) => (
                <View key={am} style={styles.amenityChip}>
                  <Text style={styles.amenityText}>✦ {am}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Espelho Financeiro em Tempo Real */}
      {summary && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionOrnament}>TRANSPARÊNCIA EM TEMPO REAL</Text>
              <Text style={styles.sectionTitle}>Resumo da Estadia</Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => onNavigateTab("consumo")}>
              <Text style={styles.linkBtnText}>Ver extrato ({summary.active_items}) →</Text>
            </Pressable>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Hospedagem ({reservation.nights}d)</Text>
              <Text style={styles.summaryValue}>{brl(summary.lodging_total)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Consumo & Experiências</Text>
              <Text style={styles.summaryValue}>{brl(summary.consumption_total)}</Text>
            </View>
          </View>

          <View style={styles.grandTotalBar}>
            <View>
              <Text style={styles.grandTotalLabel}>TOTAL PARCIAL</Text>
              {summary.cancelled_items > 0 && (
                <Text style={styles.cancelledNote}>
                  {summary.cancelled_items} item(ns) estornado(s)/cancelado(s) no histórico
                </Text>
              )}
            </View>
            <Text style={styles.grandTotalValue}>{brl(summary.grand_total)}</Text>
          </View>
        </View>
      )}

      {/* Atalhos da Central de Solicitações */}
      <View style={styles.card}>
        <Text style={styles.sectionOrnament}>ATENDIMENTO IMEDIATO NA TENDA</Text>
        <Text style={styles.sectionTitle}>Solicitar agora</Text>
        <Text style={styles.helperText}>
          Seu pedido toca um alerta sonoro instantâneo na recepção do Hotel Herbo.
        </Text>

        <View style={styles.quickGrid}>
          {REQUEST_TYPES.map((rt) => (
            <Pressable
              key={rt.key}
              style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.85 }]}
              onPress={() => onQuickRequest(rt.key)}
            >
              <Text style={styles.quickIcon}>{rt.icon}</Text>
              <Text style={styles.quickTitle}>{rt.label}</Text>
              <Text style={styles.quickSub} numberOfLines={1}>{rt.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Pedidos em andamento */}
      {openOrders.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Solicitações em andamento</Text>
            <Pressable onPress={() => onNavigateTab("pedidos")}>
              <Text style={styles.linkBtnText}>Ver todas →</Text>
            </Pressable>
          </View>
          {openOrders.map((o) => {
            const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.pendente;
            return (
              <View key={o.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderTitle}>
                    {o.quantity > 1 ? `${o.quantity}× ` : ""}{o.title}
                  </Text>
                  {!!o.admin_response && (
                    <Text style={styles.orderReply}>💬 Equipe: “{o.admin_response}”</Text>
                  )}
                </View>
                <View style={[styles.smallBadge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                  <Text style={[styles.smallBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.forest950,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    backgroundColor: COLORS.forest800,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gold700,
    padding: 20,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  ornament: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 2.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  greeting: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold200,
    fontSize: 30,
    fontWeight: "600",
  },
  fullName: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  subGreeting: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  metricBox: {
    flex: 1,
  },
  metricDivider: {
    width: 1,
    backgroundColor: COLORS.line,
    marginHorizontal: 14,
  },
  metricLabel: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  metricValue: {
    fontFamily: SERIF_FONT,
    color: COLORS.cream,
    fontSize: 26,
    fontWeight: "600",
    marginTop: 4,
  },
  metricDates: {
    color: COLORS.cream,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  metricHint: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  card: {
    backgroundColor: COLORS.forest850,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 18,
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomCode: {
    color: COLORS.gold500,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  roomName: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold200,
    fontSize: 24,
    fontWeight: "600",
    marginTop: 2,
  },
  tentIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(201, 164, 92, 0.12)",
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: "center",
    justifyContent: "center",
  },
  roomDesc: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  amenitiesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  amenityChip: {
    backgroundColor: COLORS.forest950,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amenityText: {
    color: COLORS.gold300,
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionOrnament: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  sectionTitle: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold300,
    fontSize: 21,
    fontWeight: "600",
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  linkBtn: {
    paddingVertical: 4,
  },
  linkBtnText: {
    color: COLORS.gold300,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: COLORS.forest950,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 11,
  },
  summaryValue: {
    fontFamily: SERIF_FONT,
    color: COLORS.cream,
    fontSize: 20,
    fontWeight: "600",
    marginTop: 4,
  },
  grandTotalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  grandTotalLabel: {
    color: COLORS.gold500,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  cancelledNote: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  grandTotalValue: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold200,
    fontSize: 26,
    fontWeight: "700",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickTile: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: COLORS.forest900,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  quickIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickTitle: {
    color: COLORS.gold200,
    fontWeight: "700",
    fontSize: 14,
  },
  quickSub: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  orderTitle: {
    color: COLORS.cream,
    fontSize: 14,
    fontWeight: "700",
  },
  orderReply: {
    color: COLORS.gold300,
    fontSize: 12,
    marginTop: 3,
  },
  smallBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  smallBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
