import { describe, expect, it } from "vitest";
import { getPaymentRuntimeConfig } from "./config";

describe("getPaymentRuntimeConfig", () => {
  it("allows the test gateway only when explicitly enabled in development", () => {
    expect(
      getPaymentRuntimeConfig({
        NODE_ENV: "development",
        PAYMENT_GATEWAY: "test",
        ENABLE_TEST_PAYMENT_GATEWAY: "true",
      }),
    ).toMatchObject({
      requestedGateway: "test",
      selectedGateway: "test",
      testGatewayAllowed: true,
      publishedDeployment: false,
    });
  });

  it("fails closed when the test gateway is not explicitly enabled", () => {
    expect(
      getPaymentRuntimeConfig({
        NODE_ENV: "development",
        PAYMENT_GATEWAY: "test",
      }),
    ).toMatchObject({
      requestedGateway: "test",
      selectedGateway: "disabled",
      testGatewayAllowed: false,
    });
  });

  it.each([
    { NODE_ENV: "production" },
    { NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" },
  ])("disables the test gateway on published deployments", (deploymentEnv) => {
    expect(
      getPaymentRuntimeConfig({
        ...deploymentEnv,
        PAYMENT_GATEWAY: "test",
        ENABLE_TEST_PAYMENT_GATEWAY: "true",
      }),
    ).toMatchObject({
      requestedGateway: "test",
      selectedGateway: "disabled",
      publishedDeployment: true,
    });
  });

  it("preserves Stripe and defaults unknown values to disabled", () => {
    expect(
      getPaymentRuntimeConfig({
        NODE_ENV: "production",
        PAYMENT_GATEWAY: "stripe",
      }).selectedGateway,
    ).toBe("stripe");
    expect(
      getPaymentRuntimeConfig({
        NODE_ENV: "development",
        PAYMENT_GATEWAY: "unknown",
      }).selectedGateway,
    ).toBe("disabled");
  });
});
