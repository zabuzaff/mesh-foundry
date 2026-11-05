import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../server/store.js";
import { makeApp } from "../server/app.js";
const fixture = resolve("artifacts/authoring-proof");
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "mesh-foundry-test-"));
  const store = new Store(root);
  await store.init();
  await store.create({ id: "game", name: "Game" });
  return { root, store };
}
const initial = {
  requestId: "initial",
  expectedVersion: 0,
  operations: [
    { type: "category.create", id: "people", name: "People" },
    {
      type: "asset.create",
      asset: {
        id: "human",
        categoryId: "people",
        name: "Human",
        purpose: "Fixture",
      },
    },
    {
      type: "revision.publish",
      id: "r1",
      assetId: "human",
      stage: "model",
      summary: "Proof",
      files: [
        { kind: "model", path: join(fixture, "human.glb") },
        { kind: "blend", path: join(fixture, "human.blend") },
      ],
      toolVersions: { Blender: "5.2.3" },
      fixture: true,
    },
  ],
};
test("atomic publication, retries, conflicts, owner acceptance and immutable sources", async () => {
  const { root, store } = await setup();
  try {
    await store.apply("game", initial);
    let p = await store.read("game");
    assert.equal(p.version, 1);
    assert.equal(p.revisions[0].clips.length, 3);
    assert.deepEqual(p.accepted, {});
    assert.equal((await store.apply("game", initial)).replayed, true);
    await assert.rejects(
      store.apply("game", {
        ...initial,
        operations: [{ type: "task.set", text: "Different" }],
      }),
    );
    await assert.rejects(
      store.apply("game", {
        requestId: "stale",
        expectedVersion: 0,
        operations: [{ type: "task.set", text: "stale" }],
      }),
    );
    await assert.rejects(
      store.apply("game", {
        requestId: "bad",
        expectedVersion: 1,
        operations: [
          { type: "category.create", id: "orphan", name: "Orphan" },
          {
            type: "asset.create",
            asset: {
              id: "broken",
              categoryId: "missing",
              name: "Broken",
              purpose: "",
            },
          },
        ],
      }),
    );
    p = await store.read("game");
    assert.equal(p.version, 1);
    assert(!p.categories.some((c) => c.id === "orphan"));
    await assert.rejects(
      store.apply("game", {
        requestId: "forged",
        expectedVersion: 1,
        operations: [],
        action: { type: "accept", revisionId: "r1" },
      }),
    );
    await store.apply(
      "game",
      {
        requestId: "review",
        expectedVersion: 1,
        action: { type: "accept", revisionId: "r1" },
      },
      true,
    );
    await store.apply(
      "game",
      {
        requestId: "feedback",
        expectedVersion: 2,
        action: {
          type: "feedback",
          revisionId: "r1",
          text: "Change the hands",
        },
      },
      true,
    );
    const data = await store.blob(
      "game",
      "r1",
      (await store.read("game")).revisions[0].files[0].id,
    );
    assert(data.bytes.length > 100);
    assert.equal((await store.read("game")).accepted.human, "r1");
    assert.equal((await store.read("game")).feedback.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("concurrent mutations serialize and stale second edit fails", async () => {
  const { root, store } = await setup();
  try {
    const results = await Promise.allSettled(
      ["a", "b"].map((requestId) =>
        store.apply("game", {
          requestId,
          expectedVersion: 0,
          operations: [{ type: "task.set", text: requestId }],
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await store.read("game")).version, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("corrupt projects are isolated and explicit recovery preserves damaged bytes", async () => {
  const { root, store } = await setup();
  try {
    await store.apply("game", {
      requestId: "task",
      expectedVersion: 0,
      operations: [{ type: "task.set", text: "Continue" }],
    });
    const backups = await store.backups("game");
    await writeFile(join(root, "projects/game/project.json"), "null");
    await store.create({ id: "healthy", name: "Healthy" });
    assert.equal(
      (await store.list()).find((p) => p.id === "game")?.status,
      "unreadable",
    );
    assert.equal(
      (await store.list()).find((p) => p.id === "healthy")?.status,
      "ready",
    );
    await assert.rejects(store.restore("game", { backupId: backups[0] }));
    await store.restore("game", { backupId: backups[0], recoverCorrupt: true });
    assert((await store.read("game")).version > 1);
    assert.equal((await store.list()).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("portable bundle restores exact sources without original paths; rejects corrupt bytes", async () => {
  const { root, store } = await setup(),
    other = await mkdtemp(join(tmpdir(), "mesh-foundry-import-"));
  try {
    await store.apply("game", initial);
    const bundle = await store.bundle("game");
    const restored = new Store(other);
    await restored.init();
    await restored.importBundle(bundle);
    assert.deepEqual(await restored.read("game"), await store.read("game"));
    const bad = structuredClone(bundle);
    bad.project.id = "bad";
    bad.blobs[Object.keys(bad.blobs)[0]] = "invalid";
    await assert.rejects(restored.importBundle(bad));
    assert.equal((await restored.list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});
test("invalid GLB batch does not publish metadata or partial revision", async () => {
  const { root, store } = await setup();
  try {
    const bad = join(root, "invalid.glb");
    await writeFile(bad, "not a GLB");
    const input = structuredClone(initial);
    (input.operations[2] as any).files[0].path = bad;
    await assert.rejects(store.apply("game", input));
    assert.equal((await store.read("game")).version, 0);
    assert.equal((await store.read("game")).assets.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("HTTP separates owner and agent authority and rejects foreign origins/hosts", async () => {
  const root = await mkdtemp(join(tmpdir(), "mesh-foundry-api-"));
  const { app, agentToken } = await makeApp(root, 4323);
  try {
    const req = (
      method: string,
      url: string,
      headers: Record<string, string> = {},
      payload?: any,
    ) =>
      app.inject({
        method: method as any,
        url,
        headers: { host: "127.0.0.1:4323", ...headers },
        payload,
      });
    assert.equal(
      (await req("GET", "/api/projects", { origin: "https://evil.example" }))
        .statusCode,
      403,
    );
    assert.equal(
      (await req("GET", "/api/projects", { host: "evil.example" })).statusCode,
      403,
    );
    assert.equal(
      (await req("POST", "/agent/projects", {}, { id: "game", name: "Game" }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await req(
          "POST",
          "/agent/projects",
          { authorization: `Bearer ${agentToken}` },
          { id: "game", name: "Game" },
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await req(
          "POST",
          "/api/projects/game/review",
          { authorization: `Bearer ${agentToken}` },
          {},
        )
      ).statusCode,
      401,
    );
    const session = (await req("GET", "/api/session")).json();
    assert.equal(typeof session.token, "string");
    assert.equal(
      (
        await req(
          "POST",
          "/agent/projects",
          { authorization: `Bearer ${session.token}` },
          { id: "other", name: "Other" },
        )
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("missing-primary recovery and failed bundle retry remain usable", async () => {
  const { root, store } = await setup();
  const other = await mkdtemp(join(tmpdir(), "mesh-foundry-retry-"));
  try {
    await store.apply("game", initial);
    const backups = await store.backups("game");
    await unlink(join(root, "projects/game/project.json"));
    await store.restore("game", { backupId: backups[0], recoverCorrupt: true });
    assert.equal((await store.read("game")).assets.length, 0);
    const bundle = await store.bundle("game");
    const restored = new Store(other);
    await restored.init();
    const invalid = structuredClone(bundle);
    invalid.blobs["a".repeat(64)] = "invalid";
    await assert.rejects(restored.importBundle(invalid));
    assert.equal((await restored.list()).length, 0);
    await restored.importBundle(bundle);
    assert.equal((await restored.list()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});
test("bundle cannot forge active content MIME", async () => {
  const { root, store } = await setup();
  const other = await mkdtemp(join(tmpdir(), "mesh-foundry-mime-"));
  try {
    await store.apply("game", initial);
    const bundle = await store.bundle("game");
    bundle.project.revisions[0].files[0].mime = "text/html";
    const restored = new Store(other);
    await restored.init();
    await assert.rejects(restored.importBundle(bundle), /MIME/);
    assert.equal((await restored.list()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

test("failed portable import never rewrites shared blobs and is retryable", async (t) => {
  const { root, store } = await setup();
  try {
    await store.apply("game", initial);
    const bundle = await store.bundle("game");
    bundle.project.id = "clone";
    const fs = (await import("node:fs/promises")).default;
    const { syncBuiltinESMExports } = await import("node:module");
    const shared = bundle.project.revisions[0].files[0];
    const before = await fs.stat(join(root, "blobs", shared.hash));
    const extra = Buffer.from("New bundle blob");
    const { hash } = await import("../server/files.js");
    bundle.blobs[hash(extra)] = extra.toString("base64");
    const originalOpen = fs.open;
    let failed = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      if (String(args[0]).includes("blobs/.staging-") && !failed) {
        failed = true;
        t.mock.method(handle, "writeFile", async (data: any) => {
          await handle.write(Buffer.from(data).subarray(0, 5));
          throw Error("Simulated disk failure");
        });
      }
      return handle;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        store.importBundle(bundle),
        /Simulated disk failure/,
      );
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
    const after = await fs.stat(join(root, "blobs", shared.hash));
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeMs, before.mtimeMs);
    await store.blob("game", "r1", shared.id);
    assert.equal((await store.list()).length, 1);
    assert(
      !(await fs.readdir(join(root, "blobs"))).some((name) =>
        name.startsWith(".staging-"),
      ),
    );
    await store.importBundle(bundle);
    assert.equal((await store.list()).length, 2);
    await store.blob("game", "r1", shared.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("original GLB material and texture references must validate before publication", async () => {
  const { root, store } = await setup();
  try {
    const source = await readFile(join(fixture, "human.glb"));
    const length = source.readUInt32LE(12),
      json = JSON.parse(source.toString("utf8", 20, 20 + length));
    const { inspectBytes } = await import("../server/files.js");
    function rebuild(value: any) {
      const text = Buffer.from(JSON.stringify(value)),
        padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
      text.copy(padded);
      const rest = source.subarray(20 + length),
        result = Buffer.alloc(20 + padded.length + rest.length);
      source.copy(result, 0, 0, 20);
      result.writeUInt32LE(result.length, 8);
      result.writeUInt32LE(padded.length, 12);
      padded.copy(result, 20);
      rest.copy(result, 20 + padded.length);
      return result;
    }
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 999 };
    const invalid = rebuild(json);
    await assert.rejects(inspectBytes("model", invalid), /Invalid GLB/);
    const path = join(root, "broken-material.glb");
    await writeFile(path, invalid);
    const batch = structuredClone(initial);
    (batch.operations[2] as any).files[0].path = path;
    await assert.rejects(store.apply("game", batch), /Invalid GLB/);
    assert.equal((await store.read("game")).version, 0);
    delete json.materials[0].pbrMetallicRoughness.baseColorTexture;
    json.meshes[0].primitives[0].material = 999;
    await assert.rejects(inspectBytes("model", rebuild(json)), /Invalid GLB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("static assets introduced by a rebuild are served without restarting", async () => {
  const root = await mkdtemp(join(tmpdir(), "foundry-static-test-"));
  const web = join(root, "web");
  await mkdir(join(web, "assets"), { recursive: true });
  await writeFile(join(web, "index.html"), "old build");
  const { app } = await makeApp(join(root, "data"), 4323, web);
  try {
    await app.ready();
    await writeFile(
      join(web, "assets", "new-hash.js"),
      "console.log('new build')",
    );
    await writeFile(
      join(web, "assets", "new-hash.css"),
      "body { color: white; }",
    );
    await writeFile(
      join(web, "index.html"),
      '<script src="/assets/new-hash.js"></script>',
    );
    const headers = { host: "127.0.0.1:4323" };
    const page = await app.inject({ url: "/", headers });
    assert.match(page.body, /new-hash.js/);
    for (const name of ["new-hash.js", "new-hash.css"]) {
      const response = await app.inject({ url: "/assets/" + name, headers });
      assert.equal(response.statusCode, 200);
    }
    assert.equal(
      (await app.inject({ url: "/assets/missing.js", headers })).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ url: "/api/projects", headers })).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: "/agent/projects", headers })).statusCode,
      401,
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
