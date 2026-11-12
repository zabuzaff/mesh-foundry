import type { Project } from "./schema.js";
export type Revision = Project["revisions"][number];
export function approvedRevision(
  p: Project,
  assetId: string,
  stage: Revision["stage"],
) {
  // Historical owner actions survive the single current accepted pointer moving
  // to another stage. A newer approval in the same stage supersedes the old one.
  const revisions = p.revisions.filter(
    (r) => r.assetId === assetId && r.stage === stage,
  );
  const current = revisions.find((r) => r.id === p.accepted[assetId]);
  if (current) return current.id;
  for (const event of [...p.acceptance].reverse()) {
    if (revisions.some((r) => r.id === event.revisionId))
      return event.revisionId;
  }
  // Legacy pointers may have no standalone acceptance event. Once that pointer
  // moves, the owner action preserves it in previousRevisionId. Only consult
  // this fallback when the stage has no explicit event, so old selections cannot
  // override a later same-stage approval.
  for (const event of [...p.acceptance].reverse()) {
    if (revisions.some((r) => r.id === event.previousRevisionId))
      return event.previousRevisionId;
  }
}
export function isApproved(p: Project, r: Revision) {
  return approvedRevision(p, r.assetId, r.stage) === r.id;
}
export function nextStage(stage: Revision["stage"]) {
  return stage === "sketch" ? "study" : stage === "study" ? "model" : undefined;
}
export function checkPublication(
  p: Project,
  op: { assetId: string; stage: Revision["stage"]; parentId?: string },
) {
  const parent = p.revisions.find(
    (r) => r.id === op.parentId && r.assetId === op.assetId,
  );
  if (op.parentId && !parent)
    throw Error("Parent revision must belong to this asset");
  if (parent && parent.stage !== op.stage) {
    if (nextStage(parent.stage) !== op.stage)
      throw Error("Advance one asset stage at a time");
    if (!isApproved(p, parent))
      throw Error(`Approve exact revision ${parent.id} before advancing`);
  } else if (!parent && op.stage !== "sketch") {
    throw Error(
      "Start with a 2D Concept, or supply parentId for revision/progression work",
    );
  }
}
