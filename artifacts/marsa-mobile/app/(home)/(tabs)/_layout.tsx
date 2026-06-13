import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, useColorScheme, Pressable } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";

export default function TabLayout() {
  const { isHost } = useUser();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_700Bold", fontSize: 18 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/(home)/notifications")}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.foreground} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: "MARSA",
          tabBarLabel: "Explore",
          tabBarIcon: ({ color }) => <Feather name="compass" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "My Bookings",
          tabBarIcon: ({ color }) => <Feather name="calendar" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="yachts"
        options={{
          title: "My Yachts",
          tabBarIcon: ({ color }) => <Ionicons name="boat-outline" size={22} color={color} />,
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color }) => <Ionicons name="cash-outline" size={22} color={color} />,
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
