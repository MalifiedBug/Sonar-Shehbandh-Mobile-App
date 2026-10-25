import React, { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Icon, Sheet, useToast } from "@/src/components/ui";
import { TermsModal } from "@/src/components/TermsModal";
import { MORE_ITEMS, TermsKind } from "@/src/constants";

type Card = { title: string; sub: string; icon: string; badge?: string; terms?: TermsKind; route?: string; testID: string };

const CARDS: Card[] = [
  { title: "Add New Members", sub: "Family Member Registration", icon: "account-group", route: "/directory/member", testID: "dash-card-members" },
  { title: "Social Workers", sub: "Community Help & Volunteers", icon: "hand-heart", terms: "social_worker", testID: "dash-card-social-workers" },
  { title: "Business Directory", sub: "MSME & Shop Act Registration", icon: "store", terms: "business", testID: "dash-card-business" },
  { title: "News", sub: "Live Updates & AI Agent", icon: "newspaper", terms: "news", testID: "dash-card-news" },
  { title: "MATRIMONY", sub: "Marriage Bureau & Biodata", icon: "heart", terms: "matrimony", testID: "dash-card-matrimony" },
  { title: "Events", sub: "Festival & Gatherings", icon: "calendar-star", route: "/events", testID: "dash-card-events" },
  { title: "Notice Board", sub: "Circulars & Updates", icon: "bullhorn", badge: "New", route: "/events?tab=1", testID: "dash-card-notice" },
  { title: "Rules", sub: "Sanstha Bylaws & Constitution", icon: "book-open-variant", route: "/rules", testID: "dash-card-rules" },
  { title: "Emergency numbers", sub: "Police, Ambulance, Fire, Blood", icon: "phone-in-talk", route: "/emergency", testID: "dash-card-emergency" },
];

const LINKS = [
  { label: "Members", icon: "account-multiple", route: "/directory/member", testID: "dash-link-members" },
  { label: "Businesses", icon: "storefront-outline", route: "/directory/business", testID: "dash-link-business" },
  { label: "Social Workers", icon: "hand-heart-outline", route: "/directory/social_worker", testID: "dash-link-social" },
  { label: "Matrimony", icon: "heart-outline", route: "/directory/matrimony", testID: "dash-link-matrimony" },
  { label: "My Submissions", icon: "clipboard-text-outline", route: "/mine", testID: "dash-link-mine" },
];

