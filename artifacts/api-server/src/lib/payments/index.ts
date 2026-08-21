import { DisabledPaymentGateway } from "./disabledGateway";
import { getPaymentRuntimeConfig } from "./config";
import { StripePaymentGateway } from "./stripeGateway";
import { TestPaymentGateway } from "./testGateway";
import type { PaymentGateway } from "./types";

const disabledGateway = new DisabledPaymentGateway();
const stripeGateway = new StripePaymentGateway();
const testGateway = new TestPaymentGateway();

export function getConfiguredPaymentGateway(): PaymentGateway {
  const { selectedGateway } = getPaymentRuntimeConfig();
  if (selectedGateway === "test") return testGateway;
  if (selectedGateway === "stripe") return stripeGateway;
  return disabledGateway;
}

export function getPaymentGatewayForStoredProvider(provider: string): PaymentGateway {
  if (provider === "test") return testGateway;
  if (provider === "stripe") return stripeGateway;
  throw new Error(`Unsupported stored payment provider: ${provider}`);
}

export * from "./config";
export * from "./types";
