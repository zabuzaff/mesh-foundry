// Opt-in real Blender + unchanged Scene Loom CLI integration. Never uses personal defaults.
import { legacyFixture } from "./legacy-fixture.js";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import sharp from "sharp";
import { chromium, expect } from "@playwright/test";
import { makeApp } from "../server/app.js";
import { run, References } from "../server/references.js";
import { hash } from "../server/files.js";
const checkout = process.env.SCENE_LOOM_TEST_CHECKOUT;
if (!checkout || !isAbsolute(checkout))
  throw Error(
    "Explicit absolute SCENE_LOOM_TEST_CHECKOUT required; no default library is allowed",
  );
const root = await mkdtemp(join(tmpdir(), "foundry-reference-e2e-"));
const sceneRoot = join(root, "scene"),
  foundryRoot = join(root, "foundry");
await mkdir(sceneRoot);
await mkdir(foundryRoot);
process.env.SCENE_LOOM_CLI_DIR = checkout;
process.env.SCENE_LOOM_DATA_DIR = sceneRoot;
async function port() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const p = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
const scenePort = await port(),
  foundryPort = await port();
const env = {
  ...process.env,
  SCENE_LOOM_DATA_DIR: sceneRoot,
  SCENE_LOOM_PORT: String(scenePort),
  MESH_FOUNDRY_DATA_DIR: foundryRoot,
};
const child = spawn(
  process.execPath,
  [
    join(checkout, "node_modules/tsx/dist/cli.mjs"),
    join(checkout, "server/index.ts"),
  ],
  { cwd: checkout, env, stdio: "pipe" },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
const service = await makeApp(foundryRoot, foundryPort);
await service.app.listen({ host: "127.0.0.1", port: foundryPort });
await writeFile(
  join(foundryRoot, "runtime.json"),
  JSON.stringify({
    url: `http://127.0.0.1:${foundryPort}`,
    token: service.agentToken,
  }),
  { mode: 0o600 },
);
const refs = service.references;
let count = 0;
async function input(data: unknown) {
  const path = join(root, `input-${count++}.json`);
  await writeFile(path, JSON.stringify(data));
  return path;
}
async function scene(...args: string[]) {
  return refs.cli({ checkout: checkout!, dataRoot: sceneRoot }, args);
}
async function foundry(...args: string[]) {
  const s = await run(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("scripts/cli.ts"),
      ...args,
    ],
    { cwd: process.cwd(), env, timeout: 15 * 60 * 1000 },
  );
  return JSON.parse(s).data;
}
const pid = "isolated-ref-test",
  sid = "reference-destination";
