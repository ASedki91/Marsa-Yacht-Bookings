import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, useRouter } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, useColorScheme, Pressable } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";

function NativeTabLayout({ isHost }: { isHost: boolean }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "safari", selected: "safari.fill" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bookings">
        <Icon sf={{ default: "calendar", selected: "calendar" }} />
        <Label>Bookings</Label>
      </NativeTabs.Trigger>
      {isHost && (
        <NativeTabs.Trigger name="dashboard">
          <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
          <Label>Dashboard</Label>
        </NativeTabs.Trigger>
      )}
      {isHost && (
        <NativeTabs.Trigger name="yachts">
          <Icon sf={{ default: "ferry", selected: "ferry.fill" }} />
          <Label>My Yachts</Label>
        </NativeTabs.Trigger>
      )}
      {isHost && (
        <NativeTabs.Trigger name="earnings">
          <Icon sf={{ default: "banknote", selected: "banknote.fill" }} />
          <Label>Earnings</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ isHost }: { isHost: boolean }) {
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
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="safari" tintColor={color} size={24} />
            ) : (
              <Feather name="compass" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "My Bookings",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="calendar" tintColor={color} size={24} />
            ) : (
              <Feather name="calendar" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.bar.fill" tintColor={color} size={24} />
            ) : (
              <Ionicons name="grid-outline" size={22} color={color} />
            ),
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="yachts"
        options={{
          title: "My Yachts",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="ferry" tintColor={color} size={24} />
            ) : (
              <Ionicons name="boat-outline" size={22} color={color} />
            ),
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.bar.fill" tintColor={color} size={24} />
            ) : (
              <Ionicons name="cash-outline" size={22} color={color} />
            ),
          tabBarButton: isHost ? undefined : () => null,
          tabBarItemStyle: isHost ? {} : { display: "none", width: 0 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.fill" tintColor={color} size={24} />
            ) : (
              <Ionicons name="person-outline" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isHost } = useUser();

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout isHost={isHost} />;
  }
  return <ClassicTabLayout isHost={isHost} />;
}
