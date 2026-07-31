import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSignIn, useAuth } from "@clerk/expo";
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

type Stage = "email" | "code";

export default function ForgotPasswordScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signIn } = useSignIn();
  const { isLoaded } = useAuth();

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!isLoaded || !email) return;

    const normalizedEmail = normalizeEmailAddress(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    setEmail(normalizedEmail);
    setLoading(true);
    try {
      const { error: createError } = await signIn.create({
        identifier: normalizedEmail,
      });
      if (createError) {
        Alert.alert(
          "Error",
          getClerkErrorMessage(
            createError,
            "Could not send reset email.",
          ),
        );
        return;
      }
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        Alert.alert(
          "Error",
          getClerkErrorMessage(
            sendError,
            "Could not send reset email.",
          ),
        );
        return;
      }
      setStage("code");
    } catch (resetError: unknown) {
      Alert.alert(
        "Error",
        getClerkErrorMessage(
          resetError,
          "Could not send reset email.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!isLoaded || !code || !newPassword) return;
    setLoading(true);
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyError) {
        Alert.alert(
          "Error",
          getClerkErrorMessage(
            verifyError,
            "Invalid code or password.",
          ),
        );
        return;
      }
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
      if (submitError) {
        Alert.alert(
          "Error",
          getClerkErrorMessage(
            submitError,
            "Invalid code or password.",
          ),
        );
        return;
      }
      if (signIn.status === "complete") {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          Alert.alert(
            "Error",
            getClerkErrorMessage(
              finalizeError,
              "Your password was changed, but the session could not be started.",
            ),
          );
          return;
        }
        router.replace("/(home)" as any);
      }
    } catch (resetError: unknown) {
      Alert.alert(
        "Error",
        getClerkErrorMessage(
          resetError,
          "Invalid code or password.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={c.foreground} />
        </Pressable>

        <View style={[styles.iconBox, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.light.gold} />
        </View>

        <Text style={[styles.title, { color: c.foreground }]}>
          {stage === "email" ? "Forgot password?" : "Reset password"}
        </Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
          {stage === "email"
            ? "Enter your email and we'll send a reset code"
            : `Enter the code sent to ${email} and choose a new password`}
        </Text>

        {stage === "email" ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Email address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={c.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
              />
            </View>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!email || loading) ? 0.6 : 1 }]}
              onPress={sendCode}
              disabled={!email || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Reset Code</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>Reset code</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border }]}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={c.mutedForeground}
                keyboardType="numeric"
                maxLength={6}
                autoFocus
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.foreground }]}>New password</Text>
              <View>
                <TextInput
                  style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: c.border, paddingRight: 48 }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
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
              style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!code || !newPassword || loading) ? 0.6 : 1 }]}
              onPress={resetPassword}
              disabled={!code || !newPassword || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset Password</Text>}
            </Pressable>
            <Pressable onPress={() => setStage("email")} style={{ alignSelf: "center" }}>
              <Text style={[styles.linkText, { color: c.primary }]}>Resend code</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>Remember your password? </Text>
          <Link href="/(auth)/sign-in">
            <Text style={[styles.linkText, { color: c.primary }]}>Sign in</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, gap: 16 },
  backBtn: { alignSelf: "flex-start", padding: 4, marginBottom: 8 },
  iconBox: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center" },
  primaryBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", marginTop: 8 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
