import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Btn, Chip, Header, StatusBadge, useToast } from "@/src/components/ui";
import { TextField } from "@/src/components/fields";

type Complaint = { id: string; kind: string; subject: string; message: string; status: string; created_at: string };

export default function Complaints() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [kind, setKind] = useState<"complaint" | "suggestion">("complaint");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = useLoad(() => api<Complaint[]>("/complaints/mine"));

  const submit = async () => {
    setBusy(true);
    try {
      await api("/complaints", { method: "POST", body: { kind, subject, message } });
      toast("Sent to committee / समितीकडे पाठवले");
      setSubject(""); setMessage("");
      mine.reload();
    } catch (e: any) { toast(e?.message ?? "Failed", "error"); } finally { setBusy(false); }
  };

  return (
    <View style={s.root}>
      <Header title="Complaints & Suggestions / तक्रार व सूचना" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={s.card}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Chip label="Complaint / तक्रार" active={kind === "complaint"} onPress={() => setKind("complaint")} testID="complaint-kind-complaint" />
            <Chip label="Suggestion / सूचना" active={kind === "suggestion"} onPress={() => setKind("suggestion")} testID="complaint-kind-suggestion" />
          </View>
          <TextField label="Subject / विषय" value={subject} onChangeText={setSubject} required maxLength={150} testID="complaint-subject-input" />
          <TextField label="Message / संदेश" value={message} onChangeText={setMessage} required multiline maxLength={2000} testID="complaint-message-input" />
          <Btn label="Submit / पाठवा" variant="primary" onPress={submit} loading={busy} disabled={!subject.trim() || !message.trim()} testID="complaint-submit-button" />
        </View>
        <Text style={s.h}>My previous entries / माझ्या नोंदी</Text>
        {(mine.data ?? []).length === 0 ? <Text style={s.muted}>Nothing submitted yet.</Text> : null}
        {(mine.data ?? []).map((c) => (
          <View key={c.id} style={[s.card, { marginBottom: 10, gap: 4 }]} testID={`my-complaint-${c.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.kind}>{c.kind === "complaint" ? "Complaint" : "Suggestion"}</Text>
              <StatusBadge status={c.status} />
            </View>
            <Text style={s.title}>{c.subject}</Text>
            <Text style={s.body}>{c.message}</Text>
          </View>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  card: { padding: 14, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  h: { fontSize: 15, fontWeight: "800", color: c.brand, marginTop: 24, marginBottom: 10 },
  muted: { fontSize: 13, color: c.muted },
  kind: { fontSize: 12, fontWeight: "700", color: c.brand },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
}));
