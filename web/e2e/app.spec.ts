import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function batch(page: Page) {
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  await page.getByRole("button", { name: "Try a demo batch", exact: true }).click();
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your batch, compared", exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => { await page.goto("/"); await expect(page.getByText("Model connected", { exact: true })).toBeVisible(); });

test("prediction, training examples, stale results, units, and export", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "About alcohol", exact: true }).click();
  await expect(page.getByText(/enter 12.5, not 0.125/)).toBeVisible();
  await page.getByRole("button", { name: "Predict wine quality", exact: true }).click();
  await expect(page.getByTestId("prediction-score")).toHaveText("5.00");
  await expect(page.getByTestId("support-label")).toHaveText("Similar training examples found");
  await page.getByText("Explore 3 comparable training samples", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Comparable training samples", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Comparable training samples", exact: true }).locator("tbody tr")).toHaveCount(3);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download prediction", exact: true }).click();
  const file = await downloaded;
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("training_support"); expect(text).toContain("similar_examples");
  await page.getByRole("spinbutton", { name: "Alcohol", exact: true }).fill("11");
  await expect(page.getByRole("button", { name: "Download prediction", exact: true })).toBeDisabled();
  await expect(page.getByText("Showing the previous prediction", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unusual in-range combination and out-of-range sample trigger human review", async ({ page }) => {
  await page.getByRole("spinbutton", { name: "Volatile acidity", exact: true }).fill("0.16");
  await page.getByRole("spinbutton", { name: "Sulphates", exact: true }).fill("1.98");
  await page.getByRole("spinbutton", { name: "Alcohol", exact: true }).fill("8.4");
  await page.getByRole("button", { name: "Predict wine quality", exact: true }).click();
  await expect(page.getByTestId("support-label")).toHaveText("Unusual measurement combination");
  await expect(page.getByRole("heading", { name: "Review recommended", exact: true })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Alcohol", exact: true }).fill("15");
  await page.getByRole("button", { name: "Predict wine quality", exact: true }).click();
  await expect(page.getByTestId("support-label")).toHaveText("Outside the studied range");
});

test("CSV validation, reference comparison, selection, filtering, and downloads", async ({ page }) => {
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  await page.getByLabel("Upload batch CSV", { exact: true }).setInputFiles(path.resolve("tests/fixtures/invalid.csv"));
  await expect(page.getByRole("alert")).toContainText("Row 2, volatile acidity");
  await page.getByLabel("Upload batch CSV", { exact: true }).setInputFiles(path.resolve("tests/fixtures/valid.csv"));
  await expect(page.getByText("3 samples validated and ready to compare.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  await page.getByRole("combobox", { name: "Reference sample", exact: true }).selectOption("Sample A");
  const table = page.getByRole("table", { name: "Sample measurements and model predictions", exact: true });
  await expect(table.getByRole("row", { name: /Sample B/ })).toContainText("+2.04");
  await page.getByRole("checkbox", { name: "Compare Sample B", exact: true }).check();
  await expect(page.getByText(/estimated points vs Sample A/)).toBeVisible();
  const comparisonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export reference comparison", exact: true }).click();
  const comparison = await readFile((await (await comparisonDownload).path())!, "utf8");
  expect(comparison).toContain("reference_sample_id"); expect(comparison).toContain("Sample B,Sample A");
  await page.getByRole("combobox", { name: "Reference sample", exact: true }).selectOption("Sample B");
  await expect(table.getByRole("row", { name: /Sample A/ })).toContainText("-2.04");
  await page.getByRole("checkbox", { name: "Human review only", exact: true }).check();
  await expect(table.getByRole("row", { name: /Sample C/ })).toBeVisible();
  const allDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all results", exact: true }).click();
  const all = await readFile((await (await allDownload).path())!, "utf8");
  expect(all).toContain("human_review_recommended"); expect(all.split(/\r?\n/)).toHaveLength(4);
});

test("full dataset is chunked without dropping rows; sample identity and scores stay client-side", async ({ page }) => {
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  const requests: { samples: Record<string, number>[] }[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/predict")) requests.push(request.postDataJSON()); });
  await page.getByLabel("Upload batch CSV", { exact: true }).setInputFiles(path.resolve("../data/winequality-red.csv"));
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  await expect(page.getByText("1,599 matching samples · Page 1 of 80", { exact: true })).toBeVisible();
  expect(requests.map(r => r.samples.length)).toEqual([500, 500, 500, 99]);
  expect(requests.every(r => r.samples.every(s => Object.keys(s).sort().join() === "alcohol,sulphates,volatile acidity"))).toBeTruthy();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("1,599 matching samples · Page 2 of 80", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Find a sample", exact: true }).fill("Sample 1599");
  await expect(page.getByText("1 matching samples · Page 1 of 1", { exact: true })).toBeVisible();
});

test("server failures surface an error and leave no partial batch results", async ({ page }) => {
  await page.route("**/api/predict", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Model temporarily unavailable" }) }));
  await page.getByRole("button", { name: "Batch comparison", exact: true }).click();
  await page.getByRole("button", { name: "Try a demo batch", exact: true }).click();
  await page.getByRole("button", { name: "Compare samples", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Model temporarily unavailable");
  await expect(page.getByRole("heading", { name: "Your batch, compared", exact: true })).toHaveCount(0);
});

test("keyboard access, chart alternatives, and WCAG scans across all views", async ({ page }) => {
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to main content", exact: true })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.locator("#main-content")).toBeFocused();
  await page.getByRole("button", { name: "Predict wine quality", exact: true }).click();
  await expect(page.getByTestId("support-label")).toBeVisible();
  await page.getByText("Explore 3 comparable training samples", { exact: true }).click();
  for (const view of ["prediction", "batch", "analytics"]) {
    if (view === "batch") await batch(page);
    if (view === "analytics") {
      await page.getByRole("button", { name: "Model analytics", exact: true }).click();
      await page.getByText("View model benchmark as a table", { exact: true }).click();
      await expect(page.getByRole("table", { name: "Development cross-validation results; lower errors are better", exact: true })).toBeVisible();
    }
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations, `${view} accessibility: ${JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })))}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
