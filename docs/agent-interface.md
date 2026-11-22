# Agent interface

Mesh Foundry is authored from Codex chats. Use its CLI; do not edit running project JSON or blob files directly. The studio is an inspector and review worktable, not a modeling engine. Blender scripts create editable sources and exports outside the service.

## Start and discover

From the repository, use Node.js 22.12+, `npm ci`, `npm run build`, then `npm start`. Default studio URL: http://127.0.0.1:4323. `MESH_FOUNDRY_DATA_DIR` overrides the default `~/Library/Application Support/Mesh Foundry` and must be absolute. The service binds only to loopback and takes a single-service lock. Restart after server-code changes. Static filenames are resolved per request, so a rebuild can introduce new hashed assets while the service runs.

Use the same data-root environment for the CLI. It reads the protected runtime.json for its service address and agent credential; never paste that credential into prompts or source. Copy-ready prompts preserve the active data-root path. Example:

```sh
npm --silent run cli -- help
npm --silent run cli -- schema batch
npm --silent run cli -- list
npm --silent run cli -- read PROJECT_ID
```

Commands return JSON with success/data or success/error and a nonzero exit status on error. Help and `schema batch|project|create` work offline. Every mutation takes a JSON file (or `-` for stdin), avoiding shell interpolation of creative text.

## Create and publish

```sh
npm --silent run cli -- create /absolute/project.json
npm --silent run cli -- apply PROJECT_ID /absolute/batch.json
```

Project input:

```json
{
  "id": "my-game",
  "name": "My game",
  "brief": "Working art direction and purpose"
}
```

Read the project for its version before building a batch:

```json
{
  "requestId": "human-study-001",
  "expectedVersion": 0,
  "operations": [
    { "type": "category.create", "id": "characters", "name": "Characters" },
    {
      "type": "asset.create",
      "asset": {
        "id": "human",
        "categoryId": "characters",
        "name": "Human base",
        "purpose": "Reusable human study"
      }
    },
    {
      "type": "revision.publish",
      "id": "human-concept-v1",
      "assetId": "human",
      "stage": "sketch",
      "summary": "Initial appearance and design",
      "files": [{ "kind": "image", "path": "/absolute/human-concept.png" }],
      "toolVersions": {},
      "fixture": false
    },
    {
      "type": "decision.add",
      "id": "expression-01",
      "scope": "human",
      "text": "Keep expressions understated; avoid exaggerated eyes."
    },
    {
      "type": "task.set",
      "text": "Review the human silhouette before refining clothing."
    }
  ]
}
```

All operations publish atomically. IDs are stable letters/numbers/underscores/hyphens up to 96 characters. Unknown fields fail. Revisions are immutable: publish a new ID with `parentId` to revise an existing asset. `stage` is sketch, study or model. Sketches require an image; 3D revisions require a GLB and editable Blender source. Agent updates never set acceptance pointers.

Other operations: `feedback.resolve` with feedback `id`; `decision.add` may include `supersedes`; `asset.create` may include `base: {assetId, revisionId}` to derive a variation from an exact revision. There is no silent propagation from base to variation. Clips are read from the GLB; separate composed animation scenes are not implemented yet.

Use `schema batch` for the exact contract. Repeating identical input with the same requestId returns the successful result within the last 100 receipts. Different input with that ID fails. Stale versions fail; reread current state and prepare a new request ID, preserving owner feedback and decisions.

## File validation and source responsibility

The service owns immutable SHA-256-addressed copies. Files must be absolute local paths, 1 byte–100 MB, up to 30 files per publication. Images/textures are decoded static PNG/JPEG/WebP/AVIF up to 40 million pixels. GLBs must pass original-byte Khronos validation (including material/texture references), contain geometry, parse successfully, and embed buffers/textures; clip names must be unique. No Draco or external-resource loader is configured. Recipes are text. Blender signatures are checked, but a signature is not proof that a source reopens or recreates the export.

Reopen sources in Blender and verify intended edits before publishing valuable work. The current `decoded` technical status deliberately does not claim verified source/export equivalence. Include the recipe and tool versions, and record material/rig limitations in the summary or decisions. Do not label generated concept images as geometry. Rig compatibility and visual quality still require review.

