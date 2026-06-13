import React from "react";

// Web stub — @stripe/stripe-react-native is native-only and cannot bundle on
// web (it imports react-native codegen internals). The Replit emulator/web
// preview uses these no-ops; real payments only run on iOS/Android.

export function StripeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const webUnavailable = { error: { message: "Payments are only available in the mobile app." } };

export function useStripe() {
  return {
    initPaymentSheet: async () => webUnavailable,
    presentPaymentSheet: async () => webUnavailable,
  };
}
