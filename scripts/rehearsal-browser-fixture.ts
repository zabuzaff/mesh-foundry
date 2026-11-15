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
    const selects = (revision: string) =>
      page
        .locator(".revision-trail button")
        .filter({ has: page.getByText(revision, { exact: true }) })
        .click();
    const action = (name: string) =>
      page.getByRole("button", { name, exact: true });
    await selects("model-r1");
    await expect(page.locator(".rehearsal-context")).toContainText(
      "Crate clearance",
    );
    const fit = action("Copy rehearsal fit-check prompt");
    await page.locator(".revision-action-controls summary").click();
    await fit.click();
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await expect.poll(clipboard).toContain("import-model");
    assert.match(await clipboard(), /"revision":"model-r1"/);

    await record("candidate", {
      kind: "candidate-review",
      eventId: "candidate-rejected",
      requirementId,
      model,
      verdict: "needs-revision",
      evidence: ["Housing measures 1.28 m; reduce to 1.20 m."],
    });
    const correction = action("Copy developed model correction prompt");
    // The old screen may still be visible. The first click must refuse to copy its stale record.
    const before = await clipboard();
    await correction.click();
    await expect(page.getByRole("alert")).toContainText(
      "Rehearsal context changed",
    );
    assert.equal(await clipboard(), before);
    await correction.click();
    await expect.poll(clipboard).toContain("Housing measures 1.28 m");
    const copied = await clipboard();
    for (const token of [
      "Opening width",
      '"value":1.2',
      "proxy-crate",
      "Keep the handle",
      "fixture-rehearsal",
      "candidate-rejected",
      "parentId model-r1",
      "Remove the visible seam",
      "STALE_REHEARSAL",
    ])
      assert(copied.includes(token), token);
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    const lookup = "**/api/projects/empty-studio/assets/crate/rehearsal";
    await page.route(
      lookup,
      async (route) => {
        await service.store.apply(model.libraryId, {
          requestId: "resolve-during-copy",
          expectedVersion: (await service.store.read(model.libraryId)).version,
          operations: [{ type: "feedback.resolve", id: "model-fit" }],
        });
        await route.continue();
      },
      { times: 1 },
    );
    const responseDuringCopy = page.waitForResponse((response) =>
      response.url().endsWith("/assets/crate/rehearsal"),
    );
    await correction.click();
    await responseDuringCopy;
    await expect(
      page.getByText("Review finding · Resolved", { exact: true }),
    ).toBeVisible();
    assert.equal(await clipboard(), copied);
    await expect(correction).toBeEnabled();
    await correction.click();
    await expect.poll(clipboard).not.toContain("Remove the visible seam");
    const alert = page.getByRole("alert");
    if (await alert.isVisible()) await action("Dismiss").click();

    const recoveryId = "model-writeback-pending";
    await service.store.apply(model.libraryId, {
      requestId: "simulate-published-without-writeback",
      expectedVersion: (await service.store.read(model.libraryId)).version,
      operations: [
        {
          type: "revision.publish",
          id: recoveryId,
          assetId: model.assetId,
          parentId: model.revisionId,
          stage: "model",
          summary: "Fixture successor for crate-clearance",
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
          toolVersions: {},
          fixture: true,
        },
      ],
    });
    await selects(recoveryId);
    await action("Copy candidate writeback prompt").click();
    await expect
      .poll(clipboard)
      .toContain(
        "Reconcile already-published Foundry revision model-writeback-pending with parent model-r1",
      );
    assert.match(
      await clipboard(),
      /Do not publish, change or accept a Foundry revision/,
    );
    await action("Open linked revision").click();
    await page.screenshot({ path: "artifacts/studio-linked-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await page.screenshot({ path: "artifacts/studio-linked-narrow.png" });
    await selects("prototype-r1");
    await expect(page.locator(".rehearsal-context")).toContainText(
      "targets model-r1",
    );
    await action("Open linked revision").click();
    await expect(page.locator(".revision-actions")).toContainText("model-r1");
    await batch([
      {
        type: "scene.patch",
        id: sceneId,
        changes: { description: "Inputs changed" },
      },
    ]);
    await action("Refresh rehearsal context").click();
    await expect(page.locator(".rehearsal-context")).toContainText(
      "complete its rehearsal review and draft",
    );
    await expect(correction).toHaveCount(0);
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
}
