---
name: Clerk Expo v3 API
description: Correct patterns for Clerk Expo v3 Signal-based auth hooks and token cache setup
---

## Rule

In Clerk Expo v3 (`@clerk/expo@^3.x`), `useSignIn()` and `useSignUp()` return Signal types (`SignInSignalValue` / `SignUpSignalValue`) with only `{ errors, fetchStatus, signIn/signUp }`. There is no `setActive` or `isLoaded` on these hooks.

**Correct pattern:**
```ts
import { useSignIn, useClerk, useAuth, useSSO } from "@clerk/expo";

const { signIn: signInResource } = useSignIn();
const { setActive } = useClerk();      // setActive lives on useClerk()
const { isLoaded } = useAuth();         // isLoaded lives on useAuth()
const signIn = signInResource as any;  // cast to use old runtime methods
```

The runtime JS still supports old methods (`signIn.create`, `signIn.attemptFirstFactor`, `signUp.prepareEmailAddressVerification`, `signUp.attemptEmailAddressVerification`, etc.) — they just aren't in the TypeScript types. Casting as `any` is the pragmatic fix.

**`tokenCache`** is NOT exported as a value from `@clerk/expo` v3. Only `TokenCache` (the type) is exported. Create a custom cache:
```ts
import { ClerkProvider } from "@clerk/expo";
import type { TokenCache } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";

const tokenCache: TokenCache = {
  getToken: (key) => SecureStore.getItemAsync(key),
  saveToken: (key, token) => SecureStore.setItemAsync(key, token),
  clearToken: (key) => SecureStore.deleteItemAsync(key),
};
```

**Why:** Clerk v6/@clerk/expo v3 introduced Signal-based types as their "Future API" for better reactivity. The runtime is backward-compatible but TypeScript types no longer expose the old destructuring pattern.

**How to apply:** Any time Clerk auth screens are written or updated for this project, use this pattern. Add `@clerk/react` as a direct dependency if you need the old `useSignIn` return types without casting.
