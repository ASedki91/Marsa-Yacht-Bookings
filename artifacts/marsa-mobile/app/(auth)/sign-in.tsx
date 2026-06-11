import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSignIn } from "@clerk/expo/legacy";
import { useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function SignInScreen() {
  useWarmUpBrowser();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { isLoaded, signIn, setActive } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSignIn = async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(home)/(tabs)/explore");
      } else if (result.status === "needs_second_factor") {
        setPendingVerification(true);
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage ?? err?.message ?? "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: "phone_code", code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(home)/(tabs)/explore");
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage ?? "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = useCallback(async () => {
    setError(null);
    try {
      setSsoLoading(true);
      const { createdSessionId, setActive: ssoSetActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
        router.replace("/(home)/(tabs)/explore");
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.longMessage ?? "Could not sign in with Google.");
    } finally {
      setSsoLoading(false);
    }
  }, [startSSOFlow, router]);

  if (pendingVerification) {
    const topPad2 = Platform.OS === "web" ? 67 : insets.top;
    return (
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad2 + 60, paddingHorizontal: 24 }]}>
        <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="shield-checkmark-outline" size={28} color={colors.light.gold} />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>2FA Verification</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>Enter the code sent to your phone</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TextInput
          style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: error ? "#ef4444" : c.border, width: "100%" }]}
          value={code}
          onChangeText={(v) => { setCode(v); setError(null); }}
          placeholder="6-digit code"
          placeholderTextColor={c.mutedForeground}
          keyboardType="numeric"
          maxLength={6}
          autoFocus
        />
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!code || loading) ? 0.6 : 1, width: "100%" }]}
          onPress={handleVerify}
          disabled={!code || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
        </Pressable>
      </View>
    );
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 32, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="boat" size={28} color={colors.light.gold} />
          </View>
          <Text style={[styles.brand, { color: c.foreground }]}>MARSA</Text>
          <Text style={[styles.tagline, { color: c.mutedForeground }]}>El Gouna's Premier Yacht Marketplace</Text>
        </View>

        <Text style={[styles.title, { color: c.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>Sign in to your account</Text>

        <Pressable
          style={[styles.socialBtn, { backgroundColor: c.card, borderColor: c.border, opacity: ssoLoading ? 0.7 : 1 }]}
          onPress={handleGoogle}
          disabled={ssoLoading || loading}
        >
          {ssoLoading ? (
            <ActivityIndicator color={c.foreground} size="small" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#EA4335" />
              <Text style={[styles.socialBtnText, { color: c.foreground }]}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          <Text style={[styles.dividerText, { color: c.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.foreground }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            placeholder="your@email.com"
            placeholderTextColor={c.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.foreground }]}>Password</Text>
          <View>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border, paddingRight: 48 }]}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder="Your password"
              placeholderTextColor={c.mutedForeground}
              secureTextEntry={!showPassword}
              autoComplete="password"
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <Link href="/(auth)/forgot-password" style={{ alignSelf: "flex-end", marginTop: -6 }}>
          <Text style={[styles.linkText, { color: c.primary, fontSize: 13 }]}>Forgot password?</Text>
        </Link>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!email || !password || loading || !isLoaded) ? 0.6 : 1 }]}
          onPress={handleEmailSignIn}
          disabled={!email || !password || loading || !isLoaded}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={[styles.linkText, { color: c.primary }]}>Sign up</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, gap: 14 },
  container: { flex: 1, gap: 16, alignItems: "center" },
  header: { alignItems: "center", gap: 8, marginBottom: 8 },
  logoBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 3 },
  tagline: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  socialBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  socialBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  field: { gap: 6 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  primaryBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
});
