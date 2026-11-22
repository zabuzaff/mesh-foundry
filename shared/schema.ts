import { z } from "zod";
import { renderSet, handoff } from "./references.js";
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
const text = z.string().max(20000);
const vec = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const pin = z
  .object({
    objectId: text,
    point: vec,
    camera: vec,
    target: vec,
    clip: text,
    time: z.number().min(0),
    imageId: id.optional(),
  })
  .strict();
export const file = z
  .object({
    id,
    kind: z.enum(["blend", "model", "image", "recipe", "texture"]),
    name: z.string().max(180),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive(),
    mime: z.string(),
  })
  .strict();
export const revision = z
  .object({
    id,
    assetId: id,
    parentId: id.optional(),
    stage: z.enum(["sketch", "study", "model"]),
    summary: text,
    createdAt: z.string(),
    files: z.array(file).min(1),
    clips: z.array(
      z.object({ name: text, duration: z.number().min(0) }).strict(),
    ),
    toolVersions: z.record(z.string(), z.string()),
    technical: z.enum(["decoded", "blender-verified"]),
    fixture: z.boolean(),
  })
  .strict();
const metres = z.number().finite().positive().max(10000);
const label = z.string().min(1).max(160);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const dims3 = z.tuple([metres, metres, metres]);
// Optional per-asset spec. Field names and units match Scene Rehearsal's
// scene-rehearsal-asset-spec pieces (metres, Y up, Euler XYZ radians).
export const assetSpec = z
  .object({
    version: z.literal(1),
    dimensions: dims3,
    pivot: z
      .object({ anchor: z.enum(["base-center", "center"]), position: vec })
      .strict(),
    interactive: z.boolean(),
    animationClips: z.array(label).max(50).default([]),
    clearance: z
      .array(
        z
          .object({
            id: label,
            label,
            kind: z.enum(["authored", "route"]),
            center: vec,
            size: dims3,
            rotationEuler: vec,
            cue: z
              .object({ scenario: label, event: label })
              .strict()
              .optional(),
            intersectsPlaceholder: z.boolean(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    placementNotes: z.array(text).max(50).default([]),
    scaleReference: z
      .object({
        asset: id,
        label: label.optional(),
        height: metres.optional(),
      })
      .strict()
      .nullable(),
    source: z
      .object({
        draftId: sha256,
        storyboardId: label,
        sceneId: label,
        contentDigest: sha256,
      })
      .strict()
      .optional(),
  })
  .strict();
export type AssetSpec = z.infer<typeof assetSpec>;
// A whole scene-rehearsal-asset-spec document. Only the fields Foundry reads
// are checked; other fields (units, warnings, digests, piece cues) are ignored.
export const rehearsalExport = z
  .object({
    format: z.literal("scene-rehearsal-asset-spec"),
    version: z.literal(1),
    source: z
      .object({
        draftId: sha256,
        storyboardId: label,
        sceneId: label,
        contentDigest: sha256,
      })
      .passthrough(),
    scaleReference: z
      .object({ asset: id, label: label.optional(), height: metres.optional() })
      .passthrough()
      .nullable(),
    pieces: z.array(z.object({ id: z.string() }).passthrough()).max(500),
  })
  .passthrough();
export function specFromRehearsalExport(input: {
  export: unknown;
  pieceId: string;
}): AssetSpec {
  const exp = rehearsalExport.parse(input.export);
  const piece = exp.pieces.find((p) => p.id === input.pieceId);
  if (!piece) throw Error(`Rehearsal export has no piece "${input.pieceId}"`);
  const { source, scaleReference: ref } = exp;
  return assetSpec.parse({
    version: 1,
    dimensions: piece.dimensions,
    pivot: piece.pivot,
    interactive: piece.interactive,
    animationClips: piece.animationClips,
    clearance: piece.clearance,
    placementNotes: piece.placementNotes,
    scaleReference: ref && {
      asset: ref.asset,
      label: ref.label,
      height: ref.height,
    },
    source: {
      draftId: source.draftId,
      storyboardId: source.storyboardId,
      sceneId: source.sceneId,
      contentDigest: source.contentDigest,
    },
  });
}
export const asset = z
  .object({
    id,
    categoryId: id,
    name: z.string().min(1).max(160),
    purpose: text,
    spec: assetSpec.optional(),
    base: z.object({ assetId: id, revisionId: id }).strict().optional(),
  })
  .strict();
export const decision = z
  .object({
    id,
    scope: id.optional(),
    text: text.min(1),
    supersedes: id.optional(),
    createdAt: z.string(),
  })
  .strict();
export const feedback = z
  .object({
    id,
    revisionId: id,
    text: text.min(1),
    pin: pin.optional(),
    origin: z.literal("agent-review").optional(),
    resolved: z.boolean(),
    createdAt: z.string(),
  })
  .strict();
export const sceneLoomTarget = z.strictObject({
  projectId: id,
  storyboardId: id,
});
export const sceneLoomGeneration = sceneLoomTarget.extend({
  sceneId: id,
  contentRevision: z.number().int().nonnegative(),
});
const sceneLoomPin = z.strictObject({
  storyboardId: id,
  suggestionId: id,
  sceneIds: z.array(id).min(1),
  generatedFromSceneId: id,
  contentRevision: z.number().int().nonnegative(),
  assetId: id,
  revisionId: id,
});
export const project = z
  .object({
    schemaVersion: z.literal(1),
    id,
    name: z.string().min(1).max(160),
    brief: text,
    currentTask: text,
    sceneLoomProjectId: id.optional(),
    sceneLoomPins: z.array(sceneLoomPin).optional(),
    version: z.number().int().nonnegative(),
    updatedAt: z.string(),
    categories: z.array(
      z.object({ id, name: z.string().min(1).max(160) }).strict(),
    ),
    assets: z.array(asset),
    revisions: z.array(revision),
    decisions: z.array(decision),
    feedback: z.array(feedback),
    acceptance: z.array(
      z
        .object({
          revisionId: id,
          previousRevisionId: id.optional(),
          at: z.string(),
        })
        .strict(),
    ),
    accepted: z.record(z.string(), id),
    renderSets: z.array(renderSet).default([]),
    handoffs: z.array(handoff).default([]),
    receipts: z
      .array(
        z
          .object({
            requestId: id,
            digest: z.string(),
            version: z.number().int(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Project = z.infer<typeof project>;
export const upload = z
  .object({
    kind: z.enum(["blend", "model", "image", "recipe", "texture"]),
    path: z.string().min(1),
  })
  .strict();
export const operation = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("category.create"),
      id,
      name: z.string().min(1).max(160),
    })
    .strict(),
  z.object({ type: z.literal("asset.create"), asset }).strict(),
  z
    .object({
      type: z.literal("revision.publish"),
      id,
      assetId: id,
      parentId: id.optional(),
      stage: z.enum(["sketch", "study", "model"]),
      summary: text,
      files: z.array(upload).min(1).max(30),
      toolVersions: z.record(z.string(), z.string()),
      fixture: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("decision.add"),
      id,
      scope: id.optional(),
      text: text.min(1),
      supersedes: id.optional(),
    })
    .strict(),
  sceneLoomPin
    .omit({
      storyboardId: true,
      generatedFromSceneId: true,
      contentRevision: true,
    })
    .extend({ type: z.literal("scene-loom.pin") }),
  z.strictObject({
    type: z.literal("scene-loom.unpin"),
    storyboardId: id,
    suggestionId: id,
  }),
  z.object({ type: z.literal("task.set"), text }).strict(),
  z
    .strictObject({
      type: z.literal("asset.spec"),
      assetId: id,
      spec: assetSpec.nullable().optional(),
      fromRehearsalExport: z
        .object({ export: z.unknown(), pieceId: z.string().min(1).max(200) })
        .strict()
        .optional(),
    })
    .refine(
      (op) =>
        (op.spec !== undefined) !== (op.fromRehearsalExport !== undefined),
      {
        message: "asset.spec needs exactly one of spec or fromRehearsalExport",
      },
    ),
  z.strictObject({
    type: z.literal("finding.add"),
    id,
    revisionId: id,
    text: text.min(1),
  }),
  z.object({ type: z.literal("feedback.resolve"), id }).strict(),
]);
export const batch = z
  .object({
    requestId: id,
    expectedVersion: z.number().int().nonnegative(),
    sceneLoom: sceneLoomGeneration.optional(),
    operations: z.array(operation).min(1).max(100),
  })
  .strict();
export const review = z
  .object({
    requestId: id,
    expectedVersion: z.number().int().nonnegative(),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("accept"), revisionId: id }).strict(),
      z
        .object({
          type: z.literal("feedback"),
          revisionId: id,
          text: text.min(1),
          pin: pin.optional(),
        })
        .strict(),
    ]),
  })
  .strict();
export const createProject = z
  .object({
    id,
    name: z.string().min(1).max(160),
    brief: text.default(""),
    sceneLoomProjectId: id.optional(),
  })
  .strict();
