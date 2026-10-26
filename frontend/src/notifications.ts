import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

// expo-notifications crashes on import inside Expo Go (push is not supported there)
// and has no push on web, so only load it in real development/production builds.
export const pushSupported = Platform.OS !== "web" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const Notifications: typeof import("expo-notifications") | null = pushSupported ? require("expo-notifications") : null;
