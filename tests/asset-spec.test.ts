import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.js";
import { batch } from "../shared/schema.js";
import { assetSpecText } from "../client/prompts.js";

const sha = "ab".repeat(32);
const source = {
  draftId: "06".repeat(32),
  storyboardId: "yard",
  sceneId: "gate",
  contentDigest: sha,
};
const spec = {
  version: 1,
  dimensions: [1.4, 0.75, 0.7],
  pivot: { anchor: "base-center", position: [0, 0, -2] },
  interactive: true,
  animationClips: ["drawer-open"],
  clearance: [
    {
      id: "main/walk/1",
      label: "Keep clear: walk route",
      kind: "route",
      center: [0, 0.9, 1.5],
      size: [6, 1.8, 1],
      rotationEuler: [0, 1.57, 0],
      cue: { scenario: "main", event: "walk" },
      intersectsPlaceholder: false,
    },
  ],
  placementNotes: ["Against the north wall"],
  scaleReference: { asset: "human", height: 1.75 },
  source,
};
const piece = {
  id: "desk",
  name: "Desk",
  kind: "box",
  includes: [],
  dimensions: spec.dimensions,
  position: [0, 0.4, -2],
  rotationEuler: [0, 0, 0],
  pivot: spec.pivot,
  interactive: true,
  animationClips: spec.animationClips,
  clearance: spec.clearance,
  cues: [],
  placementNotes: spec.placementNotes,
};
const exported = {
  format: "scene-rehearsal-asset-spec",
  version: 1,
  units: { length: "meter" },
  source: { ...source, title: "Gate yard", draftRev: 2, approved: true },
  scaleReference: { asset: "human", height: 1.75 },
  pieces: [piece],
  warnings: [],
  specDigest: sha,
};

test("asset.spec validates, stores, replaces and clears", async () => {
  assert.ok(
    !batch.safeParse({
      requestId: "r",
      expectedVersion: 0,
      operations: [
        { type: "asset.spec", assetId: "a", spec: { ...spec, version: 2 } },
      ],
    }).success,
  );
  const root = await mkdtemp(join(tmpdir(), "foundry-spec-"));
  const store = new Store(root);
  try {
    await store.init();
    await store.create({ id: "p", name: "P" });
    await store.apply("p", {
      requestId: "setup",
      expectedVersion: 0,
      operations: [
        { type: "category.create", id: "c", name: "C" },
        {
          type: "asset.create",
          asset: { id: "human", categoryId: "c", name: "Human", purpose: "" },
        },
        {
          type: "asset.create",
          asset: { id: "desk", categoryId: "c", name: "Desk", purpose: "" },
        },
      ],
    });
    const set = (
      requestId: string,
      version: number,
      s: unknown,
      assetId = "desk",
    ) =>
      store.apply("p", {
        requestId,
        expectedVersion: version,
        operations: [{ type: "asset.spec", assetId, spec: s }],
      } as never);
    await assert.rejects(
      set("bad-ref", 1, { ...spec, scaleReference: { asset: "nope" } }),
      /Scale reference/,
    );
    await set("ok", 1, spec);
    const p = await store.read("p");
    assert.equal(p.assets.find((a) => a.id === "desk")?.spec?.version, 1);
    const prompt = assetSpecText(p, "desk", true);
    assert.match(prompt, /Scale-reference asset: human/);
    assert.match(prompt, /Verify real-world scale/);
    assert.match(
      assetSpecText(p, "human"),
      /Ask the owner for real-world dimensions/,
    );
    assert.match(assetSpecText(p, "human", true), /do not invent/);
    await set("clear", 2, null);
    const from = (
      requestId: string,
      version: number,
      e: unknown,
      pieceId: string,
    ) =>
      store.apply("p", {
        requestId,
        expectedVersion: version,
        operations: [
          {
            type: "asset.spec",
            assetId: "desk",
            fromRehearsalExport: { export: e, pieceId },
          },
        ],
      } as never);
    await assert.rejects(from("no-piece", 3, exported, "nope"), /no piece/);
    await assert.rejects(
      from("bad-fmt", 3, { ...exported, format: "x" }, "desk"),
    );
    await assert.rejects(
      from("bad-ver", 3, { ...exported, version: 2 }, "desk"),
    );
    await assert.rejects(
      from(
        "bad-ref2",
        3,
        { ...exported, scaleReference: { asset: "nope" } },
        "desk",
      ),
      /Scale reference/,
    );
    await from("export", 3, exported, "desk");
    assert.deepEqual(
      (await store.read("p")).assets.find((a) => a.id === "desk")?.spec,
      spec,
    );
    assert.ok(
      !batch.safeParse({
        requestId: "r",
        expectedVersion: 0,
        operations: [{ type: "asset.spec", assetId: "desk" }],
      }).success,
    );
    await set("clear2", 4, null);
    assert.equal(
      (await store.read("p")).assets.find((a) => a.id === "desk")?.spec,
      undefined,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
