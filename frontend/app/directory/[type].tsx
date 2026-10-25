import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Chip, Empty, Header, Icon } from "@/src/components/ui";
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
      <Header title={def.dirTitle} subtitle={`${data?.length ?? 0} approved listings / मंजूर नोंदी`} />
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
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
          ListEmptyComponent={<Empty text={error ?? "No approved listings yet. Be the first to register! / अद्याप नोंदी नाहीत"} testID="directory-empty" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [s.item, pressed && { opacity: 0.85 }]} onPress={() => router.push(`/detail/${item.id}` as any)} testID={`directory-item-${item.id}`}>
              {photoKey && item.photos?.[photoKey] ? (
                <RemoteImage path={item.photos[photoKey].path} zoom={item.photos[photoKey].zoom} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarEmpty]}><Icon name="account" size={28} color={colors.borderStrong} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                {def.subtitle(item.data) ? <Text style={s.sub} numberOfLines={1}>{def.subtitle(item.data)}</Text> : null}
                {item.sub_caste ? <Text style={s.caste} numberOfLines={1}>{englishPart(item.sub_caste)}</Text> : null}
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
      <TermsModal kind={terms} onClose={() => setTerms(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  ctaWrap: { paddingHorizontal: 16, paddingTop: 12 },
  cta: { minHeight: 48, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  ctaText: { color: c.white, fontWeight: "800", fontSize: 14 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, height: 48 },
  chipRow: { height: 56, justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarEmpty: { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: 2 },
  caste: { fontSize: 12, color: c.brand, marginTop: 2, fontWeight: "600" },
}));
