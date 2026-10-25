import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Empty, Header, Icon } from "@/src/components/ui";
import type { Post } from "@/app/news";

const KIND: Record<string, { label: string; icon: string }> = {
  news: { label: "News / बातमी", icon: "newspaper" },
  event: { label: "Event / कार्यक्रम", icon: "calendar-star" },
  notice: { label: "Notice / सूचना", icon: "bullhorn" },
};

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading } = useLoad(() => api<Post>(`/posts/${id}`), [id]);
  const k = KIND[data?.kind ?? "news"];
  return (
    <View style={s.root}>
      <Header title={k.label} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : !data ? (
        <Empty text="This post is no longer available / ही पोस्ट उपलब्ध नाही" icon="newspaper-remove" testID="post-not-found" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} testID="post-detail-screen">
          <View style={s.kindRow}>
            <View style={s.icon}><Icon name={k.icon as any} size={22} color={colors.brand} /></View>
            <Text style={s.date}>{new Date(data.created_at).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
          <Text style={s.title} testID="post-detail-title">{data.title}</Text>
          {data.event_date || data.location ? (
            <View style={s.metaBox}>
              {data.event_date ? <View style={s.metaItem}><Icon name="calendar" size={18} color={colors.brand} /><Text style={s.metaText}>{data.event_date}</Text></View> : null}
              {data.location ? <View style={s.metaItem}><Icon name="map-marker-outline" size={18} color={colors.brand} /><Text style={s.metaText}>{data.location}</Text></View> : null}
            </View>
          ) : null}
          <Text style={s.body} testID="post-detail-body">{data.body}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  date: { flex: 1, fontSize: 12, color: c.muted },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, lineHeight: 30 },
  metaBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 14, color: c.onSurface, fontWeight: "600" },
  body: { marginTop: 16, fontSize: 16, lineHeight: 26, color: c.onSurfaceSecondary },
}));
