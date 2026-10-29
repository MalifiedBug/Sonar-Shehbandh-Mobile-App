import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui";
import { Overline } from "@/src/components/kit";
import { TermsModal } from "@/src/components/TermsModal";
import { TermsKind } from "@/src/constants";

// Bottom conversion card inviting members to contribute (opens the existing Terms → registration flow).
export function RegisterCTA() {
  const s = useStyles();
  const { colors } = useTheme();
  const [terms, setTerms] = useState<TermsKind | null>(null);
  const items: { kind: TermsKind; label: string; icon: string }[] = [
    { kind: "business", label: "Register Business", icon: "store-plus" },
    { kind: "social_worker", label: "Join as Social Worker", icon: "hand-heart" },
    { kind: "member", label: "Add Family Members", icon: "account-multiple-plus" },
  ];
  return (
    <View style={s.wrap} testID="register-cta-card">
      <Overline text="Grow the community" color={colors.goldSoft} />
      <Text style={s.title}>Register your business or volunteer as a social worker</Text>
      <Text style={s.sub}>Every listing is verified by the committee before it goes live. / समितीच्या मंजुरीनंतर नोंद प्रसिद्ध होते.</Text>
      <View style={s.row}>
        {items.map((i, idx) => (
          <Pressable key={i.kind} onPress={() => setTerms(i.kind)} style={({ pressed }) => [s.btn, idx === 0 && s.btnPrimary, pressed && { opacity: 0.85 }]} testID={`register-cta-${i.kind}`}>
            <Icon name={i.icon as any} size={18} color={idx === 0 ? colors.brandSecondary : colors.white} />
            <Text style={[s.btnText, idx === 0 && { color: colors.brandSecondary }]} numberOfLines={2}>{i.label}</Text>
          </Pressable>
        ))}
      </View>
      <TermsModal kind={terms} onClose={() => setTerms(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginHorizontal: 16, marginTop: 28, borderRadius: 24, padding: 20, backgroundColor: c.brandSecondary },
  title: { fontSize: 19, fontWeight: "800", color: c.white, marginTop: 8, lineHeight: 25, letterSpacing: -0.2 },
  sub: { fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 6, lineHeight: 18 },
  row: { flexDirection: "row", gap: 8, marginTop: 16 },
  btn: { flex: 1, minHeight: 64, borderRadius: 14, padding: 8, gap: 4, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  btnPrimary: { backgroundColor: c.goldSoft, borderColor: c.goldSoft },
  btnText: { fontSize: 11.5, fontWeight: "700", color: c.white, textAlign: "center" },
}));
