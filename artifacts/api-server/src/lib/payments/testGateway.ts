import { randomUUID } from "node:crypto";
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentGateway,
  PaymentPublicConfig,
  RefundInput,
  RefundResult,
} from "./types";

export class TestPaymentGateway implements PaymentGateway {
  readonly name = "test" as const;

  async getPublicConfig(): Promise<PaymentPublicConfig> {
    return {
      gateway: "test",
      checkoutEnabled: true,
      testMode: true,
      publishableKey: null,
    };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    return {
      provider: "test",
      providerPaymentId: `test_pay_${randomUUID()}`,
      status: "succeeded",
      isTest: true,
      action: { type: "none" },
      providerMetadata: {
        bookingId: input.bookingId,
        simulated: true,
      },
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return {
      provider: "test",
      providerRefundId: `test_ref_${randomUUID()}`,
      status: "succeeded",
      isTest: true,
    };
  }
}
