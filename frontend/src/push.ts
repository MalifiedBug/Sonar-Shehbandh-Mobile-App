import { Platform } from "react-native";
import * as Device from "expo-device";
import { api } from "@/src/api";
import { Notifications } from "@/src/notifications";

// Registers this device for Emergent managed push. Safe to call on every app open (tokens rotate).
// Never throws and never blocks the app if permission is denied.
export async function registerForPush(userId: string) {
  if (!Notifications || !Device.isDevice) return;
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
