import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { COLORS, SERIF_FONT } from "../theme";

export default function HerboLogo({ size = 56, showSubtitle = true }) {
  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="30" fill="none" stroke={COLORS.gold500} strokeWidth="1.5" />
        <Circle cx="46" cy="18" r="3" fill={COLORS.gold300} />
        <Path
          d="M32 14 L52 48 H12 Z"
          fill="none"
          stroke={COLORS.gold500}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <Path
          d="M32 14 V48 M32 28 L25 48 M32 28 L39 48"
          stroke={COLORS.gold500}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <Path d="M8 48 H56" stroke={COLORS.earth500} strokeWidth="2" strokeLinecap="round" />
      </Svg>
      <View style={styles.wordmark}>
        <Text style={styles.brand}>HERBO</Text>
        {showSubtitle && <Text style={styles.sub}>HOTEL · GLAMPING</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wordmark: {
    justifyContent: "center",
  },
  brand: {
    fontFamily: SERIF_FONT,
    color: COLORS.gold300,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 3,
  },
  sub: {
    color: COLORS.gold500,
    fontSize: 10,
    letterSpacing: 3.5,
    marginTop: 2,
  },
});
