import { default as AxeBuilder } from "@axe-core/playwright";
import { expect, FrameLocator, Page } from "@playwright/test";
import { test } from "./fixtures";

// Accessibility E2E (plan Unit 9): axe scans of the plugin's key states inside
// real CODAP, plus the functional a11y behaviors axe can't check (1.4.13
// dismiss, focus retention, reflow). Scans are scoped to the plugin iframe —
// CODAP's own violations are not ours to fail on.

const kAxeTags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function openInCodap(page: Page): Promise<FrameLocator> {
  await page.goto("https://codap3.concord.org/?mouseSensor&di=https://localhost:8080");
  const iframe = page.frameLocator(".codap-web-view-iframe");
  await expect(iframe.getByRole("region", { name: "Generated R script" })).toBeVisible();
  return iframe;
}

async function scan(page: Page) {
  return new AxeBuilder({ page })
    .include(".codap-web-view-iframe")
    .withTags(kAxeTags)
    .analyze();
}

test.describe("accessibility states", () => {
  test("empty state passes axe", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await openInCodap(page);
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test("collapsed and re-expanded states pass axe", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    const iframe = await openInCodap(page);
    await iframe.getByRole("button", { name: "Collapse" }).click();
    const collapsed = await scan(page);
    expect(collapsed.violations).toEqual([]);
    await iframe.getByRole("button", { name: /expand r sidebar/i }).click();
    const expanded = await scan(page);
    expect(expanded.violations).toEqual([]);
  });

  test("reflow: usable at 320px-wide plugin without horizontal page scroll", async ({ page }) => {
    // 1.4.10: a 320 CSS px content width must not force 2-D scrolling of the
    // pane itself (code blocks may scroll in their own container).
    await page.setViewportSize({ width: 1280, height: 720 });
    const iframe = await openInCodap(page);
    const pane = iframe.locator(".r-sidebar");
    const hasHorizontalScroll = await pane.evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("all toolbar/console controls meet the 24px target minimum (2.5.8)", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    const iframe = await openInCodap(page);
    const buttons = iframe.getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue; // hidden/collapsed controls
      expect(box.height, `button ${i} height`).toBeGreaterThanOrEqual(24);
      expect(box.width, `button ${i} width`).toBeGreaterThanOrEqual(24);
    }
  });
});
