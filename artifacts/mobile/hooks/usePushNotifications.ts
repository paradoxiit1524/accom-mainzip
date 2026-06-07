import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuth, useApiRequest } from "@/context/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token.data;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { user, token: authToken } = useAuth();
  const request = useApiRequest();

  useEffect(() => {
    if (!user || !authToken) return;

    let cancelled = false;

    (async () => {
      const pushToken = await getExpoPushToken();
      if (!pushToken || cancelled) return;

      try {
        await request("/notifications/register-token", {
          method: "POST",
          body: JSON.stringify({ pushToken }),
        });
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [user?.id, authToken]);
}