Owner review controls save feedback against exact revisions and separately accept a revision. Pins include logical object ID, mesh-local point, camera/target and animation clip/time. Pins are not transferred across topology changes. A saved pin can restore its camera/time and show a marker; snapshot images and pin remapping remain future work. New publications appear in the revision trail without replacing the revision being reviewed or its draft.

## Backups, recovery and portable copies

```sh
npm --silent run cli -- backups PROJECT_ID
npm --silent run cli -- restore PROJECT_ID /absolute/restore.json
npm --silent run cli -- export PROJECT_ID /absolute/new-bundle.json
npm --silent run cli -- import /absolute/bundle.json
```

Restore input: `{"backupId":"RETURNED_FILENAME.json","expectedVersion":3}`. Restoration advances version and clears replay receipts. A missing/corrupt primary requires explicit `{"backupId":"RETURNED_FILENAME.json","recoverCorrupt":true}`; existing damaged bytes are preserved in recovery/. Healthy projects cannot bypass version checks through corrupt recovery. Inspect owner intent before intentional rollback. Restore rejects while a render or handoff is active for that project; finish or cancel the job, then reread the version before retrying. Ordinary project writes and restores in other projects remain available. Restore/import mark saved running renders without a local process as interrupted immediately; retry with a new render request ID.

Every mutation snapshots previous metadata. Blobs are retained, including those needed by backups; no garbage collection or backup pruning yet. A portable bundle embeds metadata and owned file bytes, verifies hashes and decodes resources again on import. Imports require a new project ID/destination and cannot overwrite an existing project. Bundles are unencrypted personal files. The current service body limit is 180 MB; this JSON/base64 transfer is suitable for the small first workflow, not a large archive format. External backup and Git LFS policy remain open before production asset accumulation.

## Scene Loom and game boundary

Do not modify Scene Loom or fish.exe automatically. Reference rendering and explicit selected handoffs are available below; game import remains a later phase. Never change Scene Loom live JSON or automatically replace its scene images.

## Pinned reference renders and Scene Loom handoff

