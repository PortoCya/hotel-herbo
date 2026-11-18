import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch, resolveMediaUrl } from "../api";
import {
  brl,
  COLORS,
  fmtDateTime,
  ORDER_STATUS_META,
  REQUEST_TYPES,
  SERIF_FONT,
} from "../theme";

export default function RequestsCenterScreen({
  stay,
  catalog,
  initialCategory,
  refreshing,
  onRefresh,
  onOrderCreated,
}) {
  const [selectedType, setSelectedType] = useState(initialCategory || "servico_quarto");
  const [modalItem, setModalItem] = useState(null); // {catalogItem, requestType}
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [photoAsset, setPhotoAsset] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialCategory) setSelectedType(initialCategory);
  }, [initialCategory]);

  const reservation = stay?.reservation;
  const orders = stay?.orders || [];
  const canRequest = reservation?.status === "hospedado";

  const categoryItems = (catalog || []).filter(
    (c) => c.request_type === selectedType && c.is_active && c.available_for_guests
  );

  const openOrderModal = (catalogItem = null) => {
    if (!canRequest) {
      Alert.alert(
        "Check-in necessário",
        "As solicitações de quarto e experiências ficam disponíveis assim que o seu check-in é realizado na recepção."
      );
      return;
    }
    setQuantity(1);
    setNotes("");
    setPhotoAsset(null);
    setModalItem({ catalogItem, requestType: selectedType });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permissão necessária", "Permita o acesso às fotos para anexar uma imagem.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPhotoAsset(result.assets[0]);
    }
  };

  const submitOrder = async () => {
    if (!modalItem) return;
    if (!modalItem.catalogItem && !notes.trim()) {
      Alert.alert("Descreva sua solicitação", "Escreva no campo de observações o que você deseja.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("request_type", modalItem.requestType);
      if (modalItem.catalogItem) {
        fd.append("catalog_item", String(modalItem.catalogItem.id));
      }
      fd.append("quantity", String(quantity));
      fd.append("notes", notes.trim());

      if (photoAsset) {
        if (Platform.OS === "web" && photoAsset.file) {
          fd.append("photo", photoAsset.file);
        } else {
          const uri = photoAsset.uri;
          const name = photoAsset.fileName || `pedido-${Date.now()}.jpg`;
          const type = photoAsset.mimeType || "image/jpeg";
          fd.append("photo", { uri, name, type });
        }
      }

      await apiFetch("/me/orders/", { method: "POST", body: fd });
      setModalItem(null);
      if (onOrderCreated) await onOrderCreated();
    } catch (err) {
      Alert.alert("Não foi possível enviar", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (order) => {
    try {
      await apiFetch(`/me/orders/${order.id}/cancel/`, { method: "POST" });
      if (onOrderCreated) await onOrderCreated();
    } catch (err) {
      Alert.alert("Não foi possível cancelar", err.message);
    }
  };

  const activeCategoryMeta =
    REQUEST_TYPES.find((r) => r.key === selectedType) || REQUEST_TYPES[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold500} />
      }
    >
      {/* Seletor de Categoria */}
      <View style={styles.typeTabs}>
        {REQUEST_TYPES.map((rt) => {
          const active = rt.key === selectedType;
          return (
            <Pressable
              key={rt.key}
              style={[styles.typeTab, active && styles.typeTabActive]}
              onPress={() => setSelectedType(rt.key)}
            >
              <Text style={styles.typeTabIcon}>{rt.icon}</Text>
              <Text style={[styles.typeTabLabel, active && styles.typeTabLabelActive]}>
                {rt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Cardápio / Opções da Categoria */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ornament}>{activeCategoryMeta.subtitle.toUpperCase()}</Text>
            <Text style={styles.title}>{activeCategoryMeta.label}</Text>
          </View>
          <Pressable style={styles.customBtn} onPress={() => openOrderModal(null)}>
            <Text style={styles.customBtnText}>+ Pedido livre</Text>
          </Pressable>
        </View>

        {categoryItems.map((item) => (
          <View key={item.id} style={styles.catalogRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.catalogName}>{item.name}</Text>
              {!!item.description && (
                <Text style={styles.catalogDesc}>{item.description}</Text>
              )}
              <Text style={styles.catalogPrice}>
                {Number(item.price) > 0 ? brl(item.price) : "Cortesia da casa"}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.requestBtn, pressed && { opacity: 0.85 }]}
              onPress={() => openOrderModal(item)}
            >
              <Text style={styles.requestBtnText}>Pedir</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* Histórico de Solicitações do Hóspede */}
      <View style={styles.card}>
        <Text style={styles.ornament}>ACOMPANHAMENTO EM TEMPO REAL</Text>
        <Text style={styles.title}>Minhas Solicitações ({orders.length})</Text>

        {orders.length === 0 ? (
          <Text style={styles.emptyText}>
            Você ainda não fez solicitações nesta estadia.
          </Text>
        ) : (
          orders.map((o) => {
            const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.pendente;
            const photoUrl = resolveMediaUrl(o.photo);
            return (
              <View key={o.id} style={styles.orderItem}>
                <View style={styles.orderTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderItemTitle}>
                      {o.quantity > 1 ? `${o.quantity}× ` : ""}{o.title}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {o.type_display} · {fmtDateTime(o.created_at)}
                      {Number(o.estimated_total) > 0 ? ` · ${brl(o.estimated_total)}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                {!!o.notes && <Text style={styles.orderNotes}>“{o.notes}”</Text>}
                {!!o.admin_response && (
                  <Text style={styles.orderAdminReply}>💬 Recepção: {o.admin_response}</Text>
                )}
                {photoUrl && (
                  <Image source={{ uri: photoUrl }} style={styles.orderPhoto} />
                )}

                {o.status === "pendente" && (
                  <Pressable
                    style={styles.cancelOrderBtn}
                    onPress={() => cancelOrder(o)}
                  >
                    <Text style={styles.cancelOrderText}>Cancelar solicitação</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Modal de Confirmação do Pedido */}
      <Modal
        visible={!!modalItem}
        transparent
        animationType="slide"
        onRequestClose={() => setModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalOrnament}>
              {activeCategoryMeta.icon} {activeCategoryMeta.label.toUpperCase()}
            </Text>
            <Text style={styles.modalTitle}>
              {modalItem?.catalogItem ? modalItem.catalogItem.name : "Solicitação personalizada"}
            </Text>
            {modalItem?.catalogItem && (
              <Text style={styles.modalPrice}>
                {Number(modalItem.catalogItem.price) > 0
                  ? `${brl(modalItem.catalogItem.price)} por unidade`
                  : "Cortesia do Hotel Herbo"}
              </Text>
            )}

            {modalItem?.catalogItem && (
              <View style={styles.qtyRow}>
                <Text style={styles.label}>Quantidade</Text>
                <View style={styles.qtyControls}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => setQuantity((q) => Math.min(20, q + 1))}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.label}>
              Observações para a equipe {modalItem?.catalogItem ? "(opcional)" : "(obrigatório)"}
            </Text>
            <TextInput
              style={styles.textarea}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex.: Por volta das 19h, no deck da tenda..."
              placeholderTextColor={COLORS.muted}
              multiline
            />

            <Pressable style={styles.photoPickerBtn} onPress={pickImage}>
              <Text style={styles.photoPickerText}>
                📷 {photoAsset ? "Trocar foto anexada" : "Anexar foto (opcional)"}
              </Text>
            </Pressable>
            {photoAsset && (
              <Image source={{ uri: photoAsset.uri }} style={styles.previewImg} />
            )}

            <View style={styles.modalActions}>
              <Pressable
                style={styles.ghostBtn}
                onPress={() => setModalItem(null)}
                disabled={submitting}
              >
                <Text style={styles.ghostBtnText}>Voltar</Text>
              </Pressable>
              <Pressable
                style={styles.confirmBtn}
                onPress={submitOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.forest950} />
                ) : (
                  <Text style={styles.confirmBtnText}>🔔 Enviar para a recepção</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
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
    gap: 16,
  },
  typeTabs: {
    flexDirection: "row",
    gap: 8,
  },
  typeTab: {
    flex: 1,
    backgroundColor: COLORS.forest850,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  typeTabActive: {
    backgroundColor: "rgba(201, 164, 92, 0.18)",
    borderColor: COLORS.gold500,
  },
  typeTabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  typeTabLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  typeTabLabelActive: {
    color: COLORS.gold200,
  },
  card: {
    backgroundColor: COLORS.forest850,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 18,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  ornament: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  title: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold300,
    fontSize: 22,
    fontWeight: "600",
    marginTop: 2,
  },
  customBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold500,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  customBtnText: {
    color: COLORS.gold200,
    fontSize: 12,
    fontWeight: "700",
  },
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  catalogName: {
    color: COLORS.cream,
    fontSize: 15,
    fontWeight: "700",
  },
  catalogDesc: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  catalogPrice: {
    color: COLORS.gold300,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  requestBtn: {
    backgroundColor: COLORS.gold500,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  requestBtnText: {
    color: COLORS.forest950,
    fontWeight: "700",
    fontSize: 13,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 10,
  },
  orderItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    marginTop: 8,
  },
  orderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  orderItemTitle: {
    color: COLORS.cream,
    fontSize: 15,
    fontWeight: "700",
  },
  orderMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  orderNotes: {
    color: COLORS.text,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },
  orderAdminReply: {
    color: COLORS.gold300,
    fontSize: 12,
    marginTop: 5,
    fontWeight: "600",
  },
  orderPhoto: {
    width: 90,
    height: 90,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  cancelOrderBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  cancelOrderText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 12, 8, 0.8)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: COLORS.forest850,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 22,
  },
  modalOrnament: {
    color: COLORS.gold500,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold200,
    fontSize: 24,
    fontWeight: "600",
    marginTop: 4,
  },
  modalPrice: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 10,
  },
  qtyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 10,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    color: COLORS.gold200,
    fontSize: 18,
    fontWeight: "700",
  },
  qtyValue: {
    color: COLORS.cream,
    fontSize: 18,
    fontWeight: "700",
    minWidth: 24,
    textAlign: "center",
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 6,
  },
  textarea: {
    backgroundColor: COLORS.forest950,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    color: COLORS.text,
    padding: 12,
    minHeight: 76,
    textAlignVertical: "top",
    fontSize: 14,
  },
  photoPickerBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.gold700,
    alignItems: "center",
  },
  photoPickerText: {
    color: COLORS.gold300,
    fontSize: 13,
  },
  previewImg: {
    width: "100%",
    height: 130,
    borderRadius: 10,
    marginTop: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  ghostBtnText: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: COLORS.gold500,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  confirmBtnText: {
    color: COLORS.forest950,
    fontWeight: "700",
    fontSize: 14,
  },
});
