import React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Empty, Header, Icon, useToast } from "@/src/components/ui";

export type Post = { id: string; kind: string; title: string; body: string; level?: string; location?: string; event_date?: string; created_at: string };

export function PostList({ kind, level = "", emptyText }: { kind: string; level?: string; emptyText: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data, setData, loading, refreshing, reload, error } = useLoad(() => api<Post[]>(`/posts?kind=${kind}&level=${level}`), [kind, level]);
  const del = async (id: string) => {
    try { await api(`/admin/posts/${id}`, { method: "DELETE" }); setData((data ?? []).filter((p) => p.id !== id)); toast("Deleted"); } catch (e: any) { toast(e?.message, "error"); }
  };
  if (loading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />;
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
      ListEmptyComponent={<Empty text={error ?? emptyText} icon="newspaper-variant-outline" testID={`${kind}-empty`} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/post/${item.id}` as any)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} testID={`${kind}-item-${item.id}`}>
          <View style={s.metaRow}>
            {item.event_date ? <View style={s.metaItem}><Icon name="calendar" size={14} color={colors.brand} /><Text style={s.metaStrong}>{item.event_date}</Text></View> : null}
            {item.location ? <View style={s.metaItem}><Icon name="map-marker-outline" size={14} color={colors.muted} /><Text style={s.meta}>{item.location}</Text></View> : null}
            <View style={{ flex: 1 }} />
            {user?.role === "admin" ? (
              <Pressable onPress={() => del(item.id)} hitSlop={8} testID={`${kind}-delete-${item.id}`}><Icon name="trash-can-outline" size={20} color={colors.error} /></Pressable>
            ) : null}
          </View>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.body} numberOfLines={3}>{item.body}</Text>
          <View style={s.metaRow}>
            <Text style={s.date}>{new Date(item.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.more}>Read more / पुढे वाचा</Text>
            <Icon name="chevron-right" size={16} color={colors.brandPrimary} />
          </View>
        </Pressable>
      )}
    />
  );
}

export default function News() {
  const s = useStyles();
  return (
    <View style={s.root}>
      <Header title="News / बातम्या" subtitle="Community updates / समाज बातम्या" />
      <PostList kind="news" emptyText="No news yet / अद्याप बातम्या नाहीत" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipRow: { height: 56, justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  card: { padding: 14, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  tag: { fontSize: 11, fontWeight: "700", color: c.brand, backgroundColor: c.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  meta: { fontSize: 12, color: c.muted },
  metaStrong: { fontSize: 12, color: c.brand, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 21 },
  date: { fontSize: 11, color: c.muted },
  more: { fontSize: 12, fontWeight: "700", color: c.brandPrimary },
}));
