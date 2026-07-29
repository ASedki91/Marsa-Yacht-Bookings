import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { StripeProvider } from "@/components/StripeProvider";
import { API_BASE_URL } from "@/lib/env";

export type PaymentGateway = "test" | "stripe" | "disabled";

export interface RuntimePaymentConfig {
  gateway: PaymentGateway;
  checkoutEnabled: boolean;
  testMode: boolean;
  publishableKey: string | null;
}

interface PaymentConfigContextValue {
  config: RuntimePaymentConfig;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const disabledConfig: RuntimePaymentConfig = {
  gateway: "disabled",
  checkoutEnabled: false,
  testMode: false,
  publishableKey: null,
};

const PaymentConfigContext = createContext<PaymentConfigContextValue | null>(
  null,
);

export function PaymentConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<RuntimePaymentConfig>(disabledConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!API_BASE_URL) {
      setConfig(disabledConfig);
      setError("The API URL is not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/payments/config`);
      if (!response.ok) throw new Error("Payment configuration is unavailable.");
      const next = (await response.json()) as RuntimePaymentConfig;
      setConfig({
        gateway: next.gateway,
        checkoutEnabled: next.checkoutEnabled,
        testMode: next.testMode,
        publishableKey: next.publishableKey ?? null,
      });
    } catch (fetchError: any) {
      setConfig(disabledConfig);
      setError(fetchError?.message ?? "Payment configuration is unavailable.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(
    () => ({ config, isLoading, error, refresh }),
    [config, error, isLoading],
  );
  const content = (
    <PaymentConfigContext.Provider value={value}>
      {children}
    </PaymentConfigContext.Provider>
  );

  if (config.gateway === "stripe" && config.publishableKey) {
    return (
      <StripeProvider
        publishableKey={config.publishableKey}
        merchantIdentifier="merchant.com.marsa"
      >
        {content}
      </StripeProvider>
    );
  }

  return content;
}

export function usePaymentConfig() {
  const context = useContext(PaymentConfigContext);
  if (!context) {
    throw new Error("usePaymentConfig must be used inside PaymentConfigProvider");
  }
  return context;
}