export default function Dashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const [terms, setTerms] = useState<TermsKind | null>(null);
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const cardW = (Math.min(width, 600) - 32 - 16) / 3;
  const links = user?.role === "admin" ? [{ label: "Admin Panel", icon: "shield-account", route: "/admin", testID: "dash-link-admin" }, ...LINKS] : LINKS;

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.banner} testID="dashboard-header-title">॥ जय श्री संत नरहरी महाराज ॥</Text>
          <Text style={s.app}>Sonar Shehbandh Community / सोनार शेहबंध समाज</Text>
        </View>
        <Pressable style={s.avatarBtn} onPress={() => setMenu(true)} testID="dashboard-profile-button">
          <Icon name="account-circle" size={30} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={s.greet}>
          <Text style={s.greetText} testID="dashboard-greeting">Namaskar, {user?.name} 🙏</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.links}>
          {links.map((l) => (
            <Pressable key={l.label} style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]} onPress={() => router.push(l.route as any)} testID={l.testID}>
              <Icon name={l.icon as any} size={18} color={colors.brandSecondary} />
              <Text style={s.linkText}>{l.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.grid}>
          {CARDS.map((c, i) => (
            <Animated.View key={c.title} entering={FadeInDown.delay(i * 40).duration(300)}>
              <Pressable
                testID={c.testID}
                onPress={() => (c.terms ? setTerms(c.terms) : router.push(c.route as any))}
                style={({ pressed }) => [s.card, { width: cardW }, pressed && { transform: [{ scale: 0.96 }] }]}
              >
                <View style={s.iconWrap}>
                  <Icon name={c.icon as any} size={26} color={colors.brand} />
                </View>
                <Text style={s.cardTitle} numberOfLines={2}>{c.title}</Text>
                <Text style={s.cardSub} numberOfLines={2}>{c.sub}</Text>
                {c.badge ? <View style={s.badge}><Text style={s.badgeText}>{c.badge}</Text></View> : null}
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Pressable onPress={() => setMore(true)} style={({ pressed }) => [s.more, pressed && { opacity: 0.85 }]} testID="dashboard-more-button">
          <Icon name="dots-grid" size={22} color={colors.white} />
          <Text style={s.moreText}>More</Text>
        </Pressable>
      </ScrollView>

      <TermsModal kind={terms} onClose={() => setTerms(null)} />

      <Sheet visible={more} onClose={() => setMore(false)} title="More / अधिक" testID="more-actions-sheet">
        <ScrollView>
          {MORE_ITEMS.map((m) => (
            <Pressable
              key={m.key}
              testID={`more-item-${m.key}`}
              style={({ pressed }) => [s.moreRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setMore(false);
                if (m.key === "complaints") router.push("/complaints");
                else toast("Coming soon / लवकरच उपलब्ध", "info");
              }}
            >
              <View style={s.moreIcon}><Icon name={m.icon as any} size={22} color={colors.brand} /></View>
              <Text style={s.moreRowText}>{m.label}</Text>
              {m.key !== "complaints" ? <Text style={s.soon}>Soon</Text> : <Icon name="chevron-right" size={22} color={colors.muted} />}
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={user?.name} testID="profile-sheet">
        <Text style={s.menuSub}>@{user?.username} · {user?.role === "admin" ? "Committee Admin" : "Member"}</Text>
        <Pressable style={s.moreRow} onPress={() => { setMenu(false); router.push("/mine"); }} testID="profile-my-submissions">
          <View style={s.moreIcon}><Icon name="clipboard-text-outline" size={22} color={colors.brand} /></View>
          <Text style={s.moreRowText}>My Submissions / माझे अर्ज</Text>
        </Pressable>
        <Pressable style={s.moreRow} onPress={() => { setMenu(false); logout(); }} testID="profile-logout-button">
          <View style={s.moreIcon}><Icon name="logout" size={22} color={colors.error} /></View>
          <Text style={[s.moreRowText, { color: colors.error }]}>Logout / बाहेर पडा</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  banner: { fontSize: 19, fontWeight: "bold", color: c.brand, textAlign: "center" },
  app: { fontSize: 11, color: c.muted, textAlign: "center", marginTop: 4 },
  avatarBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  greet: { paddingHorizontal: 16, paddingTop: 16 },
  greetText: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  links: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  linkText: { fontSize: 13, fontWeight: "600", color: c.brandSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, alignSelf: "center", maxWidth: 600 },
  card: { minHeight: 132, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 10, alignItems: "center", shadowColor: c.brand, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  cardTitle: { fontSize: 12.5, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  cardSub: { fontSize: 10.5, color: c.muted, textAlign: "center", marginTop: 3, lineHeight: 14 },
  badge: { position: "absolute", top: 6, right: 6, backgroundColor: c.maroonBright, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: c.white, fontSize: 9, fontWeight: "800" },
  more: { height: 56, borderRadius: 28, backgroundColor: c.brandSecondary, marginHorizontal: 16, marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  moreText: { color: c.white, fontSize: 16, fontWeight: "800" },
  moreRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.divider },
  moreIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  moreRowText: { flex: 1, fontSize: 14, fontWeight: "600", color: c.onSurface },
  soon: { fontSize: 11, fontWeight: "700", color: c.gold, backgroundColor: c.goldSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  menuSub: { fontSize: 13, color: c.muted, marginTop: -8, marginBottom: 8 },
}));
