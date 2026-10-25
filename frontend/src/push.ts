import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "@/src/api";

// Registers this device for Emergent managed push. Safe to call on every app open (tokens rotate).
// Never throws and never blocks the app if permission is denied.
export async function registerForPush(userId: string) {
  if (Platform.OS === "web" || !Device.isDevice) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted" && current.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;
    const token = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", {
      method: "POST",
      body: { user_id: userId, platform: Platform.OS, device_token: String(token.data) },
    });
  } catch (e) {
    console.warn("Push registration skipped", e);
  }
}
