import { default as AxeBuilder } from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("R Sidebar loads inside CODAP with an accessible empty state", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("https://codap3.concord.org/?mouseSensor&di=https://localhost:8080");

  const iframe = page.frameLocator(".codap-web-view-iframe");

  // Landmark structure and empty-state onboarding are the plugin's first render.
  await expect(iframe.getByRole("region", { name: "Generated R script" })).toBeVisible();
  await expect(iframe.getByText(/watch it become R code/i)).toBeVisible();

  // Collapse/expand is fully keyboard-operable.
  const collapse = iframe.getByRole("button", { name: "Collapse" });
  await collapse.focus();
  await page.keyboard.press("Enter");
  const expand = iframe.getByRole("button", { name: /expand r sidebar/i });
  await expect(expand).toBeVisible();
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(iframe.getByRole("region", { name: "Generated R script" })).toBeVisible();

  // axe scan of the plugin's empty state (scoped to our iframe, not CODAP).
  const results = await new AxeBuilder({ page })
    .include(".codap-web-view-iframe")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
