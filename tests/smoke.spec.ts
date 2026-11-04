import { expect, test, type Page } from "@playwright/test";

const blocks = (page: Page) => page.locator(".react-flow__node");

async function openTemplate(page: Page, name: string) {
  await page.goto("/");
  await page.locator(".template-card", { hasText: name }).click();
  await expect(blocks(page).first()).toBeVisible();
}

async function runSimulated(page: Page, message: string) {
  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByLabel("Simulated answers").check();
  await page.getByLabel("Message").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
}

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 429")) problems.push(message.text());
  });
  // Exposed for the check after each test.
  (page as Page & { problems?: string[] }).problems = problems;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { problems?: string[] }).problems).toEqual([]);
});

test("home shows templates and credits the designer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(5);
  await expect(page.getByText("Design by Julian Sucatti")).toBeVisible();
});

test("a simulated run goes through every block, including sandboxed code", async ({ page }) => {
  await openTemplate(page, "Contract analyzer");
  await runSimulated(page, "What's the notice period?");
  const answer = page.locator(".message-agent");
  await expect(answer).toContainText("Simulated answer");
  await expect(answer).toContainText("have a lawyer review it");
  await expect(answer.getByText("Simulated: no AI used")).toBeVisible();
  await expect(page.locator(".block.is-done")).toHaveCount(2);
});

test("clicking a block adds it to a working flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New blank agent" }).click();
  await expect(page.getByText("Add to agent")).toBeVisible();
  await page.getByRole("button", { name: "Playground" }).click();
  await expect(page.getByRole("alert")).toContainText("Connect the Input block");
  await page.getByRole("button", { name: "Close playground" }).click();

  await page.getByRole("button", { name: /^Language/ }).click();
  await expect(page.getByText("Add to agent")).toBeHidden();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.getByRole("button", { name: "Close settings" }).click();
  await runSimulated(page, "Hello");
  await expect(page.locator(".message-agent")).toContainText("Simulated answer");
});

test("a block can be dragged from the list onto the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New blank agent" }).click();
  await page.getByRole("button", { name: /^Image generation/ }).dragTo(page.locator(".react-flow__pane"), {
    targetPosition: { x: 300, y: 300 },
  });
  await expect(page.locator(".block", { hasText: "Image generation" })).toBeVisible();
});

test("blocks connect by dragging, and loops are refused", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New blank agent" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);

  const from = page.locator(".block-pill", { hasText: "Input" }).locator(".react-flow__handle");
  const to = page.locator(".block-pill", { hasText: "Output" }).locator(".react-flow__handle");
  await from.dragTo(to);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await page.getByRole("button", { name: /^Language/ }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  // Connecting the model's output back to its own input would make a loop.
  const model = page.locator(".block", { hasText: "Language AI" });
  await model.locator(".react-flow__handle-bottom").dragTo(model.locator(".react-flow__handle-top"));
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
});

test("text files can be uploaded, and oversized ones are refused", async ({ page }) => {
  await openTemplate(page, "Job fit reviewer");
  await page.locator(".block", { hasText: "Resume" }).click();
  await page.getByLabel("Upload text files").setInputFiles([
    { name: "cover-letter.txt", mimeType: "text/plain", buffer: Buffer.from("Dear team") },
    { name: "huge.txt", mimeType: "text/plain", buffer: Buffer.alloc(400_000, "x") },
  ]);
  await expect(page.locator(".doc-list")).toContainText("cover-letter.txt");
  await expect(page.locator(".doc-list")).not.toContainText("huge.txt");
  await expect(page.getByRole("alert")).toContainText("huge.txt");
});

test("blocks can be configured, deleted and restored with undo", async ({ page }) => {
  await openTemplate(page, "Job fit reviewer");
  await page.locator(".block", { hasText: "Fit reviewer" }).click();
  await page.getByRole("tab", { name: "Tools" }).click();
  await page.getByLabel(/Calculator/).check();
  await expect(page.locator(".block", { hasText: "Fit reviewer" })).toContainText("1 tools");

  const before = await blocks(page).count();
  await page.locator(".block", { hasText: "Fit reviewer" }).getByRole("button", { name: "Block options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(blocks(page)).toHaveCount(before - 1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(blocks(page)).toHaveCount(before);
});

test("documents can be added, ignored and included", async ({ page }) => {
  await openTemplate(page, "Job fit reviewer");
  await page.locator(".block", { hasText: "Resume" }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Name", { exact: true }).fill("notes.txt");
  await page.getByLabel("Text", { exact: true }).fill("Some notes");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.locator(".block", { hasText: "Resume" })).toContainText("2 files");
  await page.locator(".doc-list li", { hasText: "notes.txt" }).getByRole("button", { name: "Included" }).click();
  await expect(page.locator(".block", { hasText: "Resume" })).toContainText("1 file");
});

test("versions save and restore", async ({ page }) => {
  await openTemplate(page, "Poster maker");
  const original = await blocks(page).count();
  await page.getByRole("button", { name: /^Language/ }).click();
  await expect(blocks(page)).toHaveCount(original + 1);
  await page.getByRole("button", { name: "Create new version" }).click();
  await expect(page.getByRole("button", { name: "Versions" })).toContainText("v2");
  await page.getByRole("button", { name: "Versions" }).click();
  await page.getByRole("menuitem", { name: /Version 1/ }).click();
  await expect(blocks(page)).toHaveCount(original);
});

test("agents persist after a reload and can be deleted", async ({ page }) => {
  await openTemplate(page, "Poster maker");
  await page.getByLabel("Agent name").fill("My poster agent");
  await page.waitForTimeout(600);
  await page.reload();
  const card = page.locator(".agent-card", { hasText: "My poster agent" });
  await expect(card).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: /Delete/ }).click();
  await expect(card).toBeHidden();
});

