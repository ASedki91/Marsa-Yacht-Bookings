import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;

export type OperatorConfirmationPayload = {
  version: number;
  operationId: string;
  actionHash: string;
  expiresAt: number;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function fingerprintOperatorAction(action: unknown): string {
  return createHash("sha256").update(stableJson(action)).digest("hex");
}

export function createConfirmationToken(
  payload: Omit<OperatorConfirmationPayload, "version">,
  secret: string,
): string {
  const encoded = Buffer.from(
    JSON.stringify({ version: TOKEN_VERSION, ...payload }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyConfirmationToken(
  token: string,
  secret: string,
): OperatorConfirmationPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as OperatorConfirmationPayload;
    if (
      payload.version !== TOKEN_VERSION ||
      typeof payload.operationId !== "string" ||
      typeof payload.actionHash !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}