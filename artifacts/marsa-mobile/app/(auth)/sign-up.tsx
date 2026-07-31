import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSignUp, useAuth, useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";
import {
  getClerkErrorMessage,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "@/lib/clerkAuth";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signUp } = useSignUp();
  const { isLoaded } = useAuth();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!isLoaded) return;

    const normalizedEmail = normalizeEmailAddress(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setEmail(normalizedEmail);
    setError(null);
    setLoading(true);
    try {
      const { error: pwError } = await signUp.password({
        emailAddress: normalizedEmail,
        password,
        ...(name.trim() ? { unsafeMetadata: { fullName: name.trim() } } : {}),
      });
      if (pwError) {
        setError(
          getClerkErrorMessage(
            pwError,
            "Sign up failed. Please try again.",
          ),
        );
        return;
      }
      const { error: codeError } = await signUp.verifications.sendEmailCode();
      if (codeError) {
        setError(
          getClerkErrorMessage(
            codeError,
            "Could not send verification code.",
          ),
        );
        return;
      }
      setPendingVerification(true);
    } catch (signUpError: unknown) {
      setError(
        getClerkErrorMessage(
          signUpError,
          "Sign up failed. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyError) {
        setError(
          getClerkErrorMessage(
            verifyError,
            "Invalid code. Please try again.",
          ),
        );
        return;
      }
      if (signUp.status === "complete") {
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) {
          setError(
            getClerkErrorMessage(
              finalizeError,
              "Your account was created, but the session could not be started.",
            ),
          );
          return;
        }
        router.replace("/(home)" as any);
      }
    } catch (verificationError: unknown) {
      setError(
        getClerkErrorMessage(
          verificationError,
          "Invalid code. Please try again.",
        ),
      );
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
        router.replace("/(home)" as any);
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
      <View style={[styles.verifyContainer, { backgroundColor: c.background, paddingTop: topPad2 + 60 }]}>
        <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="mail-outline" size={28} color={colors.light.gold} />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>Verify your email</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>We sent a 6-digit code to {email}</Text>
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
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
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify & Create Account</Text>}
        </Pressable>
        <Pressable onPress={() => { setError(null); signUp.verifications.sendEmailCode(); }}>
          <Text style={[styles.linkText, { color: c.primary }]}>Resend code</Text>
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
        <View style={styles.headerRow}>
          <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
            <Ionicons name="boat" size={26} color={colors.light.gold} />
          </View>
          <Text style={[styles.brand, { color: c.foreground }]}>MARSA</Text>
        </View>

        <Text style={[styles.title, { color: c.foreground }]}>Create account</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>Join El Gouna's premier yacht marketplace</Text>

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
          <Text style={[styles.label, { color: c.foreground }]}>Full name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
            value={name}
            onChangeText={(v) => { setName(v); setError(null); }}
            placeholder="Your full name"
            placeholderTextColor={c.mutedForeground}
            autoCapitalize="words"
          />
        </View>

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
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.foreground }]}>Password</Text>
          <View>
            <TextInput
              style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border, paddingRight: 48 }]}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              placeholder="Min. 8 characters"
              placeholderTextColor={c.mutedForeground}
              secureTextEntry={!showPassword}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!email || !password || loading || !isLoaded) ? 0.6 : 1 }]}
          onPress={handleSignUp}
          disabled={!email || !password || loading || !isLoaded}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text style={[styles.linkText, { color: c.primary }]}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, gap: 14 },
  verifyContainer: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  logoBox: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 3 },
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
