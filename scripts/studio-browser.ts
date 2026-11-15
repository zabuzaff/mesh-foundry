import { checkLinkedRehearsal } from "./rehearsal-browser-fixture.js";
import type { Project } from "../shared/schema.js";
import sharp from "sharp";
import { legacyFixture } from "./legacy-fixture.js";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeApp } from "../server/app.js";
const root = await mkdtemp(join(tmpdir(), "mesh-foundry-browser-"));
const port = 4324,
  url = `http://127.0.0.1:${port}`;
let service = await makeApp(root, port);
const fixture = resolve("artifacts/authoring-proof");
const files: { kind: "model" | "blend"; path: string }[] = [
  { kind: "model", path: join(fixture, "human.glb") },
  { kind: "blend", path: join(fixture, "human.blend") },
];
const legacy = await legacyFixture(
  "proof",
  "Authoring proof",
  "characters",
  "human",
  [
    { id: "base", stage: "study", summary: "Original palette", files },
    {
      id: "material-study",
      stage: "study",
      summary: "Material study",
      files: [
        { kind: "model", path: join(fixture, "human-edited.glb") },
        { kind: "blend", path: join(fixture, "human-edited.blend") },
      ],
    },
  ],
  1,
);
legacy.project.assets[0].name = "Human base";
legacy.project.assets[0].purpose =
  "Editable human and motion study. Technical fixture.";
