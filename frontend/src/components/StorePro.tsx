// Store subscription card (RevenueCat "Pro"): Google Play / App Store on phones, simulated Test Store in previews.
import React, { useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { makeStyles, useTheme } from "@/src/theme";
import { Btn, Icon, Sheet, useToast } from "@/src/components/ui";
import { rcSimulated, useSubscription } from "@/src/revenuecat";

const PERKS = [
  "Full biodata and all photos of every matrimony profile",
  "Phone, WhatsApp and email of every business in the directory",
  "Unlimited shortlisting of profiles",
  "Auto-renews every year — cancel anytime in your store account",
];

export function StoreProCard() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const sub = useSubscription();
  const [confirm, setConfirm] = useState<PurchasesPackage | null>(null);
  if (!sub) return null;

  const pkgs = sub.offerings?.current?.availablePackages ?? [];
  const pkg = pkgs.find((p) => p.packageType === "ANNUAL") ?? pkgs[0];
  const price = pkg?.product.priceString;

  const doBuy = async (p: PurchasesPackage) => {
    setConfirm(null);
    try {
      await sub.purchase(p);
      toast("Pro is active! / प्रो सुरू झाले");
    } catch (e: any) {
      if (e?.userCancelled) return;
      toast(e?.message === "identity_not_ready" ? "Please wait, linking your account… try again" : e?.message ?? "Purchase failed", "error");
    }
  };
  const doRestore = async () => {
    try {
      const info = await sub.restore();
      toast(info.entitlements.active.pro ? "Pro restored / प्रो पुन्हा सुरू" : "No active Pro subscription found", "info");
    } catch (e: any) {
      toast(e?.message ?? "Restore failed", "error");
    }
  };
  const manage = () =>
    Linking.openURL(sub.customerInfo?.managementURL ?? (Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions"));

  return (
    <View style={[s.card, sub.isSubscribed && s.cardActive]} testID="store-pro-card">
      <View style={s.head}>
        <View style={s.icon}><Icon name="star-circle" size={26} color={colors.gold} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>Sonar Pro / सोनार प्रो</Text>
          <Text style={s.price} testID="store-pro-price">{price ?? "—"}<Text style={s.per}> / year</Text></Text>
        </View>
        {rcSimulated ? <Text style={s.sim} testID="store-pro-simulated">SIMULATED</Text> : null}
      </View>
      {PERKS.map((f) => (
        <View key={f} style={s.feat}>
          <Icon name="check-circle" size={18} color={colors.success} />
          <Text style={s.featText}>{f}</Text>
        </View>
      ))}
      {sub.identityError ? <Text style={s.err} testID="store-pro-identity-error">Could not link purchases to your account: {sub.identityError}</Text> : null}
      {sub.isSubscribed ? (
        <>
          <View style={s.active}><Icon name="check-decagram" size={20} color={colors.success} /><Text style={s.activeText}>Pro is active on this account</Text></View>
          {!rcSimulated ? <Btn label="Manage subscription" variant="ghost" onPress={manage} testID="store-pro-manage" /> : null}
        </>
      ) : sub.isLoading ? (
        <Text style={s.muted}>Loading store prices…</Text>
      ) : !pkg ? (
        <Text style={s.muted} testID="store-pro-unavailable">Subscription options are unavailable right now. Please try again later.</Text>
      ) : (
        <Btn
          label={`Subscribe · ${price}`}
          variant="maroon"
          loading={sub.isPurchasing}
          disabled={!sub.identityReady}
          onPress={() => (rcSimulated ? setConfirm(pkg) : doBuy(pkg))}
          style={{ marginTop: 8 }}
          testID="store-pro-subscribe"
        />
      )}
      <Btn label="Restore purchases / खरेदी पुनर्संचयित करा" variant="ghost" loading={sub.isRestoring} onPress={doRestore} style={{ marginTop: 8 }} testID="store-pro-restore" />
      <Text style={s.note}>
        {rcSimulated ? "Test Store: no real money is charged in this preview." : `Billed by ${Platform.OS === "ios" ? "the App Store" : "Google Play"}. Renews yearly unless cancelled 24 hours before renewal.`}
      </Text>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title="Simulated purchase" testID="store-pro-confirm-sheet">
        <Text style={s.featText}>This is a Test Store purchase for previewing the flow. No real money will be charged.</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <Btn label="Cancel" variant="ghost" onPress={() => setConfirm(null)} style={{ flex: 1 }} testID="store-pro-confirm-cancel" />
          <Btn label={`Buy ${price ?? ""}`} variant="maroon" onPress={() => confirm && doBuy(confirm)} style={{ flex: 1 }} testID="store-pro-confirm-buy" />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 20, borderWidth: 2, borderColor: c.gold, padding: 16, gap: 8 },
  cardActive: { borderColor: c.success },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: c.goldSoft, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 17, fontWeight: "800", color: c.onSurface },
  price: { fontSize: 22, fontWeight: "800", color: c.brand, marginTop: 2 },
  per: { fontSize: 13, fontWeight: "600", color: c.muted },
  sim: { fontSize: 10, fontWeight: "800", color: c.gold, backgroundColor: c.goldSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  feat: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  featText: { flex: 1, fontSize: 13.5, color: c.onSurfaceSecondary, lineHeight: 19 },
  err: { fontSize: 12.5, color: c.error, fontWeight: "600" },
  active: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  activeText: { fontSize: 14, fontWeight: "700", color: c.success },
  muted: { fontSize: 13, color: c.muted, marginTop: 8 },
  note: { fontSize: 11.5, color: c.muted, textAlign: "center", marginTop: 4, lineHeight: 16 },
}));
