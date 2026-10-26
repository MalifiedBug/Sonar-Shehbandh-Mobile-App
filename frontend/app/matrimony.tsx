import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Chip, Empty, Header, Icon, useToast } from "@/src/components/ui";
import { RemoteImage } from "@/src/components/photo";
import { TermsModal } from "@/src/components/TermsModal";
import { Reg } from "@/src/components/RegistrationView";
import { ageOn, FORMS, parseDMY } from "@/src/forms";
import { englishPart, SUB_CASTES, TermsKind } from "@/src/constants";

const CATS = FORMS.matrimony.category!.options;

export default function Matrimony() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"all" | "short">("all");
  const [cat, setCat] = useState("");
  const [caste, setCaste] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [terms, setTerms] = useState<TermsKind | null>(null);
  const [short, setShort] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, refreshing, reload } = useLoad(
    () => api<Reg[]>(`/registrations?type=matrimony&q=${encodeURIComponent(dq)}&sub_caste=${encodeURIComponent(caste)}&category=${cat}`),
    [dq, caste, cat],
  );
  const touched = useRef<Set<string>>(new Set());
  useLoad(async () => {
    const r = await api<{ ids: string[] }>("/shortlist");
    // Keep any hearts tapped while this request was in flight.
    setShort((prev) => {
      const n = new Set(r.ids);
      touched.current.forEach((id) => (prev.has(id) ? n.add(id) : n.delete(id)));
      return n;
    });
    touched.current.clear();
    return r;
  });

  const list = useMemo(() => (tab === "short" ? (data ?? []).filter((p) => short.has(p.id)) : data ?? []), [tab, data, short]);
  const cardW = (Math.min(width, 640) - 32 - 12) / 2;

  const toggle = async (id: string) => {
    const was = short.has(id);
    touched.current.add(id);
    setShort((prev) => { const n = new Set(prev); if (was) n.delete(id); else n.add(id); return n; });
    try {
      const r = await api<{ shortlisted: boolean }>(`/shortlist/${id}`, { method: "POST" });
      toast(r.shortlisted ? "Added to shortlist / यादीत जोडले" : "Removed from shortlist", "info");
    } catch (e: any) {
      setShort((prev) => { const n = new Set(prev); if (was) n.add(id); else n.delete(id); return n; });
      toast(e?.message ?? "Failed", "error");
      if (e?.status === 402) router.push("/plans");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Matrimony / वधू-वर सूचक" subtitle={`${data?.length ?? 0} profiles · ${short.size} shortlisted`} />
      <View style={s.top}>
        <Pressable style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]} onPress={() => setTerms("matrimony")} testID="matrimony-add-profile-button">
          <Icon name="account-heart" size={20} color={colors.white} />
          <Text style={s.ctaText}>Add Matrimony Profile / बायोडाटा जोडा</Text>
        </Pressable>
        <View style={s.seg}>
          {([["all", "All Profiles / सर्व"], ["short", `Shortlisted / पसंती (${short.size})`]] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segSel]} testID={`matrimony-tab-${k}`}>
              <Text style={[s.segText, tab === k && s.segTextSel]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, city / शोधा" placeholderTextColor={colors.muted} style={s.searchInput} testID="matrimony-search-input" />
        </View>
      </View>
      <View style={s.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All" active={!cat} onPress={() => setCat("")} testID="matrimony-cat-all" />
          {CATS.map((o) => <Chip key={o.value} label={o.label} active={cat === o.value} onPress={() => setCat(o.value)} testID={`matrimony-cat-${o.value}`} />)}
        </ScrollView>
      </View>
      <View style={s.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All Sub-Castes" active={!caste} onPress={() => setCaste("")} testID="matrimony-caste-all" />
          {SUB_CASTES.map((c, i) => <Chip key={c} label={englishPart(c)} active={caste === c} onPress={() => setCaste(c)} testID={`matrimony-caste-${i}`} />)}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
          ListEmptyComponent={
            <Empty icon={tab === "short" ? "heart-outline" : "account-search-outline"} testID="matrimony-empty"
              text={tab === "short" ? "No shortlisted profiles yet. Tap the heart on a profile to save it. / पसंतीचे प्रोफाइल नाहीत" : "No profiles match these filters. / प्रोफाइल सापडले नाहीत"} />
          }
          renderItem={({ item }) => {
            const d = item.data;
            const dob = parseDMY(d.dob);
            const ph = item.photos?.portrait;
            const liked = short.has(item.id);
            return (
              <Pressable onPress={() => router.push(`/detail/${item.id}` as any)} style={({ pressed }) => [s.card, { width: cardW }, pressed && { opacity: 0.9 }]} testID={`matrimony-profile-${item.id}`}>
                <View style={[s.photo, { height: cardW * 1.15 }]}>
                  {ph ? <RemoteImage path={ph.path} zoom={ph.zoom} style={{ width: "100%", height: "100%" }} /> : <Icon name="account" size={56} color={colors.borderStrong} />}
                  <Pressable onPress={() => toggle(item.id)} hitSlop={8} style={[s.heart, liked && { backgroundColor: colors.maroonBright }]} testID={`matrimony-shortlist-${item.id}`}>
                    <Icon name={liked ? "heart" : "heart-outline"} size={20} color={colors.white} />
                  </Pressable>
                  <View style={s.catTag}><Text style={s.catTagText}>{d.category === "bride" ? "वधू Bride" : d.category === "groom" ? "वर Groom" : "पुनर्विवाह"}</Text></View>
                  {(item as any).featured ? <View style={s.featTag} testID={`matrimony-featured-${item.id}`}><Text style={s.catTagText}>★ Featured</Text></View> : null}
                </View>
                <View style={{ padding: 10, gap: 2 }}>
                  <Text style={s.name} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.line} numberOfLines={1}>{[dob ? `${ageOn(dob)} yrs` : null, d.height?.split(" (")[0]].filter(Boolean).join(" · ")}</Text>
                  <Text style={s.line} numberOfLines={1}>{[d.qualification, d.work_location].filter(Boolean).join(" · ")}</Text>
                  <Text style={s.caste} numberOfLines={1}>{englishPart(item.sub_caste)}</Text>
                </View>
              </Pressable>
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
  top: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  cta: { minHeight: 48, borderRadius: 12, backgroundColor: c.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaText: { color: c.white, fontWeight: "800", fontSize: 14 },
  seg: { flexDirection: "row", padding: 4, borderRadius: 12, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segSel: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  segText: { fontSize: 13, fontWeight: "700", color: c.muted },
  segTextSel: { color: c.brand },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, height: 48 },
  chipRow: { height: 52, justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  card: { borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  photo: { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  heart: { position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: c.overlay, alignItems: "center", justifyContent: "center" },
  catTag: { position: "absolute", left: 8, bottom: 8, backgroundColor: c.brand, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catTagText: { color: c.white, fontSize: 11, fontWeight: "800" },
  featTag: { position: "absolute", left: 8, top: 8, backgroundColor: c.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  name: { fontSize: 14, fontWeight: "800", color: c.onSurface },
  line: { fontSize: 12, color: c.onSurfaceTertiary },
  caste: { fontSize: 11, color: c.brand, fontWeight: "700", marginTop: 2 },
}));
