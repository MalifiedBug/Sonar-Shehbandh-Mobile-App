import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { makeStyles, useTheme } from "@/src/theme";

export const Icon = MaterialDesignIcons;

// ------------------------------------------------------------------ Header
export function Header({ title, subtitle, right, onBack, hideBack, testID }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; hideBack?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }, hideBack && { paddingLeft: 16 }]} testID={testID}>
      {hideBack ? null : (
        <Pressable onPress={back} style={s.headerBtn} hitSlop={8} testID="header-back-button">
          <Icon name="arrow-left" size={24} color={colors.brand} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

// ------------------------------------------------------------------ Button
type BtnVariant = "primary" | "navy" | "danger" | "ghost" | "maroon";
export function Btn({ label, onPress, variant = "primary", disabled, loading, icon, testID, style }: {
  label: string; onPress: () => void; variant?: BtnVariant; disabled?: boolean; loading?: boolean; icon?: string; testID?: string; style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const fg = variant === "danger" ? colors.error : variant === "ghost" ? colors.brand : colors.white;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        variant === "primary" && { backgroundColor: colors.brandPrimary },
        variant === "navy" && { backgroundColor: colors.brandSecondary },
        variant === "maroon" && { backgroundColor: colors.brand },
        variant === "danger" && { borderWidth: 1.5, borderColor: colors.error, backgroundColor: colors.surfaceSecondary },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon as any} size={18} color={fg} /> : null}
          <Text style={[s.btnText, { color: fg }]} numberOfLines={2}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Checkbox / Chip
export function Checkbox({ checked, onToggle, label, testID }: { checked: boolean; onToggle: () => void; label: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} style={s.check} testID={testID} hitSlop={4}>
      <Icon name={checked ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={checked ? colors.brandPrimary : colors.muted} />
      <Text style={s.checkText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable onPress={onPress} testID={testID} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ title, testID }: { title: string; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.sectionTitleRow} testID={testID}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

export function Empty({ icon = "inbox-outline", text, testID }: { icon?: string; text: string; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.empty} testID={testID}>
      <Icon name={icon as any} size={48} color={colors.borderStrong} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map: Record<string, [string, string, string]> = {
    pending: [colors.warningSoft, colors.warning, "Pending / प्रलंबित"],
    approved: [colors.successSoft, colors.success, "Approved / मंजूर"],
    rejected: [colors.errorSoft, colors.error, "Rejected / नामंजूर"],
    open: [colors.warningSoft, colors.warning, "Open / खुले"],
    resolved: [colors.successSoft, colors.success, "Resolved / निकाली"],
  };
  const [bg, fg, label] = map[status] ?? map.pending;
  return (
    <View style={[s.badge, { backgroundColor: bg }]} testID={`status-badge-${status}`}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ Sheet
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} testID={testID ? `${testID}-overlay` : undefined} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} testID={testID}>
        <View style={s.grabber} />
        {title ? <Text style={s.sheetTitle}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ Toast
type ToastKind = "success" | "error" | "info";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, kind: ToastKind = "success") => {
    setMsg({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timer.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null)), 2800);
  }, [anim]);
  const bg = msg?.kind === "error" ? colors.error : msg?.kind === "info" ? colors.brandSecondary : colors.success;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          testID="toast-message"
          style={[s.toast, { top: insets.top + 8, backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
        >
          <Icon name={msg.kind === "error" ? "alert-circle" : msg.kind === "info" ? "information" : "check-circle"} size={20} color={colors.white} />
          <Text style={s.toastText}>{msg.text}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: c.brand, letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, minHeight: 44 },
  checkText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.onSurfaceSecondary },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: c.brand, borderColor: c.brand },
  chipText: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  chipTextActive: { color: c.onBrand },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, marginBottom: 8 },
  sectionBar: { width: 4, height: 20, borderRadius: 2, backgroundColor: c.brand },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: c.brand },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: c.muted, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, maxHeight: "85%" },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: c.brand, marginBottom: 12 },
  toast: { position: "absolute", left: 16, right: 16, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  toastText: { flex: 1, color: c.white, fontSize: 14, fontWeight: "600" },
}));
