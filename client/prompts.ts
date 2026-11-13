import type { Project } from "../shared/schema";
import { isApproved, nextStage, type Revision } from "../shared/progression";
function revisionSource(p: Project, r: Revision) {
  const files = r.files.map((f) => ({
    id: f.id,
    kind: f.kind,
    name: f.name,
    hash: f.hash,
    url: `/api/projects/${p.id}/revisions/${r.id}/files/${f.id}`,
  }));
  return `Selected source: project ${p.id}, asset ${r.assetId}, exact revision ${r.id}, stored stage ${r.stage}.
Source file manifest (resolve URLs against the running Mesh Foundry service; verify hashes): ${JSON.stringify(files)}`;
}
export function turnaroundAction(
  p: Project,
  concept: Revision,
  reviewed?: Revision,
) {
  return `${revisionSource(p, concept)}
The exact approved 2D concept above is the design source. ${reviewed && reviewed.stage !== "sketch" ? `The owner was reviewing ${reviewed.id} (stage ${reviewed.stage}). Read feedback on that revision to identify ambiguities the turnaround should clarify. Use the 3D revision as review context only.` : "Read related prototype feedback for ambiguities the turnaround should clarify."}
Verify before generating and again before publication that the latest owner approval for this asset's sketch stage still names exact revision ${concept.id}. If it changed, stop and ask the creator to copy a fresh turnaround prompt.
Download and verify the approved concept images. Create a detailed 2D turnaround with labeled orthographic front, side, and back views in the same neutral pose, at the same scale, without perspective. Align the views to a shared baseline and match landmarks across them. For a non-character asset, use the same neutral configuration in each view. Preserve the approved silhouette, proportions, colors, materials and defining details. Ask the creator about consequential hidden details that cannot be inferred.
Publish a linked NEW revision for asset ${concept.assetId}: revision.publish with a new id, parentId ${concept.id}, stage sketch. Attach one labeled turnaround sheet containing all three views as the first image file so Mesh Foundry displays the complete sheet. Summarize the details clarified and any remaining assumptions. Keep this candidate unapproved for creator review. Do not generate or publish 3D work as part of this request.`;
}
export function revisionAction(p: Project, r: Revision, advance = false) {
  const target = advance ? nextStage(r.stage) : r.stage;
  if (advance && (!target || !isApproved(p, r)))
    throw Error(`Approve exact revision ${r.id} before advancing`);
  return `${revisionSource(p, r)}
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

export function rehearsalPrompt(
  repo: string,
  dataRoot: string,
  p: Project,
  r: Revision,
  hash: string,
  clips: (string | null)[],
) {
  const source = {
    project: p.id,
    asset: r.assetId,
    revision: r.id,
    hash,
    clips,
  };
  return `Prepare a Scene Rehearsal draft for owner review using this exact accepted Mesh Foundry model.
Source identity (project ID, asset ID, accepted model revision ID, GLB SHA-256, embedded clip names): ${JSON.stringify(source)}

1. In ${repo}, read docs/agent-interface.md and shared/progression.ts. Set MESH_FOUNDRY_DATA_DIR to ${JSON.stringify(dataRoot)} for the Mesh Foundry CLI. Run npm --silent run cli -- read ${p.id}. Verify the project and asset IDs, the exact revision's model stage and GLB hash, and then verify its embedded clip names from the bundle in step 4. Use approvedRevision for the model stage: check the accepted pointer, then the latest matching acceptance event, then the legacy previousRevisionId fallback. Acceptance in another stage can coexist with model approval. Stop if the accepted model revision changed or any source identity differs. Read the asset brief and decisions for intended use.
2. In /Users/zaffran/vibed/scene-rehearsal, read README.md and inspect the current CLI and import contract. The current import route requires an owner browser session. If a supported agent import workflow is still missing, report the blocker and stop before import or publication. The follow-up is a supported Scene Rehearsal agent import command that validates the accepted bundle and pins its exact source identity while preserving owner-only final approval and export. Do not use owner credentials, direct storage edits, or manual file picking as an agent import workflow.
3. When supported agent import is available, set SCENE_REHEARSAL_DATA_DIR and SCENE_REHEARSAL_PORT for the owner-intended running library. Run its CLI list and read the target rehearsal head. Identify the intended objects and activity slots from the brief and scene. Ask the owner if the target rehearsal or any slot mapping is unclear before publishing.
4. From Mesh Foundry, using the same data directory, run npm --silent run cli -- export ${p.id} /absolute/new-bundle.json to a private working location. Verify the bundle's accepted model identity. Hash the decoded GLB bytes and compare the embedded animation names with the exact clip list above. Stop and report any missing, empty, or mismatched embedded names. A null or empty clip name identifies an unnamed animation. Scene Rehearsal requires nonempty embedded names. Immediately before importing, reread the live Mesh Foundry acceptance record and stop if the accepted model revision changed. Import through the supported agent workflow with the expected source identity. Verify the returned identity and clip names, and retain the returned source key.
5. Use the latest rehearsal scene as the base. Use the scene version's asset schema. Version 1 uses asset.hash and asset.clip and cannot pin a source key. If exact provenance cannot be guaranteed by that binding, stop and ask about moving the rehearsal to version 2. Version 2 uses asset.hash and asset.source (the returned source key). Map activity slots in asset.clips to exact embedded clip names and omit clips for static models. Preserve unrelated objects and scenarios. Publish a child draft with npm run cli -- publish /absolute/path/to/request.json with JSON fields request (unique request ID), parent (current head digest), scene (updated manifest), and links (addressed feedback IDs). If the parent is stale, reread it and reconcile before retrying. Reopen the published draft and report its digest and slot mapping to the owner for review. Final approval and export are owner actions.`;
}
