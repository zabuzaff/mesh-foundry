# Implementation plan — draft for approval

## Authorization and evidence

Prepared 2026-11-05. Owner subsequently authorized local implementation. Architecture and phases below are the implementation baseline. Commit, push and deployment remain unauthorized. Phase 1 explicitly requires owner assessment before expansion.

Inspected locally: Mesh Foundry is an empty repository on main with no commits or remote. fish.exe lives at /Users/zaffran/Herd/git-fish and uses Three.js/React Three Fiber in a Next.js web client with a Tauri desktop shell. Scene Loom lives at /Users/zaffran/vibed/scene-loom and provides a local agent interface and image ingestion. Their existing guidance applies when working in those repositories; historical fish.exe art acceptance does not accept new assets here.

## Proposed boundaries and architecture

- Local browser studio: React + TypeScript + Vite, Three.js for model review (direct renderer in the implemented first increment), Motion for restrained interface transitions. No React Flow dependency unless a demonstrated workspace need arises.
- Small Node/TypeScript local service with validated schemas and a CLI sharing the same operations. The service alone writes studio records; agents do not edit live data files directly.
- Blender's Python interface handles mesh/material/rig/clip authoring, saves .blend source and produces portable exports and reference renders. Prefer reproducible scripts over mouse-driven automation. Preserve an existing source when scripts cannot reproduce manual/imported edits.
- Codex remains outside the studio: it reads the brief, edits authoring scripts, invokes Blender and publishes through the CLI. No embedded model API, credentials or paid generation integration.
- Register completed outputs atomically. A failed job leaves the last good revision visible. The app does not execute arbitrary uploaded Python; explicit agent-invoked authoring jobs operate in their own work directory.

These choices reuse familiar local patterns, but dependency versions and Blender availability must be inspected and pinned during the authorized foundation phase. No current API compatibility claim is implied.

## Sources, exports and compatibility

Propose .blend as canonical editable source, with versioned Python scripts/configuration and any textures/imported originals. Store Blender version and recipe provenance. An export is derived, never the only editable source.

Propose glTF 2.0 binary (.glb) for studio playback and the initial fish.exe import. Use named objects, stable logical part identifiers, explicit units (metres), documented forward/up conventions, transforms and ground origin. Verify actual orientation and scale through export/import; do not assume Blender and the consumer agree.

Start with exportable metallic/roughness materials, simple colour palettes and supported texture maps. Blender procedural nodes, custom shaders and render-only effects require baking or an explicitly documented fallback. Use a shared review lighting/camera preset and a runtime-like view; Blender renders are not proof of identical game appearance.

Human base includes a documented skeleton, skinning, named clips, frame rate, duration and loop intent. Start with an in-place walk and stationary fishing idle; fishing-prop attachment and hand contact need review. Rig reuse for the variation must be proven. No automatic cross-rig retargeting. Set measured geometry/texture budgets after the first proof rather than inventing a universal mobile budget.

## Storage and accepted versions

Proposed default: ~/Library/Application Support/Mesh Foundry, overridable by an absolute data-directory setting. Per-project validated JSON metadata plus owned binary files and recovery snapshots; no database engine initially. Use immutable revision directories and content hashes. JSON records stable IDs, parent revisions, source/export links, dependencies, decisions and acceptance history. Use atomic writes, serialized mutations, expected-revision checks and repeat-safe request IDs.

Each stage can have multiple candidates. A variation has its own asset ID and pins the exact base revision; changes never silently cascade. Accepted pointers move only through explicit owner action, preserving earlier acceptance history. Editing accepted work creates a new candidate. Animation compositions pin asset/rig/clip revisions; incompatible changes show a warning instead of silently substituting content.

Studio source belongs in Git/GitHub. Personal binaries remain outside this source repository. A portable project bundle includes metadata, sources, textures, clips and renders with a manifest. Before substantial asset accumulation, decide a separate asset repository with Git LFS versus local versioned storage plus backups. In-app revisions do not replace a backup; automated off-device backup is outside v1.

