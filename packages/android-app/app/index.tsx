import { Redirect } from "expo-router";
import { useAppSelector } from "../src/hooks/useTypedDispatch";

export default function Index() {
  const { isAuthenticated, hasCheckedAuth } = useAppSelector(
    (state) => state.auth
  );

  if (!hasCheckedAuth) return null;

  return <Redirect href={isAuthenticated ? "/(tabs)" : "/(auth)/login"} />;
}
