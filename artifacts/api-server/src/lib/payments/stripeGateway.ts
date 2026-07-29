import { getStripeClient, getStripePublishableKey } from "../stripe";
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentGateway,
  PaymentPublicConfig,
  RefundInput,
  RefundResult,
} from "./types";

export class StripePaymentGateway implements PaymentGateway {
  readonly name = "stripe" as const;

  async getPublicConfig(): Promise<PaymentPublicConfig> {
    const publishableKey = await getStripePublishableKey();
    return {
      gateway: "stripe",
      checkoutEnabled: Boolean(publishableKey),
      testMode: false,
      publishableKey: publishableKey || null,
    };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!input.amountUsdCents) {
      throw new Error("Stripe checkout requires a positive USD amount");
    }

    const stripe = await getStripeClient();
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountUsdCents,
        currency: "usd",
        metadata: input.metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `booking:${input.bookingId}` },
    );

    if (!intent.client_secret) {
      throw new Error("Stripe did not return a client secret");
    }

    return {
      provider: "stripe",
      providerPaymentId: intent.id,
      status: "created",
      isTest: false,
      amountUsd: (intent.amount / 100).toFixed(2),
      action: {
        type: "stripe_payment_sheet",
        clientSecret: intent.client_secret,
      },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const stripe = await getStripeClient();
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.providerPaymentId,
        ...(input.amountProviderMinor !== undefined
          ? { amount: input.amountProviderMinor }
          : {}),
        metadata: {
          cancellationOrRejectionId: input.idempotencyKey,
          egpAmount: input.amountEgp,
        },
      },
      { idempotencyKey: `refund:${input.idempotencyKey}` },
    );

    return {
      provider: "stripe",
      providerRefundId: refund.id,
      status: refund.status === "succeeded" ? "succeeded" : "pending",
      isTest: false,
    };
  }
}
