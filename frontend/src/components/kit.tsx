// Shared UX building blocks for the redesigned shell (cards, badges, overlines, skeletons, contact actions).
import React, { useEffect, useState } from "react";
import { Animated, Linking, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { elevation, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { api, useLoad } from "@/src/api";

export const tap = (style: "light" | "medium" = "light") =>
  Haptics.impactAsync(style === "light" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

export function Overline({ text, color, style }: { text: string; color?: string; style?: StyleProp<any> }) {
  const s = useStyles();
  return <Text style={[s.overline, color ? { color } : null, style]}>{text.toUpperCase()}</Text>;
}

export function SectionHead({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.sectionHead} testID={testID}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const s = useStyles();
  if (!onPress) return <View style={[s.card, style]} testID={testID}>{children}</View>;
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [s.card, style, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }]}>
      {children}
    </Pressable>
  );
}

type Tone = "success" | "brand" | "gold" | "teal" | "navy" | "error";
export function Badge({ label, icon, tone = "success", testID }: { label: string; icon?: string; tone?: Tone; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map: Record<Tone, [string, string]> = {
    success: [colors.successSoft, colors.success],
    brand: [colors.brandTertiary, colors.brand],
    gold: [colors.goldSoft, colors.gold],
    teal: ["#E0F2F1", colors.brandPrimary],
    navy: ["#E7ECF2", colors.brandSecondary],
    error: [colors.errorSoft, colors.error],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]} testID={testID}>
      {icon ? <Icon name={icon as any} size={12} color={fg} /> : null}
      <Text style={[s.badgeText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Initials({ name, size = 40 }: { name?: string; size?: number }) {
  const s = useStyles();
  const ini = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <View style={[s.initials, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.initialsText, { fontSize: size * 0.38 }]}>{ini}</Text>
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = 8, style }: { height?: number; width?: any; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [o] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.surfaceTertiary, opacity: o }, style]} />;
}

export function SkeletonCard() {
  const s = useStyles();
  return (
    <View style={[s.card, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
      <Skeleton width={56} height={56} radius={28} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" />
        <Skeleton width="45%" height={12} />
      </View>
    </View>
  );
}

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "Just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const DIR_TYPES = ["member", "business", "social_worker"] as const;

// Lets screens (e.g. Alerts "Read all") ask the tab bar to refresh its unread dot.
const unreadListeners = new Set<() => void>();
export const onUnreadRefresh = (fn: () => void) => {
  unreadListeners.add(fn);
  return () => { unreadListeners.delete(fn); };
};
export const refreshUnreadDot = () => unreadListeners.forEach((fn) => fn());

// Approved listing counts per directory (prominent metric numbers on Home and Directory).
export function useDirectoryCounts() {
  return useLoad(async () => {
    const all = await Promise.all(DIR_TYPES.map((t) => api<unknown[]>(`/registrations?type=${t}`).catch(() => [] as unknown[])));
    return Object.fromEntries(DIR_TYPES.map((t, i) => [t, all[i].length])) as Record<string, number>;
  });
}

const waUrl = (n: string) => {
  const d = n.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}`;
};

// Primary/secondary action pair: Call + WhatsApp. Locked state sends free users to Plans.
export function ContactActions({ phone, whatsapp, locked, testID }: { phone?: string; whatsapp?: string; locked?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  if (locked) {
    return (
      <Pressable style={({ pressed }) => [s.lockRow, pressed && { opacity: 0.8 }]} onPress={() => router.push("/plans")} testID={`${testID}-unlock`}>
        <Icon name="lock-outline" size={16} color={colors.gold} />
        <Text style={s.lockText} numberOfLines={1}>Unlock contacts with a plan</Text>
        <Icon name="chevron-right" size={18} color={colors.gold} />
      </Pressable>
    );
  }
  if (!phone && !whatsapp) return null;
  return (
    <View style={s.actions}>
      {phone ? (
        <Pressable style={({ pressed }) => [s.actBtn, s.actPrimary, pressed && { opacity: 0.85 }]} onPress={() => { tap("medium"); Linking.openURL(`tel:${phone}`); }} testID={`${testID}-call`}>
          <Icon name="phone" size={16} color={colors.white} />
          <Text style={[s.actText, { color: colors.white }]}>Quick Call</Text>
        </Pressable>
      ) : null}
      {whatsapp || phone ? (
        <Pressable style={({ pressed }) => [s.actBtn, s.actGhost, pressed && { opacity: 0.85 }]} onPress={() => { tap(); Linking.openURL(waUrl(whatsapp || phone!)); }} testID={`${testID}-whatsapp`}>
          <Icon name="whatsapp" size={16} color={colors.success} />
          <Text style={[s.actText, { color: colors.success }]}>WhatsApp</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: c.gold },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2 },
  sectionAction: { minHeight: 32, justifyContent: "center" },
  sectionActionText: { fontSize: 13, fontWeight: "700", color: c.brandPrimary },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: c.divider, padding: 16, ...elevation },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11, alignSelf: "flex-start" },
  badgeText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.2 },
  initials: { backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.gold },
  initialsText: { fontWeight: "800", color: c.brand },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  actBtn: { flex: 1, height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actPrimary: { backgroundColor: c.brandPrimary },
  actGhost: { backgroundColor: c.successSoft },
  actText: { fontSize: 13, fontWeight: "700" },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.goldSoft },
  lockText: { flex: 1, fontSize: 12, fontWeight: "700", color: c.gold },
}));
