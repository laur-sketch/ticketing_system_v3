import nodemailer from "nodemailer";
import { createEmailVerificationToken } from "@/lib/email-verification-token";

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

function createTransporter() {
  const host = process.env.BREVO_SMTP_HOST?.trim() || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT || "587");
  const user = process.env.BREVO_SMTP_USER?.trim();
  const pass = process.env.BREVO_SMTP_PASS?.trim();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendResolutionEmail(input: {
  ticketId: string;
  ticketNumber: string;
  title: string;
  recipientEmail: string;
  recipientName: string;
  resolutionNotes?: string | null;
}) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn("BREVO SMTP is not configured. Skipping resolution email.");
    return;
  }
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim() || "no-reply@example.com";
  const fromName = process.env.BREVO_FROM_NAME?.trim() || "Service Desk";
  const token = createEmailVerificationToken(input.ticketId, input.recipientEmail);
  const baseActionLink = `${appBaseUrl()}/api/tickets/email-verification?token=${encodeURIComponent(token)}`;
  const verifyLink = `${baseActionLink}&action=verify`;
  const rejectLink = `${appBaseUrl()}/customer/verification/email?token=${encodeURIComponent(token)}&action=reject`;
  const resolutionNotes = (input.resolutionNotes || "").trim() || "No resolution notes were provided.";

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: input.recipientEmail,
    subject: `Ticket ${input.ticketNumber} — for your confirmation`,
    text: [
      "Greeting,",
      "",
      `Your ticket (${input.ticketNumber})`,
      `(${input.title})`,
      "has been Marked RESOLVED",
      "",
      `Resolution notes: ${resolutionNotes}`,
      "",
      "Please choose whether you verify or do not verify this resolution:",
      `Verify: ${verifyLink}`,
      `Do not verify: ${rejectLink}`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.45;">
        <p><strong>Greeting,</strong></p>
        <p>
          Your ticket (<strong>${input.ticketNumber}</strong>)<br/>
          (${input.title})<br/>
          is <strong>for your confirmation</strong> (resolution proposed).
        </p>
        <p><strong>Resolution notes:</strong><br/>${resolutionNotes.replace(/\n/g, "<br/>")}</p>
        <p>Please choose whether you <strong>verify</strong> or <strong>do not verify</strong> this resolution:</p>
        <p style="display:flex; gap:10px; flex-wrap:wrap; margin: 12px 0;">
          <a href="${verifyLink}" style="background:#16a34a;color:#fff;padding:9px 14px;border-radius:10px;text-decoration:none;font-weight:700;">Verify</a>
          <a href="${rejectLink}" style="background:#dc2626;color:#fff;padding:9px 14px;border-radius:10px;text-decoration:none;font-weight:700;">Do not verify</a>
        </p>
        <p style="color:#a1a1aa;">After clicking <strong>Verify</strong>, you will be taken to the star rating and feedback step.</p>
        <p style="color:#a1a1aa;">If you click <strong>Do not verify</strong>, you will be directed to a form in the portal to submit your reason.</p>
      </div>
    `,
  });
}