test("a share link opens a copy of the agent", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTemplate(page, "Poster maker");
  await page.getByLabel("Agent name").fill("Shared poster");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("status")).toContainText("Link copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#share=");

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByLabel("Agent name")).toHaveValue("Shared poster");
  await expect(other).toHaveURL(/\/$/);
  await other.close();
});

test("a damaged share link shows a message instead of breaking", async ({ page }) => {
  await page.goto("/#share=garbage!!");
  await expect(page.getByRole("status")).toContainText("damaged");
  await expect(page.locator(".template-card").first()).toBeVisible();
});

test("code can't reach the network and infinite loops stop", async ({ page }) => {
  await openTemplate(page, "Contract analyzer");
  await page.locator(".block", { hasText: "Add review note" }).click();
  const editor = page.getByLabel("JavaScript");

  await editor.fill('return String(typeof fetch) + "/" + String(typeof document);');
  await page.getByRole("button", { name: "Close settings" }).click();
  await runSimulated(page, "Check");
  await expect(page.locator(".message-agent").last()).toContainText("undefined/undefined");

  await page.getByRole("button", { name: "Close playground" }).click();
  await page.locator(".block", { hasText: "Add review note" }).click();
  await editor.fill("while (true) {}");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByLabel("Message").fill("Loop");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message-agent").last()).toContainText("longer than 3 seconds", { timeout: 8000 });
});

test("when the daily allowance runs out, it explains and offers a simulated run", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "quota_exhausted", message: "Today's free AI allowance is used up. It resets at 00:00 UTC." }),
    }),
  );
  await openTemplate(page, "Poster maker");
  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByRole("button", { name: /jazz night/ }).click();
  const alert = page.locator(".message-agent").getByRole("alert");
  await expect(alert).toContainText("allowance is used up");
  await alert.getByRole("button", { name: "Run with simulated answers" }).click();
  await expect(page.locator(".message-image")).toBeVisible();
});

test("a real answer streams from the API into the conversation", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"reasoning":"hidden"}}]}\n\ndata: {"choices":[{"delta":{"content":"Hello "}}]}\n\ndata: {"choices":[{"delta":{"content":"**world**"}}]}\n\ndata: [DONE]\n\n',
    }),
  );
  await openTemplate(page, "Job fit reviewer");
  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByLabel("Message").fill("Test");
  await page.keyboard.press("Enter");
  const answer = page.locator(".message-agent .markdown");
  await expect(answer).toHaveText("Hello world");
  await expect(answer.locator("strong")).toHaveText("world");
  await expect(page.locator(".message-agent")).not.toContainText("hidden");
});

test("model text can't inject HTML", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ response: "<img src=x onerror=\"window.pwned=1\">" })}\n\ndata: [DONE]\n\n`,
    }),
  );
  await openTemplate(page, "Job fit reviewer");
  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByLabel("Message").fill("Test");
  await page.keyboard.press("Enter");
  await expect(page.locator(".message-agent .markdown")).toContainText("<img");
  expect(await page.evaluate(() => (window as Window & { pwned?: number }).pwned)).toBeUndefined();
});

test("the overview shows versions and runs", async ({ page }) => {
  await openTemplate(page, "Support triage");
  await runSimulated(page, "A refund please");
  await expect(page.locator(".message-agent").getByText("Simulated answer", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator(".run-list li")).toHaveCount(1);
  await expect(page.locator(".run-list")).toContainText("A refund please");
});

test("the API rejects bad requests", async ({ request }) => {
  const badModel = await request.post("/api/chat", { data: { model: "paid/model", messages: [{ role: "user", content: "x" }] } });
  expect(badModel.status()).toBe(400);
  const crossSite = await request.post("/api/chat", { data: {}, headers: { origin: "https://example.com" } });
  expect(crossSite.status()).toBe(403);
  const tooBig = await request.post("/api/chat", {
    data: { model: "@cf/zai-org/glm-4.7-flash", messages: [{ role: "user", content: "x".repeat(70_000) }] },
  });
  expect(tooBig.status()).toBe(413);
  const unknown = await request.get("/api/nope");
  expect(unknown.status()).toBe(404);
});

test("security headers are served", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["content-security-policy"]).toContain("worker-src blob:");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});

test("@mobile the builder works on a phone with no sideways scroll", async ({ page }) => {
  await page.goto("/");
  await page.locator(".template-card", { hasText: "Poster maker" }).click();
  await expect(blocks(page).first()).toBeVisible();

  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("button", { name: /^Language/ }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  // The template already has one language block.
  await expect(page.locator(".block", { hasText: "Language AI" })).toHaveCount(2);

  await page.getByRole("button", { name: "Playground" }).click();
  await page.getByLabel("Simulated answers").check();
  await page.getByLabel("Message").fill("Hi");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message-image")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
