import crypto from "node:crypto";

type EmailVerificationPayload = {
  ticketId: string;
  recipientEmail: string;
  exp: number;
};

function secret() {
  return process.env.NEXTAUTH_SECRET || "dev-only-change-this-secret-for-production-use";
}

export function createEmailVerificationToken(ticketId: string, recipientEmail: string) {
  const payload: EmailVerificationPayload = {
    ticketId,
    recipientEmail: recipientEmail.toLowerCase(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyEmailVerificationToken(token: string): EmailVerificationPayload | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as EmailVerificationPayload;
    if (!payload.ticketId || !payload.recipientEmail || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
