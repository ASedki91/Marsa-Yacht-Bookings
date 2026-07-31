import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import { useSignIn, useAuth, useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import colors from "@/constants/colors";
import { devBypass } from "@/lib/devBypass";
import {
  getClerkErrorMessage,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "@/lib/clerkAuth";

WebBrowser.maybeCompleteAuthSession();

type VerificationStrategy =
  | "email_code"
  | "mfa_email"
  | "mfa_phone"
  | "mfa_totp"
  | "mfa_backup_code";

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

  const { signIn, fetchStatus } = useSignIn();
  const { isLoaded } = useAuth();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [verificationStrategy, setVerificationStrategy] =
    useState<VerificationStrategy | null>(null);
  const [verificationDestination, setVerificationDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isBusy = loading || fetchStatus === "fetching";

  const finalizeSignIn = async () => {
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) {
      setError(
        getClerkErrorMessage(
          finalizeError,
          "Your session could not be started. Please try again.",
        ),
      );
      return false;
    }

    router.replace("/(home)" as any);
    return true;
  };

  const prepareSecondFactor = async () => {
    const emailFactor = signIn.supportedSecondFactors.find(
      (factor) => factor.strategy === "email_code",
    );
    if (emailFactor) {
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) {
        setError(
          getClerkErrorMessage(
            sendError,
            "Could not send the verification code.",
          ),
        );
        return;
      }
      setCode("");
      setVerificationDestination(emailFactor.safeIdentifier);
      setVerificationStrategy("mfa_email");
      return;
    }

    const phoneFactor = signIn.supportedSecondFactors.find(
      (factor) => factor.strategy === "phone_code",
    );
    if (phoneFactor) {
      const { error: sendError } = await signIn.mfa.sendPhoneCode();
      if (sendError) {
        setError(
          getClerkErrorMessage(
            sendError,
            "Could not send the verification code.",
          ),
        );
        return;
      }
      setCode("");
      setVerificationDestination(phoneFactor.safeIdentifier);
      setVerificationStrategy("mfa_phone");
      return;
    }

    if (
      signIn.supportedSecondFactors.some(
        (factor) => factor.strategy === "totp",
      )
    ) {
      setCode("");
      setVerificationDestination("");
      setVerificationStrategy("mfa_totp");
      return;
    }

    if (
      signIn.supportedSecondFactors.some(
        (factor) => factor.strategy === "backup_code",
      )
    ) {
      setCode("");
      setVerificationDestination("");
      setVerificationStrategy("mfa_backup_code");
      return;
    }

    setError(
      "This account requires a verification method that is not available in the app. Please contact support.",
    );
  };

  const handleSignInStatus = async () => {
    switch (signIn.status) {
      case "complete":
        await finalizeSignIn();
        break;
      case "needs_second_factor":
      case "needs_client_trust":
        await prepareSecondFactor();
        break;
      case "needs_new_password":
        setError(
          'This account needs a new password. Use "Forgot password?" to continue.',
        );
        break;
      case "needs_first_factor":
        setError(
          "Password sign-in is not available for this account. Try an email sign-in code instead.",
        );
        break;
      default:
        setError(
          "Your sign-in needs an additional step that is not available. Please start again.",
        );
    }
  };

  const handleEmailSignIn = async () => {
    if (!isLoaded || !signIn) return;

    const normalizedEmail = normalizeEmailAddress(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setEmail(normalizedEmail);
    setError(null);
    setLoading(true);
    try {
      const { error: identifierError } = await signIn.create({
        identifier: normalizedEmail,
      });
      if (identifierError) {
        setError(
          getClerkErrorMessage(
            identifierError,
            "We could not find an account with that email address.",
          ),
        );
        return;
      }

      const supportsPassword = signIn.supportedFirstFactors.some(
        (factor) => factor.strategy === "password",
      );
      if (!supportsPassword) {
        setError(
          "This account does not currently support password sign-in. Use an email sign-in code or reset the password.",
        );
        return;
      }

      const { error: pwError } = await signIn.password({ password });
      if (pwError) {
        setError(
          getClerkErrorMessage(
            pwError,
            "The email address or password is incorrect.",
          ),
        );
        return;
      }

      await handleSignInStatus();
    } catch (signInError: unknown) {
      setError(
        getClerkErrorMessage(
          signInError,
          "Sign in failed. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailCodeSignIn = async () => {
    if (!isLoaded || !signIn) return;

    const normalizedEmail = normalizeEmailAddress(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setEmail(normalizedEmail);
    setError(null);
    setLoading(true);
    try {
      const { error: identifierError } = await signIn.create({
        identifier: normalizedEmail,
      });
      if (identifierError) {
        setError(
          getClerkErrorMessage(
            identifierError,
            "We could not start email sign-in for that address.",
          ),
        );
        return;
      }

      const emailFactor = signIn.supportedFirstFactors.find(
        (factor) => factor.strategy === "email_code",
      );
      if (!emailFactor) {
        setError("Email code sign-in is not enabled for this account.");
        return;
      }

      const { error: sendError } = await signIn.emailCode.sendCode();
      if (sendError) {
        setError(
          getClerkErrorMessage(
            sendError,
            "Could not send the sign-in code.",
          ),
        );
        return;
      }

      setCode("");
      setVerificationDestination(emailFactor.safeIdentifier);
      setVerificationStrategy("email_code");
    } catch (emailCodeError: unknown) {
      setError(
        getClerkErrorMessage(
          emailCodeError,
          "Could not send the sign-in code.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signIn || !verificationStrategy) return;
    setError(null);
    setLoading(true);
    try {
      const result =
        verificationStrategy === "email_code"
          ? await signIn.emailCode.verifyCode({ code })
          : verificationStrategy === "mfa_email"
            ? await signIn.mfa.verifyEmailCode({ code })
            : verificationStrategy === "mfa_phone"
              ? await signIn.mfa.verifyPhoneCode({ code })
              : verificationStrategy === "mfa_totp"
                ? await signIn.mfa.verifyTOTP({ code })
                : await signIn.mfa.verifyBackupCode({ code });

      if (result.error) {
        setError(
          getClerkErrorMessage(
            result.error,
            "That verification code is not valid.",
          ),
        );
        return;
      }

      await handleSignInStatus();
    } catch (verificationError: unknown) {
      setError(
        getClerkErrorMessage(
          verificationError,
          "That verification code is not valid.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!verificationStrategy) return;
    setError(null);
    setLoading(true);
    try {
      const result =
        verificationStrategy === "email_code"
          ? await signIn.emailCode.sendCode()
          : verificationStrategy === "mfa_email"
            ? await signIn.mfa.sendEmailCode()
            : verificationStrategy === "mfa_phone"
              ? await signIn.mfa.sendPhoneCode()
              : null;

      if (result?.error) {
        setError(
          getClerkErrorMessage(
            result.error,
            "Could not send a new verification code.",
          ),
        );
      }
    } catch (resendError: unknown) {
      setError(
        getClerkErrorMessage(
          resendError,
          "Could not send a new verification code.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = async () => {
    await signIn.reset();
    setCode("");
    setError(null);
    setVerificationDestination("");
    setVerificationStrategy(null);
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
    } catch (googleError: unknown) {
      setError(
        getClerkErrorMessage(
          googleError,
          "Could not sign in with Google.",
        ),
      );
    } finally {
      setSsoLoading(false);
    }
  }, [startSSOFlow, router]);

  if (verificationStrategy) {
    const topPad2 = Platform.OS === "web" ? 67 : insets.top;
    const isBackupCode = verificationStrategy === "mfa_backup_code";
    const verificationCopy =
      verificationStrategy === "mfa_totp"
        ? "Enter the code from your authenticator app."
        : isBackupCode
          ? "Enter one of your saved backup codes."
          : `Enter the code sent to ${verificationDestination || "your account"}.`;
    const canResend = [
      "email_code",
      "mfa_email",
      "mfa_phone",
    ].includes(verificationStrategy);

    return (
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad2 + 60, paddingHorizontal: 24 }]}>
        <View style={[styles.logoBox, { backgroundColor: colors.light.navy }]}>
          <Ionicons name="shield-checkmark-outline" size={28} color={colors.light.gold} />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>Verify your sign-in</Text>
        <Text style={[styles.subtitle, styles.verificationCopy, { color: c.mutedForeground }]}>
          {verificationCopy}
        </Text>
        {error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <TextInput
          style={[styles.input, { backgroundColor: c.input, color: c.foreground, borderColor: error ? "#ef4444" : c.border, width: "100%" }]}
          value={code}
          onChangeText={(v) => { setCode(v); setError(null); }}
          placeholder={isBackupCode ? "Backup code" : "6-digit code"}
          placeholderTextColor={c.mutedForeground}
          keyboardType={isBackupCode ? "default" : "numeric"}
          maxLength={isBackupCode ? undefined : 6}
          autoCapitalize="none"
          autoComplete="one-time-code"
          autoFocus
        />
        <Pressable
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!code || isBusy) ? 0.6 : 1, width: "100%" }]}
          onPress={handleVerify}
          disabled={!code || isBusy}
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
        </Pressable>
        {canResend && (
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={handleResendCode}
            style={styles.textButton}
          >
            <Text style={[styles.linkText, { color: c.primary }]}>Send a new code</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={handleStartOver}
          style={styles.textButton}
        >
          <Text style={[styles.linkText, { color: c.mutedForeground }]}>Start over</Text>
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
          accessibilityRole="button"
          style={[styles.socialBtn, { backgroundColor: c.card, borderColor: c.border, opacity: (ssoLoading || isBusy) ? 0.7 : 1 }]}
          onPress={handleGoogle}
          disabled={ssoLoading || isBusy}
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
            autoCorrect={false}
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
              autoComplete="current-password"
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
          accessibilityRole="button"
          style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: (!email || !password || isBusy || !isLoaded || !signIn) ? 0.6 : 1 }]}
          onPress={handleEmailSignIn}
          disabled={!email || !password || isBusy || !isLoaded || !signIn}
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.emailCodeBtn,
            {
              borderColor: c.border,
              backgroundColor: c.card,
              opacity: (!email || isBusy || !isLoaded || !signIn) ? 0.6 : 1,
            },
          ]}
          onPress={handleEmailCodeSignIn}
          disabled={!email || isBusy || !isLoaded || !signIn}
        >
          <Ionicons name="mail-outline" size={18} color={c.primary} />
          <Text style={[styles.emailCodeBtnText, { color: c.foreground }]}>
            Sign in with an email code
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.mutedForeground }]}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text style={[styles.linkText, { color: c.primary }]}>Sign up</Text>
          </Link>
        </View>

        {__DEV__ && (
          <Pressable
            style={[styles.devBtn]}
            onPress={() => {
              devBypass.enable();
              router.replace("/(home)" as any);
            }}
          >
            <Ionicons name="construct-outline" size={14} color="#6b7280" />
            <Text style={styles.devBtnText}>Dev: Skip Sign In</Text>
          </Pressable>
        )}
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
  verificationCopy: { textAlign: "center", lineHeight: 20 },
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
  emailCodeBtn: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  emailCodeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  textButton: { paddingHorizontal: 12, paddingVertical: 6 },
  footer: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  linkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  errorBox: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { color: "#ef4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  devBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 4, opacity: 0.6 },
  devBtnText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6b7280" },
});
