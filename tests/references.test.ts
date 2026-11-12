import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { legacyFixture } from "../scripts/legacy-fixture.js";
import { Store } from "../server/store.js";
import sharp from "sharp";
import { hash } from "../server/files.js";
import { References, run } from "../server/references.js";
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "foundry-reference-unit-")),
    store = new Store(root);
  await store.init();
  await store.importBundle(
    await legacyFixture(
      "test",
      "Test",
      "people",
      "human",
      [
        {
          id: "r1",
          stage: "study",
          summary: "test",
          files: [
            {
              kind: "model",
              path: resolve("artifacts/authoring-proof/human.glb"),
            },
            {
              kind: "blend",
              path: resolve("artifacts/authoring-proof/human.blend"),
            },
          ],
        },
      ],
      1,
    ),
  );
  return { root, store };
}
test("legacy metadata defaults reference collections; failures are durable/replayed and source hashes checked", async () => {
  const { root, store } = await setup();
  try {
    const path = join(store.path("test"), "project.json"),
      old = JSON.parse(await readFile(path, "utf8"));
    delete old.renderSets;
    delete old.handoffs;
    await writeFile(path, JSON.stringify(old));
    assert.deepEqual((await store.read("test")).renderSets, []);
    const refs = new References(store, { blender: "/nonexistent/blender" });
    const failed = await refs.generate("test", {
      requestId: "missing-blender",
      revisionId: "r1",
    });
    assert.equal(failed.status, "failed");
    assert.match(failed.error!, /ENOENT/);
    assert.deepEqual(
      await refs.generate("test", {
        requestId: "missing-blender",
        revisionId: "r1",
      }),
      failed,
    );
    await assert.rejects(
      refs.generate("test", {
        requestId: "missing-blender",
        revisionId: "other",
      }),
      /reused/,
    );
    const p = await store.read("test"),
      f = p.revisions[0].files[0];
    await writeFile(join(root, "blobs", f.hash), "corruption");
    const bad = await refs.generate("test", {
      requestId: "hash-failure",
      revisionId: "r1",
    });
    assert.equal(bad.status, "failed");
    assert.match(bad.error!, /hash mismatch/);
    assert.equal(bad.outputs.length, 0);
    assert.deepEqual((await store.read("test")).accepted, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("interrupted renders recover explicitly; failed/cancelled jobs retain earlier records", async () => {
  const { root, store } = await setup();
  try {
    const refs = new References(store, { blender: "/nonexistent/blender" });
    const failed = await refs.generate("test", {
      requestId: "failure",
      revisionId: "r1",
    });
    await store.updateReferences("test", (p) =>
      p.renderSets.push({
        ...failed,
        id: "interruption",
        status: "running",
        error: undefined,
      }),
    );
    await refs.recover();
    const sets = (await store.read("test")).renderSets;
    assert.equal(sets[1].status, "interrupted");
    assert.deepEqual(sets[0], failed);
    await assert.rejects(refs.cancel("test", "missing"), /not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("untrusted portable handoff paths never execute and explicit connection is mandatory", async () => {
  const { root, store } = await setup();
  try {
    const refs = new References(store, {
      blender: "/nonexistent",
      sceneCheckout: "/trusted/checkout",
      sceneRoot: "/trusted/library",
    });
    await assert.rejects(
      refs.cli({ checkout: "/untrusted", dataRoot: "/personal" }, [
        "project",
        "list",
      ]),
      /operator-configured/,
    );
    assert.throws(
      () => new References(store, { blender: "/nonexistent" }).connection(),
      /Configure absolute/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("bounded subprocess runner rejects timeouts, overflow and cancellation", async () => {
  await assert.rejects(
    run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 30 }),
    /timed out/,
  );
  await assert.rejects(
    run(process.execPath, [
      "-e",
      "process.stdout.write('x'.repeat(9*1024*1024))",
    ]),
    /output limit/,
  );
  const controller = new AbortController(),
    pending = run(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      signal: controller.signal,
    });
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

// Synthetic metadata/PNGs exercise storage races; real rendering is covered by test:references.
async function completedFixture(store: Store) {
  const refs = new References(store, {
    blender: "/nonexistent/blender",
    sceneCheckout: "/test/checkout",
    sceneRoot: "/test/library",
  });
  const failed = await refs.generate("test", {
    requestId: "render-good",
    revisionId: "r1",
  });
  const bytes = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#777777" },
  })
    .png()
    .toBuffer();
  await store.installBlob(hash(bytes), bytes);
  const good = {
    ...failed,
    status: "completed" as const,
    error: undefined,
    resolved: { fixture: true },
    outputs: (["front", "right-side", "three-quarter"] as const).map(
      (view) => ({
        view,
        hash: hash(bytes),
        size: bytes.length,
        mime: "image/png" as const,
      }),
    ),
  };
  await store.updateReferences("test", (p) => {
    p.renderSets[0] = good;
  });
  return { refs, good: (await store.read("test")).renderSets[0] };
}
async function backupMatching(store: Store, predicate: (p: any) => boolean) {
  for (const name of await store.backups("test")) {
    const p = JSON.parse(
      await readFile(join(store.path("test"), "backups", name), "utf8"),
    );
    if (predicate(p)) return name;
  }
  throw Error("Test backup not found");
}
function destinationStub(
  refs: References,
  onImport: () => Promise<void> = async () => {},
) {
  let revision = 0,
    supporting: string[] = [],
    applies = 0;
  refs.cli = async (_target, args) => {
    if (args[0] === "asset") {
      await onImport();
      return { id: "asset_test" };
    }
    if (args[1] === "read")
      return {
        contentRevision: revision,
        scenes: [{ id: "target", supportingAssetIds: [...supporting] }],
      };
    if (args.includes("--dry-run")) return { valid: true };
    const batch = JSON.parse(await readFile(args[3], "utf8"));
    supporting = batch.operations[0].changes.supportingAssetIds;
    revision++;
    applies++;
    return { contentRevision: revision };
  };
  return () => applies;
}
const transfer = {
  requestId: "transfer",
  renderSetId: "render-good",
  views: ["front"],
  projectId: "destination",
  sceneId: "target",
};
test("restore cannot remove an active handoff, while feedback and other project restores remain available", async () => {
  const { root, store } = await setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const importing = new Promise<void>((r) => (entered = r));
  let pending: Promise<unknown> | undefined;
  try {
    const { refs } = await completedFixture(store);
    const applies = destinationStub(refs, async () => {
      entered();
      await gate;
    });
    await refs.prepare("test", transfer);
    const backupId = await backupMatching(
      store,
      (p) => p.renderSets?.[0]?.status === "completed" && !p.handoffs.length,
    );
    pending = refs.resume("test", transfer.requestId);
    await importing;
    const current = await store.read("test");
    await assert.rejects(
      store.restore("test", { backupId, expectedVersion: current.version }),
      /reference job is active/,
    );
    assert.equal((await store.read("test")).handoffs[0].status, "importing");
    await store.apply("test", {
      requestId: "during-transfer",
      expectedVersion: current.version,
      operations: [{ type: "task.set", text: "Preserve ordinary writes" }],
    });
    await store.create({ id: "other", name: "Other" });
    await store.apply("other", {
      requestId: "change",
      expectedVersion: 0,
      operations: [{ type: "task.set", text: "Other task" }],
    });
    await store.restore("other", {
      backupId: (await store.backups("other"))[0],
      expectedVersion: 1,
    });
    release();
    const result = (await pending) as { status: string };
    assert.equal(result.status, "completed");
    assert.equal(applies(), 1);
    assert.equal((await store.read("test")).handoffs[0].status, "completed");
    // Completion releases the guard rather than leaving the project locked forever.
    await store.restore("test", {
      backupId,
      expectedVersion: (await store.read("test")).version,
    });
  } finally {
    release();
    await pending?.catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
test("missing handoff journals stop before apply and failed jobs release restore protection", async () => {
  const { root, store } = await setup();
  try {
    const { refs } = await completedFixture(store);
    const applies = destinationStub(refs, async () => {
      await store.updateReferences("test", (p) => {
        p.handoffs = [];
      });
    });
    await refs.prepare("test", transfer);
    const backupId = await backupMatching(
      store,
      (p) => p.renderSets?.[0]?.status === "completed" && !p.handoffs.length,
    );
    await assert.rejects(
      refs.resume("test", transfer.requestId),
      /journal changed or disappeared/,
    );
    assert.equal(applies(), 0);
    assert.deepEqual((await store.read("test")).handoffs, []);
    await store.restore("test", {
      backupId,
      expectedVersion: (await store.read("test")).version,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("restore rejects during active rendering and checks the guard again on the storage queue", async () => {
  const { root, store } = await setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const entered = new Promise<void>((r) => (started = r));
  const refs = new References(store, { blender: "/nonexistent/blender" });
  const update = store.updateReferences.bind(store);
  store.updateReferences = async (pid, fn) => {
    await update(pid, fn);
    if (
      (await store.read(pid)).renderSets.some((r) => r.status === "running")
    ) {
      started();
      await gate;
    }
  };
  const pending = refs.generate("test", {
    requestId: "render-lock",
    revisionId: "r1",
  });
  try {
    await entered;
    const backupId = await backupMatching(store, (p) => !p.renderSets?.length);
    await assert.rejects(
      store.restore("test", {
        backupId,
        expectedVersion: (await store.read("test")).version,
      }),
      /reference job is active/,
    );
    release();
    assert.equal((await pending).status, "failed");
    await store.restore("test", {
      backupId,
      expectedVersion: (await store.read("test")).version,
    });
  } finally {
    release();
    await pending.catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
test("restore and portable import interrupt detached running renders without changing completed provenance", async () => {
  const { root, store } = await setup();
  try {
    const { refs, good } = await completedFixture(store);
    const input = { requestId: "orphan", revisionId: "r1" };
    await store.updateReferences("test", (p) =>
      p.renderSets.push({
        ...good,
        id: input.requestId,
        requestDigest: hash(JSON.stringify(input)),
        status: "running",
        outputs: [],
        resolved: undefined,
      }),
    );
    await store.apply("test", {
      requestId: "snapshot-running",
      expectedVersion: (await store.read("test")).version,
      operations: [
        { type: "task.set", text: "Snapshot an in-progress render" },
      ],
    });
    const bundle = await store.bundle("test");
    const backupId = await backupMatching(store, (p) =>
      p.renderSets?.some(
        (r: any) => r.id === "orphan" && r.status === "running",
      ),
    );
    const restored = await store.restore("test", {
      backupId,
      expectedVersion: (await store.read("test")).version,
    });
    assert.equal(restored.renderSets[1].status, "interrupted");
    assert.match(restored.renderSets[1].error!, /Restored render/);
    assert.deepEqual(restored.renderSets[0], good);
    assert.equal((await refs.generate("test", input)).status, "interrupted");
    assert.equal((await refs.cancel("test", "orphan")).status, "interrupted");
    const portable = new Store(join(root, "portable"));
    await portable.init();
    const imported = await portable.importBundle(bundle);
    assert.equal(imported.renderSets[1].status, "interrupted");
    assert.match(imported.renderSets[1].error!, /Imported render/);
    assert.deepEqual(imported.renderSets[0], good);
    assert.equal(
      bundle.project.renderSets[1].status,
      "running",
      "Import must not mutate the caller's bundle",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
