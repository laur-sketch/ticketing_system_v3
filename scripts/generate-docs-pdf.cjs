/**
 * Build docs/Ticket_System_v3_Manual.pdf from docs/TICKET_SYSTEM_V3_COMPLETE_MANUAL.md
 * Usage: npm run docs:pdf
 */
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [{ marked }, puppeteer] = await Promise.all([
    import("marked"),
    import("puppeteer"),
  ]);

  const root = path.join(__dirname, "..");
  const mdPath = path.join(root, "docs", "TICKET_SYSTEM_V3_COMPLETE_MANUAL.md");
  const pdfPath = path.join(root, "docs", "Ticket_System_v3_Manual.pdf");
  const cssPath = path.join(root, "docs", "pdf-print.css");

  if (!fs.existsSync(mdPath)) {
    console.error("Missing markdown source:", mdPath);
    process.exit(1);
  }

  const markdown = fs.readFileSync(mdPath, "utf8");
  const body = marked.parse(markdown);
  const stylesheet = fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, "utf8")
    : "";

  const browser = await puppeteer.default.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base href="file://${path.join(root, "docs").replace(/\\/g, "/")}/">
    <style>${stylesheet}</style>
  </head>
  <body>${body}</body>
</html>`,
      { waitUntil: "networkidle0" },
    );

    await page.pdf({
      path: pdfPath,
      format: "A4",
      margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log("Wrote:", pdfPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