Implements [the approved bounded scope](implementation-plan.md#reference-render-handoff--approved-implementation-scope-2026-11-05). The real fish-exe/startup-journey transfer is **not authorized** by implementation approval. Do not access its personal library during tests.

The service operator configures `MESH_FOUNDRY_BLENDER` (default `/opt/homebrew/bin/blender`), absolute `SCENE_LOOM_CLI_DIR` (the existing checkout with installed dependencies), and absolute `SCENE_LOOM_DATA_DIR`. Start Foundry from its checkout with those variables; the browser cannot supply executable or library paths. Both services must run with their respective explicit data roots. Unconfigured/unavailable connections fail clearly. No automatic installation or startup of Scene Loom occurs. No Scene Loom source/schema change is required.

```sh
npm --silent run cli -- schema render
npm --silent run cli -- render PROJECT_ID /absolute/render.json
npm --silent run cli -- renders PROJECT_ID
npm --silent run cli -- cancel-render PROJECT_ID RENDER_ID
npm --silent run cli -- schema handoff
npm --silent run cli -- handoff PROJECT_ID /absolute/handoff.json
npm --silent run cli -- handoffs PROJECT_ID
npm --silent run cli -- send PROJECT_ID HANDOFF_ID
npm --silent run cli -- cancel-handoff PROJECT_ID HANDOFF_ID
```

Render input: `{"requestId":"human-r1-ref-001","revisionId":"human-v1"}`. Request ID is the immutable render-set ID. Identical retries return its recorded status/output; reused IDs with different input fail. Deliberate rerenders or failed/interrupted retries use a new ID. Project reads include `renderSets` and `handoffs`, defaulting to empty for older projects. CLI returns success/data for a registered job even if its `status` is failed/cancelled: inspect status/error, not just process exit status.

Rendering pins verified owned GLB bytes plus hashes of every revision source. The trusted packaged Blender script strips animation channels from an intermediate GLB **before import**, retaining declared node transforms/morph weights; armatures use REST. Hidden importer bone-display helpers do not enter framing bounds. Imported lights/cameras are discarded. No asset recipes execute. The versioned neutral preset produces front, right-side and front-right three-quarter images at a shared orthographic scale/centre with fixed CPU Cycles settings. Record includes resolved cameras, bounds, orientation, lighting, colour management, Blender/Node/sharp versions and preset hash. Transparent intermediates are flattened onto exact opaque sRGB #777777; final 1024×1024 PNGs have a visible provenance footer plus full UTF-8 PNG iTXt/EXIF metadata, then are hashed and installed as owned blobs. Study, fixture and unaccepted candidates visibly say UNACCEPTED STUDY REFERENCE. An accepted non-fixture model records acceptance **at render time**, without accepting image quality. Later acceptance/revisions never rewrite old bytes.

Jobs register durably, run serially on a separate job queue and publish a complete three-view manifest atomically. Review writes remain available during rendering. Blender has two CPU threads, a 15-minute timeout and bounded captured output; images are decoded/dimension-checked before publication. Cancel requests stop the active renderer; already-completed sets remain immutable. Restart marks unfinished running jobs interrupted; use a new render ID. Jobs use service-owned temporary directories, cleaned on normal completion/failure/cancellation. Interrupted process leftovers from new jobs live under DATA_ROOT/jobs/projects/PROJECT_ID, so clear-assets can remove only the selected project’s work. Older unscoped render-/handoff- folders have no reliable ownership; clear-assets preserves them and returns their names in unattributedJobDirectories for manual attribution. Identical source hashes do not prove job ownership. This is fixed-purpose rendering, not arbitrary shell/Python execution.

Handoff input:

```json
{
  "requestId": "human-r1-transfer-001",
  "renderSetId": "human-r1-ref-001",
  "views": ["front", "three-quarter"],
  "projectId": "explicit-existing-project",
  "sceneId": "explicit-existing-scene"
}
```

`handoff` prepares a durable preview, verifies selected hashes and requires an existing target scene; it imports/publishes nothing. Inspect its source selection, target library/project/scene and existing-support count before explicitly running `send`. The studio shows handoffs only for the selected render set, with its exact set/revision identity and acceptance-at-render label. A different selection requires a new handoff ID. Leaving a prepared handoff unsent has no destination effect. Cancel handoff in the preview (or cancel-handoff in the CLI) closes it without importing/publishing; sending it then requires a new handoff ID. Cancellation never reverses a completed downstream publication.

`send` imports exact owned PNG copies via the existing Scene Loom CLI, persisting each returned ID. It reads fresh destination contentRevision, appends only missing selected IDs to the current ordered supporting-image list, persists its exact batch/request ID, dry-runs, applies identical input and verifies the selected IDs. The sole patch field is supportingAssetIds: notes, title/description, main image, connections and positions are omitted. No eviction when the 30-supporting-image limit is exceeded. Imports can remain unattached after failure; they are never automatically deleted.

Resume the same handoff after failures/ambiguous responses. It rereads the current scene and reconciles existing imported IDs; lost import responses retry identical bytes. Conflicts allocate a fresh attempt and recompute from current content, with at most three attempts per send. The journal retains attempts, digests, dry-run/results and completion revision. It never blindly replays a stale supporting list, including outside the destination's 100-receipt window. Completed handoffs are historical: retries do not reattach images later removed by the owner. Imported journals cannot execute a path different from the current operator-configured connection; prepare a new handoff for a different connection. Portable export/import/backups include and verify render blobs and provenance. As with existing portable projects, import into a separate library, not over an existing project.

Use `SCENE_LOOM_TEST_CHECKOUT=/absolute/scene-loom npm run test:references` for opt-in real Blender/CLI/browser integration. It creates unique absolute temporary libraries and synthetic IDs, starts only its own Scene Loom service, and removes those libraries/processes in cleanup. Generate proof fixtures and build first; installed Chrome and Blender are required. Diagnostic captures/manifests remain in ignored artifacts. Never substitute personal defaults or the intended real consumer for these fixtures.

## Stage labels and clearing a project's assets

Stored stage values remain `sketch`, `study`, and `model`. The studio displays
**2D Concepts** (appearance and design), **3D Prototypes** (real, rotatable meshes
for form and proportions), and **Developed Models** (more developed assets,
without a production-readiness guarantee). Owner acceptance is independent.

`npm --silent run cli -- clear-assets PROJECT INPUT.json` is a destructive,
authenticated service operation. Input is
`{"expectedVersion":6,"confirmProjectId":"PROJECT"}` with the current version
and exact project ID. It preserves project configuration, categories and
project-wide decisions, while removing all assets, revisions, review records,
render sets, handoff journals, replay receipts and asset decisions. It removes
that project's backups/recovery copies to prevent deleted assets reappearing.
References to removed asset decisions in retained decisions are detached.
Shared blobs remain while any other project metadata copy references them. Project-owned interrupted job folders are removed; older unscoped folders are preserved and reported because ownership cannot safely be inferred.
No downstream Scene Loom data is changed. All reference jobs must finish or be
cancelled before clearing. A durable cleanup manifest allows retry after a
cleanup failure; reread the project version before retrying.

## Creator-controlled stage progression

The workflow is 2D Concept (`sketch`) → creator approval → 3D Prototype
(`study`) → creator approval → Developed Model (`model`). Each asset progresses
independently. In the studio, **Accept this revision** is the creator's explicit
approval of that exact revision for its stage. Approval is a design decision,
never a production-readiness claim. Technical validation and publication do not
approve anything.

No schema migration is required: `accepted` remains the most recently accepted
revision per asset, and `acceptance` retains explicit owner actions. To determine
approval for a stage, use that asset's current accepted pointer if it belongs to
the stage; otherwise use its latest acceptance event for that stage. A new
approval in the same stage supersedes the previous one. Approval in another
stage does not erase it. Legacy accepted pointers without history remain valid. After a pointer moves, a saved previousRevisionId also preserves the prior stage approval when that stage has no explicit acceptance event; it never overrides a newer explicit same-stage approval.

New root publications start at `sketch`. Every new 3D publication needs `parentId`.
A same-stage parent permits improvement without approval. A cross-stage parent
must be the exact currently approved revision of the immediately preceding stage,
on the same asset. Stage skipping and unlinked 3D publications are rejected by
the service. Existing projects, backups and portable imports retain their stored
stages and revisions; existing 3D-only work can be refined by linking to its
existing same-stage source.

**All work** shows the selected revision's stage and status. Open it in its
stage tab without changing revisions, or choose a specific entry in the
revision trail. The prominent action follows the selected revision: revise a
concept, review or correct a 3D prototype or developed model, or advance an
exact accepted concept or prototype. The remaining actions are under **More
actions**. **Project actions → Copy new concept prompt** starts a separate
asset. Copying prepares text only. Paste into Codex and send; direction is optional.

Model and prototype review prompts ask the agent to inspect the exact exported
GLB, save numbered annotated evidence, and record verified defects in an
ordinary version-checked CLI batch:

```json
{
  "type": "finding.add",
  "id": "headphones-v2-fit-01",
  "revisionId": "headphones-v2",
  "text": "SS1: The left pad clips through the headband. Restore clearance and verify in the side view. Evidence: /absolute/SS1.png."
}
```

Use a unique finding ID. Findings appear alongside owner feedback, with their
origin labeled, without modifying the model or its acceptance. Copying a
correction includes only open records on that exact revision. Reread them
before editing, and use `feedback.resolve` only after verifying the fix. Use
`decision.add` for lasting owner-confirmed project or asset choices. Keep
revision defects in findings and scene-specific measurements in the scene's
fit requirements.

A compatible agent harness must read current state, decisions and feedback before
work, verify approval of the pinned source again before publication, and publish
a new revision with a new ID, the source `parentId`, a fresh request ID and the
current expectedVersion. Download the exact file manifest from the local
service's `/api/projects/PROJECT/revisions/REVISION/files/FILE` route, verifying
hashes. Concepts supply reference images; prototype development must refine its
editable Blender geometry/source rather than reconstruct screenshots. Preserve
the approved design, explain changes, and ask about consequential unresolved
details. Establish asset-specific production requirements before claiming
readiness; rigging and animation are conditional on intended use.

Scene Loom's separate storyboard asset-list confirmation and concept-only batch
workflow is outside these buttons. Subsequent stages happen individually here;
Mesh Foundry does not initiate that Scene Loom workflow.

## Incoming Scene Loom storyboard handoff

The service uses the same operator-configured `SCENE_LOOM_CLI_DIR` and
`SCENE_LOOM_DATA_DIR` as reference transfers. Run the following read-only command
with the stable owning project ID and exact storyboard target ID from Scene Loom.
For Baseline, supply the project ID twice.

```sh
npm --silent run cli -- scene-loom SOURCE_PROJECT_ID STORYBOARD_ID
```

The command reads the exact target through Scene Loom's existing
`project read STORYBOARD_ID` CLI. It checks the returned target ID and owning
project (`storyboard.projectId` for named storyboards, otherwise `id`).
Only an explicit `meshFoundryEnabled: true` enables the handoff. Missing
settings, unreadable targets and unavailable connections fail closed. The
response contains `contentRevision`, `sceneIds`, `libraryId` and `library`.
A null library means no linked library exists yet. Existing libraries expose
their assets, exact revisions, and `sceneLoomPins` through this command and
ordinary `read`. Legacy projects retain their original storage and identity.

After creator approval, use ordinary `create` if needed. Supply the returned
`libraryId` as `id`, the stable owning project ID as `sceneLoomProjectId`,
and a display `name` of up to 160 characters. The service derives and validates
the library ID from the owning project ID, so all its storyboard targets use
one library. If another run creates it first, reread it before applying.
An occupied or unreadable destination requires operator attention.

Use ordinary `apply LIBRARY_ID INPUT.json` with the current library
`expectedVersion`. The following batch pins an existing revision. To publish a
new 2D concept, include the usual `revision.publish` operation with
`stage: "sketch"` and matching asset and revision IDs in the same batch. Include
category and asset creation as needed. The concept and pin become visible
together. Creator acceptance remains a separate studio action.

```json
{
  "requestId": "pin-shared-prop-1",
  "expectedVersion": 4,
  "sceneLoom": {
    "projectId": "source-project",
    "storyboardId": "alternate-storyboard",
    "sceneId": "scene-a",
    "contentRevision": 12
  },
  "operations": [
    {
      "type": "scene-loom.pin",
      "suggestionId": "shared-prop",
      "sceneIds": ["scene-a", "scene-b"],
      "assetId": "prop",
      "revisionId": "prop-concept-1"
    }
  ]
}
```

The service rechecks the toggle, exact target, reviewed content revision and
existence of all linked scenes before saving. The live check and local commit
are separate service operations. A successful receipt replay performs no new
publication. Pins are keyed by storyboard ID and suggestion ID, carry the
selected scene and source content revision, and leave other storyboard pins
intact. On a repeated run, match the existing pin by those IDs and report the
pinned revision without republishing unless the creator approves a change.
Multiple scenes can find the same pin via its `sceneIds`.

### Scene Loom follow-up contract

The existing Scene Loom CLI already supplies the live toggle and target
identity. Scene Loom needs to update both copied prompts and expose persistent
storyboard-local suggestions and their results through its agent interface.
A compatible contract is as follows.

- Both prompts carry `projectId` and `storyboardId`; generation also carries
  `sceneId`. At execution start, run `project read STORYBOARD_ID`, verify
  identity and require the live toggle to be true. An older copied prompt must
  be refreshed to use the scoped publication batch described above.
- Suggestion reads the written Project Vision and full target storyboard.
  Inspect the approved visualization through that storyboard's asset manifest
  when its vision references one. Proceed with written context when it is
  absent. Use Foundry's read-only lookup for reusable assets. Save drafts in
  Scene Loom against the reviewed `contentRevision`, with stable suggestion
  IDs, descriptions, explanations and one or more existing `sceneIds`.
  Expose the saved records on `project read STORYBOARD_ID`. A shared suggestion
  is a single record with multiple scene IDs.
- Generation reads the selected scene and only suggestions whose `sceneIds`
  include it. Show the creator the exact library, suggestions and proposed
  reuse revision IDs or new concepts before writing. After approval, reread
  Scene Loom, verify the toggle again and require renewed approval for
  material source changes. Use the scoped batch for the final Foundry write.
  Mesh Foundry currently verifies scene membership in the storyboard. The
  receiving agent must take the suggestion ID and full link list from Scene
  Loom's current suggestion record.
- Provide a version-checked Scene Loom mutation to set a result on that
  exact storyboard and suggestion ID with `libraryId`, `assetId` and
  `revisionId`. It should require the live toggle, verify the suggestion still
  exists and treat the same tuple as a repeat. After a successful Foundry
  write, use the stored pin to reconcile a failed or ambiguous Scene Loom
  result write without republishing. No Foundry command writes Scene Loom's
  suggestion records.

The inbound toggle check applies to scoped concept generation and lookup.
The selected reference-render transfer documented above is a separate workflow.

## Experimental Curls glasses fitting

Run the local command from the repository with Blender 5.2.3. It accepts the
hash-verified Curls study Blender source and its approved turnaround image.
Use the CLI project read to resolve the exact revision pair and approval
before downloading them. The output directory must be new.

```sh
blender -b --disable-autoexec --python-exit-code 1 --python scripts/fit-glasses.py -- \
  /absolute/kairo-curls.blend /absolute/kairo-researcher-curls-turnaround.png \
  /absolute/fit-output --source-sha256 SOURCE_HASH --concept-sha256 CONCEPT_HASH \
  --setback 0.025
```

The tool moves the two rims, bridge, and arms together toward the face. The
agent chooses the setback after reviewing the profile. The image hash pins
the reference for that judgment. The tool saves a Blender file, GLB and
`fit.json` containing the applied parameters. Inspect front and side renders
at matched scale and check ear, nose and eye intersections before using the
output as a candidate.

For a reproducible comparison, render the original and fitted GLBs into
separate new directories. The second invocation reuses the first framing
and lighting. The comparison preset renders front, right side and back.

```sh
mkdir /absolute/before /absolute/after
blender -b -t 4 --python-exit-code 1 --python scripts/render-reference.py -- \
  /absolute/original.glb /absolute/before comparison
blender -b -t 4 --python-exit-code 1 --python scripts/render-reference.py -- \
  /absolute/fit-output/kairo-curls.glb /absolute/after /absolute/before/resolved.json
```

For Curls, add `--nose-relief 0.05` to the setback command to move the
inner rims and bridge forward together. The adjustment feathers out toward
the outer rims and preserves the front-view vertex positions. Record and
verify nose clearance and bridge contact on the saved geometry.

To run the fit and both comparison renders together, prepare a local JSON
manifest from a fresh CLI read. Verify that the concept is the approved sketch
for the same asset and that the prototype names it as its parent. The command
checks file bytes against the supplied manifest. Revision identity and
approval come from the CLI read.

```json
{
  "project": "project-id",
  "conceptRevision": "concept-id",
  "prototypeRevision": "prototype-id",
  "files": {
    "image": { "path": "/absolute/concept.png", "hash": "concept-sha256" },
    "blend": { "path": "/absolute/source.blend", "hash": "blend-sha256" },
    "model": { "path": "/absolute/source.glb", "hash": "glb-sha256" }
  }
}
```

```sh
MESH_FOUNDRY_BLENDER=/opt/homebrew/bin/blender python3 scripts/fit-curls-study.py \
  /absolute/pins.json /absolute/new-output --setback 0.025 --nose-relief 0.05
```

Inspect the images in `before/` and `after/`, the editable outputs in `fit/`,
and the root `report.json`. Contact counts describe overlapping surface
face pairs for each rim against the nose and bridge. Check eye and temple fit
in the renders.

## Experimental chair-fit check

Run Blender locally with a new output directory. The checker uses a static
seated GLB, the exact chair asset GLB, and an optional rectangular footrest.
Use current CLI revision records for the chair hash and seated-source
provenance. Pin the baked pose GLB separately by its own hash.

```sh
blender -b -t 4 --disable-autoexec --python-exit-code 1 \
  --python scripts/check-chair-fit.py -- /absolute/fit.json /absolute/fit-output
```

```json
{
  "pose": {
    "path": "/absolute/seated.glb",
    "sha256": "pose-sha256",
    "sourceRevision": "curls-source-study",
    "trousers": "Continuous trousers and hips",
    "soles": ["Shoe sole", "Shoe sole.001"],
    "offset": [0, -0.12, 0.28134564]
  },
  "chair": {
    "path": "/absolute/desk-kit.glb",
    "sha256": "chair-sha256",
    "revision": "desk-kit-study",
    "root": "Upholstered swivel chair",
    "seat": "Seat cushion",
    "offset": [0, 0.1775, 0],
    "yawDegrees": 180
  },
  "footrest": {
    "topCentre": [0, -0.407, 0.28134557],
    "size": [0.68, 0.57]
  }
}
```

Offsets use Blender world units after GLB import. Without a footrest, the
support plane is Z=0. The completed report records input pins and placement,
surface crossings and their intersecting-face bounds, minimum sampled
vertical seat gap, and each sole's proximity to and coverage on the support.
These checks measure geometry at one pose. Inspect the side and three-quarter
images for the rest of the chair and for visual balance.

## Asset spec

Scene Rehearsal no longer imports Foundry assets or fits them. It only locks
placement placeholders and produces a per-asset spec, which Foundry builds to.
Record that spec on an existing asset with an ordinary version checked batch.
Names and units follow Rehearsal's `scene-rehearsal-asset-spec` pieces (metres,
Y up, Euler XYZ radians):

