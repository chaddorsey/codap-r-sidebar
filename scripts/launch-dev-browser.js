// Opens a visible Chrome window with CODAP + the local plugin, using a scratch
// profile with Local Network Access checks disabled (dev convenience only).
const { chromium } = require("@playwright/test");
(async () => {
  const context = await chromium.launchPersistentContext(
    "/tmp/r-sidebar-dev-profile",
    {
      channel: "chrome",
      headless: false,
      viewport: null,
      ignoreHTTPSErrors: true,
      args: ["--disable-features=LocalNetworkAccessChecks", "--window-size=1500,950"]
    }
  );
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://codap3.concord.org/?mouseSensor&di=https://localhost:8080");
  console.log("Dev browser open — close the window to end this process.");
  await new Promise(resolve => context.on("close", resolve));
})().catch(e => { console.error(e.message); process.exit(1); });
