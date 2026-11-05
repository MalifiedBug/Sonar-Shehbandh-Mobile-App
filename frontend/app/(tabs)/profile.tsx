import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api, legalUrl, useLoad } from "@/src/api";
import { Btn, Icon, Sheet, useToast } from "@/src/components/ui";
import { TextField } from "@/src/components/fields";
import { Badge, Card, Initials, Overline } from "@/src/components/kit";
import { MORE_ITEMS } from "@/src/constants";

type PlansRes = { plans: { id: string; name: string }[]; current: { plan: string; expires_at: string } | null };

function Row({ icon, label, sub, onPress, danger, right, testID }: { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean; right?: React.ReactNode; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]} testID={testID}>
      <View style={[s.rowIcon, danger && { backgroundColor: colors.errorSoft }]}><Icon name={icon as any} size={20} color={danger ? colors.error : colors.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowText, danger && { color: colors.error }]}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right ?? <Icon name="chevron-right" size={22} color={colors.muted} />}
    </Pressable>
  );
}

export default function Profile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, logout } = useAuth();
  const { data: plans } = useLoad(() => api<PlansRes>("/plans"));
  const plan = plans?.current ? plans.plans.find((p) => p.id === plans.current!.plan) : null;
  const isAdmin = user?.role === "admin";
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api("/users/me", { method: "DELETE" });
      setConfirm(false);
      toast("Your account has been deleted / खाते हटवले", "success");
      await logout();
    } catch (e: any) {
      toast(e?.message ?? "Could not delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <Card style={s.hero} testID="profile-card">
        <Initials name={user?.name} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.name} numberOfLines={1}>{user?.name}</Text>
          <Text style={s.handle}>@{user?.username}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <Badge label={isAdmin ? "Committee Admin" : "Verified Member"} icon="check-decagram" tone="success" testID="profile-role-badge" />
            {plan ? <Badge label={`${plan.name} Plan`} icon="crown" tone="gold" testID="profile-plan-badge" /> : null}
          </View>
        </View>
      </Card>

      <Overline text="My account" color={colors.muted} style={s.group} />
      <View style={s.box}>
        <Row icon="clipboard-text-outline" label="My Submissions / माझे अर्ज" onPress={() => router.push("/mine")} testID="profile-my-submissions" />
        <Row
          icon="crown-outline"
          label="Membership Plans / योजना"
          sub={plan ? `Active until ${new Date(plans!.current!.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Unlock full biodata & business contacts"}
          onPress={() => router.push("/plans")}
          testID="profile-plans"
        />
        {isAdmin ? <Row icon="shield-account" label="Admin Panel" sub="Approve or reject submissions" onPress={() => router.push("/admin")} testID="profile-admin-panel" /> : null}
      </View>

      <Overline text="Services" color={colors.muted} style={s.group} />
      <View style={s.box}>
        {MORE_ITEMS.map((m) => (
          <Row
            key={m.key}
            icon={m.icon}
            label={m.label}
            onPress={() => (m.key === "complaints" ? router.push("/complaints") : toast("Coming soon / लवकरच उपलब्ध", "info"))}
            right={m.key === "complaints" ? undefined : <Text style={s.soon}>Soon</Text>}
            testID={`more-item-${m.key}`}
          />
        ))}
      </View>

      <View style={[s.box, { marginTop: 24 }]}>
        <Row icon="shield-lock-outline" label="Privacy Policy / गोपनीयता धोरण" onPress={() => WebBrowser.openBrowserAsync(legalUrl("privacy"))} testID="profile-privacy-policy" />
        <Row icon="file-document-outline" label="Terms of Service / सेवा अटी" onPress={() => WebBrowser.openBrowserAsync(legalUrl("terms"))} testID="profile-terms" />
      </View>

      <View style={[s.box, { marginTop: 24 }]}>
        <Row icon="logout" label="Logout / बाहेर पडा" danger onPress={logout} right={<View />} testID="profile-logout-button" />
        {isAdmin ? null : (
          <Row icon="account-remove-outline" label="Delete Account / खाते हटवा" sub="Permanently remove your account and all data" danger onPress={() => setConfirm(true)} right={<View />} testID="profile-delete-account-button" />
        )}
      </View>

      <Sheet visible={confirm} onClose={() => { setConfirm(false); setTyped(""); }} title="Delete account permanently? / खाते कायमचे हटवायचे?" testID="delete-account-sheet">
        <Text style={s.warn}>
          This deletes your login, all your registrations (family, matrimony, business, social worker), uploaded photos, shortlists, notifications, complaints and plan records. This cannot be undone. / ही क्रिया परत घेता येणार नाही.
        </Text>
        <TextField label="Type DELETE to confirm / पुष्टीसाठी DELETE लिहा" value={typed} onChangeText={setTyped} autoCapitalize="characters" testID="delete-account-confirm-input" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn label="Cancel / रद्द" variant="ghost" onPress={() => { setConfirm(false); setTyped(""); }} style={{ flex: 1 }} testID="delete-account-cancel" />
          <Btn label="Delete permanently" variant="danger" loading={deleting} disabled={typed.trim() !== "DELETE"} onPress={deleteAccount} style={{ flex: 1 }} testID="delete-account-confirm" />
        </View>
      </Sheet>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 16 },
  name: { fontSize: 20, fontWeight: "800", color: c.onSurface, letterSpacing: -0.3 },
  handle: { fontSize: 13, color: c.muted },
  group: { marginHorizontal: 20, marginTop: 24, marginBottom: 8 },
  box: { marginHorizontal: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowText: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  soon: { fontSize: 10.5, fontWeight: "800", color: c.gold, backgroundColor: c.goldSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  warn: { fontSize: 13.5, lineHeight: 20, color: c.onSurfaceSecondary, marginBottom: 12 },
}));
