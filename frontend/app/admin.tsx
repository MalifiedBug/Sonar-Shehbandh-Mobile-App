import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Chip, Empty, Header, Icon, StatusBadge, useToast } from "@/src/components/ui";
import { DateField, TextField } from "@/src/components/fields";
import { Reg } from "@/src/components/RegistrationView";
import { FORMS } from "@/src/forms";
import { NEWS_LEVELS } from "@/src/constants";

const TABS = ["Pending", "Post", "Complaints", "Settings"] as const;
const TYPES = [
  { v: "", l: "All" }, { v: "member", l: "Members" }, { v: "matrimony", l: "Matrimony" },
  { v: "business", l: "Business" }, { v: "social_worker", l: "Social Workers" },
];

export default function Admin() {
  const s = useStyles();
  const { user } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]>(tabParam === "complaints" ? "Complaints" : "Pending");
  if (user?.role !== "admin") return (<View style={s.root}><Header title="Admin Panel" /><Empty text="Admins only / फक्त प्रशासक" icon="lock-outline" /></View>);
  return (
    <View style={s.root}>
      <Header title="Admin Panel / प्रशासक" subtitle="Review & manage community entries" />
      <View style={s.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {TABS.map((t) => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} testID={`admin-tab-${t.toLowerCase()}`} />)}
        </ScrollView>
      </View>
      {tab === "Pending" ? <Pending /> : tab === "Post" ? <PostForm /> : tab === "Complaints" ? <Complaints /> : <Settings />}
    </View>
  );
}

function Pending() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("pending");
  const stats = useLoad(() => api<Record<string, number>>("/admin/stats"));
  const { data, loading, refreshing, reload } = useLoad(() => api<Reg[]>(`/admin/registrations?status=${status}&type=${type}`), [type, status]);
  const total = stats.data ? ["member", "matrimony", "business", "social_worker"].reduce((a, k) => a + (stats.data![k] ?? 0), 0) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {TYPES.map((t) => (
            <Chip key={t.v} label={`${t.l}${status === "pending" ? ` (${t.v ? stats.data?.[t.v] ?? 0 : total})` : ""}`} active={type === t.v} onPress={() => setType(t.v)} testID={`admin-type-${t.v || "all"}`} />
          ))}
        </ScrollView>
      </View>
      <View style={[s.chips, { flexDirection: "row", paddingBottom: 4 }]}>
        {["pending", "approved", "rejected"].map((st) => <Chip key={st} label={st[0].toUpperCase() + st.slice(1)} active={status === st} onPress={() => setStatus(st)} testID={`admin-status-${st}`} />)}
      </View>
      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} /> : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { reload(); stats.reload(); }} tintColor={colors.brand} />}
          ListEmptyComponent={<Empty text={`No ${status} entries`} icon="check-all" testID="admin-pending-empty" />}
          renderItem={({ item }) => (
            <Pressable style={s.item} onPress={() => router.push(`/detail/${item.id}` as any)} testID={`admin-item-${item.id}`}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <Text style={s.meta}>{FORMS[item.type]?.dirTitle} · by {item.owner_name} · {new Date(item.created_at).toLocaleDateString("en-IN")}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function PostForm() {
  const s = useStyles();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<"news" | "event" | "notice">("news");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("village");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/admin/posts", { method: "POST", body: { kind, title, body, level: kind === "news" ? level : null, location: location || null, event_date: kind === "event" ? date || null : null } });
      toast("Published / प्रकाशित");
      setTitle(""); setBody(""); setLocation(""); setDate("");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    } finally { setBusy(false); }
  };
  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <Text style={s.label}>Post type / प्रकार</Text>
      <View style={[s.wrapRow, { marginBottom: 16 }]}>
        <Chip label="News / बातमी" active={kind === "news"} onPress={() => setKind("news")} testID="post-kind-news" />
        <Chip label="Event / कार्यक्रम" active={kind === "event"} onPress={() => setKind("event")} testID="post-kind-event" />
        <Chip label="Notice / सूचना" active={kind === "notice"} onPress={() => setKind("notice")} testID="post-kind-notice" />
      </View>
      {kind === "news" ? (
        <>
          <Text style={s.label}>Level / स्तर</Text>
          <View style={[s.wrapRow, { marginBottom: 16 }]}>
            {NEWS_LEVELS.map((l) => <Chip key={l.value} label={l.label} active={level === l.value} onPress={() => setLevel(l.value)} testID={`post-level-${l.value}`} />)}
          </View>
        </>
      ) : null}
      <TextField label="Title / शीर्षक" value={title} onChangeText={setTitle} required testID="post-title-input" />
      <TextField label="Details / तपशील" value={body} onChangeText={setBody} required multiline maxLength={5000} testID="post-body-input" />
      {kind !== "notice" ? <TextField label="Location / ठिकाण" value={location} onChangeText={setLocation} testID="post-location-input" /> : null}
      {kind === "event" ? <DateField label="Event Date / दिनांक" value={date} onChange={setDate} testID="post-date-input" /> : null}
      <Btn label="Publish / प्रकाशित करा" variant="navy" onPress={submit} loading={busy} disabled={!title.trim() || !body.trim()} testID="post-publish-button" />
    </KeyboardAwareScrollView>
  );
}

