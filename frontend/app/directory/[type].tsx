import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Chip, Empty, Header, Icon } from "@/src/components/ui";
import { Badge, Card, ContactActions, SkeletonCard } from "@/src/components/kit";
import { RemoteImage } from "@/src/components/photo";
import { TermsModal } from "@/src/components/TermsModal";
import { Reg } from "@/src/components/RegistrationView";
import { FORMS } from "@/src/forms";
import { englishPart, SUB_CASTES, TermsKind } from "@/src/constants";

const REGISTER_LABEL: Record<string, string> = {
  member: "Register Family / कुटुंब नोंदणी करा",
  business: "Register Business / व्यवसाय नोंदवा",
  social_worker: "Add Yourself as Social Worker / समाजसेवक म्हणून नोंदणी",
  matrimony: "Add Matrimony Profile / बायोडाटा जोडा",
};

// Which saved fields hold the phone / WhatsApp numbers for each directory.
function contactOf(type: string, d: Record<string, any>): { phone?: string; whatsapp?: string } {
  if (type === "business") return { phone: d.phone1, whatsapp: d.whatsapp };
  if (type === "social_worker") return { phone: d.phone, whatsapp: d.whatsapp };
  if (type === "member") return { phone: d.primary_mobile, whatsapp: d.whatsapp };
  return {};
}

export default function Directory() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const def = FORMS[type ?? ""];
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [caste, setCaste] = useState("");
  const [cat, setCat] = useState("");
  const [terms, setTerms] = useState<TermsKind | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, refreshing, reload, error } = useLoad(
    () => api<Reg[]>(`/registrations?type=${type}&q=${encodeURIComponent(dq)}&sub_caste=${encodeURIComponent(caste)}&category=${cat}`),
    [type, dq, caste, cat],
  );

  if (!def) return <Header title="Not found" />;
  const photoKey = def.photos[0]?.key;

  return (
    <View style={s.root}>
      <Header title={def.dirTitle} subtitle={loading ? "Loading… / लोड होत आहे" : `${data?.length ?? 0} approved ${data?.length === 1 ? "listing" : "listings"} / मंजूर नोंदी`} />
      <View style={s.ctaWrap}>
        <Pressable style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]} onPress={() => setTerms(type as TermsKind)} testID="directory-register-button">
          <Icon name={type === "social_worker" ? "account-plus" : type === "business" ? "store-plus" : "plus-circle"} size={20} color={colors.white} />
          <Text style={s.ctaText}>{REGISTER_LABEL[type!]}</Text>
        </Pressable>
      </View>
      <View style={s.searchWrap}>
        <View style={s.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, city / शोधा" placeholderTextColor={colors.muted} style={s.searchInput} testID="directory-search-input" />
          {q ? <Pressable onPress={() => setQ("")} hitSlop={8}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      </View>
      {def.category ? (
        <View style={s.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <Chip label="All" active={!cat} onPress={() => setCat("")} testID="category-chip-all" />
            {def.category.options.map((o) => <Chip key={o.value} label={o.label} active={cat === o.value} onPress={() => setCat(o.value)} testID={`category-chip-${o.value}`} />)}
          </ScrollView>
        </View>
      ) : null}
      <View style={s.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All Sub-Castes" active={!caste} onPress={() => setCaste("")} testID="caste-chip-all" />
          {SUB_CASTES.map((c, i) => <Chip key={c} label={englishPart(c)} active={caste === c} onPress={() => setCaste(c)} testID={`caste-chip-${i}`} />)}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View>
              <Empty text={error ?? (dq || caste || cat ? "No matches found. Try a different search. / जुळणारे निकाल नाहीत" : "No approved listings yet. Be the first to register! / अद्याप नोंदी नाहीत")} testID="directory-empty" />
              {dq || caste || cat ? (
                <Pressable onPress={() => { setQ(""); setCaste(""); setCat(""); }} style={s.clear} testID="directory-clear-filters">
                  <Text style={s.clearText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const c = contactOf(type!, item.data ?? {});
            return (
              <Card onPress={() => router.push(`/detail/${item.id}` as any)} testID={`directory-item-${item.id}`}>
                <View style={s.itemRow}>
                  {photoKey && item.photos?.[photoKey] ? (
                    <RemoteImage path={item.photos[photoKey].path} zoom={item.photos[photoKey].zoom} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarEmpty]}><Icon name={type === "business" ? "storefront-outline" : "account"} size={28} color={colors.borderStrong} /></View>
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                    {def.subtitle(item.data) ? <Text style={s.sub} numberOfLines={1}>{def.subtitle(item.data)}</Text> : null}
                    <View style={s.badges}>
                      <Badge label={type === "business" ? "Local Partner" : "Verified"} icon="check-decagram" tone="success" />
                      {(item as any).featured ? <Badge label="Featured" icon="star" tone="gold" testID={`directory-featured-${item.id}`} /> : null}
                      {item.sub_caste ? <Badge label={englishPart(item.sub_caste)} tone="brand" /> : null}
                      {item.data?.blood_group ? <Badge label={`Blood: ${item.data.blood_group}`} icon="water" tone="error" /> : null}
                    </View>
                  </View>
                  <Icon name="chevron-right" size={22} color={colors.muted} />
                </View>
                <ContactActions phone={c.phone} whatsapp={c.whatsapp} locked={(item as any).locked} testID={`directory-item-${item.id}`} />
              </Card>
            );
          }}
        />
      )}
      <TermsModal kind={terms} onClose={() => setTerms(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  ctaWrap: { paddingHorizontal: 16, paddingTop: 12 },
  cta: { minHeight: 48, borderRadius: 14, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, ...elevation },
  ctaText: { color: c.white, fontWeight: "800", fontSize: 14 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, height: 48, ...({ outlineStyle: "none" } as any) },
  chipRow: { height: 52, justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarEmpty: { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15.5, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2 },
  sub: { fontSize: 12.5, color: c.onSurfaceTertiary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  clear: { alignSelf: "center", height: 40, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: c.brandPrimary, justifyContent: "center" },
  clearText: { fontSize: 13, fontWeight: "700", color: c.brandPrimary },
}));
