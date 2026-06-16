import { test, expect, Page } from "@playwright/test";

/**
 * Base smoke test class for example validation
 *
 * Verifies:
 * 1. Page loads
 * 2. Canvas exists
 * 3. No console errors
 * 4. No unhandled exceptions
 * 5. Screenshot captured
 */
export class BaseSmokeTest {
  /**
   * Get the URL for the example
   */
  protected getExampleUrl(): string {
    throw new Error("Subclass must implement getExampleUrl()");
  }

  /**
   * Get the example name for screenshots
   */
  protected getExampleName(): string {
    throw new Error("Subclass must implement getExampleName()");
  }

  /**
   * Run smoke test for the example
   */
  async runSmokeTest(page: Page) {
    const url = this.getExampleUrl();
    const exampleName = this.getExampleName();

    // 1. Page loads
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    // 2. No console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 3. No unhandled exceptions (page error listener)
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    // Give page time to stabilize
    await page.waitForTimeout(1000);

    // 4. Check for console errors
    expect(consoleErrors).toHaveLength(0);
    if (consoleErrors.length > 0) {
      console.error(`Console errors for ${exampleName}:`, consoleErrors);
    }

    // 5. Check for page errors
    expect(pageErrors).toHaveLength(0);
    if (pageErrors.length > 0) {
      console.error(`Page errors for ${exampleName}:`, pageErrors);
    }

    // 6. Canvas exists
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({
      timeout: 5000
    });

    // 7. Screenshot captured
    await page.screenshot({
      path: `tests/playwright/screenshots/${exampleName}-smoke.png`,
      fullPage: false
    });
  }
}
