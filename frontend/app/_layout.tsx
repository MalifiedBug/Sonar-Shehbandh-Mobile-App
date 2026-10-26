import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, Linking, LogBox, Platform, StyleSheet, Text, View } from "react-native";
import type { NotificationResponse } from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { ToastProvider, Btn, Sheet } from "@/src/components/ui";
import { colors } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { Notifications } from "@/src/notifications";

LogBox.ignoreAllLogs(true);

// Push: foreground display handler (module scope, real builds only)
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Push: Android channel must exist before any push arrives (module scope)
if (Notifications && Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

const openFromNotification = (router: ReturnType<typeof useRouter>, response: NotificationResponse | null) => {
  if (!response) return;
  const data: any = response.notification.request.content.data || {};
  const url: string | undefined = data.deeplink || data.action_url;
  if (!url) return;
  if (url.startsWith("http")) Linking.openURL(url);
  else router.push(url as any);
};

function PushHandlers() {
  const router = useRouter();
  const { user } = useAuth();
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    const N = Notifications;
    if (!N || !user) return;
    // Warm tap
    const sub = N.addNotificationResponseReceivedListener((r) => openFromNotification(router, r));
    // Cold-start tap
    N.getLastNotificationResponseAsync().then((r) => openFromNotification(router, r));
    // Weekly nudge if notifications are permanently denied
    (async () => {
      const { status, canAskAgain } = await N.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const last = await storage.getItem<string | null>("pushNudgeAt", null);
      if (last && Date.now() - Number(last) <= 7 * 24 * 60 * 60 * 1000) return;
      setNudge(true);
    })();
    return () => sub.remove();
  }, [router, user]);

  const close = async (open: boolean) => {
    await storage.setItem("pushNudgeAt", String(Date.now()));
    setNudge(false);
    if (open) Linking.openSettings();
  };

  return (
    <Sheet visible={nudge} onClose={() => close(false)} title="Turn on notifications / सूचना सुरू करा" testID="push-nudge-sheet">
      <Text style={styles.nudgeText}>
        Get alerts when your registration is approved and when the committee posts news, events or notices.
      </Text>
      <View style={styles.nudgeBtns}>
        <Btn label="Later / नंतर" variant="ghost" onPress={() => close(false)} style={{ flex: 1 }} testID="push-nudge-later" />
        <Btn label="Open Settings" variant="primary" onPress={() => close(true)} style={{ flex: 1 }} testID="push-nudge-settings" />
      </View>
    </Sheet>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === "login";
    if (!user && !onLogin) router.replace("/login");
    else if (user && onLogin) router.replace("/");
  }, [user, loading, segments, router]);

  const redirecting = !loading && ((!user && segments[0] !== "login") || (user && segments[0] === "login"));
  if (loading || redirecting) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
      <PushHandlers />
    </>
  );
}

export default function RootLayout() {
  // Prewarm the icon font so icons render on first paint (Expo Go Android fix).
  const [fontsLoaded] = useFonts({
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <StatusBar style="dark" />
              {fontsLoaded ? (
                <ToastProvider>
                  <AuthProvider>
                    <Gate />
                  </AuthProvider>
                </ToastProvider>
              ) : (
                <View style={[styles.root, styles.center]} />
              )}
            </KeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  nudgeText: { fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary, marginBottom: 16 },
  nudgeBtns: { flexDirection: "row", gap: 8 },
});
