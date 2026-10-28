import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Btn, Checkbox, Chip, Icon } from "@/src/components/ui";
import { TextField } from "@/src/components/fields";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (mode === "signup" && password.length < 6) return setError("Password must be at least 6 characters / किमान ६ अक्षरे");
    setBusy(true);
    try {
      if (mode === "login") await login(username.trim(), password, remember);
      else await signup(name.trim(), username.trim(), password, remember);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const ok = username.trim().length >= 3 && password.length > 0 && (mode === "login" || name.trim().length > 0);

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={[s.wrap, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View style={s.emblem}>
        <Icon name="diamond-stone" size={40} color={colors.gold} />
      </View>
      <Text style={s.banner} testID="login-banner">॥ जय श्री संत नरहरी महाराज ॥</Text>
      <Text style={s.app}>Sonar Shehbandh Community</Text>
      <Text style={s.appMr}>सोनार शेहबंध समाज</Text>

      <View style={s.card}>
        <View style={s.tabs}>
          <Chip label="Sign In / लॉग इन" active={mode === "login"} onPress={() => { setMode("login"); setError(""); }} testID="login-tab-signin" />
          <Chip label="Sign Up / नोंदणी" active={mode === "signup"} onPress={() => { setMode("signup"); setError(""); }} testID="login-tab-signup" />
        </View>
        {mode === "signup" ? (
          <TextField label="Full Name / पूर्ण नाव" value={name} onChangeText={setName} required testID="signup-name-input" />
        ) : null}
        <TextField label="Username / वापरकर्ता नाव" value={username} onChangeText={setUsername} required autoCapitalize="none" testID="login-username-input" />
        <TextField label="Password / पासवर्ड" value={password} onChangeText={setPassword} required secureTextEntry autoCapitalize="none" testID="login-password-input" />
        <View style={s.remember}>
          <Checkbox checked={remember} onToggle={() => setRemember((v) => !v)} label="Remember me for 1 month / मला १ महिना लक्षात ठेवा" testID="login-remember-checkbox" />
          <Text style={s.rememberHint}>{remember ? "You'll stay signed in for 30 days on this device." : "You'll be signed out after 24 hours. / २४ तासांनी लॉग आउट होईल."}</Text>
        </View>
        {error ? <Text style={s.error} testID="login-error">{error}</Text> : null}
        <Btn
          label={mode === "login" ? "Sign In / लॉग इन करा" : "Create Account / खाते तयार करा"}
          onPress={submit}
          loading={busy}
          disabled={!ok}
          variant="navy"
          testID="login-submit-button"
        />
      </View>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { paddingHorizontal: 24, alignItems: "stretch" },
  emblem: { alignSelf: "center", width: 80, height: 80, borderRadius: 40, backgroundColor: c.goldSoft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.gold, marginBottom: 16 },
  banner: { fontSize: 19, fontWeight: "800", color: c.brand, textAlign: "center" },
  app: { fontSize: 22, fontWeight: "800", color: c.brandSecondary, textAlign: "center", marginTop: 12 },
  appMr: { fontSize: 15, color: c.muted, textAlign: "center", marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  error: { color: c.error, fontSize: 13, marginBottom: 12 },
  remember: { marginBottom: 12 },
  rememberHint: { fontSize: 12, color: c.muted, marginTop: 4, marginLeft: 4 },
}));
