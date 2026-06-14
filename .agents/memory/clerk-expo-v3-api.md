---
name: Clerk Expo v3 API
description: Correct patterns for Clerk Expo v3 auth (Future/signal API), ClerkProvider setup, Google SSO, and tokenCache in Expo apps
---

## Rule

In Clerk Expo v3 (`@clerk/expo@^3.x`) with a Replit-managed Clerk tenant, build custom email/password + reset flows on the **Future/signal API from the main `@clerk/expo` export** — NOT `@clerk/expo/legacy`. This matches the canonical skill reference (`.local/skills/clerk-auth/references/custom-ui/expo-sdk-email-password.md`). The legacy hooks technically run but their classic flow (`signIn.create({identifier,password})` / `attemptFirstFactor` / `setActive`) silently no-ops on this tenant for plain email/password sign-in and breaks `reset_password_email_code`.

```ts
import { useSignIn, useSignUp, useAuth, useSSO } from "@clerk/expo";

const { signIn } = useSignIn();   // signIn is the SignInFuture signal (always defined)
const { signUp } = useSignUp();   // signUp is the SignUpFuture signal
const { isLoaded } = useAuth();   // Future hooks have NO isLoaded/setActive — gate via useAuth
```

Future API has no `isLoaded`/`setActive`. Every method returns `{ error: ClerkError | null }` (do NOT rely on try/catch alone — check `error`). After an awaited call, read `signIn.status` / `signUp.status` synchronously (canonical pattern). User-facing error text: `err?.errors?.[0]?.longMessage ?? err?.message ?? fallback`.

### Sign-in (email/password)
`signIn.password({ identifier, password })` → if `signIn.status === "complete"` → `signIn.finalize()` (sets active session; `navigate` is optional). `needs_second_factor` → MFA via `signIn.mfa.verifyPhoneCode({ code })` (MFA/phone unsupported on Replit-managed Clerk, so effectively dead).

### Sign-up (email/password)
`signUp.password({ emailAddress, password, unsafeMetadata? })` → `signUp.verifications.sendEmailCode()` → `signUp.verifications.verifyEmailCode({ code })` → if `complete` → `signUp.finalize()`.

### Password reset
`signIn.create({ identifier })` (establishes the identifier — `create` IS defined on the Future signal) → `signIn.resetPasswordEmailCode.sendCode()` → `verifyCode({ code })` (status → `needs_new_password`) → `submitPassword({ password })` (status → `complete`) → `signIn.finalize()`.

## tokenCache

`tokenCache` is NOT exported as a value from `@clerk/expo` v3 (only the `TokenCache` type). Implement with SecureStore:
```ts
import type { TokenCache } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
const tokenCache: TokenCache = {
  getToken: (key) => SecureStore.getItemAsync(key),
  saveToken: (key, token) => SecureStore.setItemAsync(key, token),
  clearToken: (key) => SecureStore.deleteItemAsync(key),
};
```

## ClerkProvider

```tsx
import { ClerkProvider } from "@clerk/expo";
<ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
```
`publishableKey` is REQUIRED — omitting it means Clerk never sets `isLoaded=true`.

## Google SSO (unchanged across legacy/future)

```tsx
import { useSSO } from "@clerk/expo"; // NOT useOAuth
const { startSSOFlow } = useSSO();
const { createdSessionId, setActive } = await startSSOFlow({
  strategy: "oauth_google",
  redirectUrl: AuthSession.makeRedirectUri(),
});
if (createdSessionId && setActive) await setActive({ session: createdSessionId });
```
SSO still returns its own `setActive` — keep using it; it is unrelated to the removed legacy hook `setActive`.

## Auth token for API calls
```tsx
import { setAuthTokenGetter } from "@workspace/api-client-react";
const { getToken } = useAuth();
setAuthTokenGetter(() => getToken()); // call in useEffect inside authenticated layout
```

**Why:** A prior note recommended `@clerk/expo/legacy`, but that classic flow silently failed for email/password sign-in and password reset on the Replit-managed tenant. The canonical Replit Clerk skill builds custom Expo flows on the Future/signal API; aligning with it fixed both bugs.

**How to apply:** Any time auth screens or Clerk setup are added or modified in the Expo app — prefer the Future API and diff against the canonical skill reference, not memory of older patterns.
