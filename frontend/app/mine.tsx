import React from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Empty, Header, Icon, StatusBadge } from "@/src/components/ui";
import { Reg } from "@/src/components/RegistrationView";
import { FORMS } from "@/src/forms";

const TYPE_ICON: Record<string, string> = { member: "account-group", matrimony: "heart", business: "store", social_worker: "hand-heart" };

export default function Mine() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, loading, refreshing, reload, error } = useLoad(() => api<Reg[]>("/registrations/mine"));
  return (
    <View style={s.root}>
      <Header title="My Submissions / माझे अर्ज" onBack={() => router.replace("/")} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
          ListEmptyComponent={<Empty text={error ?? "You haven't submitted anything yet. / अद्याप अर्ज नाहीत"} testID="mine-empty" />}
          renderItem={({ item }) => (
            <Pressable style={s.item} onPress={() => router.push(`/detail/${item.id}` as any)} testID={`mine-item-${item.id}`}>
              <View style={s.icon}><Icon name={TYPE_ICON[item.type] as any} size={22} color={colors.brand} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <Text style={s.type}>{FORMS[item.type]?.dirTitle} · {new Date(item.created_at).toLocaleDateString("en-IN")}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  type: { fontSize: 12, color: c.muted },
}));
