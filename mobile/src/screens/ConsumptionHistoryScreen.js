import React, { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { resolveMediaUrl } from "../api";
import {
  ACTIVITY_META,
  brl,
  COLORS,
  fmtDateTime,
  SERIF_FONT,
} from "../theme";

export default function ConsumptionHistoryScreen({ stay, refreshing, onRefresh }) {
  const [subTab, setSubTab] = useState("consumo"); // "consumo" | "historico"
  const [filter, setFilter] = useState("todos"); // "todos" | "ativo" | "cancelado"
  const [zoomImage, setZoomImage] = useState(null);

  const consumptions = stay?.consumptions || [];
  const activities = stay?.activities || [];
  const summary = stay?.summary;

  const filteredConsumptions = consumptions.filter((c) =>
    filter === "todos" ? true : c.status === filter
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold500} />
      }
    >
      {/* Resumo no topo */}
      {summary && (
        <View style={styles.summaryBanner}>
          <View>
            <Text style={styles.bannerLabel}>CONSUMO ATIVO DA ESTADIA</Text>
            <Text style={styles.bannerValue}>{brl(summary.consumption_total)}</Text>
          </View>
          <View style={styles.bannerRight}>
            <Text style={styles.bannerStat}>✓ {summary.active_items} item(ns) ativo(s)</Text>
            <Text style={styles.bannerStatMuted}>
              ↩ {summary.cancelled_items} cancelado(s)
            </Text>
          </View>
        </View>
      )}

      {/* Alternador Consumo vs Histórico de Atividades */}
      <View style={styles.segmented}>
        <Pressable
          style={[styles.segBtn, subTab === "consumo" && styles.segBtnActive]}
          onPress={() => setSubTab("consumo")}
        >
          <Text style={[styles.segText, subTab === "consumo" && styles.segTextActive]}>
            🧾 Lista de Consumo ({consumptions.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, subTab === "historico" && styles.segBtnActive]}
          onPress={() => setSubTab("historico")}
        >
          <Text style={[styles.segText, subTab === "historico" && styles.segTextActive]}>
            📜 Linha do Tempo ({activities.length})
          </Text>
        </Pressable>
      </View>

      {subTab === "consumo" ? (
        <>
          <View style={styles.filterRow}>
            {[
              ["todos", "Todos"],
              ["ativo", "Ativos"],
              ["cancelado", "Cancelados / Estornados"],
            ].map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.filterPill, filter === key && styles.filterPillActive]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {filteredConsumptions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nenhum item encontrado neste filtro.</Text>
            </View>
          ) : (
            filteredConsumptions.map((item) => {
              const isCancelled = item.status === "cancelado";
              const photoUrl = resolveMediaUrl(item.photo);
              return (
                <View
                  key={item.id}
                  style={[styles.itemCard, isCancelled && styles.itemCardCancelled]}
                >
                  <View style={styles.itemRow}>
                    {photoUrl ? (
                      <Pressable onPress={() => setZoomImage(photoUrl)}>
                        <Image source={{ uri: photoUrl }} style={styles.thumb} />
                        <Text style={styles.zoomHint}>🔍 Ampliar</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <Text style={{ fontSize: 20 }}>🍽️</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text
                          style={[
                            styles.itemTitle,
                            isCancelled && styles.itemTitleCancelled,
                          ]}
                        >
                          {item.quantity}× {item.description}
                        </Text>
                        <Text
                          style={[
                            styles.itemTotal,
                            isCancelled && styles.itemTotalCancelled,
                          ]}
                        >
                          {brl(item.total)}
                        </Text>
                      </View>

                      <Text style={styles.itemMeta}>
                        {item.category_display} · {brl(item.unit_price)} un. ·{" "}
                        {fmtDateTime(item.created_at)}
                      </Text>

                      {!!item.notes && (
                        <Text style={styles.itemNotes}>Obs.: {item.notes}</Text>
                      )}

                      {isCancelled && (
                        <View style={styles.cancelBox}>
                          <Text style={styles.cancelBadgeText}>
                            ITEM CANCELADO (NÃO COBRADO)
                          </Text>
                          {!!item.cancel_reason && (
                            <Text style={styles.cancelReason}>
                              Motivo: {item.cancel_reason}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : (
        <View style={styles.timelineCard}>
          <Text style={styles.timelineIntro}>
            Registro transparente e auditável de todas as adições, edições, cancelamentos e solicitações da sua estadia.
          </Text>
          {activities.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma atividade registrada ainda.</Text>
          ) : (
            activities.map((act) => {
              const meta = ACTIVITY_META[act.kind] || {
                icon: "•",
                color: COLORS.gold500,
              };
              return (
                <View key={act.id} style={styles.timelineRow}>
                  <View style={[styles.timelineDot, { borderColor: meta.color }]}>
                    <Text style={{ fontSize: 13 }}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timelineKind}>{act.kind_display}</Text>
                    <Text style={styles.timelineMsg}>{act.message}</Text>
                    <Text style={styles.timelineDate}>{fmtDateTime(act.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Modal para visualizar foto do produto/comprovante em tela cheia */}
      <Modal
        visible={!!zoomImage}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomImage(null)}
      >
        <Pressable style={styles.lightbox} onPress={() => setZoomImage(null)}>
          {zoomImage && (
            <Image
              source={{ uri: zoomImage }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          )}
          <Text style={styles.lightboxClose}>Toque em qualquer lugar para fechar ✕</Text>
        </Pressable>
      </Modal>
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
    gap: 14,
  },
  summaryBanner: {
    backgroundColor: COLORS.forest800,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.gold700,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerLabel: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  bannerValue: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold200,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
  },
  bannerRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  bannerStat: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "700",
  },
  bannerStatMuted: {
    color: COLORS.muted,
    fontSize: 12,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: COLORS.forest900,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: "rgba(201, 164, 92, 0.18)",
  },
  segText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  segTextActive: {
    color: COLORS.gold200,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  filterPillActive: {
    backgroundColor: "rgba(201, 164, 92, 0.18)",
    borderColor: COLORS.gold500,
  },
  filterText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: COLORS.gold200,
  },
  itemCard: {
    backgroundColor: COLORS.forest850,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
  },
  itemCardCancelled: {
    opacity: 0.72,
    borderColor: "rgba(208, 112, 90, 0.35)",
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold500,
  },
  zoomHint: {
    color: COLORS.gold300,
    fontSize: 10,
    textAlign: "center",
    marginTop: 3,
  },
  thumbPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: COLORS.forest950,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    color: COLORS.cream,
    fontSize: 15,
    fontWeight: "700",
  },
  itemTitleCancelled: {
    textDecorationLine: "line-through",
    color: COLORS.muted,
  },
  itemTotal: {
    color: COLORS.gold200,
    fontWeight: "700",
    fontSize: 15,
  },
  itemTotalCancelled: {
    textDecorationLine: "line-through",
    color: COLORS.danger,
  },
  itemMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  itemNotes: {
    color: COLORS.gold300,
    fontSize: 12,
    marginTop: 4,
  },
  cancelBox: {
    marginTop: 8,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 8,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
  },
  cancelBadgeText: {
    color: "#f6c3b6",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  cancelReason: {
    color: COLORS.text,
    fontSize: 12,
    marginTop: 2,
  },
  timelineCard: {
    backgroundColor: COLORS.forest850,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
  },
  timelineIntro: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.forest950,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timelineKind: {
    color: COLORS.gold500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  timelineMsg: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  timelineDate: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 3,
  },
  emptyCard: {
    backgroundColor: COLORS.forest850,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(5, 12, 8, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  lightboxImg: {
    width: "100%",
    height: "78%",
    borderRadius: 12,
  },
  lightboxClose: {
    color: COLORS.gold300,
    marginTop: 16,
    fontSize: 13,
  },
});