type Complaint = { id: string; kind: string; subject: string; message: string; owner_name: string; status: string; created_at: string };

function Complaints() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data, loading, reload, refreshing } = useLoad(() => api<Complaint[]>("/admin/complaints"));
  const resolve = async (id: string) => {
    try { await api(`/admin/complaints/${id}/resolve`, { method: "POST" }); toast("Marked resolved"); reload(); } catch (e: any) { toast(e?.message, "error"); }
  };
  if (loading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />;
  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.brand} />}
      ListEmptyComponent={<Empty text="No complaints or suggestions" testID="admin-complaints-empty" />}
      renderItem={({ item }) => (
        <View style={[s.item, { flexDirection: "column", alignItems: "stretch" }]} testID={`admin-complaint-${item.id}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={s.kind}>{item.kind === "complaint" ? "Complaint / तक्रार" : "Suggestion / सूचना"}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={s.title}>{item.subject}</Text>
          <Text style={s.body}>{item.message}</Text>
          <Text style={s.meta}>by {item.owner_name} · {new Date(item.created_at).toLocaleDateString("en-IN")}</Text>
          {item.status === "open" ? <Btn label="Mark Resolved" variant="primary" onPress={() => resolve(item.id)} style={{ marginTop: 8 }} testID={`admin-resolve-${item.id}`} /> : null}
        </View>
      )}
    />
  );
}

type EItem = { name: string; number: string; group: string };

function Settings() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const rules = useLoad(async () => (await api<{ text: string }>("/rules")).text);
  const em = useLoad(async () => (await api<{ items: EItem[] }>("/emergency")).items);
  const [busy, setBusy] = useState("");
  const save = async (what: "rules" | "emergency") => {
    setBusy(what);
    try {
      if (what === "rules") await api("/admin/rules", { method: "PUT", body: { text: rules.data } });
      else await api("/admin/emergency", { method: "PUT", body: { items: (em.data ?? []).filter((i) => i.name.trim() && i.number.trim()) } });
      toast("Saved / जतन केले");
    } catch (e: any) { toast(e?.message ?? "Failed", "error"); } finally { setBusy(""); }
  };
  if (rules.loading || em.loading) return <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />;
  const items = em.data ?? [];
  const setItem = (i: number, patch: Partial<EItem>) => em.setData(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <Text style={s.h}>Rules / नियमावली</Text>
      <TextField value={rules.data ?? ""} onChangeText={(t) => rules.setData(t)} multiline testID="settings-rules-input" />
      <Btn label="Save Rules" variant="navy" onPress={() => save("rules")} loading={busy === "rules"} testID="settings-rules-save" />
      <Text style={[s.h, { marginTop: 24 }]}>Emergency Numbers / आपत्कालीन क्रमांक</Text>
      {items.map((it, i) => (
        <View key={i} style={s.emRow}>
          <View style={{ flex: 1 }}>
            <TextField value={it.name} onChangeText={(t) => setItem(i, { name: t })} placeholder="Name / नाव" testID={`settings-em-name-${i}`} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><TextField value={it.number} onChangeText={(t) => setItem(i, { number: t })} keyboardType="phone-pad" placeholder="Number" testID={`settings-em-number-${i}`} /></View>
              <View style={{ flex: 1 }}><TextField value={it.group} onChangeText={(t) => setItem(i, { group: t })} placeholder="Group" testID={`settings-em-group-${i}`} /></View>
            </View>
          </View>
          <Pressable onPress={() => em.setData(items.filter((_, j) => j !== i))} hitSlop={8} style={{ padding: 8 }} testID={`settings-em-remove-${i}`}>
            <Icon name="trash-can-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      ))}
      <Btn label="+ Add Number" variant="ghost" onPress={() => em.setData([...items, { name: "", number: "", group: "Community" }])} style={{ marginBottom: 8 }} testID="settings-em-add" />
      <Btn label="Save Emergency Numbers" variant="navy" onPress={() => save("emergency")} loading={busy === "emergency"} testID="settings-em-save" />
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tabRow: { height: 56, justifyContent: "center" },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  meta: { fontSize: 12, color: c.muted },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20, marginVertical: 4 },
  kind: { fontSize: 12, fontWeight: "700", color: c.brand },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary, marginBottom: 8 },
  h: { fontSize: 16, fontWeight: "800", color: c.brand, marginBottom: 10 },
  emRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, borderBottomWidth: 1, borderBottomColor: c.divider, marginBottom: 10 },
}));
