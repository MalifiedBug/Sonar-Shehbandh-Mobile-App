import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Checkbox, Header, Icon, SectionTitle, useToast } from "@/src/components/ui";
import { DateField, RadioField, SelectField, TextField, TimeField } from "@/src/components/fields";
import { PhotoPicker } from "@/src/components/photo";
import { convertValues, Field, FORMS, PhotoVal, validateForm } from "@/src/forms";
import { api } from "@/src/api";

const KB: Record<string, any> = { phone: "phone-pad", number: "number-pad", year: "number-pad", pincode: "number-pad", email: "email-address", url: "url" };
const MAXLEN: Record<string, number> = { phone: 10, pincode: 6, year: 4, number: 3, gst: 15 };

export default function RegisterScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const def = FORMS[type ?? ""];
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, any>>(() => ({ ...(def?.defaults ?? {}) }));
  const [photos, setPhotos] = useState<Record<string, PhotoVal>>({});
  const [consent, setConsent] = useState(false);
  const [pinMsg, setPinMsg] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { errors, missing } = useMemo(() => (def ? validateForm(def, values, photos) : { errors: {}, missing: [] }), [def, values, photos]);

  if (!def) return <Header title="Not found" />;

  const copyFields = def.sections.flatMap((sec) => sec.fields).filter((f) => f.type === "copy");

  const setField = (key: string, val: any) =>
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      for (const cf of copyFields) if (next[cf.key] && cf.copy?.[key]) next[cf.copy[key]] = val;
      return next;
    });

  const toggleCopy = (f: Field) =>
    setValues((prev) => {
      const on = !prev[f.key];
      const next = { ...prev, [f.key]: on };
      if (on) for (const [src, dest] of Object.entries(f.copy ?? {})) next[dest] = prev[src] ?? "";
      return next;
    });

  const onPin = async (f: Field, val: string) => {
    const pin = val.replace(/\D/g, "").slice(0, 6);
    setField(f.key, pin);
    if (pin.length !== 6) { setPinMsg(""); return; }
    setPinMsg("Looking up PIN… / शोधत आहे…");
    try {
      const r = await api<{ taluka: string; district: string; state: string }>(`/pincode/${pin}`);
      const src: Record<string, string> = { ...r, taluka_district: [r.taluka, r.district].filter(Boolean).join(", ") };
      setValues((prev) => {
        const next = { ...prev };
        for (const [target, from] of Object.entries(f.fill ?? {})) next[target] = src[from] ?? prev[target];
        return next;
      });
      setPinMsg(`Filled from PIN: ${r.taluka}, ${r.district}, ${r.state}`);
    } catch {
      setPinMsg("PIN not found — please type manually / कृपया स्वतः भरा");
    }
  };

  const convert = () => {
    setValues((prev) => convertValues(def, prev));
    toast("Converted to English / इंग्रजीत रूपांतरित", "info");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/registrations", {
        method: "POST",
        body: { type: def.type, title: String(values[def.titleKey] ?? "").trim(), sub_caste: values[def.subCasteKey] ?? "", data: values, photos },
      });
      toast("Submitted for approval / मंजुरीसाठी पाठवले");
      router.replace("/mine");
    } catch (e: any) {
      toast(e?.message ?? "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: Field, value: any, onChange: (v: any) => void, err: string | undefined, tid: string) => {
    switch (f.type) {
      case "select":
        return <SelectField key={tid} label={f.label} value={value ?? ""} options={f.options ?? []} onChange={onChange} required={f.required} testID={tid} error={err} />;
      case "radio":
        return <RadioField key={tid} label={f.label} value={value ?? ""} options={f.options ?? []} onChange={onChange} required={f.required} testID={tid} />;
      case "date":
        return <DateField key={tid} label={f.label} value={value ?? ""} onChange={onChange} required={f.required} error={err} testID={tid} />;
      case "time":
        return <TimeField key={tid} label={f.label} value={value ?? ""} onChange={onChange} required={f.required} error={err} testID={tid} />;
      default:
        return (
          <TextField
            key={tid}
            label={f.label}
            value={value ?? ""}
            onChangeText={(t) => onChange(f.type === "gst" ? t.toUpperCase() : ["phone", "number", "year"].includes(f.type) ? t.replace(/\D/g, "") : t)}
            required={f.required}
            error={err}
            keyboardType={KB[f.type]}
            maxLength={f.maxLength ?? MAXLEN[f.type]}
            multiline={f.type === "textarea"}
            placeholder={f.placeholder}
            autoCapitalize={["email", "url"].includes(f.type) ? "none" : f.type === "gst" ? "characters" : "words"}
            testID={tid}
          />
        );
    }
  };

  const renderTop = (f: Field) => {
    if (f.showIf && !f.showIf(values)) return null;
    const tid = `field-${f.key}`;
    if (f.type === "copy") return <Checkbox key={tid} checked={!!values[f.key]} onToggle={() => toggleCopy(f)} label={f.label} testID={tid} />;
    if (f.type === "pincode")
      return (
        <View key={tid}>
          <TextField label={f.label} value={values[f.key] ?? ""} onChangeText={(t) => onPin(f, t)} required={f.required} error={errors[f.key]} keyboardType="number-pad" maxLength={6} testID={tid} hint={pinMsg || "Enter 6 digits to auto-fill / ६ अंक टाका"} />
        </View>
      );
    if (f.type === "repeater") {
      const rows: any[] = values[f.key] ?? [];
      return (
        <View key={tid}>
          {rows.map((row, i) => (
            <View key={i} style={s.rowCard} testID={`${tid}-row-${i}`}>
              <View style={s.rowHead}>
                <Text style={s.rowTitle}>{f.label} #{i + 1}</Text>
                <Pressable hitSlop={8} onPress={() => setField(f.key, rows.filter((_, j) => j !== i))} testID={`${tid}-remove-${i}`}>
                  <Icon name="trash-can-outline" size={22} color={colors.error} />
                </Pressable>
              </View>
              {(f.fields ?? []).map((sf) =>
                renderField(sf, row[sf.key], (v) => setField(f.key, rows.map((r, j) => (j === i ? { ...r, [sf.key]: v } : r))), errors[`${f.key}.${i}.${sf.key}`], `${tid}-${i}-${sf.key}`),
              )}
            </View>
          ))}
          <Pressable style={s.addBtn} onPress={() => setField(f.key, [...rows, {}])} testID={`${tid}-add`}>
            <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
            <Text style={s.addText}>{f.addLabel}</Text>
          </Pressable>
        </View>
      );
    }
    return renderField(f, values[f.key], (v) => setField(f.key, v), errors[f.key], tid);
  };

  const errCount = Object.keys(errors).length;
  const canSave = consent && missing.length === 0 && errCount === 0;

  return (
    <View style={s.root}>
      <Header title={def.title} subtitle="* Required / आवश्यक" testID={`register-${def.type}-screen`} />
      <KeyboardAwareScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        {def.category ? (
          <View style={s.catRow}>
            {def.category.options.map((o) => {
              const sel = values[def.category!.key] === o.value;
              return (
                <Pressable key={o.value} onPress={() => setField(def.category!.key, o.value)} style={[s.cat, sel && s.catSel]} testID={`category-tab-${o.value}`}>
                  <Text style={[s.catText, sel && s.catTextSel]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={s.photoGrid}>
          {def.photos.map((p) => (
            <View key={p.key} style={def.photos.length > 1 && p.shape !== "circle" ? s.photoHalf : s.photoFull}>
              <PhotoPicker spec={p} value={photos[p.key]} onChange={(v) => setPhotos((prev) => { const n = { ...prev }; if (v) n[p.key] = v; else delete n[p.key]; return n; })} testID={`photo-${p.key}`} />
            </View>
          ))}
        </View>

        {def.sections.map((sec, i) => (
          <View key={sec.title}>
            <SectionTitle title={sec.title} testID={`section-${i}`} />
            <View style={s.secCard}>{sec.fields.map(renderTop)}</View>
          </View>
        ))}

        <Pressable onPress={convert} style={({ pressed }) => [s.translit, pressed && { opacity: 0.8 }]} testID="convert-to-english-button">
          <Icon name="translate" size={22} color={colors.onTranslit} />
          <Text style={s.translitText}>CONVERT TO ENGLISH / कन्व्हर्ट टू इंग्लिश</Text>
        </Pressable>

        <View style={s.consent}>
          <Checkbox checked={consent} onToggle={() => setConsent(!consent)} label={def.consent} testID="consent-checkbox" />
        </View>
      </KeyboardAwareScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!canSave ? (
          <Text style={s.hint} numberOfLines={2} testID="form-missing-hint">
            {missing.length
              ? `Required: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` +${missing.length - 3} more` : ""}`
              : errCount
                ? `Please fix: ${Object.keys(errors).slice(0, 2).map((k) => {
                    const top = k.split(".")[0];
                    const f = def.sections.flatMap((x) => x.fields).find((x) => x.key === top);
                    return (f?.label ?? top).split(" / ")[0];
                  }).join(", ")}`
                : "Tick the declaration to save / घोषणा स्वीकारा"}
          </Text>
        ) : null}
        <View style={s.footBtns}>
          <Btn label="Decline / नकार" variant="danger" onPress={() => router.replace("/")} style={{ flex: 1 }} testID="form-decline-button" />
          <Btn label={def.saveLabel} variant="primary" onPress={save} disabled={!canSave} loading={saving} style={{ flex: 1.4 }} testID="form-save-button" />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, paddingBottom: 32 },
  catRow: { flexDirection: "row", gap: 6, marginBottom: 16 },
  cat: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", padding: 6 },
  catSel: { backgroundColor: c.brand, borderColor: c.brand },
  catText: { fontSize: 12, fontWeight: "700", color: c.onSurfaceSecondary, textAlign: "center" },
  catTextSel: { color: c.onBrand },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingTop: 16, paddingHorizontal: 8 },
  photoFull: { width: "100%" },
  photoHalf: { width: "50%" },
  secCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 12, paddingBottom: 2 },
  rowCard: { borderWidth: 1, borderColor: c.divider, borderRadius: 12, padding: 10, marginBottom: 10, backgroundColor: c.surface },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: "800", color: c.brandSecondary },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, justifyContent: "center", borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.brandPrimary, marginBottom: 12 },
  addText: { color: c.brandPrimary, fontWeight: "700", fontSize: 14 },
  translit: { marginTop: 24, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: c.translitBorder, backgroundColor: c.translitBg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 12 },
  translitText: { color: c.onTranslit, fontWeight: "800", fontSize: 14 },
  consent: { marginTop: 16, backgroundColor: c.goldSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  footer: { borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary, paddingHorizontal: 16, paddingTop: 10 },
  hint: { fontSize: 12, color: c.warning, marginBottom: 8, textAlign: "center" },
  footBtns: { flexDirection: "row", gap: 8 },
}));
