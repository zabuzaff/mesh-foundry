import { z } from "zod";
import { referenceViews } from "./reference-views.js";
const identity = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const view = z.enum(referenceViews);
export const renderInput = z
  .object({ requestId: identity, revisionId: identity })
  .strict();
export const renderSet = z
  .object({
    id: identity,
    requestDigest: digest,
    revisionId: identity,
    assetId: identity,
    status: z.enum([
      "running",
      "failed",
      "interrupted",
      "cancelled",
      "completed",
    ]),
    createdAt: z.string(),
    error: z.string().optional(),
    modelFileId: identity,
    sources: z.array(z.object({ id: identity, hash: digest }).strict()),
    acceptedAtRender: z.boolean(),
    label: z.string(),
    preset: z.literal("reference-neutral-v1"),
    presetHash: digest,
    resolved: z.record(z.string(), z.unknown()).optional(),
    outputs: z.array(
      z
        .object({
          view,
          hash: digest,
          size: z.number().int().positive(),
          mime: z.literal("image/png"),
        })
        .strict(),
    ),
  })
  .strict();
export const handoffInput = z
  .object({
    requestId: identity,
    renderSetId: identity,
    views: z.array(view).min(1).max(3),
    projectId: identity,
    sceneId: identity,
  })
  .strict();
export const handoff = z
  .object({
    id: identity,
    requestDigest: digest,
    renderSetId: identity,
    views: z.array(view),
    target: z
      .object({
        checkout: z.string(),
        dataRoot: z.string(),
        projectId: identity,
        sceneId: identity,
      })
      .strict(),
    status: z.enum([
      "prepared",
      "importing",
      "applying",
      "failed",
      "cancelled",
      "completed",
    ]),
    createdAt: z.string(),
    error: z.string().optional(),
    imported: z.record(z.string(), identity),
    attempts: z.array(
      z
        .object({
          requestId: identity,
          digest,
          batch: z.record(z.string(), z.unknown()),
          dryRun: z.unknown().optional(),
          result: z.unknown().optional(),
        })
        .strict(),
    ),
    preview: z.array(identity),
    verifiedRevision: z.number().int().optional(),
  })
  .strict();
export type RenderSet = z.infer<typeof renderSet>;
export type Handoff = z.infer<typeof handoff>;
