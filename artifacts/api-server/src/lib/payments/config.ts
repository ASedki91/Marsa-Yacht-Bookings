import type { PaymentProviderName } from "./types";

export interface PaymentRuntimeConfig {
  requestedGateway: PaymentProviderName;
  selectedGateway: PaymentProviderName;
  testGatewayAllowed: boolean;
  publishedDeployment: boolean;
}

function parseGateway(value: string | undefined): PaymentProviderName {
  if (value === "test" || value === "stripe" || value === "disabled") return value;
  return "disabled";
}

export function getPaymentRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PaymentRuntimeConfig {
  const requestedGateway = parseGateway(env.PAYMENT_GATEWAY);
  const publishedDeployment =
    env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1";
  const testGatewayAllowed =
    !publishedDeployment && env.ENABLE_TEST_PAYMENT_GATEWAY === "true";

  return {
    requestedGateway,
    selectedGateway:
      requestedGateway === "test" && !testGatewayAllowed
        ? "disabled"
        : requestedGateway,
    testGatewayAllowed,
    publishedDeployment,
  };
}
