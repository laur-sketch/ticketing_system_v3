/**
 * Build docs/Ticket_System_v3_Manual.pdf from docs/TICKET_SYSTEM_V3_COMPLETE_MANUAL.md
 * Usage: npm run docs:pdf
 */
const fs = require("node:fs");
const path = require("node:path");
const { mdToPdf } = require("md-to-pdf");

async function main() {
  const root = path.join(__dirname, "..");
  const mdPath = path.join(root, "docs", "TICKET_SYSTEM_V3_COMPLETE_MANUAL.md");
  const pdfPath = path.join(root, "docs", "Ticket_System_v3_Manual.pdf");
  const cssPath = path.join(root, "docs", "pdf-print.css");

  if (!fs.existsSync(mdPath)) {
    console.error("Missing markdown source:", mdPath);
    process.exit(1);
  }

  const stylesheet = fs.existsSync(cssPath) ? [cssPath] : undefined;

  await mdToPdf(
    { path: mdPath },
    {
      dest: pdfPath,
      pdf_options: {
        format: "A4",
        margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
        printBackground: true,
      },
      ...(stylesheet ? { stylesheet } : {}),
    },
  );

  console.log("Wrote:", pdfPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
