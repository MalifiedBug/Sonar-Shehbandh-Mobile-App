import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Empty, Header, Icon } from "@/src/components/ui";

export default function Rules() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, error } = useLoad(async () => (await api<{ text: string }>("/rules")).text);
  const blocks = (data ?? "").split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <View style={s.root}>
      <Header title="Rules / नियमावली" subtitle="Sanstha Bylaws & Constitution" />
      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} /> : error ? <Empty text={error} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }} testID="rules-screen">
          <View style={s.hero}>
            <Icon name="book-open-variant" size={32} color={colors.brand} />
            <Text style={s.heroText}>॥ जय श्री संत नरहरी महाराज ॥</Text>
          </View>
          {blocks.map((b, i) => {
            const [head, ...rest] = b.split("\n");
            return (
              <View key={i} style={s.card}>
                <Text style={s.head}>{head}</Text>
                {rest.length ? <Text style={s.body}>{rest.join("\n")}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { alignItems: "center", gap: 8, padding: 16, borderRadius: 16, backgroundColor: c.brandTertiary },
  heroText: { fontSize: 16, fontWeight: "800", color: c.brand },
  card: { padding: 14, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 6 },
  head: { fontSize: 15, fontWeight: "800", color: c.brandSecondary },
  body: { fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary },
}));
