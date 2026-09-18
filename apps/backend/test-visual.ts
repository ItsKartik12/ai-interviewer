/** Visual check: screenshot the app pages with headless Chromium. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const outDir = join(process.cwd(), "e2e-out");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const cssErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") cssErrors.push(m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.url().endsWith(".css") && r.status() >= 400) cssErrors.push(`CSS ${r.status()} ${r.url()}`);
  });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outDir, "visual-form.png") });

  // Computed-style assertions: is Tailwind actually styling elements?
  const checks = await page.evaluate(() => {
    const body = document.body;
    const bs = getComputedStyle(body);
    const h1 = document.querySelector("h1");
    const btn = document.querySelector("button");
    const results: Record<string, string> = {};
    results.bodyBg = bs.backgroundColor;
    results.bodyColor = bs.color;
    results.bodyFont = bs.fontFamily.slice(0, 40);
    results.h1Exists = String(Boolean(h1));
    if (h1) {
      const hs = getComputedStyle(h1);
      results.h1FontSize = hs.fontSize;
      results.h1Weight = hs.fontWeight;
      results.h1Tracking = hs.letterSpacing;
    }
    if (btn) {
      const btns = getComputedStyle(btn);
      results.btnBg = btns.backgroundColor;
      results.btnRadius = btns.borderRadius;
      results.btnDisplay = btns.display;
    }
    results.stylesheetCount = String(document.styleSheets.length);
    return results;
  });

  console.log("computed styles:", JSON.stringify(checks, null, 2));
  console.log("css/console errors:", cssErrors.length ? cssErrors : "none");
  await browser.close();
  process.exit(cssErrors.length === 0 && checks.bodyBg !== "rgba(0, 0, 0, 0)" ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
