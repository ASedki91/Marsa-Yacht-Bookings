---
name: Clerk Expo v3 API
description: Correct patterns for Clerk Expo v3 auth hooks — use @clerk/expo/legacy for real resource methods
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

**Why:** Clerk v6/@clerk/expo v3 moved `useSignIn`/`useSignUp` to a Signal-based API in the main export. The `/legacy` path preserves the classic resource-based API. The `as any` cast approach fails at runtime because the Signal wrapper object genuinely does not have those methods.

**How to apply:** Any time auth screens use `useSignIn` or `useSignUp`, import from `@clerk/expo/legacy`. The `signUp`/`signIn` values can be `undefined` when not loaded — use optional chaining (`signUp?.method()`).
