import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { onUnreadRefresh, tap } from "@/src/components/kit";
import { api } from "@/src/api";

const TABS: Record<string, { label: string; icon: string; active: string }> = {
  index: { label: "Home", icon: "home-variant-outline", active: "home-variant" },
  community: { label: "Directory", icon: "account-group-outline", active: "account-group" },
  matrimony: { label: "Matrimony", icon: "heart-outline", active: "heart" },
  notifications: { label: "Alerts", icon: "bell-outline", active: "bell" },
  profile: { label: "Profile", icon: "account-circle-outline", active: "account-circle" },
};

type BottomTabBarProps = { state: { index: number; routes: { key: string; name: string }[] } };

function TabBar({ state }: BottomTabBarProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // Refresh the unread dot whenever the user switches tabs, or when a screen asks for it.
  useEffect(() => {
    const load = () => api<{ count: number }>("/notifications/unread-count").then((r) => setUnread(r.count)).catch(() => {});
    load();
    return onUnreadRefresh(load);
  }, [state.index]);

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="bottom-tab-bar">
      {state.routes.map((route, i) => {
        const t = TABS[route.name];
        if (!t) return null;
        const focused = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            testID={`tab-${route.name}`}
            style={s.item}
            onPress={() => {
              tap();
              if (!focused) router.navigate((route.name === "index" ? "/" : `/${route.name}`) as any);
            }}
          >
            <View style={[s.pill, focused && s.pillActive]}>
              <Icon name={(focused ? t.active : t.icon) as any} size={22} color={focused ? colors.brand : colors.muted} />
              {route.name === "notifications" && unread > 0 ? <View style={s.dot} testID="tab-alerts-dot" /> : null}
            </View>
            <Text style={[s.label, focused && s.labelActive]} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p: any) => <TabBar state={p.state} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="matrimony" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const useStyles = makeStyles((c) => ({
  bar: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 8, shadowColor: "#0A2540", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  item: { flex: 1, alignItems: "center", gap: 4, minHeight: 52 },
  pill: { width: 60, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: c.brandTertiary },
  dot: { position: "absolute", top: 4, right: 16, width: 9, height: 9, borderRadius: 5, backgroundColor: c.error, borderWidth: 1.5, borderColor: c.surfaceSecondary },
  label: { fontSize: 11, fontWeight: "600", color: c.muted },
  labelActive: { color: c.brand, fontWeight: "800" },
}));
