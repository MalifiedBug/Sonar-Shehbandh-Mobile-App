import React from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Icon } from "@/src/components/ui";
import { TERMS, TermsKind } from "@/src/constants";

export function TermsModal({ kind, onClose }: { kind: TermsKind | null; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const t = kind ? TERMS[kind] : null;
  return (
    <Modal visible={!!t} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        {t ? (
          <View style={s.card} testID={`terms-dialog-${kind}`}>
            <View style={s.head}>
              <Icon name="shield-check-outline" size={28} color={colors.brand} />
              <Text style={s.title}>{t.title}</Text>
              {t.subtitle ? <Text style={s.subtitle}>{t.subtitle}</Text> : null}
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {t.clauses.map((c, i) => (
                <View key={i} style={s.clause}>
                  <View style={s.num}><Text style={s.numText}>{i + 1}</Text></View>
                  <Text style={s.clauseText}>
                    {c.h ? <Text style={s.clauseHead}>{c.h}: </Text> : null}
                    {c.t}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={s.foot}>
              <Btn label={t.decline} variant="danger" onPress={onClose} style={{ flex: 1 }} testID="terms-decline-button" />
              <Btn
                label={t.accept}
                variant="primary"
                style={{ flex: 1.3 }}
                testID="terms-accept-button"
                onPress={() => {
                  onClose();
                  router.push(t.route as any);
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: "center", padding: 16 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 20, maxHeight: "88%", overflow: "hidden", borderWidth: 1, borderColor: c.border },
  head: { alignItems: "center", padding: 16, paddingBottom: 12, gap: 6, backgroundColor: c.brandTertiary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 17, fontWeight: "800", color: c.brand, textAlign: "center" },
  subtitle: { fontSize: 13, color: c.onSurfaceTertiary, textAlign: "center" },
  clause: { flexDirection: "row", gap: 10 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.brand, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numText: { color: c.onBrand, fontSize: 12, fontWeight: "800" },
  clauseText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary },
  clauseHead: { fontWeight: "800", color: c.onSurface },
  foot: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border },
}));
