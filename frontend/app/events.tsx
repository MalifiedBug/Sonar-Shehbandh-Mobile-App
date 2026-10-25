import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { makeStyles } from "@/src/theme";
import { Header } from "@/src/components/ui";
import { PostList } from "@/app/news";

export default function Events() {
  const s = useStyles();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [idx, setIdx] = useState(tab === "1" ? 1 : 0);
  return (
    <View style={s.root}>
      <Header title="Events & Notice Board" subtitle="कार्यक्रम व सूचना फलक" />
      <View style={s.seg}>
        {["Events / कार्यक्रम", "Notice Board / सूचना फलक"].map((l, i) => (
          <Pressable key={l} onPress={() => setIdx(i)} style={[s.segBtn, idx === i && s.segSel]} testID={`events-tab-${i}`}>
            <Text style={[s.segText, idx === i && s.segTextSel]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {idx === 0 ? (
        <PostList key="event" kind="event" emptyText="No upcoming events / कार्यक्रम नाहीत" />
      ) : (
        <PostList key="notice" kind="notice" emptyText="No circulars yet / सूचना नाहीत" />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  seg: { flexDirection: "row", margin: 16, marginBottom: 0, padding: 4, borderRadius: 14, backgroundColor: c.surfaceTertiary },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segSel: { backgroundColor: c.brand },
  segText: { fontSize: 13, fontWeight: "700", color: c.onSurfaceTertiary },
  segTextSel: { color: c.onBrand },
}));
