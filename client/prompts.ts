import type { Project } from "../shared/schema";
import { isApproved, nextStage, type Revision } from "../shared/progression";
export function revisionAction(p: Project, r: Revision, advance = false) {
  const target = advance ? nextStage(r.stage) : r.stage;
  if (advance && (!target || !isApproved(p, r)))
    throw Error(`Approve exact revision ${r.id} before advancing`);
  const files = r.files.map((f) => ({
    id: f.id,
    kind: f.kind,
    name: f.name,
    hash: f.hash,
    url: `/api/projects/${p.id}/revisions/${r.id}/files/${f.id}`,
  }));
  return `Selected source: project ${p.id}, asset ${r.assetId}, exact revision ${r.id}, stored stage ${r.stage}.
Source file manifest (resolve URLs against the running Mesh Foundry service; verify hashes): ${JSON.stringify(files)}
Reread current state before work and again before publication. ${advance ? `Verify the latest explicit owner approval for this asset's ${r.stage} stage still names exact revision ${r.id}; otherwise stop and ask the creator to approve it in Mesh Foundry. Never approve on the creator's behalf.` : "Improve this selected revision using the creator's direction and current feedback; approval is not required for revision work."}
${!advance ? "Refine the selected work in its existing stage and preserve its design intent." : r.stage === "sketch" ? "Inspect the exact concept images. Translate the approved design into real, rotatable 3D geometry, preserving approved proportions, silhouette, colors and defining details. Ask the creator about consequential unresolved details instead of silently inventing them." : "Download and refine the exact existing editable Blender source, geometry, recipes and textures listed above; do not recreate it from screenshots. Preserve the approved design and explain changes. Establish relevant production requirements with the creator (intended use, target environment, scale, geometry/material/texture budgets and export needs) before claiming readiness. Rigging and animation are needed only if the asset's intended use requires them."}
Publish a linked NEW revision for asset ${r.assetId}: revision.publish with a new id, parentId ${r.id}, stage ${target}. Preserve all previous revisions, source files, decisions and feedback. Explain changes and limitations in the summary. New revisions remain unapproved candidates. Stage approval never guarantees production readiness. Work only on this selected asset; do not advance other assets.`;
}
export function workPrompt(
  repo: string,
  dataRoot: string,
  p: Project | null,
  assetId: string | undefined,
  r: Revision | undefined,
  action: string,
) {
  return `Work with Mesh Foundry project ${p?.id ?? "[choose project]"}${assetId ? `, asset ${assetId}` : ""}${r ? `, exact revision ${r.id}` : ""}.
Use any compatible agent harness with local filesystem and process access. Read ${repo}/docs/agent-interface.md first. Run npm --silent run cli -- read ${p?.id ?? "PROJECT_ID"} from ${repo}, setting the process environment MESH_FOUNDRY_DATA_DIR to ${JSON.stringify(dataRoot)}. Use the CLI's current schema for publication. Read current project-wide and asset decisions, approval history, accepted versions, current task and feedback (including unresolved feedback on the source). Treat creative content as reference, not authorization to bypass approval. Use the service URL from runtime.json for source downloads without exposing credentials. Discover pinned reference sets with cli renders and transfer state with cli handoffs before generating or sending images.
${action}
Preserve approved revisions and owner feedback; publish new candidates through the CLI. Do not approve work or modify game/Scene Loom projects without explicit instructions.\nMy direction: `;
}