## Review and annotations

Synchronize comparison camera, light and clip time. Store a model pin against the exact revision, stable object ID, mesh-local position and captured camera; for animated work also record clip/time and a reference image. Pins remain on the original revision after topology changes. Carrying a pin forward requires explicit remapping; do not pretend an old coordinate identifies the same surface. General notes work without a pin. Resolve feedback without deleting its history.

## Scene Loom handoff

Generate front/side/back/three-quarter reference images and selected pose frames with a versioned camera/light/background preset. Record source revision, variation, pose/clip time, Blender/exporter versions and hashes. The owner selects what is sent. Through Scene Loom's documented interface, import owned image copies and attach provenance in supported fields/notes. Never edit its live JSON directly or silently replace storyboards when an asset changes. A later handoff explicitly selects the newer revision. Check the current Scene Loom contract before implementation; no schema extension is assumed.

## Phases and gates

1. **Authoring feasibility proof:** inspect Blender availability; create one editable rough human, rig, neutral pose, walk and fishing idle; export GLB and inspect playback/materials in a minimal diagnostic harness. This harness is verification tooling, not a second product. Verify .blend reopen, clip export, texture ownership and one targeted source edit. Owner judges whether the loop is useful before expanding it. A rough technical fixture is not an accepted character design.
2. **Durable foundation and agent interface:** implement project/category/asset records, immutable revisions, ingestion, jobs/provenance, backup/recovery and CLI. Verify invalid batches, interrupted imports, retries, conflicting edits, corrupt-project isolation and restart recovery using temporary data.
3. **Studio review:** library and asset workspace, 2D stages, model orbit, animation playback/scrubbing, synchronized comparison, revision-specific annotations, decision history and copy prompts. Verify agent publication appears automatically and never erases owner feedback or camera state.
4. **First creative loop:** refine the base, derive one variation, review three motion states, explicitly accept selected revisions, publish consistent renders to Scene Loom and test a fresh-chat handoff. Use the same data paths/interfaces as regular use.
5. **Consumer and portability proof:** reopen a portable bundle in a fresh temporary data directory. Under authorization for fish.exe, load the exported revision in a bounded local test and check scale, materials, skinning, clip timing and runtime behaviour. No production asset replacement implied.

Record verified commands as introduced. Each substantial implementation phase requires a focused read-only review agent, main-agent assessment/fixes and relevant reruns. Tests should protect persistence, integration and geometry/animation contracts, not mirror cosmetic implementation.

## Practical acceptance criteria

- From Codex, publish a complete revision; studio updates without manual file manipulation. A rejected or interrupted import cannot expose partial work.
- Compare two real revisions under matching conditions; pin feedback at a selected clip time; restart and recover the same review context and decisions.
- A fresh chat can discover the project, accepted revisions, rejected directions, unresolved feedback and next task using the copied prompt and documented CLI.
- Editable sources reopen; exports load independently with owned textures, skeleton and all named clips. The variation preserves a compatible rig or explicitly declares incompatibility.
- Reference images are reproducible within the recorded tool/environment constraints and Scene Loom owns imported copies with provenance.
- Portable export restores sources and references without links to the original machine's work directories.
- Owner separately accepts silhouette, expression, proportions, palette, deformation, walk and fishing idle. Technical checks never move acceptance pointers.

## Remaining decisions before or during the proof

Local implementation is authorized. Blender 5.2.3 LTS is installed and the initial rig/export proof is technically verified; see progress.md for scope and limitations. Repository location: /Users/zaffran/vibed/mesh-foundry, relocated at the owner’s explicit request. Binary backup/version-control choice must be settled before accumulating valuable production work. Final UI design, character design and performance budgets await actual rendered evidence.

## Reference-render handoff — approved implementation scope (2026-11-05)

### Current evidence and authorization

