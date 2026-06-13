const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// @stripe/stripe-react-native is native-only — its index imports react-native
// codegen internals that cannot bundle on web. Redirect it to a web stub so the
// web/Replit-emulator preview builds. Real payments only run on iOS/Android.
const stripeWebStub = path.resolve(__dirname, "lib/stripe.web.tsx");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "@stripe/stripe-react-native") {
    return { type: "sourceFile", filePath: stripeWebStub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
