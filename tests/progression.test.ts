import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { legacyFixture } from "../scripts/legacy-fixture.js";
import { References } from "../server/references.js";
import { Store } from "../server/store.js";
import { isApproved } from "../shared/progression.js";
import { revisionAction, workPrompt } from "../client/prompts.js";

test("exact stage approvals, linked independent progression, and harness-neutral prompts", async () => {
  const root = await mkdtemp(join(tmpdir(), "foundry-progression-"));
  const store = new Store(root);
  try {
    await store.init();
    await store.create({ id: "game", name: "Game" });
    const image = join(root, "concept.png");
    await sharp({
      create: { width: 4, height: 4, channels: 4, background: "red" },
    })
      .png()
      .toFile(image);
    const apply = async (operations: unknown[]) =>
      store.apply("game", {
        requestId: crypto.randomUUID(),
        expectedVersion: (await store.read("game")).version,
        operations,
      });
    const publish = (
      id: string,
      assetId: string,
      stage: string,
      parentId?: string,
    ) => ({
      type: "revision.publish",
      id,
      assetId,
      stage,
      ...(parentId ? { parentId } : {}),
      summary: id,
      files:
        stage === "sketch"
          ? [{ kind: "image", path: image }]
          : [
              {
                kind: "blend",
                path: resolve("artifacts/authoring-proof/human.blend"),
              },
              {
                kind: "model",
                path: resolve("artifacts/authoring-proof/human.glb"),
              },
            ],
      toolVersions: {},
      fixture: true,
    });
    const accept = async (revisionId: string) =>
      store.apply(
        "game",
        {
          requestId: crypto.randomUUID(),
          expectedVersion: (await store.read("game")).version,
          action: { type: "accept", revisionId },
        },
        true,
      );
    await apply([
      { type: "category.create", id: "props", name: "Props" },
      ...["a", "b"].map((id) => ({
        type: "asset.create",
        asset: { id, categoryId: "props", name: id, purpose: "" },
      })),
      publish("concept-a", "a", "sketch"),
      publish("concept-b", "b", "sketch"),
    ]);
    await assert.rejects(
      apply([publish("no-concept", "b", "study")]),
      /Start with a 2D Concept/,
    );
    await assert.rejects(
      apply([publish("no-prototype", "b", "model")]),
      /Start with a 2D Concept/,
    );
    let p = await store.read("game");
    const concept = p.revisions[0];
    assert.throws(
      () => revisionAction(p, concept, true),
      /Approve exact revision concept-a/,
    );
    assert.match(
      revisionAction(p, concept),
      /parentId concept-a, stage sketch/,
    );
    await assert.rejects(
      apply([publish("proto-a", "a", "study", "concept-a")]),
      /Approve exact revision concept-a/,
    );
    await accept("concept-a");
    p = await store.read("game");
    const prompt = workPrompt(
      "/repo",
      "/test-library",
      p,
      "a",
      concept,
      revisionAction(p, concept, true),
    );
    for (const text of [
      "project game",
      "asset a",
      "revision concept-a",
      concept.files[0].hash,
      concept.files[0].id,
      "real, rotatable 3D geometry",
      "silhouette",
      "consequential unresolved",
      "Reread current state",
      "parentId concept-a, stage study",
      "unapproved candidates",
      "/test-library",
    ])
      assert(prompt.includes(text), text);
    await assert.rejects(
      apply([publish("skip", "a", "model", "concept-a")]),
      /one asset stage/,
    );
    await assert.rejects(
      apply([publish("unlinked", "a", "study")]),
      /parentId/,
    );
    await assert.rejects(
      apply([publish("wrong-asset", "b", "study", "concept-a")]),
      /belong to this asset/,
    );
    await assert.rejects(
      apply([publish("proto-b", "b", "study", "concept-b")]),
      /Approve exact revision concept-b/,
    );
    await apply([publish("proto-a", "a", "study", "concept-a")]);
    p = await store.read("game");
    assert.equal(p.accepted.a, "concept-a");
    assert(
      !isApproved(
        p,
        p.revisions.find((r) => r.id === "proto-a")!,
      ),
    );
    await assert.rejects(
      apply([publish("model-a", "a", "model", "proto-a")]),
      /Approve exact revision proto-a/,
    );
    await apply([publish("proto-a-v2", "a", "study", "proto-a")]);
    await accept("proto-a");
    p = await store.read("game");
    assert(isApproved(p, concept));
    const prototype = p.revisions.find((r) => r.id === "proto-a")!;
    const developedPrompt = revisionAction(p, prototype, true);
    for (const text of [
      "editable Blender source",
      "do not recreate it from screenshots",
      "production requirements",
      "Rigging and animation",
      "parentId proto-a, stage model",
    ])
      assert(developedPrompt.includes(text), text);
    for (const f of prototype.files) assert(developedPrompt.includes(f.hash));
    await apply([
      { ...publish("model-a", "a", "model", "proto-a"), fixture: false },
      publish("concept-a-v2", "a", "sketch", "concept-a"),
    ]);
    p = await store.read("game");
    assert.equal(p.accepted.a, "proto-a");
    const model = p.revisions.find((r) => r.id === "model-a")!;
    assert.match(revisionAction(p, model), /parentId model-a, stage model/);
    assert.throws(() => revisionAction(p, model, true));
    await accept("concept-a-v2");
    p = await store.read("game");
    assert(!isApproved(p, concept));
    assert(isApproved(p, prototype));
    await assert.rejects(
      apply([publish("old-concept", "a", "study", "concept-a")]),
      /Approve exact revision concept-a/,
    );
    assert.equal(p.revisions.length, 6);
    assert.equal(
      p.revisions.find((r) => r.id === "model-a")!.parentId,
      "proto-a",
    );
    await accept("model-a");
    await accept("concept-a-v2");
    const refs = new References(store, { blender: "/nonexistent/blender" });
    const rendered = await refs.generate("game", {
      requestId: "approval-snapshot",
      revisionId: "model-a",
    });
    assert.equal(rendered.acceptedAtRender, true);
    assert.equal(rendered.status, "failed"); // No real renderer in this unit test.
    // Existing/imported direct-stage data remains readable; its exact accepted
    // pointer is also supported when legacy history is absent.
    const legacy = structuredClone(p);
    legacy.acceptance = [];
    legacy.accepted.a = "concept-a";
    assert(isApproved(legacy, concept));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy pointer approvals survive later owner actions and round trips", async () => {
  const root = await mkdtemp(join(tmpdir(), "foundry-legacy-approval-"));
  const store = new Store(root);
  try {
    await store.init();
    const files: { kind: "model" | "blend"; path: string }[] = [
      { kind: "model", path: resolve("artifacts/authoring-proof/human.glb") },
      { kind: "blend", path: resolve("artifacts/authoring-proof/human.blend") },
    ];
    const bundle = await legacyFixture("legacy", "Legacy", "props", "asset", [
      { id: "prototype-old", stage: "study", files },
      { id: "prototype-new", stage: "study", files },
      { id: "model", stage: "model", files },
    ]);
    bundle.project.accepted.asset = "prototype-old";
    await store.importBundle(bundle);
    const accept = async (revisionId: string) =>
      store.apply(
        "legacy",
        {
          requestId: crypto.randomUUID(),
          expectedVersion: (await store.read("legacy")).version,
          action: { type: "accept", revisionId },
        },
        true,
      );
    let p = await store.read("legacy");
    const old = p.revisions[0],
      newer = p.revisions[1],
      model = p.revisions[2];
    assert(isApproved(p, old));
    await accept("model");
    p = await store.read("legacy");
    assert(isApproved(p, old));
    assert(isApproved(p, model));
    assert.match(revisionAction(p, old, true), /parentId prototype-old/);
    const copy = await store.bundle("legacy");
    copy.project.id = "round-trip";
    await store.importBundle(copy);
    assert(isApproved(await store.read("round-trip"), old));
    await accept("prototype-new");
    await accept("model");
    p = await store.read("legacy");
    assert(!isApproved(p, old));
    assert(isApproved(p, newer));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
