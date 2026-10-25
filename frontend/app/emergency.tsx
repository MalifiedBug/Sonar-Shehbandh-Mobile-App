import React from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Empty, Header, Icon } from "@/src/components/ui";

type EItem = { name: string; number: string; group: string };
const ICON: Record<string, string> = { Government: "shield-star-outline", Medical: "medical-bag", Community: "account-heart-outline" };

export default function Emergency() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, error } = useLoad(async () => (await api<{ items: EItem[] }>("/emergency")).items);
  const groups = Array.from(new Set((data ?? []).map((i) => i.group)));
  return (
    <View style={s.root}>
      <Header title="Emergency Numbers / आपत्कालीन क्रमांक" subtitle="Tap to call / कॉल करण्यासाठी टॅप करा" />
      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} /> : error ? <Empty text={error} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {groups.map((g) => (
            <View key={g} style={{ marginBottom: 16 }}>
              <Text style={s.group}>{g}</Text>
              <View style={{ gap: 8 }}>
                {(data ?? []).filter((i) => i.group === g).map((it, idx) => (
                  <Pressable key={`${it.number}-${idx}`} onPress={() => Linking.openURL(`tel:${it.number}`)} style={({ pressed }) => [s.item, pressed && { opacity: 0.8 }]} testID={`emergency-call-${it.number}`}>
                    <View style={s.icon}><Icon name={(ICON[g] ?? "phone") as any} size={22} color={colors.brand} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{it.name}</Text>
                      <Text style={s.num}>{it.number}</Text>
                    </View>
                    <View style={s.call}><Icon name="phone" size={20} color={colors.white} /></View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  group: { fontSize: 13, fontWeight: "800", color: c.muted, textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  num: { fontSize: 18, fontWeight: "800", color: c.brand, marginTop: 2 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.success, alignItems: "center", justifyContent: "center" },
}));
