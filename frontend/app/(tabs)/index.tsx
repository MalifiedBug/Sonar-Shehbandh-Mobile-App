import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { elevation, makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { Icon, useToast } from "@/src/components/ui";
import { Badge, Card, Initials, Overline, SectionHead, Skeleton, tap, timeAgo, useDirectoryCounts } from "@/src/components/kit";
import { RemoteImage } from "@/src/components/photo";
import { RegisterCTA } from "@/src/components/RegisterCTA";
import { TermsModal } from "@/src/components/TermsModal";
import { TermsKind } from "@/src/constants";
import { FORMS } from "@/src/forms";
import { api, useLoad } from "@/src/api";
import type { Post } from "@/app/news";
import type { Reg } from "@/src/components/RegistrationView";

type Action = { title: string; icon: string; terms?: TermsKind; route?: string; dot?: boolean; testID: string };

const DAY = 86400000;
const isNew = (iso?: string) => !!iso && Date.now() - new Date(iso).getTime() < 7 * DAY;
const parseDate = (d?: string) => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? null : new Date(t);
};

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [terms, setTerms] = useState<TermsKind | null>(null);
  const toast = useToast();

  const unread = useLoad(() => api<{ count: number }>("/notifications/unread-count")).data?.count ?? 0;
  const feed = useLoad(async () => {
    const [events, notices, news, businesses] = await Promise.all([
      api<Post[]>("/posts?kind=event").catch(() => [] as Post[]),
      api<Post[]>("/posts?kind=notice").catch(() => [] as Post[]),
      api<Post[]>("/posts?kind=news").catch(() => [] as Post[]),
      api<Reg[]>("/registrations?type=business").catch(() => [] as Reg[]),
    ]);
    return { events, notices, news, businesses };
  });
  const counts = useDirectoryCounts();
  const d = feed.data;

  // Pinned hero: the next upcoming event, otherwise the most recent one.
  const hero = useMemo(() => {
    if (!d?.events.length) return null;
    const today = new Date(new Date().toDateString()).getTime();
    const upcoming = d.events
      .map((e) => ({ e, t: parseDate(e.event_date)?.getTime() ?? null }))
      .filter((x) => x.t !== null && x.t >= today)
      .sort((a, b) => a.t! - b.t!);
    return upcoming[0]?.e ?? d.events[0];
  }, [d]);
  const updates = useMemo(
    () => (d ? [...d.notices, ...d.news].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4) : []),
    [d],
  );
  const featured = (d?.businesses ?? []).slice(0, 6);

  const actions: Action[] = [
    { title: "Add New Members", icon: "account-group", route: "/directory/member", testID: "dash-card-members" },
    { title: "Social Workers", icon: "hand-heart", route: "/directory/social_worker", testID: "dash-card-social-workers" },
    { title: "Business Directory", icon: "store", route: "/directory/business", testID: "dash-card-business" },
    { title: "News", icon: "newspaper", terms: "news", dot: d?.news.some((n) => isNew(n.created_at)), testID: "dash-card-news" },
    { title: "Matrimony", icon: "heart", route: "/matrimony", testID: "dash-card-matrimony" },
    { title: "Events", icon: "calendar-star", route: "/events", testID: "dash-card-events" },
    { title: "Notice Board", icon: "bullhorn", route: "/events?tab=1", dot: d?.notices.some((n) => isNew(n.created_at)), testID: "dash-card-notice" },
    { title: "Rules", icon: "book-open-variant", route: "/rules", testID: "dash-card-rules" },
    { title: "Emergency numbers", icon: "phone-in-talk", route: "/emergency", testID: "dash-card-emergency" },
    { title: "Plans", icon: "crown-outline", route: "/plans", testID: "dash-link-plans" },
    { title: "My Submissions", icon: "clipboard-text-outline", route: "/mine", testID: "dash-link-mine" },
    ...(user?.role === "admin" ? [{ title: "Admin Panel", icon: "shield-account", route: "/admin", testID: "dash-link-admin" }] : []),
  ];
  const tileW = (Math.min(width, 600) - 32 - 3 * 8) / 4;
  const open = (a: Action) => {
    tap();
    if (a.terms) setTerms(a.terms);
    else router.push(a.route as any);
  };

  const heroDate = parseDate(hero?.event_date);
  const daysLeft = heroDate ? Math.round((heroDate.getTime() - new Date(new Date().toDateString()).getTime()) / DAY) : null;

  return (
    <View style={s.root}>
      {/* Persistent top bar */}
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.push("/profile")} hitSlop={6} testID="dashboard-profile-button">
          <Initials name={user?.name} size={40} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Overline text="Namaskar 🙏" />
          <Text style={s.hello} numberOfLines={1} testID="dashboard-greeting">{user?.name}</Text>
        </View>
        <Pressable style={s.bell} onPress={() => router.push("/notifications")} testID="dashboard-bell-button">
          <Icon name={unread ? "bell-ring-outline" : "bell-outline"} size={24} color={colors.brandSecondary} />
          {unread ? (
            <View style={s.bellBadge} testID="dashboard-bell-badge">
              <Text style={s.bellBadgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => { feed.reload(); counts.reload(); }} tintColor={colors.brand} />}
      >
        <Text style={s.banner} testID="dashboard-header-title">॥ जय श्री संत नरहरी महाराज ॥</Text>
        <Text style={s.app}>Sonar Shehbandh Community / सोनार शेहबंध समाज</Text>

        {/* Pinned hero anchor */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          {feed.loading ? (
            <Skeleton height={190} radius={24} />
          ) : hero ? (
            <Pressable onPress={() => router.push(`/post/${hero.id}` as any)} style={({ pressed }) => [s.hero, pressed && { opacity: 0.95 }]} testID="home-hero-event">
              <View style={s.heroTop}>
                <View style={s.pinRow}>
                  <Icon name="pin" size={14} color={colors.goldSoft} />
                  <Overline text={daysLeft !== null && daysLeft >= 0 ? "Pinned · Upcoming event" : "Pinned · Latest event"} color={colors.goldSoft} />
                </View>
                {daysLeft !== null && daysLeft >= 0 && daysLeft <= 1 ? (
                  <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>{daysLeft === 0 ? "TODAY" : "TOMORROW"}</Text></View>
                ) : null}
              </View>
              <View style={s.heroBody}>
                {heroDate ? (
                  <View style={s.dateBadge}>
                    <Text style={s.dateDay}>{heroDate.getDate()}</Text>
                    <Text style={s.dateMon}>{heroDate.toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={s.heroTitle} numberOfLines={2}>{hero.title}</Text>
                  {hero.location ? (
                    <View style={s.heroMeta}><Icon name="map-marker-outline" size={14} color="rgba(255,255,255,0.8)" /><Text style={s.heroMetaText} numberOfLines={1}>{hero.location}</Text></View>
                  ) : null}
                  {daysLeft !== null && daysLeft > 1 ? <Text style={s.countdown}><Text style={s.countNum}>{daysLeft}</Text> days to go</Text> : null}
                </View>
              </View>
              <View style={s.heroActions}>
                <View style={[s.heroBtn, s.heroBtnPrimary]}><Text style={[s.heroBtnText, { color: colors.brandSecondary }]}>View Details</Text></View>
                <Pressable onPress={() => router.push("/events")} style={[s.heroBtn, s.heroBtnGhost]} testID="home-hero-all-events">
                  <Text style={s.heroBtnText}>All Events</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <View style={s.hero} testID="home-hero-welcome">
              <Overline text="Welcome" color={colors.goldSoft} />
              <Text style={[s.heroTitle, { marginTop: 8 }]}>One community, one app</Text>
              <Text style={s.heroMetaText}>Events and gatherings announced by the committee will be pinned here.</Text>
              <View style={s.heroActions}>
                <Pressable onPress={() => router.push("/community")} style={[s.heroBtn, s.heroBtnPrimary]} testID="home-hero-explore"><Text style={[s.heroBtnText, { color: colors.brandSecondary }]}>Explore Directory</Text></Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Quick action launcher */}
        <SectionHead title="Quick access" />
        <View style={s.grid}>
          {actions.map((a, i) => (
            <Animated.View key={a.testID} entering={FadeInDown.delay(i * 25).duration(260)}>
              <Pressable onPress={() => open(a)} style={({ pressed }) => [s.tile, { width: tileW }, pressed && { transform: [{ scale: 0.94 }] }]} testID={a.testID}>
                <View style={s.tileIcon}>
                  <Icon name={a.icon as any} size={24} color={a.icon === "phone-in-talk" ? colors.error : colors.brand} />
                  {a.dot ? <View style={s.tileDot} /> : null}
                </View>
                <Text style={s.tileText} numberOfLines={2}>{a.title}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* Metrics */}
        <SectionHead title="Community at a glance" action="Directory" onAction={() => router.push("/community")} />
        <View style={s.metrics}>
          {[
            { k: "member", label: "Families", icon: "account-group" },
            { k: "business", label: "Businesses", icon: "store" },
            { k: "social_worker", label: "Social Workers", icon: "hand-heart" },
          ].map((m) => (
            <Pressable key={m.k} style={s.metric} onPress={() => router.push(`/directory/${m.k}` as any)} testID={`home-metric-${m.k}`}>
              <Icon name={m.icon as any} size={18} color={colors.brandPrimary} />
              {counts.loading ? <Skeleton width={40} height={28} style={{ marginTop: 6 }} /> : <Text style={s.metricNum}>{counts.data?.[m.k] ?? 0}</Text>}
              <Text style={s.metricLabel}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Feed: official notices & news */}
        <SectionHead title="Latest updates" action="See all" onAction={() => router.push("/events?tab=1")} />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {feed.loading ? (
            [0, 1].map((i) => <Skeleton key={i} height={130} radius={20} />)
          ) : updates.length ? (
            updates.map((p) => (
              <Card key={p.id} onPress={() => router.push(`/post/${p.id}` as any)} testID={`home-update-${p.id}`}>
                <View style={s.authorRow}>
                  <View style={[s.authorIcon, p.kind === "news" && { backgroundColor: "#E7ECF2" }]}>
                    <Icon name={p.kind === "notice" ? "bullhorn" : "newspaper"} size={18} color={p.kind === "notice" ? colors.brand : colors.brandSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={s.author} numberOfLines={1}>Sanstha Committee</Text>
                      <Icon name="check-decagram" size={14} color={colors.success} />
                    </View>
                    <Text style={s.authorRole}>Official · {timeAgo(p.created_at)}</Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    onPress={async () => {
                      try {
                        await Share.share({ message: `${p.title}\n\n${p.body}` });
                      } catch {
                        toast("Sharing isn't available here / शेअर उपलब्ध नाही", "info");
                      }
                    }}
                    style={s.share}
                    testID={`home-update-share-${p.id}`}
                  >
                    <Icon name="share-variant-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
                  <Badge label={p.kind === "notice" ? "Notice" : "News"} tone={p.kind === "notice" ? "brand" : "navy"} />
                  {p.level ? <Badge label={p.level} tone="gold" /> : null}
                  {isNew(p.created_at) ? <Badge label="New" tone="success" /> : null}
                </View>
                <Text style={s.postTitle} numberOfLines={2}>{p.title}</Text>
                <Text style={s.postBody} numberOfLines={2}>{p.body}</Text>
                <Text style={s.readMore}>Read more →</Text>
              </Card>
            ))
          ) : (
            <Card><Text style={s.emptyText}>No notices or news yet. Updates from the committee will appear here.</Text></Card>
          )}
        </View>

        {/* Businesses */}
        {featured.length ? (
          <>
            <SectionHead title="Community businesses" action="View all" onAction={() => router.push("/directory/business")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {featured.map((b) => {
                const pk = FORMS.business.photos[0]?.key;
                const photo = pk ? b.photos?.[pk] : undefined;
                return (
                  <Pressable key={b.id} onPress={() => router.push(`/detail/${b.id}` as any)} style={({ pressed }) => [s.biz, pressed && { opacity: 0.9 }]} testID={`home-business-${b.id}`}>
                    {photo ? <RemoteImage path={photo.path} zoom={photo.zoom} style={s.bizImg} /> : <View style={[s.bizImg, s.bizImgEmpty]}><Icon name="storefront-outline" size={32} color={colors.borderStrong} /></View>}
                    <View style={{ padding: 12, gap: 4 }}>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        <Badge label="Local Partner" icon="check-decagram" tone="success" />
                        {(b as any).featured ? <Badge label="Featured" tone="gold" /> : null}
                      </View>
                      <Text style={s.bizTitle} numberOfLines={1}>{b.title}</Text>
                      <Text style={s.bizSub} numberOfLines={1}>{FORMS.business.subtitle(b.data ?? {})}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <RegisterCTA />
      </ScrollView>

      <TermsModal kind={terms} onClose={() => setTerms(null)} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.divider },
  hello: { fontSize: 17, fontWeight: "800", color: c.onSurface, letterSpacing: -0.2, marginTop: 1 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  bellBadge: { position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.error, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.surfaceSecondary },
  bellBadgeText: { color: c.white, fontSize: 10, fontWeight: "800" },
  banner: { fontSize: 18, fontWeight: "800", color: c.brand, textAlign: "center", marginTop: 20 },
  app: { fontSize: 11.5, color: c.muted, textAlign: "center", marginTop: 4 },
  hero: { borderRadius: 24, padding: 18, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: "rgba(184,134,11,0.45)", ...elevation },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  live: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "rgba(46,125,50,0.25)" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#6FCF7F" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#B9F0C2", letterSpacing: 0.8 },
  heroBody: { flexDirection: "row", gap: 14, marginTop: 14, alignItems: "center" },
  dateBadge: { width: 60, height: 66, borderRadius: 16, backgroundColor: c.goldSoft, alignItems: "center", justifyContent: "center" },
  dateDay: { fontSize: 26, fontWeight: "800", color: c.brand, lineHeight: 30 },
  dateMon: { fontSize: 11, fontWeight: "800", color: c.gold, letterSpacing: 1 },
  heroTitle: { fontSize: 19, fontWeight: "800", color: c.white, lineHeight: 25, letterSpacing: -0.3 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  heroMetaText: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 6, lineHeight: 18 },
  countdown: { fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginTop: 6 },
  countNum: { fontSize: 15, fontWeight: "800", color: c.goldSoft },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  heroBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  heroBtnPrimary: { backgroundColor: c.goldSoft },
  heroBtnGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  heroBtnText: { fontSize: 13.5, fontWeight: "800", color: c.white },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, rowGap: 16 },
  tile: { alignItems: "center", gap: 8 },
  tileIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider, alignItems: "center", justifyContent: "center", ...elevation },
  tileDot: { position: "absolute", top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: c.error, borderWidth: 1.5, borderColor: c.surfaceSecondary },
  tileText: { fontSize: 11.5, fontWeight: "600", color: c.onSurfaceSecondary, textAlign: "center", lineHeight: 15 },
  metrics: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  metric: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider },
  metricNum: { fontSize: 26, fontWeight: "800", color: c.brandSecondary, marginTop: 6, letterSpacing: -0.5 },
  metricLabel: { fontSize: 11.5, fontWeight: "600", color: c.muted, marginTop: 2 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  author: { fontSize: 13.5, fontWeight: "700", color: c.onSurface },
  authorRole: { fontSize: 11.5, color: c.muted, marginTop: 1 },
  share: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  postTitle: { fontSize: 15.5, fontWeight: "800", color: c.onSurface, marginTop: 10, lineHeight: 21 },
  postBody: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: 4, lineHeight: 19 },
  readMore: { fontSize: 12.5, fontWeight: "700", color: c.brandPrimary, marginTop: 10 },
  emptyText: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 19 },
  biz: { width: 220, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider, overflow: "hidden" },
  bizImg: { width: "100%", height: 110 },
  bizImgEmpty: { backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  bizTitle: { fontSize: 14.5, fontWeight: "800", color: c.onSurface, marginTop: 4 },
  bizSub: { fontSize: 12, color: c.muted },
}));