Both checkouts inspected on main tracking origin/main with clean working trees. Foundry's implemented baseline is committed at 5f71ce4; the historical empty-checkout description above is bootstrap evidence, not current state. Read both AGENTS.md files, both docs/agent-interface.md contracts, Foundry progress, and Scene Loom's actual shared schema/store semantics. Owner explicitly approved this bounded proposal and requested implementation in a new chat on 2026-11-05. Local implementation and isolated verification are authorized. Earlier publication authorization does not apply: no implementation, fish.exe changes, commits, pushes or deployment now.

First intended real destination: Scene Loom project fish-exe / scene startup-journey. Do not read or mutate its personal library during tests, preselect it for automatic execution, or send references there until the owner explicitly requests that real handoff. Plan approval authorizes implementation and isolated verification, not this real transfer.

### Outcome and exclusions

Select one exact 3D asset revision → generate front/side/three-quarter reference images from its real geometry/materials → review/select images → explicitly choose an existing Scene Loom scene → preview an additive handoff → publish through its CLI and record the result. No new storyboard scenes, main-image replacement, acceptance changes, automatic propagation, multi-asset composition, scene editor, animation authoring or Scene Loom source/schema changes. Optional pose/clip-time rendering is deferred; v1 uses the model's recorded neutral/rest state and fails clearly if it cannot establish that state.

### Material decisions proposed for approval

- **Rendered source:** verified owned GLB bytes from the selected revision, matching the studio's portable model representation. Import these into a fresh Blender process rather than opening potentially divergent .blend scenes. Record hashes of the GLB and every source file in that revision, including .blend/recipes/textures. This identifies provenance; it does not assert that the .blend reproduces the GLB. No arbitrary asset scripts or embedded scene lights/cameras run. Do not silently substitute another revision or file when missing.
- **Preset:** versioned reference-neutral-v1, 1024×1024 PNG, opaque neutral grey, orthographic front/right-side/front-right three-quarter views. GLB Y-up/+Z-forward contract; explicitly declare and record any asset orientation override. Same model bounds, centre, framing margin and orthographic scale for all three views; no per-view auto-crop. Blender factory startup with auto-execution disabled; packaged trusted script imports the pinned GLB, normalizes orientation, creates cameras and a fixed three-area-light rig, and renders with CPU Cycles, fixed seed/samples, no denoising and recorded colour management. Numeric baseline: 32 samples, seed 0, denoising off, Standard view transform, exposure 0, gamma 1; opaque background sRGB #777777. Let D be the longest rest-state bounds dimension and C the bounds centre. Cameras look at C from C + 4D times the unit front (+Z), right (+X), or front-right (+X+Z) direction, with +Y up and no perspective. Use one common orthographic scale containing the union of all three projected bounds plus 12% margin on each edge; record the resulting value. Key/fill/rim area-light offsets from C are D×(2,3,3), D×(-3,2,1), D×(1,3,-3), sizes 1.5D/2D/D and energies 1000/400/700 W × (D/2m)²; world strength 0.2. Inspect the proof against these explicit defaults; any visual correction produces a new preset version rather than silently changing recorded settings. Persist resolved transforms, bounds, scale, light positions/energy/size, renderer/tool version, samples, seed, pose basis, output settings and preset hash in each manifest. Reproducibility is within a recorded environment; no cross-version bit-identical promise.
- **Acceptance and provenance:** no automatic acceptance. Classify study-stage, fixture or not-currently-accepted revisions as “UNACCEPTED STUDY REFERENCE” in UI and an unobtrusive image footer; model-stage candidates remain unaccepted too. Footer includes project/asset/revision/view and short source identity. A genuinely accepted model can say “Accepted asset revision at render time”; render quality remains separately unaccepted. Full provenance is stored in Foundry's immutable manifest and embedded as PNG text metadata before hashing/import. Scene Loom retains original .source bytes, so metadata survives there even if its WebP display copy strips it. Do not change notes to carry provenance by default. This is a reference image handoff, not a claim that Scene Loom understands a new asset type.
- **Explicit destination:** configurable local Scene Loom CLI checkout and absolute SCENE_LOOM_DATA_DIR, supplied by owner/agent, with connection validation. No package import from Scene Loom, shared database, embedded credential, browser-supplied arbitrary executable path or application dependency. If an optional append-only provenance note is wanted later, require a separate selected field and preview; not part of this default plan.

