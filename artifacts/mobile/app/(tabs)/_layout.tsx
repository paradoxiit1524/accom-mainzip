import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

let BlurView: any = null;
if (Platform.OS === "ios") {
  try {
    BlurView = require("expo-blur").BlurView;
  } catch {}
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const isIOS = Platform.OS === "ios";
  const { isStudent } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : theme.navBg,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          elevation: 0,
        },
        tabBarBackground: () =>
          isIOS && BlurView ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.navBg }]} />
          ),
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: -2 },
      }}
    >
      {/* Home — all roles */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />

      {/* Attendance (staff) / My Status (student) — same screen, adapts by role */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: isStudent ? "My Status" : "Attendance",
          tabBarIcon: ({ color }) => <Feather name={isStudent ? "activity" : "check-square"} size={22} color={color} />,
        }}
      />

      {/* Inventory — staff only; hidden for students */}
      <Tabs.Screen
        name="inventory"
        options={{
          href: isStudent ? null : undefined,
          title: "Inventory",
          tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
        }}
      />

      {/* Mess Card — staff only; hidden for students */}
      <Tabs.Screen
        name="mess-card"
        options={{
          href: isStudent ? null : undefined,
          title: "Mess Card",
          tabBarIcon: ({ color }) => <Feather name="credit-card" size={22} color={color} />,
        }}
      />

      {/* Notifications — students only (staff use profile tools menu) */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: isStudent ? undefined : null,
          title: "Alerts",
          tabBarIcon: ({ color }) => <Feather name="bell" size={22} color={color} />,
        }}
      />

      {/* Profile — all roles */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />

      {/* Hidden — accessible via deep links but not in tab bar */}
      <Tabs.Screen name="hostel" options={{ href: null }} />
      <Tabs.Screen name="lostandfound" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {},
});
