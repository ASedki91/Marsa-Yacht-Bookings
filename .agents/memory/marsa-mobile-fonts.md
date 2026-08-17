---
name: MARSA mobile font stack
description: Which @expo-google-fonts packages the mobile app uses and what each face is for.
---

# MARSA Mobile Font Stack

The app uses four Google Fonts families, all loaded in `app/_layout.tsx` via `useFonts()`.

| Package | Weights loaded | Role |
|---|---|---|
| `@expo-google-fonts/hanken-grotesk` | 400, 500, 600, 700 | UI / body text (replaces Inter) |
| `@expo-google-fonts/marcellus` | 400 | Wordmark / display headings |
| `@expo-google-fonts/space-mono` | 400, 700 | Labels / detail text / monospace |
| `@expo-google-fonts/tajawal` | 400, 500, 700 | Arabic text |

All four packages must be present in `artifacts/marsa-mobile/package.json` and installed.
If Metro throws "Unable to resolve module @expo-google-fonts/…", run:

```bash
pnpm install --filter @workspace/marsa-mobile
```

then restart the Expo workflow. The packages are declared but not always installed after a merge.

**Why:** Added at the UI identity checkpoint (2026-08-17) to match the MARSA brand from marsa-identity-standalone.vercel.app. Hanken Grotesk replaced Inter as the primary UI face.

**How to apply:** When adding new text styles, use `HankenGrotesk_*` for UI, `Marcellus_400Regular` for display/wordmark, `SpaceMono_*` for code/labels, `Tajawal_*` for Arabic.