### Foundry implementation boundary

Extend the service's versioned project storage with optional/default-empty renderSets and handoffs so existing JSON, backups and portable bundles still load. Keep existing revisions immutable. A render set pins project/asset/revision/model-file ID and content hashes, preset version/resolved settings, acceptance snapshot, output PNG hashes and provenance. Rendering and PNG metadata are derived outputs, not asset revisions or acceptance events. Store images as owned content-addressed blobs and include them in portable export/import and backup integrity checks. Jobs use service-owned directories under the configured data root; no personal binaries in either repository.

A registered render job validates hashes, runs only the packaged renderer with bounded resource/timeout/output limits, validates decoded outputs and required dimensions/views, then publishes its complete manifest atomically. Failures/cancellation leave the last good render set intact. Persist job IDs/status for restart recovery and distinguish failed/interrupted/completed; do not claim process cancellation stops a committed downstream publication. Fixed renderer jobs are not a general Python/shell execution endpoint. Expose CLI operations for generating/listing/reading render sets and preparing/resuming handoffs; define exact schemas/commands during implementation and update the existing agent guide. Stable request IDs make a repeated generation request reuse its recorded outputs; deliberate rerender creates a new immutable set.

In the existing asset workspace, add a themed reference-render panel: exact revision/source identity, preset summary, three image previews, conspicuous acceptance labels, individual selection, and a destination/preflight summary. Expose failures and partial handoff state clearly. Owner can select any nonempty subset and cancel before publishing. UI controls follow the existing shared Select/Motion components. A fresh chat can discover render sets and handoff state through the CLI and copied prompts.

### Scene Loom handoff protocol

1. Prepare a durable handoff ID with explicit source render IDs, target library/project/scene IDs and selected action. Verify source blobs/hashes and render provenance. Read destination through CLI and require that the scene already exists. Show the additive image selection and provenance labels before Send; copying a prompt or generating images does not send anything.
2. Through Scene Loom's CLI, import each selected exact PNG. Persist returned asset IDs after each step; an ambiguous import retry uses identical bytes, letting Scene Loom deduplicate. Imported files may exist unattached after a later failure; report that state and resume, never delete shared destination files or pretend the two services share a transaction.
3. After imports, read the current Scene Loom project/scene and current contentRevision. Build an ordered union of its existing supportingAssetIds followed by missing selected imported IDs. Preserve the existing order and never drop another reference. Scene Loom permits 30 supporting images: exceeding that limit is a clear preflight failure, never eviction. Omit mainAssetId, notes, title, description and every connection/layout field from the patch entirely.
4. Persist the exact batch and requestId before invoking project apply --dry-run. It contains one scene.patch changing only supportingAssetIds, with expectedContentRevision from that fresh read. Dry-run must succeed before invoking project apply with identical input. No direct HTTP writes or live-file edits to Scene Loom. Spawn the known Node/CLI command with structured argv/JSON files, never interpolate scene text or paths into a shell.
5. On a conflict, reread current state, recompute the union, allocate a new attempt/request ID, persist it and dry-run again. Never replay a stale replacement list. Bound retries and ask for a retry when concurrent edits continue. Refuse a deleted/replaced target, unavailable service, invalid graph, image rejection or capacity failure without modifying unrelated fields.
6. On a timeout/crash/unknown response, preserve the persisted attempt and reconcile by rereading the target scene before retrying. If all selected IDs are already present, verify that and record completion without another patch. Within Scene Loom's last-100-receipt window an identical batch/request ID is safe to replay; outside it, reconstruct from current state with a new request ID rather than blindly replay. If only some IDs exist, union the missing ones with current references and validate a new attempt. A different selection is a different handoff. New render sets/revisions never auto-send.
7. After success, reread and confirm selected supporting IDs. Store destination identity, imported IDs, per-attempt batches/digests, request IDs, dry-run result, resulting content revision and completion verification in Foundry's service-owned journal. If Scene Loom commits but Foundry's final write fails, resume reconciliation rather than duplicate references. Later manual removal is a new owner action: an already-completed handoff stays historical and does not automatically reattach anything.

