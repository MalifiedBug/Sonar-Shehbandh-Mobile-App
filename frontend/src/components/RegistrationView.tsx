import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, SectionTitle } from "@/src/components/ui";
import { RemoteImage } from "@/src/components/photo";
import { Field, FORMS } from "@/src/forms";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

export type Reg = {
  id: string; type: string; title: string; sub_caste: string; data: Record<string, any>; photos: Record<string, { path: string; zoom: number }>;
  status: string; owner_name: string; created_at: string; approved_at?: string; expires_at?: string; reject_reason?: string;
};

export function RegistrationView({ reg }: { reg: Reg }) {
  const s = useStyles();
  const { colors } = useTheme();
  const def = FORMS[reg.type];
  if (!def) return null;
  const d = reg.data;
  const cat = def.category?.options.find((o) => o.value === d.category);

  const valueRow = (f: Field, v: any, key: string) => {
    if (v === undefined || v === null || v === "" || f.type === "copy") return null;
    const callable = f.type === "phone";
    return (
      <View key={key} style={s.row}>
        <Text style={s.rowLabel}>{f.label}</Text>
        {callable ? (
          <Pressable onPress={() => Linking.openURL(`tel:${v}`)} testID={`detail-call-${key}`}>
            <Text style={[s.rowValue, { color: colors.brandPrimary, fontWeight: "700" }]}>{String(v)}</Text>
          </Pressable>
        ) : (
          <Text style={s.rowValue} testID={`detail-value-${key}`}>{String(v)}</Text>
        )}
      </View>
    );
  };

  return (
    <View>
      {reg.type === "matrimony" ? (
        <View style={s.biodataHead}>
          <Text style={s.shree}>॥ श्री ॥</Text>
          <Text style={s.bioTitle}>Biodata / बायोडाटा</Text>
          {cat ? <Text style={s.bioCat}>{cat.label}</Text> : null}
          {reg.expires_at ? <Text style={s.valid} testID="biodata-valid-until">Valid until / वैधता: {fmtDate(reg.expires_at)}</Text> : null}
        </View>
      ) : null}

      <View style={s.photos}>
        {def.photos.filter((p) => reg.photos?.[p.key]).map((p) => {
          const ph = reg.photos[p.key];
          const dim = p.shape === "circle" ? { width: 120, height: 120, borderRadius: 60 } : p.shape === "portrait" ? { width: 120, height: 160, borderRadius: 12 } : p.shape === "square" ? { width: 120, height: 120, borderRadius: 16 } : { width: 160, height: 120, borderRadius: 12 };
          return (
            <View key={p.key} style={s.photoItem}>
              <RemoteImage path={ph.path} zoom={ph.zoom} style={[dim, { borderWidth: 2, borderColor: colors.border }]} testID={`detail-photo-${p.key}`} />
              <Text style={s.photoLabel} numberOfLines={2}>{p.label}</Text>
            </View>
          );
        })}
      </View>

      <Text style={s.name} testID="detail-title">{reg.title}</Text>
      {reg.sub_caste ? <Text style={s.caste}>{reg.sub_caste}</Text> : null}

      {def.sections.map((sec) => {
        const rows = sec.fields.flatMap((f) => {
          if (f.type === "repeater") {
            const items: any[] = d[f.key] ?? [];
            return items.length
              ? [
                  <View key={f.key}>
                    {items.map((it, i) => (
                      <View key={i} style={s.subCard}>
                        <Text style={s.subTitle}>{f.label} #{i + 1}</Text>
                        {(f.fields ?? []).map((sf) => valueRow(sf, it[sf.key], `${f.key}-${i}-${sf.key}`))}
                      </View>
                    ))}
                  </View>,
                ]
              : [];
          }
          const r = valueRow(f, d[f.key], f.key);
          return r ? [r] : [];
        });
        if (!rows.length) return null;
        return (
          <View key={sec.title}>
            <SectionTitle title={sec.title} />
            <View style={s.card}>{rows}</View>
          </View>
        );
      })}
      <View style={s.meta}>
        <Icon name="information-outline" size={16} color={colors.muted} />
        <Text style={s.metaText}>Submitted by {reg.owner_name} on {fmtDate(reg.created_at)}{reg.approved_at ? ` · Approved ${fmtDate(reg.approved_at)}` : ""}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  biodataHead: { alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.border, marginBottom: 16, gap: 4 },
  shree: { fontSize: 18, fontWeight: "800", color: c.brand },
  bioTitle: { fontSize: 20, fontWeight: "800", color: c.brandSecondary },
  bioCat: { fontSize: 14, fontWeight: "700", color: c.brand },
  valid: { fontSize: 12, color: c.success, fontWeight: "700", marginTop: 4 },
  photos: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  photoItem: { alignItems: "center", width: 160, gap: 6 },
  photoLabel: { fontSize: 11, color: c.muted, textAlign: "center" },
  name: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center", marginTop: 16 },
  caste: { fontSize: 13, color: c.brand, textAlign: "center", marginTop: 4, fontWeight: "600" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider, gap: 2 },
  rowLabel: { fontSize: 12, color: c.muted },
  rowValue: { fontSize: 15, color: c.onSurface },
  subCard: { marginVertical: 8, padding: 10, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.divider },
  subTitle: { fontSize: 13, fontWeight: "800", color: c.brandSecondary },
  meta: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 16 },
  metaText: { flex: 1, fontSize: 12, color: c.muted },
}));
