import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import Slider from "@react-native-community/slider";
import * as ImagePicker from "expo-image-picker";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, useToast } from "@/src/components/ui";
import { BACKEND, fileSource, getToken } from "@/src/api";
import { uploadForm } from "@/src/utils/upload";
import { PhotoSpec, PhotoVal } from "@/src/forms";

const DIMS: Record<PhotoSpec["shape"], { w: number; h: number; r: number }> = {
  circle: { w: 120, h: 120, r: 60 },
  square: { w: 120, h: 120, r: 16 },
  portrait: { w: 120, h: 160, r: 12 },
  landscape: { w: 160, h: 120, r: 12 },
};

export function RemoteImage({ path, zoom = 1, style, testID }: { path: string; zoom?: number; style?: any; testID?: string }) {
  return (
    <View style={[{ overflow: "hidden" }, style]} testID={testID}>
      <Image source={fileSource(path)} style={{ width: "100%", height: "100%", transform: [{ scale: zoom }] }} contentFit="cover" cachePolicy="memory-disk" />
    </View>
  );
}

export function PhotoPicker({ spec, value, onChange, testID }: { spec: PhotoSpec; value?: PhotoVal; onChange: (v: PhotoVal | undefined) => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const d = DIMS[spec.shape];

  const launch = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const r = await uploadForm(`${BACKEND}/api/upload`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        files: { file: { uri: a.uri, name: a.fileName ?? "photo.jpg", mimeType: a.mimeType ?? "image/jpeg" } },
      });
      if (!r.ok) throw new Error(r.status === 402 ? "Storage limit reached, try later" : r.status === 413 ? "Photo too large (max 8 MB)" : "Upload failed");
      const js = await r.json();
      onChange({ path: js.path, zoom: value?.zoom ?? 1 });
    } catch (e: any) {
      toast(e?.message ?? "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // The system photo picker (Android Photo Picker / iOS PHPicker) needs no storage permission.
  const pick = () => launch();

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{spec.label}{spec.required ? <Text style={{ color: colors.error }}> *</Text> : null}</Text>
      <Pressable testID={testID} onPress={pick} style={[s.box, { width: d.w, height: d.h, borderRadius: d.r }]}>
        {value ? (
          <RemoteImage path={value.path} zoom={value.zoom} style={{ width: d.w, height: d.h, borderRadius: d.r }} />
        ) : (
          <View style={s.placeholder}>
            <Icon name={spec.shape === "circle" ? "account" : "image-plus"} size={40} color={colors.borderStrong} />
            <Text style={s.tap}>Tap to add / फोटो जोडा</Text>
          </View>
        )}
        {busy ? <View style={s.busy}><ActivityIndicator color={colors.white} /></View> : null}
        {value && !busy ? <View style={s.editDot}><Icon name="camera" size={14} color={colors.white} /></View> : null}
      </Pressable>
      {spec.shape === "circle" && value ? (
        <View style={s.zoomRow}>
          <Icon name="magnify-minus-outline" size={20} color={colors.muted} />
          <Slider
            testID={`${testID}-zoom-slider`}
            style={{ flex: 1, height: 40 }}
            minimumValue={1}
            maximumValue={3}
            step={0.1}
            value={value.zoom}
            onValueChange={(z: number) => onChange({ ...value, zoom: Math.round(z * 10) / 10 })}
            minimumTrackTintColor={colors.brand}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.brand}
          />
          <Icon name="magnify-plus-outline" size={20} color={colors.muted} />
          <Text style={s.zoomText} testID={`${testID}-zoom-value`}>{value.zoom.toFixed(1)}x</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", marginBottom: 16, width: "100%" },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary, marginBottom: 8, textAlign: "center" },
  box: { borderWidth: 2, borderColor: c.border, borderStyle: "dashed", backgroundColor: c.surfaceTertiary, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  placeholder: { alignItems: "center", gap: 4, padding: 8 },
  tap: { fontSize: 11, color: c.muted, textAlign: "center" },
  busy: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.overlay, alignItems: "center", justifyContent: "center" },
  editDot: { position: "absolute", right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  zoomRow: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 320, marginTop: 4 },
  zoomText: { width: 40, fontSize: 13, fontWeight: "700", color: c.brand, textAlign: "right" },
}));