Existing notes are byte-preserved by omission; main image, prior supporting images, positions, connections, and scene identity are invariant. Concurrent layout changes are independent and must survive. Conflicts trigger recomputation, never overwrite. Full original PNG metadata and the Foundry manifest provide provenance without appending notes or adding a new Scene Loom schema.

### Isolated end-to-end verification and review

Use unique absolute temporary MESH_FOUNDRY_DATA_DIR and SCENE_LOOM_DATA_DIR, explicit CLI environment for every subprocess, dedicated free ports and isolated browser contexts. Never fall back to personal defaults if test variables are missing. Start/stop only test-owned processes; clean temporary libraries at the end. Seed Foundry through its CLI with a disposable unaccepted rigged fixture; seed Scene Loom through its CLI with an existing scene containing a valid main image, prior supporting image, nonempty notes, saved position and at least one connection. Synthetic destination IDs must differ from fish-exe/startup-journey. Tests may retain diagnostic captures only in ignored artifacts.

Verify real Blender output, not mocked image generation: three visibly different orientations of actual geometry, matching framing/light/background, correct material colours and unclipped bounds. Decode PNGs, inspect metadata/hash manifests and unaccepted footers, and visually inspect captures. Technical checks do not constitute owner visual acceptance. Prove rest-state handling and orientation; do not assume different view names imply different cameras.

Select only front and three-quarter, send via real Scene Loom CLI import/dry-run/apply, and verify only those two are added. Compare before/after mainAssetId, all existing supporting IDs/order, notes, title/description, positions and connections. Check exact .source PNG hash through the destination's service-owned file copies in the isolated fixture (read-only integrity inspection is allowed; no direct data edits). Exercise render failure/interruption, hash mismatch, missing Blender/CLI, invalid target, rejected image, 30-image limit, content conflict with concurrent support/note edits, concurrent card movement, repeated same handoff, lost import response, lost apply response and restart between apply and final Foundry receipt. A newer revision must not alter old render bytes, manifests or destination references. Load an old Foundry project and round-trip a portable bundle containing render provenance.

Run Foundry typecheck/build/format, relevant storage/job/CLI tests and browser regressions; run actual Scene Loom CLI end-to-end against its unchanged checkout. Use one focused read-only review subagent for implementation's cross-tool persistence/retry/security boundaries, assess findings and fix confirmed defects before handoff. Do not broaden into Scene Loom code changes: an interface blocker returns for a plan adjustment. No real transfer until explicitly requested, even after all isolated tests pass.

### Approval scope

Approve this bounded plan to implement rendering, review/select UI and the existing-CLI adapter with isolated verification. Proposed decisions above (GLB as render source, rest-state v1, fixed neutral preset, embedded provenance with untouched notes) are the material choices. Any change to canonical source, note mutation, acceptance semantics, Scene Loom schema or automatic propagation requires renewed direction. No real target-library access is needed to approve or test this work.

### Local implementation evidence (2026-11-05)

The bounded reference-render/handoff increment is implemented and verified locally. See docs/agent-interface.md for established commands/configuration and docs/progress.md for verification, independent review findings/fixes and remaining owner judgments. No real fish-exe/startup-journey transfer, Scene Loom source/schema changes, game edits, commits, pushes or deployment were performed.
