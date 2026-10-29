import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { makeStyles, useTheme } from "@/src/theme";
import { Header, Icon } from "@/src/components/ui";
import { Card, Overline, SectionHead, Skeleton, useDirectoryCounts } from "@/src/components/kit";
import { RegisterCTA } from "@/src/components/RegisterCTA";

const DIRS = [
  { type: "member", title: "Family Members", mr: "कुटुंब सदस्य", sub: "Family Member Registration", icon: "account-group" },
  { type: "business", title: "Business Directory", mr: "व्यवसाय निर्देशिका", sub: "MSME & Shop Act Registration", icon: "store" },
  { type: "social_worker", title: "Social Workers", mr: "समाजसेवक", sub: "Community Help & Volunteers", icon: "hand-heart" },
];

const ESSENTIALS = [
  { title: "Emergency numbers", sub: "Police, Ambulance, Fire, Blood", icon: "phone-in-talk", route: "/emergency", tone: "error" },
  { title: "Rules", sub: "Sanstha Bylaws & Constitution", icon: "book-open-variant", route: "/rules", tone: "navy" },
  { title: "Events", sub: "Festival & Gatherings", icon: "calendar-star", route: "/events", tone: "teal" },
];

export default function Community() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: counts, loading } = useDirectoryCounts();

  return (
    <View style={s.root}>
      <Header hideBack title="Directory / निर्देशिका" subtitle="Verified community listings / मंजूर नोंदी" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <SectionHead title="Browse directories" />
        <View style={s.list}>
          {DIRS.map((d) => (
            <Card key={d.type} onPress={() => router.push(`/directory/${d.type}` as any)} style={s.dir} testID={`community-dir-${d.type}`}>
              <View style={s.dirIcon}><Icon name={d.icon as any} size={26} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.dirTitle}>{d.title}</Text>
                <Text style={s.dirMr}>{d.mr}</Text>
                <Text style={s.dirSub}>{d.sub}</Text>
              </View>
              <View style={s.metric}>
                {loading ? <Skeleton width={36} height={24} /> : <Text style={s.metricNum} testID={`community-count-${d.type}`}>{counts?.[d.type] ?? 0}</Text>}
                <Overline text="Listed" color={colors.muted} style={{ fontSize: 9 }} />
              </View>
            </Card>
          ))}
        </View>

        <SectionHead title="Essentials" />
        <View style={s.list}>
          {ESSENTIALS.map((e) => (
            <Pressable key={e.route} onPress={() => router.push(e.route as any)} style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]} testID={`community-essential-${e.route.slice(1)}`}>
              <View style={[s.rowIcon, e.tone === "error" && { backgroundColor: colors.errorSoft }]}>
                <Icon name={e.icon as any} size={20} color={e.tone === "error" ? colors.error : e.tone === "teal" ? colors.brandPrimary : colors.brandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{e.title}</Text>
                <Text style={s.rowSub}>{e.sub}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <RegisterCTA />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { paddingHorizontal: 16, gap: 12 },
  dir: { flexDirection: "row", alignItems: "center", gap: 14 },
  dirIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  dirTitle: { fontSize: 15.5, fontWeight: "800", color: c.onSurface },
  dirMr: { fontSize: 12.5, color: c.brand, marginTop: 1, fontWeight: "600" },
  dirSub: { fontSize: 12, color: c.muted, marginTop: 3 },
  metric: { alignItems: "flex-end", minWidth: 48 },
  metricNum: { fontSize: 26, fontWeight: "800", color: c.brandSecondary, letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E7ECF2", alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
