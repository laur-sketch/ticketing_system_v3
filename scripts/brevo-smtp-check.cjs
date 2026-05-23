/**
 * Quick Brevo SMTP probe. Reads BREVO_* + APP_BASE_URL from .env and
 * (1) verifies the SMTP connection
 * (2) optionally sends a test email when --send <recipient> is provided.
 *
 * Usage:
 *   node scripts/brevo-smtp-check.cjs
 *   node scripts/brevo-smtp-check.cjs --send you@example.com
 */
const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const host = (process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com").trim();
  const port = Number(process.env.BREVO_SMTP_PORT || "587");
  const user = (process.env.BREVO_SMTP_USER || "").trim();
  const pass = (process.env.BREVO_SMTP_PASS || "").trim();
  const fromEmail = (process.env.BREVO_FROM_EMAIL || "").trim();
  const fromName = (process.env.BREVO_FROM_NAME || "Service Desk").trim();

  console.log("Brevo SMTP config");
  console.log("  host:", host);
  console.log("  port:", port);
  console.log("  user:", user || "(missing)");
  console.log("  pass set:", pass ? `${pass.slice(0, 6)}…${pass.slice(-4)} (len ${pass.length})` : "(missing)");
  console.log("  from :", fromEmail ? `${fromName} <${fromEmail}>` : "(missing)");

  if (!user || !pass) {
    console.error("\nMissing BREVO_SMTP_USER or BREVO_SMTP_PASS in .env");
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  console.log("\nVerifying SMTP connection…");
  try {
    await transporter.verify();
    console.log("  ✓ Brevo SMTP accepted credentials.");
  } catch (e) {
    console.error("  ✗ verify() failed:", e && e.message ? e.message : e);
    if (e && (e.code || e.response)) {
      console.error("  code:", e.code, "response:", e.response);
    }
    process.exit(3);
  }

  const sendIdx = process.argv.indexOf("--send");
  if (sendIdx !== -1 && process.argv[sendIdx + 1]) {
    const to = process.argv[sendIdx + 1];
    console.log(`\nSending test email to ${to}…`);
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail || user}>`,
        to,
        subject: "AGCTek Help Desk · Brevo SMTP test",
        text:
          "This is a test from the ticket_system_v3 SMTP probe.\n\n" +
          "If you received this, Brevo SMTP is working end-to-end.",
        html:
          "<p>This is a test from the <strong>ticket_system_v3</strong> SMTP probe.</p>" +
          "<p>If you received this, Brevo SMTP is working end-to-end.</p>",
      });
      console.log("  ✓ Sent.");
      console.log("    messageId:", info.messageId);
      console.log("    accepted :", info.accepted);
      console.log("    rejected :", info.rejected);
      if (info.response) console.log("    response:", info.response);
    } catch (e) {
      console.error("  ✗ sendMail failed:", e && e.message ? e.message : e);
      if (e && (e.code || e.response)) {
        console.error("  code:", e.code, "response:", e.response);
      }
      process.exit(4);
    }
  } else {
    console.log("\n(no --send <email> provided; skipping live message)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
