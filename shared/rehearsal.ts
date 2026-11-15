import { z } from "zod";
import { id, rehearsalLink } from "./schema.js";

const model = z.object({ libraryId: id, assetId: id, revisionId: id });
const reference = z.object({
  dataDir: z.string().startsWith("/"),
  port: z.number().int().min(1).max(65535),
  revisionId: id,
  link: z.string(),
});
const requirement = z.object({
  id,
  name: z.string(),
  source: model,
  objects: z.array(id),
  measurements: z.array(
    z.object({ label: z.string(), value: z.number(), unit: z.string() }),
  ),
  changes: z.array(z.string()),
  preserve: z.array(z.string()),
  checks: z.array(z.string()),
});
const event = z.object({ eventId: id });
export const sceneEvents = z.object({
  id,
  rehearsalBrief: z.unknown().optional(),
  rehearsalEvents: z
    .array(
      z.discriminatedUnion("kind", [
        event.extend({
          kind: z.literal("review"),
          inputRevision: z.number(),
          blockout: z.enum(["ready", "needs-revision"]),
        }),
        event.extend({
          kind: z.literal("draft"),
          reviewId: id,
          draft: reference,
          requirements: z.array(requirement),
          retireRequirementIds: z.array(id).optional(),
        }),
        event.extend({
          kind: z.literal("candidate"),
          requirementId: id,
          model,
          basedOn: model,
        }),
        event.extend({
          kind: z.literal("candidate-review"),
          requirementId: id,
          model,
          verdict: z.enum(["accepted", "needs-revision"]),
          evidence: z.array(z.string()),
        }),
        event.extend({
          kind: z.literal("fit"),
          requirementId: id,
          model,
          rehearsalRevisionId: id,
          assembled: reference.optional(),
          verdict: z.enum(["pass", "model-defect", "rehearsal-issue"]),
          evidence: z.array(z.string()),
        }),
      ]),
    )
    .default([]),
});
export type RehearsalLink = z.infer<typeof rehearsalLink>;
export type SceneEvents = z.infer<typeof sceneEvents>;
type Event<K> = Extract<SceneEvents["rehearsalEvents"][number], { kind: K }>;
export function resolveRehearsal(
  scene: SceneEvents,
  link: RehearsalLink,
  libraryId: string,
  assetId: string,
  contentRevision: number,
  inputRevision: number,
) {
  const events = scene.rehearsalEvents;
  const review = [...events]
    .reverse()
    .find((e): e is Event<"review"> => e.kind === "review");
  const draft = [...events]
    .reverse()
    .find((e): e is Event<"draft"> => e.kind === "draft");
  const basis = events.find(
    (e): e is Event<"draft"> =>
      e.kind === "draft" &&
      e.requirements.some((r) => r.id === link.requirementId),
  );
  const saved = basis?.requirements.find((r) => r.id === link.requirementId);
  if (
    !basis ||
    !saved ||
    saved.source.libraryId !== libraryId ||
    saved.source.assetId !== assetId
  )
    return {
      status: "missing",
      message:
        "Find the exact asset requirement on the linked Scene Loom scene and update this asset’s link.",
    } as const;
  if (
    events
      .slice(events.indexOf(basis) + 1)
      .some(
        (e) =>
          e.kind === "draft" &&
          (e.retireRequirementIds?.includes(saved.id) ||
            e.requirements.some(
              (r) =>
                r.source.libraryId === libraryId &&
                r.source.assetId === assetId,
            )),
      )
  )
    return {
      status: "stale",
      message:
        "Scene Loom retired or replaced this requirement. Update this asset’s link before continuing.",
    } as const;
  if (
    !scene.rehearsalBrief ||
    review?.inputRevision !== inputRevision ||
    review?.blockout !== "ready" ||
    draft?.reviewId !== review.eventId
  )
    return {
      status: "stale",
      message:
        "Open the linked scene in Scene Loom and complete its rehearsal review and draft steps.",
    } as const;

  const head = events.reduce(
    (head, e) =>
      e.kind === "draft"
        ? e.draft
        : e.kind === "fit" && e.assembled
          ? e.assembled
          : head,
    basis.draft,
  );
  const candidate = [...events]
    .reverse()
    .find(
      (e): e is Event<"candidate"> =>
        e.kind === "candidate" && e.requirementId === saved.id,
    );
  const sameAsset = (value: z.infer<typeof model>) =>
    value.libraryId === libraryId && value.assetId === assetId;
  if (
    candidate &&
    (!sameAsset(candidate.model) || !sameAsset(candidate.basedOn))
  )
    return {
      status: "stale",
      message:
        "The recorded candidate does not match the linked asset. Reconcile the Scene Loom handoff.",
    } as const;
  const results = candidate ? events.slice(events.indexOf(candidate) + 1) : [];
  const acceptance = [...results]
    .reverse()
    .find(
      (e): e is Event<"candidate-review"> =>
        e.kind === "candidate-review" &&
        e.requirementId === saved.id &&
        sameAsset(e.model) &&
        e.model.revisionId === candidate?.model.revisionId,
    );
  const fit = [...results]
    .reverse()
    .find(
      (e): e is Event<"fit"> =>
        e.kind === "fit" &&
        e.requirementId === saved.id &&
        sameAsset(e.model) &&
        e.model.revisionId === candidate?.model.revisionId,
    );
  const currentFit =
    fit &&
    (fit.assembled?.revisionId ?? fit.rehearsalRevisionId) === head.revisionId
      ? fit
      : undefined;
  return {
    status: "ready",
    link,
    requirement: saved,
    measuredIn: basis.draft,
    head,
    candidate,
    acceptance,
    fit: currentFit,
    staleFit: Boolean(fit && !currentFit),
    contentRevision,
    inputRevision,
    afterEventId: events.at(-1)?.eventId ?? null,
  } as const;
}
export type RehearsalContext = ReturnType<typeof resolveRehearsal>;
export type ReadyRehearsal = Extract<RehearsalContext, { status: "ready" }>;
