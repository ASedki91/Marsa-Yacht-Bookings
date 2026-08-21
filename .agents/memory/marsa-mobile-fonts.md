---
name: MARSA mobile font stack
description: Which @expo-google-fonts packages the mobile app uses and what each face is for.
---

# MARSA Mobile Font Stack

The mobile app uses four Google Fonts families, all loaded in `app/_layout.tsx` via `useFonts()`. The admin app uses the matching `@fontsource/*` packages from `src/main.tsx`.

| Package | Weights loaded | Role |
|---|---|---|
| `@expo-google-fonts/hanken-grotesk` | 400, 500, 600, 700 | UI / body text (replaces Inter) |
| `@expo-google-fonts/marcellus` | 400 | Wordmark / display headings |
| `@expo-google-fonts/space-mono` | 400, 700 | Labels / detail text / monospace |
| `@expo-google-fonts/tajawal` | 400, 500, 700 | Arabic text |

All four Expo packages must be present in `artifacts/marsa-mobile/package.json` and installed. The four admin packages must be present in `artifacts/marsa-admin/package.json` and installed.
If Metro throws "Unable to resolve module @expo-google-fonts/…" or Vite throws "Failed to resolve import @fontsource/…", run the filtered workspace install:

```bash
pnpm install --filter @workspace/marsa-mobile
pnpm install --filter @workspace/marsa-admin
```

then restart the affected workflow. The packages can be declared in the manifests and lockfile but still be absent from `node_modules` after a merge.

**Why:** Added at the UI identity checkpoint (2026-08-17) to match the MARSA brand from marsa-identity-standalone.vercel.app. Hanken Grotesk replaced Inter as the primary UI face.

**How to apply:** When adding new text styles, use `HankenGrotesk_*` for UI, `Marcellus_400Regular` for display/wordmark, `SpaceMono_*` for code/labels, `Tajawal_*` for Arabic.
