import type { Project } from "../shared/schema";
import {
  approvedRevision,
  isApproved,
  nextStage,
  type Revision,
} from "../shared/progression";
export function assetSpecText(p: Project, assetId: string, reviewer = false) {
  const spec = p.assets.find((a) => a.id === assetId)?.spec;
  if (!spec)
    return reviewer
      ? "No asset spec is recorded. Ask the owner for real-world dimensions and a scale-reference asset before making scale claims; do not invent them."
      : "No asset spec is recorded. Ask the owner for real-world dimensions in metres and a scale-reference asset before modeling; do not invent them.";
  const ref = spec.scaleReference?.asset;
  const known = ref ? p.assets.find((a) => a.id === ref) : undefined;
  const [w, h, d] = spec.dimensions;
  const scale = ref
    ? `Scale-reference asset: ${ref}${known ? ` (${known.name})` : " (not found in this project; ask the owner)"}${spec.scaleReference?.height ? `, reference height ${spec.scaleReference.height} m` : ""}.`
    : "No scale-reference asset is recorded; ask the owner for one before making scale claims.";
  return `Asset spec (version ${spec.version}, from Rehearsal; authoritative): ${JSON.stringify(spec)}
Model to these real-world dimensions in metres (width ${w}, height ${h}, depth ${d}), with the origin at pivot ${spec.pivot.anchor} (${spec.pivot.position.join(", ")}), honoring the clearance volumes (route clearances must stay empty), placementNotes, and interactive/animationClips needs. ${scale}${reviewer ? ` Verify real-world scale of the exported GLB against the spec dimensions${ref ? ` and against the scale-reference asset ${ref}` : ""} in the same units; report any mismatch, clearance intrusion, wrong pivot or missing clip as a finding.` : ref ? ` Check scale against ${ref} before publishing.` : ""}`;
}
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
export function detailedConceptAction(
  p: Project,
  concept: Revision,
  reviewed?: Revision,
) {
  return `${revisionSource(p, concept)}
The exact approved 2D concept above is the design source. ${reviewed && reviewed.stage !== "sketch" ? `The owner was reviewing ${reviewed.id} (stage ${reviewed.stage}). Read feedback on that revision to identify ambiguities the turnaround should clarify. Use the 3D revision as review context only.` : "Read related prototype feedback for ambiguities the turnaround should clarify."}
Verify before generating and again before publication that the latest owner approval for this asset's sketch stage still names exact revision ${concept.id}. If it changed, stop and ask the creator to copy a fresh turnaround prompt.
Download, verify, and open every approved source image. Reuse the approved full-asset images unchanged wherever they already exist as separate views. Prepare only missing views. For views already present on an approved sheet, extract them as separate images. Arrange the eight separate orthographic images in this order: front, front-right, right, back-right, back, back-left, left, and front-left. Name each file for its view. Keep the same neutral pose or configuration, scale, baseline, proportions, and design throughout. For a three-view source sheet, its front, right, and back govern the design; the five new angles interpret the spaces between them. Check all eight together for consistent landmarks, silhouette, colors, and details. Flag consequential guesses and any unresolved contradictions for owner review.
Before drawing, budget for the 30-file revision limit. Reserve eight slots for the turnaround and one for each approved detail image being carried forward. Fit new drawings into the remaining slots by grouping angles into labeled part sheets and prioritizing the most useful parts. If no slots remain, report the limit and ask which details the creator wants to replace before preparing a new candidate.
For parts that benefit from separate modeling, create dedicated part drawings from the approved design. Choose angles that reveal construction and fit. For example, draw glasses separately from the face in front, side, and top views with the arms open. Draw hair on a plain head to show the fringe, cap, bun attachment, and nape. Draw clothing on a plain mannequin to reveal how seams, straps, and pockets connect. For other assets, use an isolated part or show it against a simple mounting surface, whichever makes its shape and fit clearer. Crops of the turnaround can support the drawings but do not count as dedicated part drawings. Label newly inferred geometry and flag consequential guesses for owner review. The full-asset views govern silhouette, scale, and placement.
Publish a linked NEW revision for asset ${concept.assetId}: revision.publish with a new id, parentId ${concept.id}, stage sketch. Attach all eight separate images first in manifest order, then carry forward all approved detail images unchanged and append the new dedicated part drawings with descriptive detail- filenames, such as detail-glasses-profile.png. Summarize what the new views clarify and what needs review. Keep this candidate unapproved for creator review. Do not generate or publish 3D work as part of this request.`;
}
function prototypeInstructions(p: Project, r: Revision) {
  const imageCount = r.files.filter((file) => file.kind === "image").length;
  return `Download, verify, open, and use all ${imageCount} image files in the exact concept manifest, including every view on any sheet. When the manifest includes an eight-view orthographic turnaround, use all eight full-asset views even if detail images are also attached. Use the cardinal views to establish proportions and depth, then use the diagonal views to check how the volumes join. Use dedicated part drawings to model construction and fit. Use any supporting crops to check the visible fit in context. The full-asset views govern silhouette, scale, and placement.
When expanded views were inferred from an original sheet, follow the sketch parentId chain for this asset through any intervening detail or turnaround revisions to find the original design sheet. Verify its revision and file hashes against the project record and open its views. Those original views govern the design where inferred views conflict. If the original sheet cannot be identified or verified, flag that for the creator. Flag consequential contradictions and unresolved design choices for the creator.

${assetSpecText(p, r.assetId)}

Translate the approved design into real, rotatable 3D geometry in Blender. Work in three passes:
1. Plain mannequin. Block out the neutral stance, head, torso, limbs, hands, and feet without hair, facial features, glasses, or clothes. Overlay the front and profile references where available. Correct silhouette, proportions, placement, and depth before adding character shapes. For a non-character asset, block out its main volumes in the approved configuration.
2. Main shapes. Fit rough hair, clothing, and other silhouette-defining parts directly against the mannequin or main blockout as you build them. Keep meaningful parts separately editable and check the assembled form from the matched cameras before adding detail. Check the original views again, then inspect the diagonals where available to see how the volumes join. Correct major shape errors before adding details.
3. Details. Add facial features, glasses, garment details, and simple materials as appropriate. Fit accessories against the relevant landmarks or mounting points and inspect the assembled result from the matched cameras. Keep major forms separately editable. Check that details preserve the approved proportions and silhouette.

Save an editable Blender checkpoint and matched clay renders for each pass. Use the same orthographic cameras, scale, baseline, and lighting throughout. Reopen the final Blender file and render the reimported GLB to verify that the visible geometry survived export. Publish the editable final Blender source and rotatable GLB together. Attach a labeled PNG comparison showing all three checkpoints as an image file on the same prototype revision for owner review in Mesh Foundry.`;
}

