---
name: Clerk Expo v3 setup
description: Correct @clerk/expo v3 API for ClerkProvider, sign-in, sign-up, and Google SSO in Expo apps
---

# Clerk Expo v3 Wiring

**Why:** The old ClerkProvider import pattern and auth screen API methods don't match @clerk/expo v3, causing a stuck loading spinner with no errors.

## ClerkProvider (app/_layout.tsx)
```tsx
import { ClerkProvider, tokenCache } from "@clerk/expo"; // tokenCache from main package, NOT @clerk/expo/token-cache

<ClerkProvider
  publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
  tokenCache={tokenCache}
>
```

`publishableKey` is REQUIRED — omitting it causes Clerk to never set isLoaded=true.

## Sign In
```tsx
const { signIn, setActive, isLoaded } = useSignIn();
const result = await signIn!.create({ identifier: email, password });
if (result.status === "complete") await setActive!({ session: result.createdSessionId });
```

## Sign Up (with email verification)
```tsx
const { signUp, setActive, isLoaded } = useSignUp();
await signUp!.create({ emailAddress: email, password, firstName, lastName });
await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
// After user enters code:
const result = await signUp!.attemptEmailAddressVerification({ code });
if (result.status === "complete") await setActive!({ session: result.createdSessionId });
```

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

**How to apply:** Any time auth screens or Clerk setup are added or modified in the Expo app.