```json
{
  "type": "asset.spec",
  "assetId": "desk",
  "spec": {
    "version": 1,
    "dimensions": [1.4, 0.75, 0.7],
    "pivot": { "anchor": "base-center", "position": [0, 0, -2] },
    "interactive": true,
    "animationClips": ["drawer-open"],
    "clearance": [
      {
        "id": "main/walk/1",
        "label": "Keep clear: walk route",
        "kind": "route",
        "center": [0, 0.9, 1.5],
        "size": [6, 1.8, 1],
        "rotationEuler": [0, 1.570796, 0],
        "cue": { "scenario": "main", "event": "walk" },
        "intersectsPlaceholder": false
      }
    ],
    "placementNotes": ["Against the north wall"],
    "scaleReference": { "asset": "human", "label": "Baseline", "height": 1.75 },
    "source": {
      "draftId": "<64 hex>",
      "storyboardId": "yard",
      "sceneId": "gate",
      "contentDigest": "<64 hex>"
    }
  }
}
```

`spec` is null to clear it. `version` must be 1. `dimensions` is
`[width, height, depth]` in metres; `pivot.anchor` is `base-center` or `center`
and `pivot.position` is where the asset origin goes. `clearance[].kind` is
`authored` or `route`; `center`/`size`/`rotationEuler` are world space and
`cue` is present for routes. `scaleReference` may be null; when set,
`scaleReference.asset` must be an asset in the same project (checked when the
spec is set; a spec supplied inside `asset.create` is validated for shape
only). `source` is optional; store it so a later Rehearsal export's
`contentDigest` can be compared to see whether the asset was built to a stale
spec. Specs are optional and replacing one overwrites the previous value;
earlier values remain in project backups.

