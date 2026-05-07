import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

function loadDotEnv(envPath) {
  const buf = fs.readFileSync(envPath);
  let raw = buf.toString("utf8");
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    raw = buf.toString("utf16le");
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  const root = process.cwd();
  loadDotEnv(path.join(root, ".env"));

  const host = process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT || "587");
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_PASS;
  const from = process.env.BREVO_FROM_EMAIL;
  const to = process.argv[2] || from;

  if (!user || !pass || !from || !to) {
    throw new Error("Missing SMTP config. Need BREVO_SMTP_USER, BREVO_SMTP_PASS, BREVO_FROM_EMAIL.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.verify();
  const info = await transporter.sendMail({
    from: `"Service Desk SMTP Test" <${from}>`,
    to,
    subject: "Brevo SMTP test - ticket_system_v3",
    text: "SMTP test successful. This confirms Brevo SMTP is configured correctly.",
  });

  console.log("SMTP verify: OK");
  console.log(`Message sent: ${info.messageId}`);
  console.log(`Recipient: ${to}`);
}

main().catch((err) => {
  console.error("SMTP test failed:");
  console.error(err?.message || err);
  process.exit(1);
});
