import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store, Conflict } from "./store.js";
import { hash } from "./files.js";
import {
  renderInput,
  handoffInput,
  view,
  type RenderSet,
  type Handoff,
} from "../shared/references.js";
import { z } from "zod";
import { id, sceneLoomTarget } from "../shared/schema.js";
import { isApproved } from "../shared/progression.js";

// Fixed executables are configured by the local service operator, never by browser input.
export type ReferenceConfig = {
  blender: string;
  sceneCheckout?: string;
  sceneRoot?: string;
};
export async function run(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    signal?: AbortSignal;
  } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      signal: options.signal,
      killSignal: "SIGKILL",
    });
    let stdout = "",
      stderr = "",
      size = 0,
      failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = Error(
        "Process timed out; resume to reconcile any downstream publication",
      );
      child.kill("SIGKILL");
    }, options.timeout ?? 60000);
    const capture = (chunk: Buffer, err = false) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        failure = Error("Process output limit exceeded");
        child.kill("SIGKILL");
      } else if (err) stderr += chunk.toString();
      else stdout += chunk.toString();
    };
    child.stdout.on("data", (c) => capture(c));
    child.stderr.on("data", (c) => capture(c, true));
    child.once("error", (e) => {
      failure = e;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          Error((stderr || stdout).slice(-4000) || `Process exited ${code}`),
        );
      else resolve(stdout);
    });
  });
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export class References {
  private active = new Map<string, AbortController>();
  private queue: Promise<unknown> = Promise.resolve();
  serial<T>(pid: string, fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => this.store.withReferenceJob(pid, fn));
    this.queue = next.catch(() => {});
    return next;
  }
  constructor(
    public store: Store,
    public config: ReferenceConfig,
  ) {}
  async recover() {
    for (const row of await this.store.list())
      if (row.status === "ready") {
        const p = await this.store.read(row.id);
        if (p.renderSets.some((r) => r.status === "running"))
          await this.store.updateReferences(p.id, (p) => {
            for (const r of p.renderSets)
              if (r.status === "running") {
                r.status = "interrupted";
                r.error =
                  "Service restarted during render; use a new request ID to rerender.";
              }
          });
      }
  }
  async bytes(digest: string) {
    const bytes = await readFile(join(this.store.root, "blobs", digest));
    if (hash(bytes) !== digest) throw Error("Source/output hash mismatch");
    return bytes;
  }
  async generate(pid: string, input: unknown) {
    const d = renderInput.parse(input);
    return this.serial(pid, async () => {
      const p = await this.store.read(pid),
        digest = hash(JSON.stringify(d)),
        prior = p.renderSets.find((r) => r.id === d.requestId);
      if (prior) {
        if (prior.requestDigest !== digest)
          throw Error("Render request ID reused with different input");
        return prior;
      }
      const rev = p.revisions.find((r) => r.id === d.revisionId),
        model = rev?.files.find((f) => f.kind === "model");
      if (!rev || !model) throw Error("Exact 3D revision/model not found");
      const script = resolve("scripts/render-reference.py"),
        presetHash = hash(
          Buffer.concat([
            await readFile(script),
            Buffer.from(
              "reference-neutral-v1/png-pipeline-v1/opaque-srgb-777777/footer90/iTXt",
            ),
          ]),
        );
      const accepted =
        rev.stage === "model" && !rev.fixture && isApproved(p, rev);
      const record: RenderSet = {
        id: d.requestId,
        requestDigest: digest,
        revisionId: rev.id,
        assetId: rev.assetId,
        status: "running",
        createdAt: new Date().toISOString(),
        modelFileId: model.id,
        sources: rev.files.map((f) => ({ id: f.id, hash: f.hash })),
        acceptedAtRender: accepted,
        label: accepted
          ? "Accepted asset revision at render time · render quality unaccepted"
          : "UNACCEPTED STUDY REFERENCE",
        preset: "reference-neutral-v1",
        presetHash,
        outputs: [],
      };
      await this.store.updateReferences(pid, (p) => p.renderSets.push(record));
      const controller = new AbortController();
      this.active.set(pid + "/" + record.id, controller);
      let dir: string | undefined;
      try {
        for (const f of rev.files) await this.bytes(f.hash);
        dir = await this.store.jobDirectory(pid, "render");
        const source = join(dir, "source.glb");
        await writeFile(source, await this.bytes(model.hash), { mode: 0o600 });
        await run(
          this.config.blender,
          [
            "--background",
            "--factory-startup",
            "--disable-autoexec",
            "--threads",
            "2",
            "--python-exit-code",
            "1",
            "--python",
            script,
            "--",
            source,
            dir,
          ],
          { timeout: 15 * 60 * 1000, signal: controller.signal },
        );
        record.resolved = JSON.parse(
          await readFile(join(dir, "resolved.json"), "utf8"),
        );
        Object.assign(record.resolved!, {
          pngPipeline: "sharp flatten opaque #777777, footer90, UTF-8 iTXt",
          node: process.version,
          sharp: sharp.versions,
          footer: { top: 934, height: 90, font: "sans-serif" },
        });
        for (const name of view.options) {
          const path = join(dir, name + ".png"),
            meta = await sharp(path, {
              limitInputPixels: 1024 * 1024,
            }).metadata();
          if (
            meta.width !== 1024 ||
            meta.height !== 1024 ||
            meta.format !== "png"
          )
            throw Error("Invalid renderer output");
          const provenance = {
            projectId: pid,
            ...record,
            status: "completed",
            outputs: undefined,
            view: name,
          };
          const lines = [
            record.label,
            `Project ${pid}`,
            `Asset ${rev.assetId}`,
            `Revision ${rev.id}`,
            `${name} · GLB ${model.hash.slice(0, 12)}`,
          ];
          const footer = `<svg width="1024" height="90"><rect width="1024" height="90" fill="#20242a"/>${lines.map((line, i) => `<text x="18" y="${18 + i * 16}" fill="#ffffff" font-family="sans-serif" font-size="${i === 0 ? 15 : 12}">${escape(line)}</text>`).join("")}</svg>`;
          const bytes = await sharp(path)
            .flatten({ background: "#777777" })
            .composite([{ input: Buffer.from(footer), top: 934, left: 0 }])
            .withMetadata()
            .withExif({
              IFD0: { ImageDescription: JSON.stringify(provenance) },
            })
            .png()
            .toBuffer();
          // PNG text chunk is explicit and survives exact .source copies downstream.
          const tagged = pngText(
            bytes,
            "MeshFoundry",
            JSON.stringify(provenance),
          );
          await this.store.installBlob(hash(tagged), tagged);
          record.outputs.push({
            view: name,
            hash: hash(tagged),
            size: tagged.length,
            mime: "image/png",
          });
        }
        controller.signal.throwIfAborted();
        record.status = "completed";
      } catch (e) {
        record.status = controller.signal.aborted ? "cancelled" : "failed";
        record.error = (e as Error).message;
        record.outputs = [];
      } finally {
        this.active.delete(pid + "/" + record.id);
        if (dir) await rm(dir, { recursive: true, force: true });
      }
      await this.store.updateReferences(pid, (p) => {
        const index = p.renderSets.findIndex((r) => r.id === record.id);
        if (
          index < 0 ||
          p.renderSets[index].requestDigest !== record.requestDigest
        )
          throw new Conflict(
            "Render journal changed or disappeared; refusing to lose job provenance",
          );
        p.renderSets[index] = record;
      });
      return record;
    });
  }
  async cancel(pid: string, rid: string) {
    id.parse(pid);
    id.parse(rid);
    const p = await this.store.read(pid),
      r = p.renderSets.find((r) => r.id === rid);
    if (!r) throw Error("Render job not found");
    this.active.get(pid + "/" + rid)?.abort();
    return {
      id: rid,
      status: r.status,
      message:
        r.status === "running"
          ? "Cancellation requested; inspect the job for its final state"
          : "Job already stopped; completed outputs remain immutable",
    };
  }
  connection() {
    const { sceneCheckout: checkout, sceneRoot: dataRoot } = this.config;
    if (
      !checkout ||
      !dataRoot ||
      !isAbsolute(checkout) ||
      !isAbsolute(dataRoot)
    )
      throw Error(
        "Configure absolute SCENE_LOOM_CLI_DIR and SCENE_LOOM_DATA_DIR on the service before handoff",
      );
    return { checkout, dataRoot };
  }
  async cli(target: { checkout: string; dataRoot: string }, args: string[]) {
    const trusted = this.connection();
    if (
      target.checkout !== trusted.checkout ||
      target.dataRoot !== trusted.dataRoot
    )
      throw Error(
        "Handoff target differs from the operator-configured Scene Loom connection; prepare a new handoff",
      );
    if (!isAbsolute(target.checkout) || !isAbsolute(target.dataRoot))
      throw Error("Scene Loom paths must be absolute");
    const result = JSON.parse(
      await run(
        process.execPath,
        [
          join(target.checkout, "node_modules/tsx/dist/cli.mjs"),
          join(target.checkout, "cli/index.ts"),
          ...args,
        ],
        {
          cwd: target.checkout,
          env: { ...process.env, SCENE_LOOM_DATA_DIR: target.dataRoot },
        },
      ),
    );
    if (!result.success) throw Error(JSON.stringify(result.error));
    return result.data;
  }
  async generationSource(target: z.infer<typeof sceneLoomTarget>) {
    const source = z
      .object({
        id,
        storyboard: z.object({ projectId: id }).optional(),
        meshFoundryEnabled: z.boolean().optional(),
        contentRevision: z.number().int().nonnegative(),
        scenes: z.array(z.object({ id })),
      })
      .parse(
        await this.cli(this.connection(), [
          "project",
          "read",
          target.storyboardId,
        ]),
      );
    if (
      source.id !== target.storyboardId ||
      (source.storyboard?.projectId ?? source.id) !== target.projectId
    )
      throw Error(
        "Scene Loom storyboard does not belong to the requested project",
      );
    if (source.meshFoundryEnabled !== true)
      throw Error(
        "Mesh Foundry handoff is disabled on this Scene Loom storyboard",
      );
    return {
      contentRevision: source.contentRevision,
      sceneIds: source.scenes.map((scene) => scene.id),
    };
  }
  async destination(target: Handoff["target"]) {
    const p = await this.cli(target, ["project", "read", target.projectId]);
    const scene = p.scenes.find((s: { id: string }) => s.id === target.sceneId);
    if (!scene)
      throw Error(
        "Existing destination scene not found; no scene will be created",
      );
    return { p, scene };
  }
  async prepare(pid: string, input: unknown) {
    const d = handoffInput.parse(input);
    if (new Set(d.views).size !== d.views.length)
      throw Error("Duplicate selected view");
    return this.serial(pid, async () => {
      const p = await this.store.read(pid),
        digest = hash(JSON.stringify(d)),
        existing = p.handoffs.find((h) => h.id === d.requestId);
      if (existing) {
        if (existing.requestDigest !== digest)
          throw Error("Handoff ID reused with different selection/target");
        return existing;
      }
      const rs = p.renderSets.find(
        (r) => r.id === d.renderSetId && r.status === "completed",
      );
      if (!rs) throw Error("Completed render set required");
      for (const v of d.views) {
        const out = rs.outputs.find((o) => o.view === v);
        if (!out) throw Error("Missing view");
        await this.bytes(out.hash);
      }
      const target = {
        ...this.connection(),
        projectId: d.projectId,
        sceneId: d.sceneId,
      };
      const { scene } = await this.destination(target);
      // Conservative preflight before imports; exact deduplication/capacity rechecked on send.
      const h: Handoff = {
        id: d.requestId,
        requestDigest: digest,
        renderSetId: rs.id,
        views: d.views,
        target,
        status: "prepared",
        createdAt: new Date().toISOString(),
        imported: {},
        attempts: [],
        preview: scene.supportingAssetIds,
      };
      await this.store.updateReferences(pid, (p) => p.handoffs.push(h));
      return h;
    });
  }
  private async saveHandoff(pid: string, h: Handoff) {
    await this.store.updateReferences(pid, (p) => {
      const index = p.handoffs.findIndex((x) => x.id === h.id);
      if (index < 0 || p.handoffs[index].requestDigest !== h.requestDigest)
        throw new Conflict(
          "Handoff journal changed or disappeared; refusing to continue the transfer",
        );
      p.handoffs[index] = h;
    });
  }
  async cancelHandoff(pid: string, hid: string) {
    id.parse(hid);
    return this.serial(pid, async () => {
      const p = await this.store.read(pid),
        h = p.handoffs.find((h) => h.id === hid);
      if (!h) throw Error("Handoff not found");
      if (h.status === "completed") return h;
      h.status = "cancelled";
      await this.saveHandoff(pid, h);
      return h;
    });
  }
  async resume(pid: string, hid: string) {
    id.parse(hid);
    return this.serial(pid, async () => {
      const p = await this.store.read(pid),
        h = p.handoffs.find((h) => h.id === hid);
      if (!h) throw Error("Handoff not found");
      if (h.status === "completed") return h;
      if (h.status === "cancelled")
        throw Error(
          "Handoff cancelled; prepare a new handoff to send references",
        );
      const rs = p.renderSets.find(
        (r) => r.id === h.renderSetId && r.status === "completed",
      )!;
      const save = () => this.saveHandoff(pid, h);
      let dir: string | undefined;
      try {
        delete h.error;
        await this.destination(h.target);
        dir = await this.store.jobDirectory(pid, "handoff");
        h.status = "importing";
        await save();
        for (const v of h.views) {
          const out = rs.outputs.find((o) => o.view === v)!;
          const bytes = await this.bytes(out.hash);
          if (h.imported[v]) continue;
          const path = join(dir, v + ".png");
          await writeFile(path, bytes, { mode: 0o600 });
          const input = join(dir, "import.json");
          await writeFile(input, JSON.stringify({ path }), { mode: 0o600 });
          const imported = await this.cli(h.target, [
            "asset",
            "import",
            h.target.projectId,
            input,
          ]);
          h.imported[v] = id.parse(imported.id);
          await save();
        }
        const selected = h.views.map((v) => h.imported[v]);
        h.status = "applying";
        await save();
        let complete = false;
        for (let n = 0; n < 3; n++) {
          const { p: current, scene } = await this.destination(h.target);
          const union = [
            ...new Set<string>([...scene.supportingAssetIds, ...selected]),
          ];
          if (union.length > 30)
            throw Error(
              "Destination exceeds 30 supporting images; nothing evicted. Imported copies may remain unattached.",
            );
          if (selected.every((a) => scene.supportingAssetIds.includes(a))) {
            h.verifiedRevision = current.contentRevision;
            complete = true;
            break;
          }
          const requestId = randomUUID();
          const batch = {
            schemaVersion: 1,
            projectId: h.target.projectId,
            requestId,
            expectedContentRevision: current.contentRevision,
            operations: [
              {
                type: "scene.patch",
                id: h.target.sceneId,
                changes: { supportingAssetIds: union },
              },
            ],
          };
          const attempt: Handoff["attempts"][number] = {
            requestId,
            digest: hash(JSON.stringify(batch)),
            batch,
          };
          h.attempts.push(attempt);
          await save();
          const path = join(dir, "batch.json");
          await writeFile(path, JSON.stringify(batch), { mode: 0o600 });
          try {
            attempt.dryRun = await this.cli(h.target, [
              "project",
              "apply",
              h.target.projectId,
              path,
              "--dry-run",
            ]);
            await save();
            attempt.result = await this.cli(h.target, [
              "project",
              "apply",
              h.target.projectId,
              path,
            ]);
            await save();
          } catch (e) {
            // Never replay a stale replacement list, even when the response was lost.
            const fresh = await this.destination(h.target);
            if (
              selected.every((a) => fresh.scene.supportingAssetIds.includes(a))
            ) {
              h.verifiedRevision = fresh.p.contentRevision;
              complete = true;
              break;
            }
            if (fresh.p.contentRevision !== current.contentRevision) continue;
            throw e;
          }
          const verified = await this.destination(h.target);
          if (
            selected.every((a) => verified.scene.supportingAssetIds.includes(a))
          ) {
            h.verifiedRevision = verified.p.contentRevision;
            complete = true;
            break;
          }
        }
        if (!complete)
          throw Error(
            "Concurrent content changes prevented completion; resume to recompute from current state",
          );
        h.status = "completed";
        await save();
      } catch (e) {
        h.status = "failed";
        h.error = (e as Error).message;
        await save();
      } finally {
        if (dir) await rm(dir, { recursive: true, force: true });
      }
      return h;
    });
  }
}
// PNG UTF-8 iTXt chunk with CRC32, inserted before IEND; full provenance independent of EXIF support.
function pngText(bytes: Buffer, key: string, value: string) {
  const data = Buffer.from(key + "\0\0\0\0\0" + value, "utf8"),
    type = Buffer.from("iTXt"),
    body = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const b of body) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([
    bytes.subarray(0, -12),
    length,
    body,
    checksum,
    bytes.subarray(-12),
  ]);
}