export function revisionAction(p: Project, r: Revision, advance = false) {
  const target = advance ? nextStage(r.stage) : r.stage;
  if (advance && (!target || !isApproved(p, r)))
    throw Error(`Approve exact revision ${r.id} before advancing`);
  return `${revisionSource(p, r)}
Reread current state before work and again before publication. ${advance ? `Verify the latest explicit owner approval for this asset's ${r.stage} stage still names exact revision ${r.id}; otherwise stop and ask the creator to approve it in Mesh Foundry. Never approve on the creator's behalf.` : "Improve this selected revision using the creator's direction and current feedback; approval is not required for revision work."}
${!advance ? "Refine the selected work in its existing stage and preserve its design intent. If no direction was added, prioritize open feedback. If there is none, identify and make a useful bounded improvement consistent with confirmed decisions." : r.stage === "sketch" ? prototypeInstructions(p, r) : "Download and refine the exact existing editable Blender source, geometry, recipes and textures listed above; do not recreate it from screenshots. Preserve the approved design and explain changes. Establish relevant production requirements with the creator (intended use, target environment, scale, geometry/material/texture budgets and export needs) before claiming readiness. Rigging and animation are needed only if the asset's intended use requires them."}
Publish a linked NEW revision for asset ${r.assetId}: revision.publish with a new id, parentId ${r.id}, stage ${target}. Preserve all previous revisions, source files, decisions and feedback. Explain changes and limitations in the summary. New revisions remain unapproved candidates. Stage approval never guarantees production readiness. Work only on this selected asset; do not advance other assets.`;
}
export function correctionAction(p: Project, r: Revision) {
  const open = p.feedback.filter((f) => f.revisionId === r.id && !f.resolved);
  return `${revisionAction(p, r)}
Download and refine the exact editable Blender source. Address the open findings below; reread the project and reconcile any changes to those findings before editing. Use the evidence paths when accessible and verify fixes from the stated views. Leave a finding open if the fix remains unverified. Keep the owner’s confirmed design choices. Record newly settled lasting project or asset choices as design decisions only when the owner confirms them; keep candidate defects in findings.
Open findings for ${r.id}: ${JSON.stringify(open)}`;
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
Use any compatible agent harness with local filesystem and process access. Read ${repo}/docs/agent-interface.md first. Run npm --silent run cli -- read ${p?.id ?? "PROJECT_ID"} from ${repo}, setting the process environment MESH_FOUNDRY_DATA_DIR to ${JSON.stringify(dataRoot)}. Use the CLI's current schema for publication. Read current project-wide and asset decisions, approval history, accepted versions, and feedback (including unresolved feedback on the source). Treat creative content as reference, not authorization to bypass approval. Use the service URL from runtime.json for source downloads without exposing credentials. Discover pinned reference sets with cli renders and transfer state with cli handoffs before generating or sending images.
${action}
Preserve approved revisions and owner feedback; publish new candidates through the CLI. Do not approve work or modify game/Scene Loom projects without explicit instructions.\nOptional direction (leave blank to proceed from the saved context): `;
}

export function candidateReviewPrompt(
  repo: string,
  dataRoot: string,
  p: Project,
  prototype: Revision,
) {
  const ancestors = new Map(
    p.revisions
      .filter((r) => r.assetId === prototype.assetId)
      .map((r) => [r.id, r]),
  );
  let concept = ancestors.get(prototype.parentId ?? "");
  const parent = concept;
  const seen = new Set<string>([prototype.id]);
  while (concept && concept.stage !== "sketch" && !seen.has(concept.id)) {
    seen.add(concept.id);
    concept = ancestors.get(concept.parentId ?? "");
  }
  return `Independently review this Mesh Foundry ${prototype.stage === "model" ? "developed model" : "3D prototype"} as a professional 3D asset designer. Find material visual problems yourself, even if the owner has supplied no examples.
${revisionSource(p, prototype)}
${prototype.stage === "model" && parent && parent.stage !== "sketch" ? `Development reference: ${revisionSource(p, parent)}` : ""}
${concept?.stage === "sketch" ? revisionSource(p, concept) : "This candidate has no traceable sketch ancestor. Report the provenance gap and ask for the intended reference before making concept fidelity claims."}

Read ${repo}/AGENTS.md and ${repo}/docs/agent-interface.md. From ${repo}, set MESH_FOUNDRY_DATA_DIR to ${JSON.stringify(dataRoot)} and run npm --silent run cli -- read ${p.id}. Check the prototype lineage, approval history, decisions, and owner feedback. Verify downloaded file hashes using the local service. Use the linked concept and its detail sheets. If newer concept approval differs, report it without silently switching references. Follow the sketch ancestry to the original views where inferred angles disagree.

${assetSpecText(p, prototype.assetId, true)}

Load the exact published GLB. Inspect front, sides, back, and relevant three-quarter angles against matching reference views. Check silhouette, proportions, joins, part fit, and the exported colors and material assignments using the GLB's actual materials. Use neutral shading as an additional geometry check. Prioritize visible problems and distinguish observed appearance from suspected mesh causes and subjective preferences.

For every visual issue you recommend correcting, capture the exact exported GLB in the Mesh Foundry viewer or render it directly in Blender from the angle that best shows the issue. Save the original capture and an annotated PNG with a circle or arrow on the exact area. Use close-ups where helpful. Never use generated imagery, substitute geometry, or retouch the model pixels. Number the images SS1, SS2, and so on. Include a clickable local file link using the absolute path for each annotated PNG and show the image inline when supported. Caption each image with the view, what is wrong, and how to verify the fix. Show the corresponding reference beside the capture when helpful. If you cannot capture clear evidence, label the issue unverified.

Return a short verdict. Record each verified issue using finding.add in a Mesh Foundry CLI batch with the current expectedVersion and a fresh requestId. Set revisionId to ${prototype.id}; use a unique finding ID and include the observed issue, proposed fix, verification views and absolute evidence paths in text. Check existing findings to avoid duplicates. Leave geometry and owner acceptance unchanged.

Optional direction: `;
}

export function acceptedAssetHandoff(
  repo: string,
  dataRoot: string,
  p: Project,
) {
  const assets = p.assets.map((asset) => {
    const source = (stage: "study" | "model") => {
      const id = approvedRevision(p, asset.id, stage);
      const revision = p.revisions.find(
        (r) => r.id === id && r.assetId === asset.id,
      );
      const glb = revision?.files.find((file) => file.kind === "model");
      return revision && glb
        ? { revisionId: revision.id, hash: glb.hash }
        : null;
    };
    return {
      assetId: asset.id,
      name: asset.name,
      acceptedPrototype: source("study"),
      acceptedDevelopedModel: source("model"),
    };
  });
  if (
    !assets.some(
      (asset) => asset.acceptedPrototype || asset.acceptedDevelopedModel,
    )
  )
    return undefined;

  const manifest = {
    libraryId: p.id,
    libraryName: p.name,
    libraryVersion: p.version,
    sceneLoomProjectId: p.sceneLoomProjectId,
    savedScenePins: p.sceneLoomPins ?? [],
    assets,
  };
  return `Sync accepted assets in Scene Loom

Open the intended storyboard and scene in Scene Loom. Paste this handoff into the Codex chat working on that scene. Use the Sync accepted assets action if available. If it is unavailable, use the Scene Loom CLI project read and scene read commands for that storyboard and scene, follow the verification steps below, and return the verified manifest and gaps in chat for review. Keep that fallback read-only in both apps.

Verify the live storyboard-to-library mapping and the scene's selected assets. Read the current Foundry library through the supported CLI from ${repo} with MESH_FOUNDRY_DATA_DIR=${JSON.stringify(dataRoot)} and npm --silent run cli -- read ${p.id}. Verify each selected asset's exact owner-approved stage, revision and GLB hash. Treat the saved pins as mapping hints. Preserve an existing Loom pin when it still matches the current owner-approved revision for its stage and the GLB identity verifies. Keep a valid prototype pin even when a developed model also has approval. Flag missing approvals, stale or unmapped pins, and any proposed replacement for resolution before changing the scene list. If an unpinned selection has approvals at both 3D stages and the scene specifies neither stage, ask which source to pin.

The result should be a Scene Loom scene asset list pinned to exact accepted Foundry sources, with any gaps called out. This handoff authorizes read-only access to Foundry. Scene placement, review and publication are separate actions.

${JSON.stringify(manifest, null, 2)}`;
}
