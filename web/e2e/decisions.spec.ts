import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.getByText("Model connected", { exact: true })).toBeVisible(); });

test("prediction remains compact while comparable evidence spans the full row", async ({ page }) => {
  await page.getByRole("button", { name: "Predict wine quality", exact: true }).click();
  await expect(page.getByTestId("prediction-score")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Routine sensory review", exact: true })).toBeVisible();
  const score = await page.getByTestId("prediction-score").boundingBox();
  const review = await page.locator(".compact-review").boundingBox();
  expect(review!.y - score!.y).toBeLessThan(330);
  const grid = await page.locator(".predict-grid").boundingBox();
  const evidence = await page.locator(".prediction-evidence").boundingBox();
  expect(evidence!.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
  expect(evidence!.width).toBeCloseTo(grid!.width, -1);
  expect(await page.locator(".result-card table").count()).toBe(0);
  await page.getByText("Explore 3 comparable training samples", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Comparable training samples", exact: true })).toBeVisible();
});

test("each visible review reason has a working filter", async ({ page }) => {
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  await page.getByRole("button", { name: "Try a demo batch", exact: true }).click();
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  const table = page.getByRole("table", { name: "Sample measurements and model predictions", exact: true });
  for (const [code, name, count] of [
    ["outside_range", "Outside studied range", 1], ["unusual_combination", "Unusual combination", 1],
    ["nearby_disagreement", "Nearby tasting scores disagree", 2], ["uncommon_score", "Uncommon predicted score", 2],
  ] as const) {
    await page.getByRole("combobox", { name: "Filter review reason", exact: true }).selectOption(code);
    await expect(table.locator("tbody tr")).toHaveCount(count);
    for (const row of await table.locator("tbody tr").all()) await expect(row.locator(".table-review-reasons")).toContainText(name);
  }
  await page.getByRole("combobox", { name: "Filter review reason", exact: true }).selectOption("all");
  await expect(table.locator("tbody tr")).toHaveCount(6);
});

test("reference stays visible while scrolling and measurement differences are explicit", async ({ page }) => {
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  await page.getByRole("button", { name: "Try a demo batch", exact: true }).click();
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  await page.getByRole("combobox", { name: "Reference sample", exact: true }).selectOption("Lot A · Cellar 01");
  await page.getByRole("checkbox", { name: "Compare Lot B · Cellar 01", exact: true }).check();
  const differences = page.getByRole("group", { name: "Measurement differences for Lot B · Cellar 01 versus Lot A · Cellar 01", exact: true });
  await expect(differences).toContainText("+3.1 percentage points");
  await expect(differences).toContainText("-0.42 g/L");
  await expect(page.getByText("Higher model estimate — not proof of better wine", { exact: true })).toBeVisible();
  await page.getByRole("table", { name: "Sample measurements and model predictions", exact: true }).getByRole("row", { name: /Lot D/ }).scrollIntoViewIfNeeded();
  const pinned = await page.getByTestId("sticky-reference").boundingBox();
  expect(pinned!.y).toBeGreaterThanOrEqual(0); expect(pinned!.y).toBeLessThan(20);
  await expect(page.getByTestId("sticky-reference")).toContainText("Lot A · Cellar 01");
  await page.getByRole("combobox", { name: "Filter review reason", exact: true }).selectOption("outside_range");
  await expect(page.getByTestId("sticky-reference")).toContainText("Lot A · Cellar 01");
});

test("analytics disclose weak flag validation and expose the audit data", async ({ page }) => {
  await page.getByRole("button", { name: "Model analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Do flags identify larger prediction errors?", exact: true })).toBeVisible();
  await expect(page.getByText("Error-risk separation was not demonstrated.", { exact: true })).toBeVisible();
  const audit = page.getByRole("table", { name: "Grouped development audit · 5 folds · frozen model settings and rules", exact: true });
  await expect(audit.getByRole("row", { name: /Any review flag/ })).toContainText("151 / 1128");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download flag audit", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("wine-lab-review-flag-audit.json");
});
