import React, { useMemo, useState } from "react";
import { FlatList, KeyboardTypeOptions, Pressable, Text, TextInput, View } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, Sheet } from "@/src/components/ui";
import { Opt, optLabel, optValue } from "@/src/forms";

export function Label({ label, required }: { label: string; required?: boolean }) {
  const s = useStyles();
  return (
    <Text style={s.label}>
      {label}
      {required ? <Text style={s.star}> *</Text> : null}
    </Text>
  );
}

export function TextField({ label, value, onChangeText, required, error, hint, keyboardType, multiline, maxLength, placeholder, testID, autoCapitalize, secureTextEntry }: {
  label?: string; value: string; onChangeText: (t: string) => void; required?: boolean; error?: string | null; hint?: string;
  keyboardType?: KeyboardTypeOptions; multiline?: boolean; maxLength?: number; placeholder?: string; testID?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters"; secureTextEntry?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={s.field}>
      {label ? <Label label={label} required={required} /> : null}
      <TextInput
        testID={testID}
        value={value ?? ""}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.input, multiline && s.multiline, focus && s.inputFocus, !!error && s.inputError]}
      />
      {multiline && maxLength ? <Text style={s.counter}>{(value ?? "").length}/{maxLength}</Text> : null}
      {error ? <Text style={s.error} testID={testID ? `${testID}-error` : undefined}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SelectField({ label, value, options, onChange, required, testID, error }: {
  label: string; value: string; options: Opt[]; onChange: (v: string) => void; required?: boolean; testID?: string; error?: string | null;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => options.filter((o) => optLabel(o).toLowerCase().includes(q.toLowerCase())), [options, q]);
  const current = options.find((o) => optValue(o) === value);
  return (
    <View style={s.field}>
      <Label label={label} required={required} />
      <Pressable testID={testID} onPress={() => setOpen(true)} style={[s.input, s.select, !!error && s.inputError]}>
        <Text style={[s.selectText, !current && { color: colors.muted }]} numberOfLines={1}>
          {current ? optLabel(current) : "Select / निवडा"}
        </Text>
        <Icon name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Sheet visible={open} onClose={() => { setOpen(false); setQ(""); }} title={label} testID={testID ? `${testID}-sheet` : undefined}>
        {options.length > 10 ? (
          <TextInput value={q} onChangeText={setQ} placeholder="Search / शोधा" placeholderTextColor={colors.muted} style={[s.input, { marginBottom: 8 }]} testID={testID ? `${testID}-search` : undefined} />
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(o) => optValue(o)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const sel = optValue(item) === value;
            return (
              <Pressable
                testID={testID ? `${testID}-option-${index}` : undefined}
                onPress={() => { onChange(optValue(item)); setOpen(false); setQ(""); }}
                style={({ pressed }) => [s.option, sel && s.optionSel, pressed && { opacity: 0.7 }]}
              >
                <Text style={[s.optionText, sel && { color: colors.brand, fontWeight: "700" }]}>{optLabel(item)}</Text>
                {sel ? <Icon name="check" size={20} color={colors.brand} /> : null}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

export function RadioField({ label, value, options, onChange, required, testID }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; required?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.field}>
      <Label label={label} required={required} />
      <View style={s.radioRow}>
        {options.map((o, i) => {
          const sel = optValue(o) === value;
          return (
            <Pressable key={optValue(o)} testID={testID ? `${testID}-${i}` : undefined} onPress={() => onChange(optValue(o))} style={[s.radio, sel && s.radioSel]}>
              <Icon name={sel ? "radiobox-marked" : "radiobox-blank"} size={20} color={sel ? colors.brandPrimary : colors.muted} />
              <Text style={s.radioText}>{optLabel(o)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const maskDate = (t: string) => {
  const d = t.replace(/\D/g, "").slice(0, 8);
  let o = d.slice(0, 2);
  if (d.length > 2) o += "/" + d.slice(2, 4);
  if (d.length > 4) o += "/" + d.slice(4);
  return o;
};

export function DateField(props: { label: string; value: string; onChange: (v: string) => void; required?: boolean; error?: string | null; testID?: string }) {
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChangeText={(t) => props.onChange(maskDate(t))}
      required={props.required}
      error={props.error}
      keyboardType="number-pad"
      placeholder="DD/MM/YYYY"
      maxLength={10}
      testID={props.testID}
    />
  );
}

export function TimeField({ label, value, onChange, required, error, testID }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; error?: string | null; testID?: string }) {
  const s = useStyles();
  const [hm, ap] = (value || "").split(" ");
  const ampm = ap || "AM";
  const setHm = (t: string) => {
    const d = t.replace(/\D/g, "").slice(0, 4);
    const o = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    onChange(o ? `${o} ${ampm}` : "");
  };
  return (
    <View style={s.field}>
      <Label label={label} required={required} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput testID={testID} value={hm ?? ""} onChangeText={setHm} keyboardType="number-pad" placeholder="HH:MM" maxLength={5} style={[s.input, { flex: 1 }, !!error && s.inputError]} />
        {["AM", "PM"].map((x) => (
          <Pressable key={x} testID={testID ? `${testID}-${x.toLowerCase()}` : undefined} onPress={() => onChange(`${hm || ""} ${x}`)} style={[s.ampm, ampm === x && s.ampmSel]}>
            <Text style={[s.ampmText, ampm === x && s.ampmTextSel]}>{x}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary, marginBottom: 6 },
  star: { color: c.error, fontWeight: "800" },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.white, paddingHorizontal: 12, fontSize: 15, color: c.onSurface },
  inputFocus: { borderColor: c.brandPrimary, borderWidth: 1.5 },
  inputError: { borderColor: c.error },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  counter: { fontSize: 11, color: c.muted, textAlign: "right", marginTop: 4 },
  error: { fontSize: 12, color: c.error, marginTop: 4 },
  hint: { fontSize: 12, color: c.info, marginTop: 4 },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  selectText: { flex: 1, fontSize: 15, color: c.onSurface },
  option: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.divider },
  optionSel: { backgroundColor: c.brandTertiary },
  optionText: { flex: 1, fontSize: 15, color: c.onSurface },
  radioRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radio: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.white },
  radioSel: { borderColor: c.brandPrimary },
  radioText: { fontSize: 14, color: c.onSurface },
  ampm: { width: 56, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.white },
  ampmSel: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  ampmText: { fontWeight: "700", color: c.onSurfaceSecondary },
  ampmTextSel: { color: c.onBrandPrimary },
}));
