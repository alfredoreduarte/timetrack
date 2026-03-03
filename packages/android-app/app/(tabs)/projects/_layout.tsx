import { Stack } from "expo-router";
import { colors } from "../../../src/theme/colors";

export default function ProjectsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    />
  );
}
