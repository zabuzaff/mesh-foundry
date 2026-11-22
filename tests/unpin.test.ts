import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.js";
import { batch } from "../shared/schema.js";

const unpin = {
  type: "scene-loom.unpin",
  storyboardId: "sb",
  suggestionId: "s",
};

test("scene-loom.unpin is its own batch and fails for a missing pin", async () => {
  assert.ok(
    batch.safeParse({ requestId: "r", expectedVersion: 0, operations: [unpin] })
      .success,
  );
  assert.ok(
    !batch.safeParse({
      requestId: "r",
      expectedVersion: 0,
      operations: [{ ...unpin, extra: 1 }],
    }).success,
  );
  const root = await mkdtemp(join(tmpdir(), "foundry-unpin-"));
  const store = new Store(root);
  try {
    await store.init();
    await store.create({ id: "p", name: "P" });
    await assert.rejects(
      store.apply("p", {
        requestId: "missing-pin",
        expectedVersion: 0,
        operations: [unpin],
      }),
      /pin not found/,
    );
    await assert.rejects(
      store.apply("p", {
        requestId: "mixed",
        expectedVersion: 0,
        operations: [unpin, { type: "task.set", text: "x" }],
      }),
      /own batch/,
    );
    assert.equal((await store.read("p")).version, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