**From a whole Rehearsal export.** Instead of `spec`, pass
`fromRehearsalExport: { "export": <the full spec JSON>, "pieceId": "gate" }`
(exactly one of `spec` or `fromRehearsalExport`). `apply` rejects the batch if
`format` is not `scene-rehearsal-asset-spec`, `version` is not 1, `pieceId` is
not in `pieces`, or the mapped result is invalid. Mapping: piece `dimensions`,
`pivot`, `interactive`, `animationClips`, `clearance` and `placementNotes`
copy as is; export `scaleReference` copies as is (null stays null); `source`
keeps only `draftId`, `storyboardId`, `sceneId`, `contentDigest`. The piece's
`id`, `name`, `kind`, `includes`, `position`, `rotationEuler` and `cues`, and
the export's `units`, `warnings`, `draftRev`, approval fields and `specDigest`
are not stored. The stored spec is the mapped result, not the export.

When a spec exists, **Copy 3D prototype prompt** and the 3D prototype/developed
model reviewer prompt include it. The builder models to its dimensions,
clearances, pivot, notes, interaction and clips. The reviewer must verify real-world
scale against the named scale-reference asset and report mismatches as
findings. Without a spec the prompts tell the agent to ask the owner for
dimensions and a scale reference rather than invent them.

## Scene Loom sync handoff

**Project actions → Copy Scene Loom sync handoff** copies an inventory of
owner-approved 3D prototypes and developed models, with exact revision IDs,
GLB hashes and saved storyboard pins. Open the intended scene in Scene Loom
and paste the handoff into the Codex chat working with **Sync accepted assets**.
Use the live Loom scene mapping to verify selections and reread Foundry before
pinning sources. Preserve valid scene pins at their approved stage and report
replacements or ambiguous stage choices for resolution. If the sync action
is unavailable, use the Loom CLI project and scene reads and return the
verified manifest and gaps in chat without editing either app. Concept, development,
review and correction prompts stay in Foundry's independent asset workflow.

The retired `rehearsal.link` operation and `rehearsal` asset field no longer exist. A stored `rehearsal` field on an asset is dropped when the project is read and is gone after the next save. A storyboard asset suggestion pin is a different workflow.
