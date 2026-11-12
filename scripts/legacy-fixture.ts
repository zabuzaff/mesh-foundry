// Isolated test/proof setup: exercise compatibility with pre-progression projects
// through the supported portable import path, without bypassing new publication rules.
import { inspect } from "../server/files.js";
import { revision, type Project } from "../shared/schema.js";
export async function legacyFixture(
  pid: string,
  name: string,
  categoryId: string,
  assetId: string,
  revisions: {
    id: string;
    stage: "study" | "model";
    files: { kind: "model" | "blend"; path: string }[];
    summary?: string;
  }[],
  version = 0,
) {
  const blobs: Record<string, string> = {};
  const records: Project["revisions"] = [];
  for (const r of revisions) {
    const inspected = await Promise.all(r.files.map(inspect));
    for (const f of inspected) blobs[f.file.hash] = f.bytes.toString("base64");
    records.push(
      revision.parse({
        id: r.id,
        assetId,
        stage: r.stage,
        summary: r.summary ?? "Legacy technical fixture",
        files: inspected.map((f) => f.file),
        clips: inspected.find((f) => f.file.kind === "model")?.clips ?? [],
        createdAt: new Date().toISOString(),
        toolVersions: {},
        fixture: true,
        technical: "decoded",
      }),
    );
  }
  const project: Project = {
    schemaVersion: 1,
    id: pid,
    name,
    brief: "",
    currentTask: "",
    version,
    updatedAt: new Date().toISOString(),
    categories: [{ id: categoryId, name: categoryId }],
    assets: [
      {
        id: assetId,
        categoryId,
        name: assetId,
        purpose: "Legacy technical fixture",
      },
    ],
    revisions: records,
    decisions: [],
    feedback: [],
    acceptance: [],
    accepted: {},
    receipts: [],
    renderSets: [],
    handoffs: [],
  };
  return { format: "mesh-foundry-1" as const, project, blobs };
}
