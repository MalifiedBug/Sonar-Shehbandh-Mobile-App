import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";
import { api, useLoad } from "@/src/api";
import { Btn, Header, Icon, useToast } from "@/src/components/ui";

type Plan = { id: string; rank: number; name: string; price: number; features: string[] };
type PlansRes = { plans: Plan[]; current: { plan: string; expires_at: string } | null };

const ICON: Record<string, string> = { silver: "heart-multiple", gold: "store-check", platinum: "crown" };

export default function Plans() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data, setData, loading } = useLoad(() => api<PlansRes>("/plans"));
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const currentRank = data?.plans.find((p) => p.id === data.current?.plan)?.rank ?? 0;

  const poll = async (orderId: string) => {
    setChecking(orderId);
    for (let i = 0; i < 100 && alive.current; i++) {
      try {
        const r = await api<{ status: string; subscription: PlansRes["current"] }>(`/payments/${orderId}`);
        if (r.status === "PAID") {
          setData((d) => (d ? { ...d, current: r.subscription } : d));
          toast("Payment successful — plan active! / योजना सुरू झाली");
          setChecking(null);
          return;
        }
        if (["EXPIRED", "AMOUNT_MISMATCH"].includes(r.status)) break;
      } catch {
        // keep trying; network can blip while returning from the browser
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
    if (alive.current) {
      setChecking(null);
      toast("Payment not completed. If money was deducted, it will reflect shortly.", "info");
    }
  };

  const buy = async (plan: Plan) => {
    setBusy(plan.id);
    try {
      const o = await api<{ order_id: string; checkout_url: string }>("/payments/order", { method: "POST", body: { plan: plan.id } });
      await WebBrowser.openBrowserAsync(o.checkout_url);
      poll(o.order_id);
    } catch (e: any) {
      toast(e?.message ?? "Could not start payment", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.root}>
      <Header title="Membership Plans / सदस्यता योजना" subtitle="Secure payment by Razorpay" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }} testID="plans-screen">
          {data?.current ? (
            <View style={s.active} testID="plans-current">
              <Icon name="check-decagram" size={22} color={colors.success} />
              <Text style={s.activeText}>
                Active: {data.plans.find((p) => p.id === data.current!.plan)?.name} · valid till{" "}
                {new Date(data.current.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </Text>
            </View>
          ) : null}
          {checking ? (
            <View style={s.checking} testID="plans-checking">
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={s.checkingText}>Waiting for payment confirmation… / पेमेंटची पुष्टी होत आहे</Text>
            </View>
          ) : null}
          {(data?.plans ?? []).map((p) => {
            const owned = currentRank >= p.rank;
            const best = p.id === "gold";
            return (
              <View key={p.id} style={[s.card, best && s.cardBest]} testID={`plan-card-${p.id}`}>
                {best ? <View style={s.ribbon}><Text style={s.ribbonText}>MOST POPULAR</Text></View> : null}
                <View style={s.head}>
                  <View style={s.icon}><Icon name={ICON[p.id] as any} size={26} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{p.name}</Text>
                    <Text style={s.price} testID={`plan-price-${p.id}`}>₹{p.price}<Text style={s.per}> / year</Text></Text>
                  </View>
                </View>
                {p.features.map((f) => (
                  <View key={f} style={s.feat}>
                    <Icon name="check-circle" size={18} color={colors.success} />
                    <Text style={s.featText}>{f}</Text>
                  </View>
                ))}
                <Btn
                  label={owned ? "Included in your plan" : currentRank ? `Upgrade · Pay ₹${p.price}` : `Buy · Pay ₹${p.price}`}
                  variant={best ? "maroon" : "primary"}
                  disabled={owned || !!checking}
                  loading={busy === p.id}
                  onPress={() => buy(p)}
                  style={{ marginTop: 8 }}
                  testID={`plan-buy-${p.id}`}
                />
              </View>
            );
          })}
          <Text style={s.note}>Payments are processed securely by Razorpay (UPI, cards, net banking, wallets). Prices include all charges. Plans renew manually after 1 year.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  active: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 12, backgroundColor: c.successSoft },
  activeText: { flex: 1, color: c.success, fontWeight: "700", fontSize: 13 },
  checking: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 12, backgroundColor: c.translitBg },
  checkingText: { flex: 1, color: c.onTranslit, fontWeight: "600", fontSize: 13 },
  card: { padding: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 8 },
  cardBest: { borderColor: c.gold, borderWidth: 2, backgroundColor: c.goldSoft },
  ribbon: { position: "absolute", top: -1, right: 16, backgroundColor: c.gold, paddingHorizontal: 8, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  ribbonText: { color: c.white, fontSize: 10, fontWeight: "800" },
  head: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 4 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "800", color: c.onSurface },
  price: { fontSize: 24, fontWeight: "800", color: c.brand, marginTop: 2 },
  per: { fontSize: 13, fontWeight: "600", color: c.muted },
  feat: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  featText: { flex: 1, fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  note: { fontSize: 12, color: c.muted, textAlign: "center", lineHeight: 18 },
}));