async function sceneBatch(ops: unknown[]) {
  const p = await scene("project", "read", pid);
  return scene(
    "project",
    "apply",
    pid,
    await input({
      schemaVersion: 1,
      projectId: pid,
      requestId: crypto.randomUUID(),
      expectedContentRevision: p.contentRevision,
      operations: ops,
    }),
  );
}
integration: try {
  for (let n = 0; n < 100; n++) {
    try {
      await readFile(join(sceneRoot, "runtime.json"));
      break;
    } catch {
      if (child.exitCode !== null) throw Error(logs);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  await scene(
    "project",
    "create",
    await input({ id: pid, title: "Isolated references" }),
  );
  const imports: string[] = [];
  for (const color of ["#334455", "#665544", "#556677"]) {
    const path = join(root, `seed-${imports.length}.png`);
    await sharp({
      create: { width: 40, height: 40, channels: 3, background: color },
    })
      .png()
      .toFile(path);
    imports.push(
      (
        await scene(
          "asset",
          "import",
          pid,
          await input({ path, kind: "project-image" }),
        )
      ).id,
    );
  }
  await sceneBatch([
    {
      type: "scene.create",
      scene: {
        id: sid,
        title: "Keep title",
        description: "Keep description",
        notes: "Keep notes exactly.\nSecond line.",
        mainAssetId: imports[0],
        supportingAssetIds: [imports[1]],
      },
    },
    {
      type: "scene.create",
      scene: {
        id: "other",
        title: "Other",
        description: "",
        notes: "",
        mainAssetId: imports[0],
        supportingAssetIds: [],
      },
    },
    {
      type: "connection.create",
      connection: {
        id: "edge",
        sourceSceneId: sid,
        targetSceneId: "other",
        label: "Keep link",
      },
    },
  ]);
  await scene(
    "layout",
    "patch",
    pid,
    await input({
      expectedLayoutRevision: 0,
      positions: { [sid]: { x: 150, y: -70 } },
    }),
  );
  const variant = await scene(
    "storyboard",
    "create",
    pid,
    await input({ name: "Alternate" }),
  );
  const sceneRuntime = JSON.parse(
    await readFile(join(sceneRoot, "runtime.json"), "utf8"),
  );
  async function toggle(targetId: string, enabled: boolean) {
    const response = await fetch(
      `http://127.0.0.1:${scenePort}/api/projects/${targetId}/settings`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sceneRuntime.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meshFoundryEnabled: enabled }),
      },
    );
    assert.ok(response.ok, await response.text());
  }
  await assert.rejects(foundry("scene-loom", pid, pid), /handoff is disabled/);
  await toggle(pid, true);
  const baseline = await foundry("scene-loom", pid, pid);
  assert.equal(baseline.library, null);
  const libraryId = baseline.libraryId;
  await foundry(
    "create",
    await input({
      id: libraryId,
      name: "Shared library",
      sceneLoomProjectId: pid,
    }),
  );
  await assert.rejects(
    foundry("scene-loom", pid, variant.id),
    /handoff is disabled/,
  );
  await toggle(variant.id, true);
  const alternate = await foundry("scene-loom", pid, variant.id);
  assert.equal(alternate.libraryId, libraryId);
  await assert.rejects(
    foundry("scene-loom", variant.id, variant.id),
    /does not belong/,
  );
  const pin = {
    type: "scene-loom.pin",
    suggestionId: "shared-prop",
    sceneIds: [sid, "other"],
    assetId: "prop",
    revisionId: "concept-1",
  };
  const publish = {
    type: "revision.publish",
    id: "concept-1",
    assetId: "prop",
    stage: "sketch",
    summary: "Shared prop concept",
    toolVersions: {},
    files: [{ kind: "image", path: join(root, "seed-0.png") }],
  };
  const baselineBatch = await input({
    requestId: "baseline-concept",
    expectedVersion: 0,
    sceneLoom: {
      projectId: pid,
      storyboardId: pid,
      sceneId: sid,
      contentRevision: baseline.contentRevision,
    },
    operations: [
      { type: "category.create", id: "props", name: "Props" },
      {
        type: "asset.create",
        asset: {
          id: "prop",
          categoryId: "props",
          name: "Prop",
          purpose: "Shared prop",
        },
      },
      publish,
      pin,
    ],
  });
  const blobsBefore = await readdir(join(foundryRoot, "blobs"));
  await assert.rejects(
    foundry(
      "apply",
      libraryId,
      await input({
        ...JSON.parse(await readFile(baselineBatch, "utf8")),
        operations: [pin, { type: "task.set", text: "Unrelated update" }],
      }),
    ),
    /Operation is not allowed in Scene Loom generation/,
  );
  await toggle(pid, false);
  await assert.rejects(
    foundry("apply", libraryId, baselineBatch),
    /handoff is disabled/,
  );
  assert.equal((await foundry("read", libraryId)).revisions.length, 0);
  assert.deepEqual(await readdir(join(foundryRoot, "blobs")), blobsBefore);
  await toggle(pid, true);
  await foundry("apply", libraryId, baselineBatch);
  assert.equal(
    (await foundry("apply", libraryId, baselineBatch)).replayed,
    true,
  );
  const repeated = await foundry("scene-loom", pid, pid);
  const fromSecondScene = repeated.library.sceneLoomPins.find(
    (candidate: typeof pin & { storyboardId: string }) =>
      candidate.storyboardId === pid &&
      candidate.sceneIds.includes("other") &&
      candidate.suggestionId === pin.suggestionId,
  );
  assert.equal(fromSecondScene.revisionId, "concept-1");
  const alternateTarget = {
    projectId: pid,
    storyboardId: variant.id,
    sceneId: "other",
    contentRevision: alternate.contentRevision,
  };
  await foundry(
    "apply",
    libraryId,
    await input({
      requestId: "alternate-reuse",
      expectedVersion: 1,
      sceneLoom: alternateTarget,
      operations: [pin],
    }),
  );
  assert.equal((await foundry("read", libraryId)).revisions.length, 1);
  await foundry(
    "apply",
    libraryId,
    await input({
      requestId: "alternate-concept",
      expectedVersion: 2,
      sceneLoom: alternateTarget,
      operations: [
        {
          ...publish,
          id: "concept-2",
          parentId: "concept-1",
          files: [{ kind: "image", path: join(root, "seed-1.png") }],
        },
        { ...pin, revisionId: "concept-2" },
      ],
    }),
  );
  const shared = await foundry("read", libraryId);
  assert.equal(shared.assets.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      shared.sceneLoomPins.map(
        (result: { storyboardId: string; revisionId: string }) => [
          result.storyboardId,
          result.revisionId,
        ],
      ),
    ),
    { [pid]: "concept-1", [variant.id]: "concept-2" },
  );
  console.log(
    "Verified shared Scene Loom library, independent pins, repeat reuse and live toggle checks.",
  );
  if (process.argv.includes("--incoming-only")) break integration;
  const before = await scene("project", "read", pid);
  const files: { kind: "model" | "blend"; path: string }[] = [
    { kind: "model", path: resolve("artifacts/authoring-proof/human.glb") },
    { kind: "blend", path: resolve("artifacts/authoring-proof/human.blend") },
  ];
  await foundry(
    "import",
    await input(
      await legacyFixture(
        "proof",
        "Reference proof",
        "people",
        "human",
        [
          {
            id: "r1",
            stage: "study",
            summary: "Unaccepted geometry fixture",
            files,
          },
        ],
        1,
      ),
    ),
  );
  console.log("Rendering real pinned GLB via Foundry CLI…");
  const rs = await foundry(
    "render",
    "proof",
    await input({ requestId: "render-one", revisionId: "r1" }),
  );
  assert.equal(rs.status, "completed", rs.error);
  assert.equal(rs.outputs.length, 3);
  assert.equal(rs.acceptedAtRender, false);
  assert.equal(
    (
      await foundry(
        "render",
        "proof",
        await input({ requestId: "render-one", revisionId: "r1" }),
      )
    ).id,
    rs.id,
  );
  await mkdir("artifacts", { recursive: true });
  for (const o of rs.outputs) {
    const bytes = await refs.bytes(o.hash);
    assert.equal(hash(bytes), o.hash);
    assert(bytes.includes(Buffer.from("UNACCEPTED STUDY REFERENCE")));
    assert(bytes.includes(Buffer.from("MeshFoundry")));
    const m = await sharp(bytes).metadata();
    assert.equal(m.width, 1024);
    assert.equal(m.height, 1024);
    await sharp(bytes).raw().toBuffer();
    await writeFile(`artifacts/reference-${o.view}.png`, bytes);
  }
  assert.equal(
    new Set(rs.outputs.map((o: { hash: string }) => o.hash)).size,
    3,
  );
  const cameras = rs.resolved.cameras;
  assert(cameras.front.position[1] < 0);
  assert(cameras["right-side"].position[0] > 0);
  assert.equal(cameras.front.orthoScale, cameras["right-side"].orthoScale);
  assert.match(rs.resolved.poseBasis, /REST/);
  assert(
    rs.resolved.bounds.min[2] > -0.01,
    "Hidden bone-display geometry must not enter rest bounds",
  );
  assert(Math.abs(rs.resolved.bounds.centre[2] - 0.95) < 0.01);
  await writeFile(
    "artifacts/reference-manifest.json",
    JSON.stringify(rs, null, 2),
  );
  const raw = await sharp(await refs.bytes(rs.outputs[0].hash))
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.deepEqual([...raw.subarray(0, 3)], [119, 119, 119]);
  // A running Blender job can be cancelled without blocking ordinary review writes.
  const cancellation = foundry(
    "render",
    "proof",
    await input({ requestId: "cancel-proof", revisionId: "r1" }),
  );
  for (let n = 0; n < 100; n++) {
    const state = await foundry("read", "proof");
    if (
      state.renderSets.some(
        (r: { id: string; status: string }) =>
          r.id === "cancel-proof" && r.status === "running",
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 20));
  }
  const during = await foundry("read", "proof");
  await foundry(
    "apply",
    "proof",
    await input({
      requestId: "during-render",
      expectedVersion: during.version,
      operations: [
        {
          type: "task.set",
          text: "Review writes remain available during render",
        },
      ],
    }),
  );
  await foundry("cancel-render", "proof", "cancel-proof");
  const cancelled = await cancellation;
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(cancelled.outputs, []);
  assert.deepEqual((await foundry("read", "proof")).renderSets[0], rs);
  const h = await foundry(
    "handoff",
    "proof",
    await input({
      requestId: "selected-two",
      renderSetId: rs.id,
      views: ["front", "three-quarter"],
      projectId: pid,
      sceneId: sid,
    }),
  );
  assert.equal(h.status, "prepared");
  assert.equal(
    (await scene("project", "read", pid)).contentRevision,
    before.contentRevision,
  );
  const cancelledPreview = await refs.prepare("proof", {
    requestId: "cancelled-preview",
    renderSetId: rs.id,
    views: ["right-side"],
    projectId: pid,
    sceneId: sid,
  });
  assert.equal(
    (await foundry("cancel-handoff", "proof", cancelledPreview.id)).status,
    "cancelled",
  );
  await assert.rejects(refs.resume("proof", cancelledPreview.id), /cancelled/);
  assert.equal(
    (await scene("project", "read", pid)).contentRevision,
    before.contentRevision,
  );
  const done = await foundry("send", "proof", h.id);
  assert.equal(done.status, "completed", done.error);
  assert.equal(done.attempts.length, 1);
  assert(done.attempts[0].dryRun);
  const after = await scene("project", "read", pid),
    current = after.scenes.find((s: { id: string }) => s.id === sid),
    old = before.scenes.find((s: { id: string }) => s.id === sid);
  assert.deepEqual(
    { ...current, supportingAssetIds: old.supportingAssetIds },
    old,
  );
  assert.deepEqual(after.positions, before.positions);
  assert.deepEqual(after.connections, before.connections);
  assert.deepEqual(current.supportingAssetIds, [
    imports[1],
    done.imported.front,
    done.imported["three-quarter"],
  ]);
  assert.equal(done.imported["right-side"], undefined);
  for (const v of ["front", "three-quarter"]) {
    const original = await readFile(
      join(sceneRoot, "projects", pid, "assets", done.imported[v] + ".source"),
    );
    assert.equal(
      hash(original),
      rs.outputs.find((o: { view: string }) => o.view === v).hash,
    );
  }
  assert.deepEqual(await foundry("send", "proof", h.id), done);
  assert.equal(
    (await scene("project", "read", pid)).contentRevision,
    after.contentRevision,
  );
  // Historical completed handoffs never reattach owner-removed references.
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: [imports[1]] },
    },
  ]);
  await foundry("send", "proof", h.id);
  assert.deepEqual(
    (await refs.destination(done.target)).scene.supportingAssetIds,
    [imports[1]],
  );
  const originalCLI = refs.cli.bind(refs);
  async function prepare(
    id: string,
    views: string[] = ["front", "three-quarter"],
  ) {
    return refs.prepare("proof", {
      requestId: id,
      renderSetId: rs.id,
      views,
      projectId: pid,
      sceneId: sid,
    });
  }
  // Real CLI import commits, then response is lost. Retry deduplicates exact bytes.
  let lost = false;
  const lostH = await prepare("lost-import");
  refs.cli = async (t, a) => {
    const result = await originalCLI(t, a);
    if (!lost && a[0] === "asset") {
      lost = true;
      throw Error("Injected lost import response");
    }
    return result;
  };
  assert.equal((await refs.resume("proof", lostH.id)).status, "failed");
  refs.cli = originalCLI;
  assert.equal((await refs.resume("proof", lostH.id)).status, "completed");
  // Concurrent content + layout edits after dry-run force a fresh additive batch.
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: [imports[1]] },
    },
  ]);
  const conflict = await prepare("conflict");
  let changed = false;
  refs.cli = async (t, a) => {
    const result = await originalCLI(t, a);
    if (!changed && a.includes("--dry-run")) {
      changed = true;
      await sceneBatch([
        {
          type: "scene.patch",
          id: sid,
          changes: {
            notes: "Concurrent owner note",
            supportingAssetIds: [imports[1], imports[2]],
          },
        },
      ]);
      const p = await scene("project", "read", pid);
      await scene(
        "layout",
        "patch",
        pid,
        await input({
          expectedLayoutRevision: p.layoutRevision,
          positions: { [sid]: { x: 900, y: 300 } },
        }),
      );
    }
    return result;
  };
  const reconciled = await refs.resume("proof", conflict.id);
  refs.cli = originalCLI;
  assert.equal(reconciled.status, "completed", reconciled.error ?? "");
  assert.equal(reconciled.attempts.length, 2);
  const concurrent = await scene("project", "read", pid);
  assert.equal(concurrent.scenes[0].notes, "Concurrent owner note");
  assert.deepEqual(concurrent.positions[sid], { x: 900, y: 300 });
  assert(concurrent.scenes[0].supportingAssetIds.includes(imports[2]));
  // Lost apply response: reconcile without publishing again.
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: [imports[1]] },
    },
  ]);
  const applyH = await prepare("lost-apply");
  let lostApply = false;
  refs.cli = async (t, a) => {
    const result = await originalCLI(t, a);
    if (
      !lostApply &&
      a[0] === "project" &&
      a[1] === "apply" &&
      !a.includes("--dry-run")
    ) {
      lostApply = true;
      throw Error("Injected lost apply response");
    }
    return result;
  };
  const applyDone = await refs.resume("proof", applyH.id);
  refs.cli = originalCLI;
  assert.equal(applyDone.status, "completed");
  assert.equal(applyDone.attempts.length, 1);
  // Full bundle carries pinned outputs; newer revision does not change them.
  // Simulate process/disk loss after downstream commit, before any Foundry receipt.
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: [imports[1]] },
    },
  ]);
  const crashH = await prepare("restart-after-apply");
  const originalUpdate = service.store.updateReferences.bind(service.store);
  let diskUnavailable = false;
  service.store.updateReferences = async (...a) => {
    if (diskUnavailable)
      throw Error("Injected unavailable disk after remote commit");
    return originalUpdate(...a);
  };
  refs.cli = async (t, a) => {
    const result = await originalCLI(t, a);
    if (a[0] === "project" && a[1] === "apply" && !a.includes("--dry-run"))
      diskUnavailable = true;
    return result;
  };
  await assert.rejects(refs.resume("proof", crashH.id), /unavailable disk/);
  refs.cli = originalCLI;
  service.store.updateReferences = originalUpdate;
  const committedRevision = (await scene("project", "read", pid))
    .contentRevision;
  const restarted = new References(service.store, refs.config);
  assert.equal(
    (await restarted.resume("proof", crashH.id)).status,
    "completed",
  );
  assert.equal(
    (await scene("project", "read", pid)).contentRevision,
    committedRevision,
  );
  await assert.rejects(
    refs.prepare("proof", {
      requestId: "invalid-target",
      renderSetId: rs.id,
      views: ["front"],
      projectId: pid,
      sceneId: "missing-scene",
    }),
    /not found/,
  );
  const rejected = await prepare("rejected-import", ["right-side"]);
  refs.cli = async (t, a) => {
    if (a[0] === "asset") throw Error("Injected destination image rejection");
    return originalCLI(t, a);
  };
  const rejectedResult = await refs.resume("proof", rejected.id);
  refs.cli = originalCLI;
  assert.equal(rejectedResult.status, "failed");
  assert.equal(Object.keys(rejectedResult.imported).length, 0);
  const missingCLI = await prepare("missing-cli");
  const badConnection = new References(service.store, {
    blender: refs.config.blender,
    sceneCheckout: "/missing/scene-loom",
    sceneRoot,
  });
  await assert.rejects(
    badConnection.cli(
      { checkout: "/missing/scene-loom", dataRoot: sceneRoot },
      ["project", "list"],
    ),
  );
  assert.equal(
    (await badConnection.resume("proof", missingCLI.id)).status,
    "failed",
  );
  // Capacity failure preserves all 30 existing references, never evicts to fit.
  const capacityIds = [...imports];
  for (let n = 0; n < 27; n++) {
    const path = join(root, `capacity-${n}.png`);
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: n + 1, g: 80, b: 90 },
      },
    })
      .png()
      .toFile(path);
    capacityIds.push(
      (await scene("asset", "import", pid, await input({ path }))).id,
    );
  }
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: capacityIds },
    },
  ]);
  const capacity = await prepare("capacity", ["right-side"]);
  const capacityResult = await refs.resume("proof", capacity.id);
  assert.equal(capacityResult.status, "failed");
  assert.match(capacityResult.error!, /30 supporting/);
  assert.deepEqual(
    (await refs.destination(capacity.target)).scene.supportingAssetIds,
    capacityIds,
  );
  await sceneBatch([
    {
      type: "scene.patch",
      id: sid,
      changes: { supportingAssetIds: [imports[1]] },
    },
  ]);
  const p = await foundry("read", "proof");
  await foundry(
    "apply",
    "proof",
    await input({
      requestId: "new-revision",
      expectedVersion: p.version,
      operations: [
        {
          type: "revision.publish",
          id: "r2",
          parentId: "r1",
          assetId: "human",
          stage: "study",
          summary: "New candidate",
          files,
          toolVersions: {},
          fixture: true,
        },
      ],
    }),
  );
  const bundle = await service.store.bundle("proof");
  assert.deepEqual(bundle.project.renderSets[0], rs);
  for (const o of rs.outputs)
    assert.equal(hash(Buffer.from(bundle.blobs[o.hash]!, "base64")), o.hash);
  const { Store } = await import("../server/store.js");
  const portable = new Store(join(root, "portable"));
  await portable.init();
  await portable.importBundle(bundle);
  assert.deepEqual(
    (await portable.read("proof")).renderSets,
    bundle.project.renderSets,
  );
  // Browser uses the actual rendered set and selection controls, desktop + narrow.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${foundryPort}`);
    await page
      .locator(".revision-trail button")
      .filter({ hasText: "r1" })
      .click();
    await page
      .getByRole("button", { name: "Reference renders", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Reference set", exact: true })
      .click();
    await page
      .getByRole("option", {
        name: rs.createdAt.slice(11, 19) + " · completed",
        exact: true,
      })
      .click();
    await page.getByAltText("front reference for r1").waitFor();
    await expect(
      page.getByText("UNACCEPTED STUDY REFERENCE", { exact: true }).first(),
    ).toBeVisible();
    await page.getByLabel("Destination project", { exact: true }).fill(pid);
    await page.getByLabel("Destination scene", { exact: true }).fill(sid);
    await page
      .getByRole("button", { name: "Preview handoff", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send references", exact: true })
      .last()
      .waitFor();
    // A preview belongs to its pinned set, never whichever images were last selected.
    await expect(
      page
        .locator(".handoff")
        .filter({ hasText: "Source set render-one" })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Reference set", exact: true })
      .click();
    await page
      .getByRole("option", {
        name: cancelled.createdAt.slice(11, 19) + " · cancelled",
        exact: true,
      })
      .click();
    await expect(page.locator(".handoff")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send references", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Reference set", exact: true })
      .click();
    await page
      .getByRole("option", {
        name: rs.createdAt.slice(11, 19) + " · completed",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Send references", exact: true })
      .last()
      .waitFor();
    await page.screenshot({
      path: "artifacts/reference-ui-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "artifacts/reference-ui-narrow.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const revisionBeforeCancel = (await scene("project", "read", pid))
      .contentRevision;
    await page
      .getByRole("button", { name: "Cancel handoff", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: "Send references", exact: true }),
    ).toHaveCount(0);
    assert.equal(
      (await scene("project", "read", pid)).contentRevision,
      revisionBeforeCancel,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log(
    "PASS: real Blender/CLI selected handoff, exact source integrity, additive preservation, replay/history, lost import/apply responses, concurrent notes/support/layout, portable bundle and browser.",
  );
} finally {
  await service.app.close();
  child.kill("SIGTERM");
  await new Promise<void>((r) => {
    if (child.exitCode !== null) r();
    else child.once("exit", () => r());
  });
  await rm(root, { recursive: true, force: true });
}
