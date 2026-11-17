import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import type { makeApp } from "../server/app.js";

export async function checkLinkedRehearsal(
  checkout: string,
  root: string,
  service: Awaited<ReturnType<typeof makeApp>>,
  page: Page,
) {
  assert(isAbsolute(checkout));
  const sceneRoot = join(root, "scene-loom");
  await mkdir(sceneRoot);
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const env = {
    ...process.env,
    SCENE_LOOM_DATA_DIR: sceneRoot,
    SCENE_LOOM_PORT: String(port),
  };
  const child = spawn(
    process.execPath,
    [join(checkout, "node_modules/tsx/dist/cli.mjs"), "server/index.ts"],
    {
      cwd: checkout,
      env,
      stdio: "inherit",
    },
  );
  const closed = once(child, "close");
  try {
    const runtimePath = join(sceneRoot, "runtime.json");
    await expect
      .poll(async () =>
        readFile(runtimePath, "utf8").then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
    const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
    const connection = { checkout, dataRoot: sceneRoot };
    service.references.config.sceneCheckout = checkout;
    service.references.config.sceneRoot = sceneRoot;
    const loom = (...args: string[]) =>
      service.references.cli(connection, args);
    let fileCount = 0;
    async function input(data: unknown) {
      const path = join(root, `rehearsal-fixture-${++fileCount}.json`);
      await writeFile(path, JSON.stringify(data));
      return path;
    }
    const projectId = "linked-fixture";
    const sceneId = "crate-fit";
    const requirementId = "crate-clearance";
    const model = {
      libraryId: "empty-studio",
      assetId: "crate",
      revisionId: "model-r1",
    };
    const source = { ...model, revisionId: "prototype-r1" };
    const link = { projectId, storyboardId: projectId, sceneId, requirementId };
    const head = {
      dataDir: join(root, "rehearsal"),
      port: 4545,
      revisionId: "fixture-rehearsal",
      link: "http://127.0.0.1:4545",
    };
    await loom(
      "project",
      "create",
      await input({ id: projectId, title: "Linked fixture" }),
    );
    const response = await fetch(
      `http://127.0.0.1:${port}/api/projects/${projectId}/settings`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${runtime.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meshFoundryEnabled: true }),
      },
    );
    assert.ok(response.ok, await response.text());
    async function batch(operations: unknown[]) {
      const project = await loom("project", "read", projectId);
      const path = await input({
        schemaVersion: 1,
        projectId,
        requestId: crypto.randomUUID(),
        expectedContentRevision: project.contentRevision,
        operations,
      });
      await loom("project", "apply", projectId, path, "--dry-run");
      await loom("project", "apply", projectId, path);
    }
    await batch([
      {
        type: "scene.create",
        scene: {
          id: sceneId,
          title: "Fit fixture",
          description: "",
          notes: "",
          supportingAssetIds: [],
        },
      },
    ]);
    await batch([
      {
        type: "scene.patch",
        id: sceneId,
        changes: {
          rehearsalBrief: {
            layout: "Crate by opening",
            scenarios: ["Check opening"],
            assets: [],
            gaps: [],
          },
        },
      },
    ]);
    const project = await loom("project", "read", projectId);
    async function record(afterEventId: string | null, event: unknown) {
      await batch([
        { type: "rehearsal.record", id: sceneId, afterEventId, event },
      ]);
    }
    await record(null, {
      kind: "review",
      eventId: "cleared",
      inputRevision: project.rehearsalInputRevision ?? project.contentRevision,
      blockout: "ready",
      imports: "ready",
      scope: "Fixture",
      findings: ["Opening measured"],
    });
    await record("cleared", {
      kind: "draft",
      eventId: "draft",
      reviewId: "cleared",
      parentRevisionId: null,
      draft: head,
      requirements: [
        {
          id: requirementId,
          name: "Crate clearance",
          source,
          objects: ["proxy-crate"],
          measurements: [{ label: "Opening width", value: 1.2, unit: "m" }],
          changes: ["Narrow the housing"],
          preserve: ["Keep the handle"],
          checks: ["Clear the doorway in playback"],
        },
      ],
    });
    await record("draft", {
      kind: "candidate",
      eventId: "candidate",
      requirementId,
      model,
      basedOn: source,
    });
    await service.store.apply(model.libraryId, {
      requestId: "link-fixture",
      expectedVersion: (await service.store.read(model.libraryId)).version,
      operations: [{ type: "rehearsal.link", assetId: model.assetId, link }],
    });
    const endpoint = `/api/projects/${model.libraryId}/assets/${model.assetId}/rehearsal`;
    const readLegacy = () => fetch(new URL(endpoint, page.url()));
    const legacy = await readLegacy();
    assert.equal(legacy.status, 200);
    const linked = await legacy.json();
    assert.equal(linked.status, "ready");
    assert.deepEqual(linked.candidate.model, model);

    await page.reload();
    await page
      .locator(".revision-trail button")
      .filter({ has: page.getByText(model.revisionId, { exact: true }) })
      .click();
    await page
      .getByRole("button", { name: "More actions", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /rehearsal|writeback/i }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", {
        name: "Copy developed model review prompt",
        exact: true,
      })
      .click();
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await expect
      .poll(clipboard)
      .toContain("Independently review this Mesh Foundry developed model");
    assert.doesNotMatch(
      await clipboard(),
      /candidate-review|rehearsal.record|Crate clearance/,
    );
    const before = await service.store.read(model.libraryId);
    await page
      .getByRole("button", { name: "Project actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", {
        name: "Copy Scene Loom sync handoff",
        exact: true,
      })
      .click();
    await expect
      .poll(clipboard)
      .toContain("Sync accepted assets in Scene Loom");
    assert.deepEqual(await service.store.read(model.libraryId), before);
    await batch([
      {
        type: "scene.patch",
        id: sceneId,
        changes: { description: "Inputs changed" },
      },
    ]);
    const changed = await readLegacy();
    assert.equal(changed.status, 200);
    assert.match(
      (await changed.json()).message,
      /complete its rehearsal review and draft/,
    );
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
}
