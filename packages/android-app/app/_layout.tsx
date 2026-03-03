import React, { useEffect, useState, useCallback } from "react";
import { View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { Provider } from "react-redux";
import * as SplashScreen from "expo-splash-screen";
import Toast from "react-native-toast-message";
import { store } from "../src/store";
import {
  rehydrateAuth,
  getCurrentUser,
} from "../src/store/slices/authSlice";
import { setOnUnauthorized } from "../src/services/api";
import { useAppSelector, useAppDispatch } from "../src/hooks/useTypedDispatch";

SplashScreen.preventAutoHideAsync().catch(() => {});

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const dispatch = useAppDispatch();
  const { isAuthenticated, hasCheckedAuth } = useAppSelector(
    (state) => state.auth
  );
  const [appIsReady, setAppIsReady] = useState(false);

  // Rehydrate auth on mount
  useEffect(() => {
    async function prepare() {
      try {
        await dispatch(rehydrateAuth());
      } catch {
        // Rehydration failed — will show login
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, [dispatch]);

  // Safety net: always hide splash after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Hide splash once the root view lays out
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  // Validate token by fetching current user
  useEffect(() => {
    if (appIsReady && isAuthenticated) {
      dispatch(getCurrentUser()).catch(() => {});
    }
  }, [appIsReady, isAuthenticated, dispatch]);

  // Set up 401 handler
  useEffect(() => {
    setOnUnauthorized(() => {
      store.dispatch({ type: "auth/logout/fulfilled" });
      router.replace("/(auth)/login");
    });
  }, [router]);

  // Redirect based on auth state
  useEffect(() => {
    if (!appIsReady || !hasCheckedAuth) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, hasCheckedAuth, segments, appIsReady, router]);

  // Return null while loading — native splash stays visible
  if (!appIsReady) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <AuthGate />
      <Toast />
    </Provider>
  );
}