legacy.project.decisions.push({
  id: "fixture-status",
  text: "Technical fixtures, not accepted character designs.",
  createdAt: new Date().toISOString(),
});
await service.store.importBundle(legacy);
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
        parentId: "base",
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
    .getByRole("button", { name: "3D Prototypes", exact: true })
    .click();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Copy revision prompt", exact: true })
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
        parentId: "base",
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
  // Full creator progression, exercised only in this temporary library.
  const imagePath = join(root, "concept.png");
  await sharp({
    create: { width: 32, height: 32, channels: 4, background: "#abbcff" },
  })
    .png()
    .toFile(imagePath);
  await service.store.apply("empty-studio", {
    requestId: "concept-seed",
    expectedVersion: 0,
    operations: [
      { type: "category.create", id: "props", name: "Props" },
      {
        type: "asset.create",
        asset: {
          id: "crate",
          categoryId: "props",
          name: "Crate",
          purpose: "Progression fixture",
        },
      },
      {
        type: "revision.publish",
        id: "concept-r1",
        assetId: "crate",
        stage: "sketch",
        summary: "Concept fixture",
        files: [{ kind: "image", path: imagePath }],
        toolVersions: {},
        fixture: true,
      },
    ],
  });
  await page.getByRole("heading", { name: "Crate", exact: true }).waitFor();
  const prototypeCopy = page.getByRole("button", {
    name: "Copy 3D prototype prompt",
    exact: true,
  });
  const turnaroundCopy = page.getByRole("menuitem", {
    name: "Copy detailed 2D concept prompt",
    exact: true,
  });
  await expect(turnaroundCopy).toHaveCount(0);
  await expect(prototypeCopy).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open in 2D Concepts", exact: true })
    .click();
  await expect(page.locator(".revision-actions")).toContainText("concept-r1");
  let writes = 0;
  page.on("request", (req) => {
    if (req.method() !== "GET") writes++;
  });
  const checkCopy = async (label: string, expected: string[]) => {
    const before = await service.store.read("empty-studio"),
      beforeWrites = writes;
    const button = page.getByRole("button", { name: label, exact: true });
    const item = page
      .locator('.action-menu[data-state="open"]')
      .getByRole("menuitem", { name: label, exact: true });
    if (await button.isVisible()) {
      await button.click();
    } else {
      if (!(await item.isVisible())) {
        await page
          .getByRole("button", { name: "More actions", exact: true })
          .click();
      }
      await item.click();
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
    const text = await page.evaluate(() => navigator.clipboard.readText());
    for (const value of expected) assert(text.includes(value), value);
    assert(!text.includes(service.agentToken));
    assert.equal(writes, beforeWrites);
    assert.deepEqual(await service.store.read("empty-studio"), before);
  };
  const projectActions = page.getByRole("button", {
    name: "Project actions",
    exact: true,
  });
  await projectActions.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Copy new concept prompt" }),
  ).toBeFocused();
  await page.screenshot({
    path: "artifacts/studio-project-actions.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(projectActions).toBeFocused();
  await projectActions.click();

  await checkCopy("Copy new concept prompt", [
    "project empty-studio",
    "Create a separate asset",
  ]);
  assert(
    !(await page.evaluate(() => navigator.clipboard.readText())).includes(
      "exact revision concept-r1",
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Next on the worktable" }),
  ).toHaveCount(0);
  await checkCopy("Copy concept revision prompt", [
    "concept-r1",
    "stage sketch",
    "approval is not required for revision work",
  ]);
  await page
    .getByRole("button", { name: "3D Prototypes", exact: true })
    .click();
  await expect(
    page.getByText(
      "Select and approve an exact 2D Concept revision, then use its advancement prompt.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy stage prompt", exact: true }),
  ).toHaveCount(0);
  await expect(prototypeCopy).toHaveCount(0);
  await page.getByRole("button", { name: "2D Concepts", exact: true }).click();
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await expect(prototypeCopy).toBeEnabled();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menu").screenshot({
    path: "artifacts/studio-revision-actions.png",
    animations: "disabled",
  });
  await checkCopy("Copy detailed 2D concept prompt", [
    "exact revision concept-r1",
    "concept.png",
    "front, front-right, right, back-right, back, back-left, left, and front-left",
    "scale, baseline, proportions, and design",
    "Attach all eight separate images",
    "Prepare only missing views",
    "budget for the 30-file revision limit",
    "grouping angles into labeled part sheets",
    "create dedicated part drawings from the approved design",
    "do not count as dedicated part drawings",
    "carry forward all approved detail images unchanged",
    "parentId concept-r1, stage sketch",
    root,
  ]);
  await checkCopy("Copy 3D prototype prompt", [
    "empty-studio",
    "crate",
    "concept-r1",
    "concept.png",
    "real, rotatable 3D geometry",
    "parentId concept-r1, stage study",
    root,
  ]);
  await page.screenshot({
    path: "artifacts/studio-concept-progression.png",
    fullPage: true,
  });
  // Wait on the empty destination stage while the agent publishes.
  await page
    .getByRole("button", { name: "3D Prototypes", exact: true })
    .click();
  await service.store.apply("empty-studio", {
    requestId: "prototype",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "revision.publish",
        id: "prototype-r1",
        parentId: "concept-r1",
        assetId: "crate",
        stage: "study",
        summary: "Prototype fixture",
        files,
        toolVersions: {},
        fixture: true,
      },
    ],
  });
  await expect(page.locator(".stage-label").first()).toContainText(
    "prototype-r1",
  );
  await expect(page.locator(".stage-empty")).toHaveCount(0);
  await expect(page.locator("canvas").first()).toBeVisible();
  // Once the arriving revision is selected, later candidates must not steal it.
  await service.store.apply("empty-studio", {
    requestId: "prototype-revision",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "revision.publish",
        id: "prototype-r2",
        parentId: "prototype-r1",
        assetId: "crate",
        stage: "study",
        summary: "Alternate prototype",
        files,
        toolVersions: {},
        fixture: true,
      },
    ],
  });
  await page
    .locator(".revision-trail button")
    .filter({ has: page.getByText("prototype-r2", { exact: true }) })
    .waitFor();
  await expect(page.locator(".stage-label").first()).toContainText(
    "prototype-r1",
  );
  await page.getByRole("button", { name: "All work", exact: true }).click();
  await page
    .getByRole("button", { name: "Open in 3D Prototypes", exact: true })
    .click();
  await page.locator(".asset-item.selected").click();
  await expect(page.locator(".revision-actions")).toContainText("prototype-r1");
  const developedCopy = page.getByRole("button", {
    name: "Copy developed model prompt",
    exact: true,
  });
  await expect(developedCopy).toHaveCount(0);
  assert.equal(
    (await service.store.read("empty-studio")).accepted.crate,
    "concept-r1",
  );
  await checkCopy("Copy 3D prototype review prompt", [
    "exact revision prototype-r1",
    "exact revision concept-r1",
    "capture the exact exported GLB",
    "Number the images SS1, SS2",
    "clickable local file link using the absolute path",
    "finding.add",
    "Set revisionId to prototype-r1",
    "Optional direction",
    root,
  ]);
  await checkCopy("Copy revision prompt", [
    "parentId prototype-r1, stage study",
  ]);
  await service.store.apply("empty-studio", {
    requestId: "review-fixture",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "finding.add",
        id: "prototype-fit",
        revisionId: "prototype-r1",
        text: "SS1: Round the left join. Verify in profile.",
      },
      {
        type: "finding.add",
        id: "other-fit",
        revisionId: "prototype-r2",
        text: "Different candidate only.",
      },
    ],
  });
  await page
    .getByText("SS1: Round the left join. Verify in profile.", { exact: true })
    .waitFor();
  await checkCopy("Copy 3D prototype correction prompt", [
    "parentId prototype-r1, stage study",
    "SS1: Round the left join.",
    "Optional direction",
  ]);
  assert(
    !(await page.evaluate(() => navigator.clipboard.readText())).includes(
      "Different candidate only.",
    ),
  );
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await expect(developedCopy).toBeEnabled();
  await checkCopy("Copy developed model prompt", [
    "prototype-r1",
    "human.blend",
    "do not recreate it from screenshots",
    "production requirements",
    "parentId prototype-r1, stage model",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/studio-prototype-progression-narrow.png",
    fullPage: true,
  });
  const originalGlb = await readFile(files[0].path);
  const originalJsonEnd = 20 + originalGlb.readUInt32LE(12);
  const embedded = JSON.parse(
    originalGlb.toString("utf8", 20, originalJsonEnd),
  );
  delete embedded.animations[0].name;
  const json = JSON.stringify(embedded);
  const jsonBytes = Buffer.from(json);
  const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 32);
  jsonBytes.copy(paddedJson);
  const glb = Buffer.concat([
    originalGlb.subarray(0, 20),
    paddedJson,
    originalGlb.subarray(originalJsonEnd),
  ]);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(paddedJson.length, 12);
  const modelPath = join(root, "unnamed-clip.glb");
  await writeFile(modelPath, glb);
  await service.store.apply("empty-studio", {
    requestId: "developed",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "revision.publish",
        id: "model-r1",
        parentId: "prototype-r1",
        assetId: "crate",
        stage: "model",
        summary: "Developed fixture",
        files: [{ kind: "model", path: modelPath }, files[1]],
        toolVersions: {},
        fixture: true,
      },
    ],
  });
  await page
    .locator(".revision-trail button")
    .filter({ has: page.getByText("model-r1", { exact: true }) })
    .click();
  await expect(developedCopy).toHaveCount(0);
  await checkCopy("Copy developed model review prompt", [
    "exact revision model-r1",
    "finding.add",
  ]);
  await service.store.apply("empty-studio", {
    requestId: "model-review-fixture",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "finding.add",
        id: "model-fit",
        revisionId: "model-r1",
        text: "SS1: Remove the visible seam. Verify in three-quarter view.",
      },
    ],
  });
  await page
    .getByText("SS1: Remove the visible seam. Verify in three-quarter view.", {
      exact: true,
    })
    .waitFor();
  await checkCopy("Copy developed model correction prompt", [
    "parentId model-r1, stage model",
    "SS1: Remove the visible seam.",
  ]);
  await expect(
    page.getByRole("button", { name: "Accept this revision", exact: true }),
  ).toBeEnabled();
  await page
    .locator(".revision-trail button")
    .filter({ has: page.getByText("concept-r1", { exact: true }) })
    .click();
  await expect(prototypeCopy).toBeEnabled();
  const rehearsalLabel = "Copy Scene Rehearsal prompt";
  const rehearsalCopy = page.getByRole("menuitem", {
    name: rehearsalLabel,
    exact: true,
  });
  const selectRevision = (id: string) =>
    page
      .locator(".revision-trail button")
      .filter({ has: page.getByText(id, { exact: true }) })
      .click();
  await selectRevision("model-r1");
  await expect(rehearsalCopy).toHaveCount(0);
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Developed Models", exact: true })
    .click();
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  await page.route("**/api/session", async (route) => {
    await sessionGate;
    await route.continue();
  });
  const clipsLoaded = page.waitForResponse(
    (response) => response.url().endsWith("/clips") && response.ok(),
  );
  await page.reload();
  await clipsLoaded;
  await page
    .getByRole("button", { name: "Open in Developed Models", exact: true })
    .click();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await expect(rehearsalCopy).toBeDisabled();
  releaseSession();
  await expect(rehearsalCopy).toBeEnabled();
  await page.unroute("**/api/session");
  const identity = JSON.stringify({
    project: "empty-studio",
    asset: "crate",
    revision: "model-r1",
    hash: createHash("sha256").update(glb).digest("hex"),
    clips: embedded.animations.map(
      (clip: { name?: string }) => clip.name ?? null,
    ),
  });
  const payload = [
    identity,
    "A null or empty clip name identifies an unnamed animation",
    JSON.stringify(root),
    "read empty-studio",
    "export empty-studio",
    "Immediately before importing, reread the live Mesh Foundry acceptance record",
    "If a supported agent import workflow is still missing, report the blocker",
    "Ask the owner if the target rehearsal or any slot mapping is unclear",
    "Final approval and export are owner actions",
  ];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(url + "/"))
      externalRequests.push(request.url());
  });
  await checkCopy(rehearsalLabel, payload);
  assert.deepEqual(externalRequests, []);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await rehearsalCopy.screenshot({
    path: "artifacts/studio-rehearsal-action.png",
  });
  await page.screenshot({
    path: "artifacts/studio-rehearsal-narrow.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "All work", exact: true }).click();
  await selectRevision("prototype-r2");
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await expect
    .poll(async () => (await service.store.read("empty-studio")).accepted.crate)
    .toBe("prototype-r2");
  await page
    .getByRole("button", { name: "Developed Models", exact: true })
    .click();
  await selectRevision("model-r1");
  await checkCopy(rehearsalLabel, payload);
  const imageNames = [
    "front",
    "front-right",
    "right",
    "back-right",
    "back",
    "back-left",
    "left",
    "front-left",
    "detail-hinge-profile",
  ];
  const viewFiles = await Promise.all(
    imageNames.map(async (angle, index) => {
      const path = join(root, angle + ".png");
      await sharp({
        create: {
          width: 80,
          height: 100,
          channels: 3,
          background: { r: 60 + (index % 7) * 20, g: 110, b: 145 },
        },
      })
        .png()
        .toFile(path);
      return { kind: "image" as const, path };
    }),
  );
  await service.store.apply("empty-studio", {
    requestId: "detailed-concept",
    expectedVersion: (await service.store.read("empty-studio")).version,
    operations: [
      {
        type: "revision.publish",
        id: "concept-r2",
        parentId: "concept-r1",
        assetId: "crate",
        stage: "sketch",
        summary: "Eight orthographic image fixtures and one detail",
        files: viewFiles,
        toolVersions: {},
        fixture: true,
      },
    ],
  });
  await page.getByRole("button", { name: "2D Concepts", exact: true }).click();
  await selectRevision("concept-r2");
  await expect(prototypeCopy).toHaveCount(0);
  const conceptManifest = (
    await service.store.read("empty-studio")
  ).revisions.find((revision) => revision.id === "concept-r2")?.files;
  assert(conceptManifest);
  assert.equal(conceptManifest[0].id, conceptManifest[7].id);
  const picker = page.getByRole("combobox", { name: "Concept image" });
  for (const angle of [...imageNames.slice(1), imageNames[0]]) {
    await picker.click();
    await page
      .getByRole("option", { name: angle + ".png", exact: true })
      .click();
    const image = page.getByRole("img", { name: angle + ".png", exact: true });
    const file: Project["revisions"][number]["files"][number] =
      conceptManifest[imageNames.indexOf(angle)];
    assert.equal(file.name, angle + ".png");
    await expect(image).toHaveAttribute(
      "src",
      `/api/projects/empty-studio/revisions/concept-r2/files/${file.id}`,
    );
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBe(80);
  }
  await picker.click();
  await page.screenshot({
    path: "artifacts/studio-eight-view-narrow.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "artifacts/studio-eight-view-desktop.png",
    fullPage: true,
  });
  await selectRevision("concept-r1");
  await expect(picker).toHaveCount(0);
  await expect(prototypeCopy).toBeEnabled();
  await selectRevision("concept-r2");
  await page
    .getByRole("button", { name: "Accept this revision", exact: true })
    .click();
  await expect(prototypeCopy).toBeEnabled();
  await checkCopy("Copy 3D prototype prompt", [
    "exact revision concept-r2",
    "use all 9 image files",
    "use all eight full-asset views even if detail images are also attached",
    "cardinal views to establish proportions and depth",
    "diagonal views to check how the volumes join",
    "Use dedicated part drawings to model construction and fit",
    "follow the sketch parentId chain for this asset",
    "parentId concept-r2, stage study",
    ...imageNames.map((angle) => angle + ".png"),
  ]);
  await selectRevision("concept-r1");
  await expect(prototypeCopy).toHaveCount(0);
  await expect(turnaroundCopy).toHaveCount(0);
  await checkCopy("Copy concept revision prompt", [
    "parentId concept-r1, stage sketch",
  ]);
  assert.equal((await service.store.read("empty-studio")).revisions.length, 5);
  if (process.env.SCENE_LOOM_TEST_CHECKOUT)
    await checkLinkedRehearsal(
      process.env.SCENE_LOOM_TEST_CHECKOUT,
      root,
      service,
      page,
    );
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
        creatorProgression: true,
        clipboardOnly: true,
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
