import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getBaseUrl, setBaseUrl } from "../api";
import HerboLogo from "../components/HerboLogo";
import { COLORS, SERIF_FONT } from "../theme";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("marcela");
  const [password, setPassword] = useState("herbo123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverModal, setServerModal] = useState(false);
  const [serverUrl, setServerUrl] = useState(getBaseUrl());

  const handleSubmit = async (customUser, customPass) => {
    const u = (customUser ?? username).trim();
    const p = customPass ?? password;
    if (!u || !p) {
      setError("Informe seu login e senha.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onLogin(u, p);
    } catch (err) {
      setError(
        err.message === "Network request failed"
          ? `Não foi possível conectar a ${getBaseUrl()}. Verifique se o servidor Django está rodando e se o IP está correto.`
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  const saveServer = async () => {
    const updated = await setBaseUrl(serverUrl);
    setServerUrl(updated);
    setServerModal(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.logoWrap}>
            <HerboLogo size={68} />
          </View>
          <Text style={styles.tagline}>
            A liberdade de acampar com a sofisticação de um serviço de hotel.
          </Text>
          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>PORTAL DO HÓSPEDE</Text>
            <View style={styles.line} />
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Usuário ou e-mail</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="ex.: marcela"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Senha da estadia</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••"
            placeholderTextColor={COLORS.muted}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
            onPress={() => handleSubmit()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.forest950} />
            ) : (
              <Text style={styles.primaryBtnText}>Acessar minha estadia</Text>
            )}
          </Pressable>

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>ACESSOS DE DEMONSTRAÇÃO</Text>
            <View style={styles.demoRow}>
              <Pressable
                style={styles.demoChip}
                onPress={() => {
                  setUsername("marcela");
                  setPassword("herbo123");
                  handleSubmit("marcela", "herbo123");
                }}
              >
                <Text style={styles.demoChipTitle}>Marcela · T01 Tenda Ipê</Text>
                <Text style={styles.demoChipSub}>Check-in ativo (2 dias)</Text>
              </Pressable>
              <Pressable
                style={styles.demoChip}
                onPress={() => {
                  setUsername("rafael");
                  setPassword("herbo123");
                  handleSubmit("rafael", "herbo123");
                }}
              >
                <Text style={styles.demoChipTitle}>Rafael · D01 Domo</Text>
                <Text style={styles.demoChipSub}>Reserva aguardando check-in</Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={styles.serverBtn} onPress={() => setServerModal(true)}>
            <Text style={styles.serverBtnText}>⚙️ Servidor: {getBaseUrl()}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={serverModal} transparent animationType="fade" onRequestClose={() => setServerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Endereço do Servidor (Backend)</Text>
            <Text style={styles.modalHint}>
              Se estiver usando o Expo Go no celular físico, informe o IPv4 do seu PC na rede Wi-Fi (ex.: http://192.168.1.15:8000).
            </Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://192.168.1.15:8000"
              placeholderTextColor={COLORS.muted}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setServerModal(false)}>
                <Text style={styles.ghostBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primaryBtnSmall} onPress={saveServer}>
                <Text style={styles.primaryBtnText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.forest950,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.forest850,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 24,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  tagline: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },
  dividerText: {
    color: COLORS.gold500,
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: "700",
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#f6c3b6",
    fontSize: 13,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.forest950,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold500,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primaryBtnSmall: {
    backgroundColor: COLORS.gold500,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  primaryBtnText: {
    color: COLORS.forest950,
    fontWeight: "700",
    fontSize: 15,
  },
  demoBox: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
  },
  demoTitle: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  demoRow: {
    gap: 8,
  },
  demoChip: {
    backgroundColor: COLORS.forest900,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 12,
  },
  demoChipTitle: {
    color: COLORS.gold200,
    fontWeight: "700",
    fontSize: 14,
  },
  demoChipSub: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  serverBtn: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 6,
  },
  serverBtnText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 12, 8, 0.78)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.forest850,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 20,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold300,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalHint: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  ghostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ghostBtnText: {
    color: COLORS.muted,
    fontWeight: "600",
  },
});
