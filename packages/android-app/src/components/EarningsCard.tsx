import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing, borderRadius, fontSize } from "../theme/spacing";
import { formatReportsDuration } from "../utils/dateTime";

interface EarningsCardProps {
  title: string;
  earnings: number;
  duration: number;
}

export const EarningsCard = ({ title, earnings, duration }: EarningsCardProps) => (
  <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.earnings}>${earnings.toFixed(2)}</Text>
    <Text style={styles.duration}>{formatReportsDuration(duration)}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  earnings: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xs,
  },
  duration: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
});
