const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// @stripe/stripe-react-native is native-only — its index imports react-native
// codegen internals that cannot bundle on web. Redirect it to a web stub so the
// web/Replit-emulator preview builds. Real payments only run on iOS/Android.
const stripeWebStub = path.resolve(__dirname, "lib/stripe.web.tsx");
const clerkOptionalNativeModule = path.resolve(
  __dirname,
  "node_modules/@clerk/expo/dist/specs/NativeClerkModule.js",
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "@stripe/stripe-react-native") {
    return { type: "sourceFile", filePath: stripeWebStub };
  }
  // Expo Go does not ship ClerkExpo. Clerk's Android-specific resolver uses
  // requireNativeModule() and crashes before the JS fallback can load. The
  // generic resolver uses requireOptionalNativeModule(), so Expo Go can run
  // the JS Clerk flow while custom Android builds still use the native module
  // when it is available.
  if (
    platform === "android" &&
    moduleName.endsWith("/@clerk/expo/dist/specs/NativeClerkModule.android")
  ) {
    return { type: "sourceFile", filePath: clerkOptionalNativeModule };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
