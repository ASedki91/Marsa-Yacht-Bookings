import { describe, expect, it } from "vitest";
import { TestPaymentGateway } from "./testGateway";

const checkoutInput = {
  bookingId: "booking-test-123",
  amountEgp: "12500.00",
  metadata: {
    yachtId: "yacht-test-123",
    guestId: "guest-test-123",
  },
};

describe("TestPaymentGateway", () => {
  it("advertises an enabled virtual checkout without a publishable key", async () => {
    const gateway = new TestPaymentGateway();

    await expect(gateway.getPublicConfig()).resolves.toEqual({
      gateway: "test",
      checkoutEnabled: true,
      testMode: true,
      publishableKey: null,
    });
  });

  it("completes checkout as a successful virtual payment", async () => {
    const gateway = new TestPaymentGateway();

    const result = await gateway.createCheckout(checkoutInput);

    expect(result).toMatchObject({
      provider: "test",
      status: "succeeded",
      isTest: true,
      action: { type: "none" },
      providerMetadata: {
        bookingId: checkoutInput.bookingId,
        simulated: true,
      },
    });
    expect(result.providerPaymentId).toMatch(/^test_pay_[0-9a-f-]{36}$/);
  });

  it("generates a unique transaction ID for every virtual payment", async () => {
    const gateway = new TestPaymentGateway();

    const [first, second] = await Promise.all([
      gateway.createCheckout(checkoutInput),
      gateway.createCheckout(checkoutInput),
    ]);

    expect(first.providerPaymentId).not.toBe(second.providerPaymentId);
  });
});
