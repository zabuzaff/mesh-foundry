import {
  mkdir,
  mkdtemp,
  link,
  readFile,
  writeFile,
  rename,
  readdir,
  copyFile,
  unlink,
  open,
  rm,
} from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  id,
  project,
  createProject,
  batch,
  review,
  type Project,
  revision,
  sceneLoomTarget,
  specFromRehearsalExport,
} from "../shared/schema.js";
import { inspect, hash, inspectBytes } from "./files.js";
import { checkPublication } from "../shared/progression.js";
export class Conflict extends Error {}
const now = () => new Date().toISOString();
export const sceneLoomLibraryId = (projectId: string) =>
  "scene-loom-" + hash(id.parse(projectId));

type ReadSceneLoom = (target: z.infer<typeof sceneLoomTarget>) => Promise<{
  contentRevision: number;
  sceneIds: string[];
}>;

export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  private referenceJobs = new Map<string, number>();
  constructor(
    public root: string,
    private readSceneLoom?: ReadSceneLoom,
  ) {
    if (!isAbsolute(root)) throw Error("Data directory must be absolute");
  }
  async init() {
    await mkdir(join(this.root, "projects"), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, "blobs"), { recursive: true, mode: 0o700 });
  }
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
  // Acquire/release through the same queue as restore; work itself does not hold
  // the storage lock, so feedback and unrelated project writes stay available.
  async withReferenceJob<T>(pid: string, work: () => Promise<T>): Promise<T> {
    id.parse(pid);
    await this.serial(async () => {
      this.referenceJobs.set(pid, (this.referenceJobs.get(pid) ?? 0) + 1);
    });
    try {
      return await work();
    } finally {
      await this.serial(async () => {
        const remaining = (this.referenceJobs.get(pid) ?? 1) - 1;
        if (remaining) this.referenceJobs.set(pid, remaining);
        else this.referenceJobs.delete(pid);
      });
    }
  }
  interruptDetachedRenders(p: Project, reason: string) {
    for (const render of p.renderSets)
      if (render.status === "running") {
        render.status = "interrupted";
        render.error = reason + " Use a new request ID to rerender.";
      }
  }
  path(pid: string) {
    return join(this.root, "projects", id.parse(pid));
  }
  async read(pid: string) {
    const raw = JSON.parse(
      await readFile(join(this.path(pid), "project.json"), "utf8"),
    );
    // Retired: assets once carried a Scene Rehearsal fit link. Drop it on read.
    for (const a of raw?.assets ?? [])
      if (a && typeof a === "object") delete a.rehearsal;
    const p = project.parse(raw);
    this.validate(p);
    if (p.id !== pid) throw Error("Project identity mismatch");
    return p;
  }
  async list() {
    const rows = [];
    for (const pid of (await readdir(join(this.root, "projects"))).filter(
      (n) => !n.startsWith("."),
    )) {
      try {
        const p = await this.read(pid);
        rows.push({
          id: pid,
          name: p.name,
          version: p.version,
          sceneLoomProjectId: p.sceneLoomProjectId,
          status: "ready",
        });
      } catch {
        rows.push({ id: pid, name: pid, status: "unreadable" });
      }
    }
    return rows;
  }
  validate(p: Project) {
    if (
      p.sceneLoomProjectId &&
      p.id !== sceneLoomLibraryId(p.sceneLoomProjectId)
    )
      throw Error("Incorrect Scene Loom library ID");
    const pins = new Set<string>();
    for (const pin of p.sceneLoomPins ?? []) {
      if (!p.sceneLoomProjectId)
        throw Error("Scene Loom pins require a linked library");
      const key = pin.storyboardId + ":" + pin.suggestionId;
      if (pins.has(key)) throw Error("Duplicate Scene Loom suggestion pin");
      pins.add(key);
      if (
        new Set(pin.sceneIds).size !== pin.sceneIds.length ||
        !pin.sceneIds.includes(pin.generatedFromSceneId)
      )
        throw Error("Invalid linked scene IDs");
      if (
        !p.revisions.some(
          (r) => r.id === pin.revisionId && r.assetId === pin.assetId,
        )
      )
        throw Error("Scene Loom pin must reference an existing asset revision");
    }

    for (const entries of [
      p.categories,
      p.assets,
      p.revisions,
      p.decisions,
      p.feedback,
    ])
      if (new Set(entries.map((e) => e.id)).size !== entries.length)
        throw Error("Duplicate record ID");
    for (const a of p.assets) {
      if (!p.categories.some((c) => c.id === a.categoryId))
        throw Error("Missing category");
      if (
        a.base &&
        !p.revisions.some(
          (r) => r.id === a.base!.revisionId && r.assetId === a.base!.assetId,
        )
      )
        throw Error("Missing base revision");
    }
    for (const r of p.revisions) {
      if (r.stage === "sketch" && !r.files.some((f) => f.kind === "image"))
        throw Error("Sketch requires image");
      if (
        r.stage !== "sketch" &&
        (!r.files.some((f) => f.kind === "model") ||
          !r.files.some((f) => f.kind === "blend"))
      )
        throw Error("3D revision requires model/source");
      if (!p.assets.some((a) => a.id === r.assetId))
        throw Error("Missing asset");
      if (
        r.parentId &&
        !p.revisions.some(
          (s) =>
            s.id === r.parentId && s.assetId === r.assetId && s.id !== r.id,
        )
      )
        throw Error("Invalid parent revision");
    }
    for (const rs of p.renderSets) {
      const rev = p.revisions.find(
        (r) => r.id === rs.revisionId && r.assetId === rs.assetId,
      );
      if (
        !rev ||
        !rev.files.some((f) => f.id === rs.modelFileId && f.kind === "model") ||
        JSON.stringify(rs.sources) !==
          JSON.stringify(rev.files.map((f) => ({ id: f.id, hash: f.hash })))
      )
        throw Error("Invalid render provenance");
      if (
        rs.status === "completed" &&
        (rs.outputs.length !== 3 ||
          new Set(rs.outputs.map((o) => o.view)).size !== 3 ||
          !rs.resolved)
      )
        throw Error("Incomplete render set");
    }
    for (const h of p.handoffs)
      if (
        !p.renderSets.some(
          (r) => r.id === h.renderSetId && r.status === "completed",
        )
      )
        throw Error("Missing handoff render set");
    for (const entries of [p.renderSets, p.handoffs])
      if (new Set(entries.map((e) => e.id)).size !== entries.length)
        throw Error("Duplicate reference ID");
    for (const [aid, rid] of Object.entries(p.accepted))
      if (!p.revisions.some((r) => r.id === rid && r.assetId === aid))
        throw Error("Invalid accepted reference");
    for (const f of p.feedback)
      if (!p.revisions.some((r) => r.id === f.revisionId))
        throw Error("Missing feedback revision");
    for (const d of p.decisions) {
      if (d.scope && !p.assets.some((a) => a.id === d.scope))
        throw Error("Missing decision asset");
      if (
        d.supersedes &&
        !p.decisions.some((s) => s.id === d.supersedes && s.id !== d.id)
      )
        throw Error("Missing superseded decision");
    }
    for (const event of p.acceptance)
      if (!p.revisions.some((r) => r.id === event.revisionId))
        throw Error("Missing accepted revision");
  }
  async atomic(path: string, value: unknown) {
    const tmp = path + "." + randomUUID() + ".tmp";
    const f = await open(tmp, "wx", 0o600);
    try {
      await f.writeFile(JSON.stringify(value, null, 2) + "\n");
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(tmp, path);
  }
  async publishNew(p: Project) {
    this.validate(p);
    const staging = join(this.root, "projects", ".staging-" + randomUUID());
    await mkdir(staging);
    try {
      await this.atomic(join(staging, "project.json"), p);
      await rename(staging, this.path(p.id));
    } catch (e) {
      await rm(staging, { recursive: true, force: true });
      throw e;
    }
  }
  async save(p: Project, previous?: Project) {
    project.parse(p);
    this.validate(p);
    if (previous) {
      await mkdir(join(this.path(p.id), "backups"), { recursive: true });
      await this.atomic(
        join(this.path(p.id), "backups", `${Date.now()}-${randomUUID()}.json`),
        previous,
      );
    }
    await this.atomic(join(this.path(p.id), "project.json"), p);
  }
  async create(input: unknown) {
    return this.serial(async () => {
      const d = createProject.parse(input);
      try {
        await readFile(join(this.path(d.id), "project.json"));
        throw Error("Project already exists");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      const p: Project = {
        schemaVersion: 1,
        ...d,
        currentTask: "",
        version: 0,
        updatedAt: now(),
        categories: [],
        assets: [],
        revisions: [],
        decisions: [],
        feedback: [],
        accepted: {},
        acceptance: [],
        receipts: [],
        renderSets: [],
        handoffs: [],
      };
      await this.publishNew(p);
      return p;
    });
  }
  async apply(pid: string, input: unknown, owner = false) {
    return this.serial(async () => {
      const data = owner ? review.parse(input) : batch.parse(input);
      const previous = await this.read(pid);
      const digest = hash(JSON.stringify(data));
      const receipt = previous.receipts.find(
        (r) => r.requestId === data.requestId,
      );
      if (receipt) {
        if (receipt.digest !== digest)
          throw new Conflict(
            "Request ID was already used with different input",
          );
        return { version: receipt.version, replayed: true };
      }
      if (previous.version !== data.expectedVersion)
        throw new Conflict(
          "Project changed; read current state and retry with a new request ID",
        );
      if (
        "operations" in data &&
        data.operations.some((op) => op.type === "scene-loom.unpin") &&
        (data.sceneLoom ||
          data.operations.some((op) => op.type !== "scene-loom.unpin"))
      )
        throw Error(
          "Scene Loom unpin must be its own batch without a generation target",
        );
      const generation = "operations" in data ? data.sceneLoom : undefined;
      const pins =
        "operations" in data
          ? data.operations.filter((op) => op.type === "scene-loom.pin")
          : [];
      if (pins.length && !generation)
        throw Error("Scene Loom pins require a generation target");
      if (generation && "operations" in data) {
        if (previous.sceneLoomProjectId !== generation.projectId)
          throw Error(
            "Scene Loom generation targets a different asset library",
          );
        if (
          !pins.length ||
          new Set(pins.map((pin) => pin.suggestionId)).size !== pins.length
        )
          throw Error("Provide one pin per selected suggestion");
        for (const op of data.operations) {
          if (
            op.type !== "category.create" &&
            op.type !== "asset.create" &&
            op.type !== "revision.publish" &&
            op.type !== "scene-loom.pin"
          )
            throw Error("Operation is not allowed in Scene Loom generation");
          if (
            op.type === "revision.publish" &&
            (op.stage !== "sketch" ||
              !pins.some(
                (pin) => pin.revisionId === op.id && pin.assetId === op.assetId,
              ))
          )
            throw Error(
              "Scene Loom generation can publish only pinned 2D concepts",
            );
          if (
            op.type === "asset.create" &&
            !pins.some((pin) => pin.assetId === op.asset.id)
          )
            throw Error("Scene Loom generation can create only pinned assets");
        }
      }
      const p = structuredClone(previous);
      if (generation) {
        p.sceneLoomPins = (p.sceneLoomPins ?? []).filter(
          (pin) =>
            pin.storyboardId !== generation.storyboardId ||
            !pins.some((next) => next.suggestionId === pin.suggestionId),
        );
        for (const { type: _, ...pin } of pins) {
          if (
            !pin.sceneIds.includes(generation.sceneId) ||
            new Set(pin.sceneIds).size !== pin.sceneIds.length
          )
            throw Error("Invalid linked scene IDs");
          const existing = previous.sceneLoomPins?.find(
            (candidate) =>
              candidate.storyboardId === generation.storyboardId &&
              candidate.suggestionId === pin.suggestionId,
          );
          if (
            existing?.assetId === pin.assetId &&
            existing.revisionId === pin.revisionId &&
            existing.sceneIds.length === pin.sceneIds.length &&
            pin.sceneIds.every((sceneId) => existing.sceneIds.includes(sceneId))
          ) {
            p.sceneLoomPins.push(existing);
            continue;
          }
          p.sceneLoomPins.push({
            ...pin,
            storyboardId: generation.storyboardId,
            generatedFromSceneId: generation.sceneId,
            contentRevision: generation.contentRevision,
          });
        }
      }
      let imported: Awaited<ReturnType<typeof inspect>>[] = [];
      if ("action" in data) {
        const action = data.action;
        const rev = p.revisions.find((r) => r.id === action.revisionId);
        if (!rev) throw Error("Revision not found");
        if (action.type === "accept") {
          const prior = p.accepted[rev.assetId];
          p.accepted[rev.assetId] = rev.id;
          p.acceptance.push({
            revisionId: rev.id,
            ...(prior ? { previousRevisionId: prior } : {}),
            at: now(),
          });
        } else
          p.feedback.push({
            id: randomUUID(),
            revisionId: rev.id,
            text: action.text,
            pin: action.pin,
            resolved: false,
            createdAt: now(),
          });
      } else
        for (const op of data.operations) {
          if (op.type === "category.create")
            p.categories.push({ id: op.id, name: op.name });
          if (op.type === "asset.create") p.assets.push(op.asset);
          if (op.type === "asset.spec") {
            const asset = p.assets.find((entry) => entry.id === op.assetId);
            if (!asset) throw Error("Asset spec asset not found");
            const spec = op.fromRehearsalExport
              ? specFromRehearsalExport(op.fromRehearsalExport)
              : op.spec;
            if (spec) {
              if (
                spec.scaleReference &&
                !p.assets.some((a) => a.id === spec.scaleReference!.asset)
              )
                throw Error("Scale reference asset not found in this project");
              asset.spec = spec;
            } else delete asset.spec;
          }
          if (op.type === "scene-loom.unpin") {
            const before = p.sceneLoomPins?.length ?? 0;
            p.sceneLoomPins = (p.sceneLoomPins ?? []).filter(
              (pin) =>
                pin.storyboardId !== op.storyboardId ||
                pin.suggestionId !== op.suggestionId,
            );
            if (p.sceneLoomPins.length === before)
              throw Error("Scene Loom pin not found");
          }
          if (op.type === "task.set") p.currentTask = op.text;
          if (op.type === "decision.add")
            p.decisions.push({
              id: op.id,
              scope: op.scope,
              text: op.text,
              supersedes: op.supersedes,
              createdAt: now(),
            });
          if (op.type === "finding.add") {
            if (!p.revisions.some((r) => r.id === op.revisionId))
              throw Error("Finding revision not found");
            p.feedback.push({
              id: op.id,
              revisionId: op.revisionId,
              text: op.text,
              origin: "agent-review",
              resolved: false,
              createdAt: now(),
            });
          }
          if (op.type === "feedback.resolve") {
            const f = p.feedback.find((f) => f.id === op.id);
            if (!f) throw Error("Feedback not found");
            f.resolved = true;
          }
          if (op.type === "revision.publish") {
            checkPublication(p, op);
            const files = [];
            let clips: { name: string; duration: number }[] = [];
            for (const input of op.files) {
              const result = await inspect(input);
              imported.push(result);
              files.push(result.file);
              if (input.kind === "model") clips = result.clips;
            }
            if (op.stage === "sketch" && !files.some((f) => f.kind === "image"))
              throw Error("A sketch requires an image");
            if (
              op.stage !== "sketch" &&
              (!files.some((f) => f.kind === "model") ||
                !files.some((f) => f.kind === "blend"))
            )
              throw Error(
                "3D revisions require editable Blender source and a GLB",
              );
            if (files.filter((f) => f.kind === "model").length > 1)
              throw Error("Publish one model per revision");
            p.revisions.push(
              revision.parse({
                id: op.id,
                assetId: op.assetId,
                parentId: op.parentId,
                stage: op.stage,
                summary: op.summary,
                files,
                clips,
                createdAt: now(),
                toolVersions: op.toolVersions,
                fixture: op.fixture,
                technical: "decoded",
              }),
            );
          }
        }
      p.version++;
      p.updatedAt = now();
      p.receipts.push({
        requestId: data.requestId,
        digest,
        version: p.version,
      });
      p.receipts = p.receipts.slice(-100);
      project.parse(p);
      this.validate(p);
      const checkSource = async () => {
        if (!generation) return;

        if (!this.readSceneLoom)
          throw Error("Scene Loom connection unavailable");
        const source = await this.readSceneLoom(generation);
        if (source.contentRevision !== generation.contentRevision)
          throw new Conflict(
            "Scene Loom storyboard changed; reread and confirm the source",
          );
        if (
          pins.some((pin) =>
            pin.sceneIds.some((sceneId) => !source.sceneIds.includes(sceneId)),
          )
        )
          throw Error("Linked scene is missing from the selected storyboard");
      };
      if (imported.length) await checkSource();
      // Content-addressed owned copies are installed first. A failed publication
      // may leave unreferenced blobs, never partial visible project records.
      for (const item of imported)
        await this.installBlob(item.file.hash, item.bytes);
      await checkSource();
      await this.save(p, previous);
      return { version: p.version, replayed: false };
    });
  }
  async jobDirectory(pid: string, kind: "render" | "handoff") {
    const parent = join(this.root, "jobs", "projects", id.parse(pid));
    await mkdir(parent, { recursive: true, mode: 0o700 });
    // Project ownership is in the path before any source/output is written.
    return mkdtemp(join(parent, kind + "-"));
  }
  async legacyJobDirectories() {
    try {
      return (await readdir(join(this.root, "jobs")))
        .filter((name) => /^(render|handoff)-/.test(name))
        .sort();
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  // Destructive owner-authorized reset. Never writes to downstream libraries.
  async clearAssets(pid: string, input: unknown) {
    return this.serial(async () => {
      const d = z
        .object({
          expectedVersion: z.number().int().nonnegative(),
          confirmProjectId: id,
        })
        .strict()
        .parse(input);
      if (d.confirmProjectId !== pid)
        throw Error("Project confirmation mismatch");
      if (this.referenceJobs.size)
        throw new Conflict(
          "A reference job is active; finish or cancel it first",
        );
      const previous = await this.read(pid);
      if (previous.version !== d.expectedVersion)
        throw new Conflict("Project changed");
      const candidates = new Set<string>();
      const retained = new Set<string>();
      // Scan every metadata copy, including backups/recovery. Fail closed on
      // unreadable metadata before changing anything or collecting shared blobs.
      const scan = async (dir: string, target: Set<string>) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isSymbolicLink())
            throw Error("Unexpected metadata symlink");
          if (entry.isDirectory()) await scan(path, target);
          else if (entry.name.endsWith(".json")) {
            const value = JSON.parse(await readFile(path, "utf8"));
            const visit = (v: any) => {
              if (typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
                target.add(v);
              else if (Array.isArray(v)) v.forEach(visit);
              else if (v && typeof v === "object")
                Object.values(v).forEach(visit);
            };
            visit(value);
          }
        }
      };
      for (const entry of await readdir(join(this.root, "projects"))) {
        await scan(
          join(this.root, "projects", entry),
          entry === pid ? candidates : retained,
        );
      }
      const legacyJobs = await this.legacyJobDirectories();
      const p = structuredClone(previous);
      p.assets = [];
      p.revisions = [];
      p.feedback = [];
      p.accepted = {};
      p.acceptance = [];
      p.renderSets = [];
      p.handoffs = [];
      delete p.sceneLoomPins;
      p.decisions = p.decisions.filter((d) => !d.scope);
      const decisionIds = new Set(p.decisions.map((d) => d.id));
      for (const d of p.decisions)
        if (d.supersedes && !decisionIds.has(d.supersedes)) delete d.supersedes;
      p.receipts = [];
      p.version++;
      p.updatedAt = now();
      const cleanup = join(this.path(pid), "asset-cleanup.json");
      await this.atomic(cleanup, [...candidates]);
      // Do not create a new snapshot containing the deleted assets.
      await this.save(p);
      await rm(join(this.path(pid), "backups"), {
        recursive: true,
        force: true,
      });
      await rm(join(this.path(pid), "recovery"), {
        recursive: true,
        force: true,
      });
      await rm(join(this.root, "jobs", "projects", pid), {
        recursive: true,
        force: true,
      });
      for (const digest of candidates)
        if (!retained.has(digest))
          await rm(join(this.root, "blobs", digest), { force: true });
      await rm(cleanup, { force: true });
      return {
        version: p.version,
        assets: p.assets.length,
        unattributedJobDirectories: legacyJobs,
      };
    });
  }
  async installBlob(digest: string, bytes: Buffer) {
    if (hash(bytes) !== digest) throw Error("Blob hash mismatch");
    const destination = join(this.root, "blobs", digest);
    const verify = async () => {
      if (hash(await readFile(destination)) !== digest)
        throw Error("Stored blob hash mismatch");
    };
    try {
      await verify();
      return;
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    const temporary = join(this.root, "blobs", ".staging-" + randomUUID());
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Hard-link publication is atomic and cannot replace an existing blob.
      try {
        await link(temporary, destination);
      } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
        await verify();
      }
    } finally {
      await unlink(temporary).catch((e: any) => {
        if (e.code !== "ENOENT") throw e;
      });
    }
  }
  async blob(pid: string, rid: string, fid: string) {
    const p = await this.read(pid),
      r = p.revisions.find((r) => r.id === rid),
      f = r?.files.find((f) => f.id === fid);
    if (!f) throw Error("File not found");
    const bytes = await readFile(join(this.root, "blobs", f.hash));
    if (hash(bytes) !== f.hash) throw Error("Stored blob is corrupt");
    return { file: f, bytes };
  }
  async backups(pid: string) {
    id.parse(pid);
    try {
      return (await readdir(join(this.path(pid), "backups")))
        .filter((n) => /^[\w-]+\.json$/.test(n))
        .sort()
        .reverse();
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async restore(pid: string, input: unknown) {
    return this.serial(async () => {
      if (this.referenceJobs.has(pid))
        throw new Conflict(
          "A reference job is active for this project; finish or cancel it before restoring a backup",
        );
      const d = z
        .object({
          backupId: z.string().regex(/^[\w-]+\.json$/),
          expectedVersion: z.number().int().optional(),
          recoverCorrupt: z.boolean().default(false),
        })
        .strict()
        .parse(input);
      let current: Project | undefined;
      try {
        current = await this.read(pid);
      } catch {}
      if (current && d.recoverCorrupt)
        throw Error("Corrupt recovery is only for unreadable projects");
      if (current && current.version !== d.expectedVersion)
        throw new Conflict("Project changed");
      if (!current && !d.recoverCorrupt)
        throw Error("Use explicit corrupt recovery");
      const p = project.parse(
        JSON.parse(
          await readFile(join(this.path(pid), "backups", d.backupId), "utf8"),
        ),
      );
      this.validate(p);
      if (p.id !== pid) throw Error("Backup identity mismatch");
      for (const f of this.files(p)) {
        if (hash(await readFile(join(this.root, "blobs", f.hash))) !== f.hash)
          throw Error("Backup file is missing or corrupt");
      }
      if (!current) {
        await mkdir(join(this.path(pid), "recovery"), { recursive: true });
        await copyFile(
          join(this.path(pid), "project.json"),
          join(this.path(pid), "recovery", `${Date.now()}.json`),
        ).catch((e: any) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
      p.version = current ? current.version + 1 : Date.now();
      p.receipts = [];
      this.interruptDetachedRenders(
        p,
        "Restored render has no active process.",
      );
      p.updatedAt = now();
      await this.save(p, current);
      return p;
    });
  }
  files(p: Project) {
    return [
      ...p.revisions.flatMap((r) => r.files),
      ...p.renderSets.flatMap((r) =>
        r.outputs.map((o) => ({ ...o, kind: "image" as const })),
      ),
    ];
  }
  async updateReferences(pid: string, fn: (p: Project) => void) {
    return this.serial(async () => {
      const old = await this.read(pid),
        p = structuredClone(old);
      fn(p);
      p.version++;
      p.updatedAt = now();
      await this.save(p, old);
    });
  }
  async bundle(pid: string) {
    const p = await this.read(pid);
    const blobs: Record<string, string> = {};
    for (const f of this.files(p)) {
      const b = await readFile(join(this.root, "blobs", f.hash));
      if (hash(b) !== f.hash) throw Error("Corrupt export file");
      blobs[f.hash] = b.toString("base64");
    }
    return { format: "mesh-foundry-1", project: p, blobs };
  }
  async importBundle(input: unknown) {
    return this.serial(async () => {
      const b = z
        .object({
          format: z.literal("mesh-foundry-1"),
          project,
          blobs: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.string()),
        })
        .strict()
        .parse(input);
      this.validate(b.project);
      for (const r of b.project.revisions)
        for (const f of r.files) {
          const bytes = Buffer.from(b.blobs[f.hash] ?? "", "base64");
          if (hash(bytes) !== f.hash || bytes.length !== f.size)
            throw Error("Bundle hash mismatch");
          const actual = await inspectBytes(f.kind, bytes);
          if (actual.mime !== f.mime) throw Error("Bundle MIME mismatch");
          if (
            f.kind === "model" &&
            JSON.stringify(actual.clips) !== JSON.stringify(r.clips)
          )
            throw Error("Bundle clip metadata mismatch");
          if (r.technical !== "decoded")
            throw Error(
              "Imported Blender verification must be re-established locally",
            );
        }
      for (const rs of b.project.renderSets)
        for (const f of rs.outputs) {
          const bytes = Buffer.from(b.blobs[f.hash] ?? "", "base64");
          if (hash(bytes) !== f.hash || bytes.length !== f.size)
            throw Error("Render bundle hash mismatch");
          const actual = await inspectBytes("image", bytes);
          if (actual.mime !== "image/png")
            throw Error("Render bundle MIME mismatch");
        }
      for (const [digest, base64] of Object.entries(b.blobs))
        if (hash(Buffer.from(base64, "base64")) !== digest)
          throw Error("Bundle hash mismatch");
      for (const [digest, base64] of Object.entries(b.blobs)) {
        const bytes = Buffer.from(base64, "base64");
        await this.installBlob(digest, bytes);
      }
      this.interruptDetachedRenders(
        b.project,
        "Imported render has no active process.",
      );
      await this.publishNew(b.project);
      return b.project;
    });
  }
}
