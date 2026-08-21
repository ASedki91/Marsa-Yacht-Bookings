import { createHmac, timingSafeEqual } from "crypto";

const UPLOAD_INTENT_TTL_SECONDS = 15 * 60;

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to sign upload intents");
  }
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

export function createUploadIntent(userId: string, objectPath: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_INTENT_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}.${objectPath}`;
  return `${encode(payload)}.${sign(payload)}`;
}

export function verifyUploadIntent(
  token: string,
  userId: string,
  objectPath: string,
): boolean {
  try {
    const [encodedPayload, encodedSignature] = token.split(".");
    if (!encodedPayload || !encodedSignature) return false;

    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedPayloadParts = payload.split(".");
    if (expectedPayloadParts.length < 3) return false;

    const expiresAt = Number(expectedPayloadParts[1]);
    const tokenObjectPath = expectedPayloadParts.slice(2).join(".");
    if (
      expectedPayloadParts[0] !== userId ||
      tokenObjectPath !== objectPath ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    const actualSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = Buffer.from(sign(payload), "base64url");
    return (
      actualSignature.length === expectedSignature.length &&
      timingSafeEqual(actualSignature, expectedSignature)
    );
  } catch {
    return false;
  }
}