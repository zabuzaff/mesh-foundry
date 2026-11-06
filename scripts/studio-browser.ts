import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeApp } from "../server/app.js";
const root = await mkdtemp(join(tmpdir(), "mesh-foundry-browser-"));
const port = 4324,
  url = `http://127.0.0.1:${port}`;
let service = await makeApp(root, port);
const fixture = resolve("artifacts/authoring-proof");
const files = [
  { kind: "model", path: join(fixture, "human.glb") },
  { kind: "blend", path: join(fixture, "human.blend") },
];
await service.store.create({ id: "proof", name: "Authoring proof" });
await service.store.apply("proof", {
  requestId: "seed",
  expectedVersion: 0,
  operations: [
    { type: "category.create", id: "characters", name: "Characters" },
    {
      type: "asset.create",
      asset: {
        id: "human",
        categoryId: "characters",
        name: "Human base",
        purpose: "Editable human and motion study. Technical fixture.",
      },
    },
    ...["base", "material-study"].map((id, index) => ({
      type: "revision.publish",
      id,
      assetId: "human",
      stage: "study",
      summary: index ? "Material study" : "Original palette",
      files: index
        ? [
            { kind: "model", path: join(fixture, "human-edited.glb") },
            { kind: "blend", path: join(fixture, "human-edited.blend") },
          ]
        : files,
      toolVersions: { Blender: "5.2.3" },
      fixture: true,
    })),
    {
      type: "decision.add",
      id: "fixture-status",
      text: "Technical fixtures, not accepted character designs.",
    },
  ],
});
await service.app.listen({ host: "127.0.0.1", port });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  context.setDefaultTimeout(10000);
  const page = await context.newPage(),
    errors: string[] = [],
    failed: string[] = [];
  let expected401 = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && !(expected401 && [401, 503].includes(r.status())))
      failed.push(r.url());
  });
  async function choose(label: string, value: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
  await page.goto(url);
  await page
    .getByRole("heading", { name: "Human base", exact: true })
    .waitFor();
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(700);
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(
    await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        ground: style.getPropertyValue("--ground").trim(),
        accent: style.getPropertyValue("--accent").trim(),
        wordmark: getComputedStyle(document.querySelector(".brand")!)
          .fontWeight,
        displayLoaded: document.fonts.check('800 28px "Syne Variable"'),
        uiLoaded: document.fonts.check('400 13px "DM Sans Variable"'),
      };
    }),
    {
      ground: "#101215",
      accent: "#abbcff",
      wordmark: "800",
      displayLoaded: true,
      uiLoaded: true,
    },
  );
  const projectMenu = page.getByRole("combobox", {
    name: "Project",
    exact: true,
  });
  await projectMenu.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("listbox").waitFor();
  await page.screenshot({
    path: "artifacts/studio-project-menu.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(projectMenu).toBeFocused();
  await choose("Compare revision", "base");
  await page.locator("canvas").nth(1).waitFor();
  await choose("Animation clip", "walk");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const timeline = page.getByLabel("Animation time");
  await timeline.press("End");
  await page.waitForTimeout(120);
  const endPose = await page.locator("canvas").first().screenshot();
  await timeline.press("Home");
  for (let i = 0; i < 12; i++) await timeline.press("ArrowRight");
  await page.waitForTimeout(120);
  const middlePose = await page.locator("canvas").first().screenshot();
  assert(
    !endPose.equals(middlePose),
    "End-to-middle seeking must change the actual model pose",
  );
  await page.getByRole("button", { name: "Next frame", exact: true }).click();
  const next = Number(await timeline.inputValue());
  await page
    .getByRole("button", { name: "Previous frame", exact: true })
    .click();
  assert(Number(await timeline.inputValue()) < next);
  await page
    .getByRole("button", { name: "Restart animation", exact: true })
    .click();
  await expect(timeline).toHaveValue("0");
  await choose("Playback speed", "2×");
  await page
    .getByRole("button", { name: "Loop playback", exact: true })
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible({ timeout: 4000 });
  assert.equal(Number(await timeline.inputValue()), 2);
  await page
    .getByRole("button", { name: "Restart animation", exact: true })
    .click();
  await choose("Playback speed", "1×");
  await page
    .getByRole("button", { name: "Loop playback", exact: true })
    .click();
  await page.getByRole("button", { name: "Animation", exact: true }).click();
  await page.getByRole("region", { name: "Animation takes" }).waitFor();
  await page.waitForTimeout(400);
  await page.evaluate(
    `window.collapseSamples=[];window.collapseDone=new Promise(resolve=>{const start=performance.now();function sample(){window.collapseSamples.push({present:!!document.querySelector('.clip-library'),y:document.querySelector('.review-toolbar').getBoundingClientRect().top});if(performance.now()-start<650)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample);});void 0;`,
  );
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.evaluate(() => (window as any).collapseDone);
  const samples = await page.evaluate(
    () => (window as any).collapseSamples as { present: boolean; y: number }[],
  );
  const removed = samples.findIndex(
    (sample, index) =>
      index > 0 && !sample.present && samples[index - 1].present,
  );
  assert(removed > 0, "Clip panel must complete its exit");
  assert(
    Math.abs(samples[removed].y - samples[removed - 1].y) < 3,
    "Panel unmount must not cause a spacing jump",
  );

  await expect(
    page.getByRole("region", { name: "Animation takes" }),
  ).toHaveCount(0);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/studio-comparison.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pin feedback", exact: true }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.getByText(/Pinned to /).waitFor();
  const feedback = page.getByLabel("Feedback", { exact: true });
  await feedback.fill("Adjust this hand.");
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await page.getByText("Adjust this hand.", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Adjust this hand.", { exact: true }).waitFor();
  assert((await service.store.read("proof")).feedback[0].pin);
  await feedback.fill("Draft must survive live publication");
  const decisions = page.getByRole("button", {
    name: "Design decisions",
    exact: true,
  });
  await decisions.click();
  await expect(decisions).toHaveAttribute("aria-expanded", "false");
  await expect(feedback).toHaveValue("Draft must survive live publication");
  await decisions.click();
  const current = await service.store.read("proof");
  await service.store.apply("proof", {
    requestId: "live",
    expectedVersion: current.version,
    operations: [
      {
        type: "revision.publish",
        id: "live-candidate",
        assetId: "human",
        stage: "study",
        summary: "Live publication",
        files,
        toolVersions: { Blender: "5.2.3" },
        fixture: true,
      },
    ],
  });
  await page.getByRole("button", { name: /live-candidate/ }).waitFor();
  await expect(feedback).toHaveValue("Draft must survive live publication");
  await expect(page.locator(".stage-label").first()).toContainText(
    "material-study",
  );
  await page
    .getByRole("button", { name: "Copy edit prompt", exact: true })
    .click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  assert(prompt.includes(root));
  assert(prompt.includes("material-study"));
  assert(!prompt.includes(service.agentToken));
  let releaseOld!: () => void,
    signalCaptured!: () => void,
    held = false;
  const oldBlocked = new Promise<void>((resolve) => (releaseOld = resolve)),
    captured = new Promise<void>((resolve) => (signalCaptured = resolve));
  await page.route("**/api/projects/proof", async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    signalCaptured();
    await oldBlocked;
    await route.fulfill({ response });
  });
  await captured;
  const beforeNew = await service.store.read("proof");
  await service.store.apply("proof", {
    requestId: "out-of-order",
    expectedVersion: beforeNew.version,
    operations: [
      {
        type: "revision.publish",
        id: "newer-candidate",
        assetId: "human",
        stage: "study",
        summary: "Newer revision",
        files,
        toolVersions: { Blender: "5.2.3" },
        fixture: true,
      },
    ],
  });
  await page.getByRole("button", { name: /newer-candidate/ }).click();
  await feedback.fill("Preserve draft across stale refresh");
  releaseOld();
  await page.waitForTimeout(250);
  await expect(feedback).toHaveValue("Preserve draft across stale refresh");
  await expect(page.locator(".stage-label").first()).toContainText(
    "newer-candidate",
  );
  await page.unroute("**/api/projects/proof");
  await feedback.fill("Submitted draft");
  await page.route("**/api/projects/proof/review", async (route) => {
    const res = await route.fetch();
    await new Promise((r) => setTimeout(r, 450));
    await route.fulfill({ response: res });
  });
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await feedback.fill("Newer unsaved draft");
  await page.getByText("Submitted draft", { exact: true }).waitFor();
  await expect(feedback).toHaveValue("Newer unsaved draft");
  await page.unroute("**/api/projects/proof/review");
  await page
    .locator(".revision-trail button")
    .filter({ has: page.getByText("base", { exact: true }) })
    .click();
  await expect(feedback).toHaveValue("");
  // A real service restart rotates review credentials; first save refreshes the
  // session while preserving the draft, then an explicit retry succeeds.
  expected401 = true;
  await service.app.close();
  service = await makeApp(root, port);
  await service.app.listen({ host: "127.0.0.1", port });
  await feedback.fill("After restart");
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await page
    .getByText("Studio reconnected. Your draft is preserved; save again.")
    .waitFor();
  await expect(feedback).toHaveValue("After restart");
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await page.getByText("After restart", { exact: true }).waitFor();
  expected401 = false;
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await page.getByRole("button", { name: "Accepted", exact: true }).waitFor();
  assert.equal((await service.store.read("proof")).accepted.human, "base");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/studio-narrow.png",
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  const menuBounds = (await page.getByRole("listbox").boundingBox())!;
  assert(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 390);
  await page.screenshot({
    path: "artifacts/studio-menu-narrow.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await service.store.create({ id: "empty-studio", name: "Empty studio" });
  await page.reload();
  await choose("Project", "Empty studio");
  await page
    .getByRole("heading", { name: "Your next idea starts here." })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/studio-empty-narrow.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "artifacts/studio-empty-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await writeFile(
    "artifacts/studio-browser.json",
    JSON.stringify(
      {
        errors,
        failed,
        comparison: true,
        persistedPin: true,
        liveDraftPreserved: true,
        lateSaveDraftPreserved: true,
        restart: true,
        promptDataRoot: true,
        acceptance: true,
        narrowOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log("Studio browser checks pass");
} finally {
  await browser.close();
  await service.app.close();
  await rm(root, { recursive: true, force: true });
}
