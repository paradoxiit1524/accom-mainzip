import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, router, useSegments } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth, useApiRequest } from "@/context/AuthContext";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePushNotifications } from "@/hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      gcTime: 30 * 60 * 1000,
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
});

function ScreenCaptureGuard() {
  const { user } = useAuth();
  const request = useApiRequest();
  const isStaff = user?.role && user.role !== "student";

  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !user) return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      request("/timelogs", {
        method: "POST",
        body: JSON.stringify({
          type: "screenshot",
          note: `Screenshot captured by ${user.name} (${user.email}) on mobile device`,
        }),
      }).catch(() => {});
    });
    return () => sub.remove();
  }, [user, request]);

  return null;
}

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  useHeartbeat();
  usePushNotifications();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!user && !inAuthGroup) {
      router.replace("/auth" as any);
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)" as any);
    }
  }, [user, isLoading, segments]);

  return (
    <>
      <ScreenCaptureGuard />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Guard: show the app after fonts load OR after a 3s timeout —
  // whichever comes first. Prevents an infinite white screen when
  // the font CDN is slow or unavailable (e.g. in Expo Go on mobile).
  const [appReady, setAppReady] = useState(false);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        queryClient.invalidateQueries();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    // Fallback: render app after 3 s even if fonts haven't resolved
    const timer = setTimeout(() => {
      setAppReady(true);
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthGuard />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
