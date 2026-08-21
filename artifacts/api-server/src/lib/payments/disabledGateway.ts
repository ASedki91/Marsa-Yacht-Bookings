import {
  PaymentGatewayUnavailableError,
  type CheckoutInput,
  type CheckoutResult,
  type PaymentGateway,
  type PaymentPublicConfig,
  type RefundInput,
  type RefundResult,
} from "./types";

export class DisabledPaymentGateway implements PaymentGateway {
  readonly name = "disabled" as const;

  async getPublicConfig(): Promise<PaymentPublicConfig> {
    return {
      gateway: "disabled",
      checkoutEnabled: false,
      testMode: false,
      publishableKey: null,
    };
  }

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    throw new PaymentGatewayUnavailableError();
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new PaymentGatewayUnavailableError("Refund gateway is unavailable");
  }
}
