// Design tokens for Sonar Shehbandh Community. Light theme only.
// Colors follow the specification: deep maroon accents, warm off-white cards,
// navy / teal actions, light-blue transliteration box and red decline.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FBF7EE",
  onSurface: "#1F1A17",
  surfaceSecondary: "#FFFDF7",
  onSurfaceSecondary: "#3A2F2A",
  surfaceTertiary: "#F4EEE2",
  onSurfaceTertiary: "#5B4E45",
  surfaceInverse: "#0A2540",
  onSurfaceInverse: "#FFFFFF",
  muted: "#7A6E66",

  brand: "#8B1818",
  onBrand: "#FFFFFF",
  brandPrimary: "#008080",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0A2540",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#F6E7E3",
  onBrandTertiary: "#8B1818",

  success: "#2E7D32",
  onSuccess: "#FFFFFF",
  warning: "#B26A00",
  onWarning: "#FFFFFF",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#0288D1",
  onInfo: "#FFFFFF",

  border: "#E0E0E0",
  borderStrong: "#C9BFB3",
  divider: "#EEE7DA",

  // App specific
  maroonBright: "#B71C1C",
  translitBg: "#E0F2FE",
  translitBorder: "#0288D1",
  onTranslit: "#01579B",
  gold: "#B8860B",
  goldSoft: "#FBF1D6",
  white: "#FFFFFF",
  overlay: "rgba(10,20,30,0.45)",
  successSoft: "#E6F4EA",
  warningSoft: "#FFF3E0",
  errorSoft: "#FDECEA",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const colors = light;

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
