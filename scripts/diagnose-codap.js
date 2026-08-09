const { chromium } = require("@playwright/test");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-features=LocalNetworkAccessChecks"] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const events = [];
  page.on("console", m => events.push(`CONSOLE[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("requestfailed", r => events.push(`REQFAIL ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));
  page.on("response", r => { if (r.url().includes("localhost")) events.push(`RESPONSE ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.goto("https://codap3.concord.org/?mouseSensor&di=https://localhost:8080", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(12000);
  const iframeCount = await page.locator("iframe").count();
  const webviewCount = await page.locator(".codap-web-view-iframe").count();
  events.push(`IFRAMES total=${iframeCount} codap-web-view=${webviewCount}`);
  if (webviewCount > 0) {
    const frame = page.frameLocator(".codap-web-view-iframe");
    const region = await frame.getByRole("region", { name: "Generated R script" }).count().catch(() => -1);
    events.push(`PLUGIN script-region count=${region}`);
  }
  await page.screenshot({ path: "/tmp/codap-diagnose.png", fullPage: false });
  console.log(events.filter(e => !e.includes("gtag") && !e.includes("google")).join("\n"));
  await browser.close();
})().catch(e => { console.error("DIAG FAIL:", e.message); process.exit(1); });
