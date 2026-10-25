import React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Empty, Header, Icon, useToast } from "@/src/components/ui";

type Notif = { id: string; title: string; message: string; action_url?: string | null; read: boolean; created_at: string };

const iconFor = (n: Notif) => {
  const u = n.action_url ?? "";
  if (u.startsWith("/news")) return "newspaper";
  if (u.includes("tab=1")) return "bullhorn";
  if (u.startsWith("/events")) return "calendar-star";
  if (u.startsWith("/admin")) return "message-alert-outline";
  if (n.title.startsWith("New submission")) return "file-document-edit-outline";
  if (n.title.startsWith("Approved")) return "check-decagram";
  if (n.title.startsWith("Not approved")) return "close-octagon-outline";
  return "bell-outline";
};

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function Notifications() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { data, setData, loading, refreshing, reload, error } = useLoad(() => api<Notif[]>("/notifications"));
  const unread = (data ?? []).filter((n) => !n.read).length;

  const open = async (n: Notif) => {
    if (!n.read) {
      setData((data ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    if (n.action_url) router.push(n.action_url as any);
  };

  const readAll = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setData((data ?? []).map((x) => ({ ...x, read: true })));
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  };

  return (
    <View style={s.root}>
      <Header
        title="Notifications / सूचना"
        subtitle={unread ? `${unread} unread / न वाचलेल्या` : "All caught up / सर्व वाचले"}
        right={
          unread ? (
            <Pressable onPress={readAll} style={s.readAll} testID="notifications-read-all">
              <Icon name="check-all" size={18} color={colors.brandPrimary} />
              <Text style={s.readAllText}>Read all</Text>
            </Pressable>
          ) : undefined
        }
      />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
          ListEmptyComponent={<Empty icon="bell-sleep-outline" text={error ?? "No alerts yet. Approvals, news, events and notices will appear here. / अद्याप सूचना नाहीत"} testID="notifications-empty" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={({ pressed }) => [s.item, !item.read && s.itemUnread, pressed && { opacity: 0.85 }]} testID={`notification-item-${item.id}`}>
              <View style={[s.icon, !item.read && { backgroundColor: colors.brand }]}>
                <Icon name={iconFor(item) as any} size={20} color={item.read ? colors.brand : colors.white} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.title, !item.read && { fontWeight: "800" }]} numberOfLines={2}>{item.title}</Text>
                <Text style={s.msg} numberOfLines={3}>{item.message}</Text>
                <Text style={s.time}>{timeAgo(item.created_at)}</Text>
              </View>
              {!item.read ? <View style={s.dot} testID={`notification-unread-${item.id}`} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  readAll: { flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingHorizontal: 10, marginRight: 4 },
  readAllText: { fontSize: 13, fontWeight: "700", color: c.brandPrimary },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  itemUnread: { backgroundColor: c.brandTertiary, borderColor: c.brandTertiary },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  msg: { fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 18 },
  time: { fontSize: 11, color: c.muted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.maroonBright, marginTop: 6 },
}));
