import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Btn, Empty, Header, Sheet, StatusBadge, useToast } from "@/src/components/ui";
import { Reg, RegistrationView } from "@/src/components/RegistrationView";
import { FORMS } from "@/src/forms";

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data, setData, loading, error } = useLoad(() => api<Reg>(`/registrations/${id}`), [id]);
  const [sheet, setSheet] = useState<"reject" | "remove" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === "admin";

  const act = async (kind: "approve" | "reject" | "remove") => {
    setBusy(true);
    try {
      if (kind === "remove") {
        await api(`/admin/registrations/${id}`, { method: "DELETE" });
        toast("Listing removed / काढून टाकले");
        setSheet(null);
        router.back();
        return;
      }
      const r = await api<Reg>(`/admin/registrations/${id}/${kind}`, { method: "POST", body: kind === "reject" ? { reason } : undefined });
      setData(r);
      setSheet(null);
      toast(kind === "approve" ? "Approved / मंजूर" : "Rejected / नामंजूर", kind === "approve" ? "success" : "info");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Header title={data ? FORMS[data.type]?.dirTitle ?? "Details" : "Details / तपशील"} right={data ? <View style={{ paddingRight: 8 }}><StatusBadge status={data.status} /></View> : undefined} />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : error || !data ? (
        <Empty text={error ?? "Not found"} icon="alert-circle-outline" />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} testID="detail-screen">
            {data.status === "rejected" && data.reject_reason ? <Text style={s.reason}>Reason: {data.reject_reason}</Text> : null}
            <RegistrationView reg={data} />
            {(data as any).locked ? (
              <View style={s.lock} testID="detail-locked-card">
                <Text style={s.lockTitle}>{data.type === "business" ? "🔒 Contact details are for plan members" : "🔒 Full biodata is for Matrimony Plus members"}</Text>
                <Text style={s.lockText}>
                  {data.type === "business"
                    ? "Get the phone, WhatsApp and email of every community business. / संपर्क तपशील पाहण्यासाठी योजना घ्या."
                    : "See all photos, family background, relatives and partner expectations of every profile. / संपूर्ण बायोडाटा पाहण्यासाठी योजना घ्या."}
                </Text>
                <Btn label="View Plans / योजना पहा" variant="maroon" onPress={() => router.push("/plans")} testID="detail-unlock-button" />
              </View>
            ) : null}
          </ScrollView>
          {isAdmin ? (
            <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
              {data.status !== "approved" ? <Btn label="Approve / मंजूर" variant="primary" onPress={() => act("approve")} loading={busy} style={{ flex: 1 }} testID="admin-approve-button" /> : null}
              {data.status !== "rejected" ? <Btn label="Reject / नामंजूर" variant="danger" onPress={() => setSheet("reject")} style={{ flex: 1 }} testID="admin-reject-button" /> : null}
              <Btn label="Remove" variant="ghost" icon="trash-can-outline" onPress={() => setSheet("remove")} style={{ flex: 0.8 }} testID="admin-remove-button" />
            </View>
          ) : null}
        </>
      )}
      <Sheet visible={sheet === "reject"} onClose={() => setSheet(null)} title="Reject entry / नामंजूर करा" testID="reject-sheet">
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason (optional) / कारण" placeholderTextColor={colors.muted} style={s.input} multiline testID="reject-reason-input" />
        <Btn label="Confirm Reject / नामंजूर करा" variant="maroon" onPress={() => act("reject")} loading={busy} testID="reject-confirm-button" />
      </Sheet>
      <Sheet visible={sheet === "remove"} onClose={() => setSheet(null)} title="Remove this listing? / काढून टाकायचे?" testID="remove-sheet">
        <Text style={s.sheetText}>This permanently deletes the entry for everyone.</Text>
        <Btn label="Remove permanently" variant="maroon" onPress={() => act("remove")} loading={busy} testID="remove-confirm-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  footer: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
  reason: { backgroundColor: c.errorSoft, color: c.error, padding: 12, borderRadius: 12, marginBottom: 12, fontSize: 13 },
  input: { minHeight: 90, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 15, color: c.onSurface, backgroundColor: c.white, marginBottom: 12, textAlignVertical: "top" },
  sheetText: { fontSize: 14, color: c.onSurfaceSecondary, marginBottom: 12 },
  lock: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.gold, gap: 8 },
  lockTitle: { fontSize: 15, fontWeight: "800", color: c.brand },
  lockText: { fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 19 },
}));
