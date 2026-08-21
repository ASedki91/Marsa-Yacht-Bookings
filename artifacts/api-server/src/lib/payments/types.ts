export type PaymentProviderName = "test" | "stripe" | "disabled";

export interface PaymentPublicConfig {
  gateway: PaymentProviderName;
  checkoutEnabled: boolean;
  testMode: boolean;
  publishableKey: string | null;
}

export interface CheckoutInput {
  bookingId: string;
  amountEgp: string;
  amountUsdCents?: number;
  metadata: Record<string, string>;
}

export interface CheckoutResult {
  provider: Exclude<PaymentProviderName, "disabled">;
  providerPaymentId: string;
  status: "created" | "succeeded";
  isTest: boolean;
  amountUsd?: string;
  action:
    | { type: "none" }
    | { type: "stripe_payment_sheet"; clientSecret: string };
  providerMetadata?: Record<string, unknown>;
}

export interface RefundInput {
  providerPaymentId: string;
  amountEgp: string;
  amountProviderMinor?: number;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundResult {
  provider: Exclude<PaymentProviderName, "disabled">;
  providerRefundId: string;
  status: "succeeded" | "pending";
  isTest: boolean;
}

export interface PaymentGateway {
  readonly name: PaymentProviderName;
  getPublicConfig(): Promise<PaymentPublicConfig>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}

export class PaymentGatewayUnavailableError extends Error {
  constructor(message = "Checkout is currently unavailable") {
    super(message);
    this.name = "PaymentGatewayUnavailableError";
  }
}
