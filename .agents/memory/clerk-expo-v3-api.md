---
name: Clerk Expo v3 API
description: Correct patterns for Clerk Expo v3 auth hooks, ClerkProvider setup, Google SSO, and tokenCache in Expo apps
---

## Rule

In Clerk Expo v3 (`@clerk/expo@^3.x`), `useSignIn()` and `useSignUp()` from the **main** `@clerk/expo` export return Signal types — `signUp.prepareEmailAddressVerification`, `signIn.create`, etc. are **undefined at runtime** (not just missing from types). The `as any` cast does NOT fix this.

**Correct fix: import from `@clerk/expo/legacy`**

```ts
import { useSignIn } from "@clerk/expo/legacy";
import { useSignUp } from "@clerk/expo/legacy";
// Keep other things from main export:
import { useSSO, useClerk, useAuth, ClerkProvider } from "@clerk/expo";

// Legacy returns { isLoaded, signIn, setActive } / { isLoaded, signUp, setActive }
// with the real Clerk resource objects — all methods work
const { isLoaded, signUp, setActive } = useSignUp();
const { isLoaded, signIn, setActive } = useSignIn();
```

`@clerk/expo/legacy` is a valid package export (verified in package.json exports map). It re-exports from `@clerk/react/legacy` which returns `client.signUp` / `client.signIn` — the actual resource objects.

## tokenCache

**`tokenCache`** is NOT exported as a value from `@clerk/expo` v3 (only `TokenCache` type). Create a custom cache:
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
<ClerkProvider
  publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
  tokenCache={tokenCache}  // must be custom object, NOT imported from @clerk/expo
>
```

`publishableKey` is REQUIRED — omitting it causes Clerk to never set isLoaded=true.

## Google SSO

```tsx
import { useSSO } from "@clerk/expo"; // NOT useOAuth
const { startSSOFlow } = useSSO();
const { createdSessionId, setActive } = await startSSOFlow({
  strategy: "oauth_google",
  redirectUrl: AuthSession.makeRedirectUri(),
});
if (createdSessionId && setActive) await setActive({ session: createdSessionId });
```

## Auth token for API calls
```tsx
import { setAuthTokenGetter } from "@workspace/api-client-react";
const { getToken } = useAuth();
setAuthTokenGetter(() => getToken()); // call in useEffect inside authenticated layout
```

**Why:** Clerk v6/@clerk/expo v3 moved `useSignIn`/`useSignUp` to a Signal-based API in the main export. The `/legacy` path preserves the classic resource-based API. `tokenCache` is a type-only export in v3 and must be implemented with SecureStore.

**How to apply:** Any time auth screens or Clerk setup are added or modified in the Expo app.
