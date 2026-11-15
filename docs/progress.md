# Progress and continuation

## 2026-11-05 — planning checkpoint

Completed: inspected empty Mesh Foundry checkout, read relevant fish.exe and Scene Loom guidance/manifests, reviewed “Plan Scene Loom storyboard studio” chat, captured owner workflow and authored planning documents. Project-bootstrap applied proportionately. No application code or extra capabilities added.

Owner agreed: Codex-led authoring, Blender usage, project/category/asset hierarchy, 2D → 3D study → model progression, animation workspace, neutral/walk/fishing-idle first trial, comparison and model-point feedback, persistent decisions and copy prompts.

Proposed, awaiting plan approval: implementation stack, .blend/GLB pipeline, JSON/local binary storage, immutable revisions, staged implementation and verification gates. No dependency/API versions have been verified for Mesh Foundry.

Impeccable's context launcher failed with permission denied; written guidance and the Scene Loom discussion informed the planning brief. No rendered UI or automated visual detector was run. There is no final visual approval.

Next: owner reviews docs/implementation-plan.md. After explicit implementation authorization, begin the authoring feasibility phase; inspect Blender and tool availability before installing anything. Settle backup/version-control policy before accumulating valuable assets.

Current checkout: /Users/zaffran/vibed/mesh-foundry. Moved here at the owner’s request, including the existing .git directory and all planning documents. No remote configured at inspection. No commit, push, deployment, application implementation or edits to sibling repositories performed.

## 2026-11-05 — phase 1 authoring proof

Owner authorized local implementation. Installed Blender 5.2.3 LTS with Homebrew; Node 22.21.1 verified. Added reproducible Blender source generation, a source-reopen/material-edit script, a minimal Three.js diagnostic viewer and exported-data/Chrome checks. Generated binary fixtures are ignored and remain separate from source control. No studio persistence or personal project data exists yet.

Verification: source reopened with 14 bones; original and edited GLBs carry all three named two-second clips and embedded resources; the shirt material differs after source editing. Chrome/WebGL loaded 19 skinned meshes at approximately 1.9 metres height. Walk and fishing idle move actual skinned vertices, neutral remains still, and loop-boundary displacement is zero. Browser page errors: none. Production build passes; npm audit reports zero vulnerabilities. Build warns about the diagnostic Three.js bundle size (~657 kB uncompressed); no performance acceptance is claimed.

A browser check found a one-frame start offset, corrected by authoring clips from frame zero. Captures inspected at artifacts/proof-walk.png and artifacts/proof-fishing.png. First independent read-only review identified missing export/runtime assertions; these were added and pass. Final independent source review found no remaining material phase-1 issue. Its minor endpoint-verification caveat was addressed by sampling non-looping clamped clips, so the endpoint assertion checks the final key rather than a wrapped start.

Limits: rough segmented, rigidly weighted geometry does not prove production-quality joint deformation. Fishing idle lacks rod/contact constraints. No character or motion is visually accepted. Studio design, categories, revision storage, annotations, comparison, variations, Scene Loom handoff and fish.exe import remain unimplemented.

Current owner review: phase 1 viewer at http://127.0.0.1:4322. The plan's gate is “Owner judges whether the loop is useful before expanding it.” Next implementation after that assessment is durable foundation/agent ingestion, then studio review; do not mistake this diagnostic page for the final interface. No commits, pushes, deployments or sibling-repository edits.

## 2026-11-05 — first integrated studio increment

Owner accepted the proof as a useful workflow and explicitly authorized continuation. That acceptance concerns the workflow, not the fixture's design. Implemented phase 2 durable foundation and the first phase 3 review workspace.

Implemented: strict schemas; atomic project publication; immutable owned file blobs; conflict detection and last-100-request replay receipts; source/GLB/image ingestion; local authenticated service and CLI; snapshots, corrupt/missing-primary recovery; portable small-project JSON bundles. UI: project/category/asset navigation, stage filtering, 2D image display, orbitable models, clip playback/scrubbing, shared camera/time comparison, neutral material, revision trail, pin/general feedback, current decisions/task, copy prompts and separate owner acceptance. Agent publishing cannot modify owner acceptance.

The implementation uses direct Three.js inside a lazy React viewer rather than React Three Fiber: the existing proven harness supplied the required orbit/picking/mixer functionality without another rendering abstraction. Removed unused Fiber/Drei packages. React/TypeScript/Vite, Motion, Fastify, Zod, sharp and local Fontsource Syne/DM Sans are pinned in the lockfile. Blender authors geometry/materials/rigs; the studio does not execute arbitrary Python.

Independent read-only review found and main agent fixed: bundle metadata MIME trust, failed-import residue, missing-primary recovery, cross-project late responses, draft attribution, missing-clip comparison labels, session restart credentials, exact source-file links, model texture disposal and live/late-save draft loss. Foundation regression suite includes those import/recovery/security cases. Expanded browser regression covers actual point pin persistence, linked comparison/playback, live publication preserving active revision/draft, late save preserving newer drafts, copied prompt data-root continuity, restart/retry, acceptance and narrow layout. Verification outcome is recorded after the final run below.

Scope still open: animation mode currently reviews reusable clips, not multi-asset compositions. No rendered reference-image presets/handoff, annotation snapshots/remapping, character variation production, accepted creative assets, fish.exe import, or mature large-asset packaging. .blend ingestion checks signature; external Blender reopen is still required to prove source validity. JSON bundles have a practical small-project size limit. Storage/backup/Git LFS policy must be settled before production assets accumulate.

Preview at http://127.0.0.1:4323 uses disposable /private/tmp/mesh-foundry-studio-review. Personal data is untouched. No commits, pushes, deployment or sibling-repository edits. Next: owner reviews the first studio workspace; continue with animation composition and render handoff, then the first actual creative asset loop and separately authorized game import. Do not represent this increment as completion of all five plan phases.

Final verification for this increment: production build/typecheck pass; all 8 foundation tests pass; expanded isolated Chrome workflow passes; dependency audit reports zero vulnerabilities. Desktop and 390px captures inspected. The Three.js chunk still triggers a size advisory (~591 kB raw); no target-device performance acceptance is claimed. Final independent review of the draft-preservation fixes found no remaining material issue within that scope. Formatting and document links checked before handoff.

## 2026-11-05 — studio motion correction

Owner found the first workspace too static. Replaced the token revision fade with a coherent UI motion layer: moving selection surfaces, unfolding clip library and inspector disclosures, animated comparison opening/closing, revision mask transitions and copy confirmation. Added the full preview transport (restart, frame stepping, speed, loop, timeline/readout, animated play/pause) using the existing Motion dependency. UI state and drafts stay mounted while disclosures close; inactive disclosure content is keyboard-inert. No source assets or acceptance state changed.

Independent review identified endpoint action pausing in Three.js; fixed by resetting the active action before absolute-time sampling. Browser regressions now compare actual canvas poses after endpoint→middle seeking, exercise stepping, non-loop completion/speed/restart, and verify panel toggles preserve drafts. Build/typecheck, expanded Chrome workflow, and rendered desktop/390px inspection pass. Final formatting check recorded at handoff. Existing storage checks remain applicable because no service/storage contract changed. Preview restarted to serve the current build. No commit or push.

## 2026-11-05 — cohesive control polish

Owner approved polish after a read-only comparison with Scene Loom. Replaced all four native selectors (project, comparison, clip, speed) with a shared themed, keyboard-accessible Radix-based component. Added raised animated menus, selected checks, contextual descriptions and consistent chevrons; quieted secondary actions and aligned control surfaces/hover/focus treatment while preserving primary Save feedback and explicit acceptance.

Independent read-only source review found an empty-sentinel collision with legal clip names and copy-icon styling leaking onto the project trigger; both fixed. Browser tests now operate real custom-menu options and check keyboard open/Escape focus restoration and narrow menu placement alongside the existing draft/pin/playback/restart/acceptance regressions. Typecheck/build and the custom-menu workflow pass; final format/narrow verification recorded at handoff. Actual menu and workspace captures inspected. No data contracts, accepted assets, sibling repositories, commits or publication changed.

## 2026-11-05 — Animation-to-Assets collapse correction

Fixed the stutter above the stage tabs: the clip library's bottom spacing now animates to zero with its height, instead of disappearing abruptly at unmount. Removed the toolbar's competing layout-position animation and the redundant clip-path wipe. Added a frame-sampled browser regression asserting the panel's removal does not cause a final spacing jump. No storage, source assets or acceptance changes.

## 2026-11-05 — example removal

Owner requested removing the example. Stopped the preview, verified authoring-proof was the only project and both revisions were unaccepted fixtures, then removed its project directory, backups and unreferenced imported blobs from the isolated preview library. Personal storage did not exist and was untouched. Retained reproducible test-fixture scripts. The client now falls back to an empty/remaining healthy project when a remembered project no longer exists, avoiding a stale project selection after removal.

## 2026-11-05 — review defect patches

Patched the three confirmed review findings. Shared blobs are now installed through a common write/fsync/atomic no-overwrite hard-link path for regular publication and bundle imports; verified existing blobs are reused. Interrupted staging writes leave existing project files intact and can be retried. All project-response setters reject lower versions for the same project, including polling, project-selection reads and post-save refreshes. Khronos glTF validation checks original GLB bytes before the Node geometry decoder strips materials/textures.

Added regression coverage for partial-write failure with existing shared files, clean import retry, invalid original texture/material references and atomic batch rejection, plus the delayed-old-response browser sequence that previously reverted a selected new revision and erased its draft. No accepted assets or user project data changed. Independent read-only assessment confirmed the fix paths and exact malformed-model rejection. No commit or push. The existing documented small-project bundle size limit is unchanged.

## 2026-11-05 — initial publication authorization

Owner authorized committing and pushing the reviewed studio source and documentation to https://github.com/zabuzaff/mesh-foundry. Verified the target is the owner's empty private repository. Runtime libraries, generated models, source binaries, screenshots, local project data and credentials remain excluded. Local Git uses the same repository-specific SSH identity configuration as Scene Loom; global SSH configuration is unchanged. This authorization does not include deployment or acceptance of any visual asset.

## 2026-11-05 — reference-render handoff planning

New request: prepare a bounded implementation-ready plan before implementing Foundry → Scene Loom reference renders. Both main checkouts were clean at inspection. Read both repository guides and agent interfaces and checked Scene Loom's supporting-image/patch/receipt contracts: supporting images max 30; scene.patch supports partial fields; image imports deduplicate exact bytes; content/layout revisions are separate; dry-run precedes publication; request receipts cover the latest 100 successful batches.

Recorded the proposal in the existing implementation plan: exact GLB revision → versioned neutral front/side/three-quarter renders → owner selection → existing Scene Loom CLI image imports and supporting-only scene.patch → durable provenance/retry reconciliation. Proposed material choices: render pinned GLB rather than potentially divergent .blend; rest-state scope; provenance in Foundry/PNG metadata with visible acceptance labels; do not mutate existing scene notes. Plan approval is pending. No application implementation or Scene Loom files/data changed.

First real intended target is fish-exe/startup-journey, but it remains explicitly unauthorized until the owner requests the real handoff. Plan/implementation testing must use separate absolute temporary data roots and synthetic scene IDs; no personal storyboard access is necessary. No fish.exe work, commits, pushes or deployment authorized for this request.

## 2026-11-05 — handoff plan approved; continue in new chat

Owner explicitly approved the bounded reference-render handoff plan and requested implementation continue in a new Mesh Foundry chat. Implement the approved section of docs/implementation-plan.md and preserve the three existing uncommitted planning-document changes. No further plan approval is needed within that scope. Inspect actual checkout and both agent interfaces first; use isolated libraries, the existing themed controls, meaningful end-to-end tests and one focused read-only reviewer. Real fish-exe/startup-journey handoff, fish.exe edits, commits, pushes and deployment remain unauthorized. This chat performs only approval recording and chat creation; implementation belongs to the new chat.

## 2026-11-05 — reference rendering and explicit Scene Loom transfer

Implemented the approved local scope in the existing checkout, preserving the three planning-document edits. Added backward-compatible renderSets/handoffs storage, immutable pinned source/output hashes, recorded neutral/rest preset, real fixed-purpose Blender generation, UTF-8 PNG provenance and visible acceptance footers, themed main-worktable three-view review/selection, explicit destination preview, and durable existing-CLI handoff journals. Source revisions and acceptance remain unchanged. New CLI schemas/commands and operator configuration are documented in docs/agent-interface.md.

Independent read-only review found and main agent fixed persisted executable-path trust, imported GLB lights contaminating the fixed preset, long storage locks during rendering, and asymmetric projected framing. Actual rendered inspection also caught hidden Blender bone-display meshes inflating the bounds; those helpers are excluded. Blender 5.2's removed legacy compositor API is handled by flattening the transparent intermediate in sharp to the recorded opaque grey. Animation channels are removed before import so first-clip evaluation cannot replace declared rest transforms. No arbitrary asset scripts execute.

Verification checkpoint: 14 storage/job/security tests and typecheck pass. Real Blender 5.2.3 output and unchanged Scene Loom CLI have passed isolated source-byte integrity, selected front/three-quarter-only attachment, preservation of scene fields/layout/connections, replay/history, lost import/apply responses, concurrent note/support/layout edits, restart after downstream commit before Foundry receipt, invalid target, unavailable CLI, rejected image, 30-image capacity, newer-revision pinning and portable bundle round-trip. Chrome desktop/narrow review passed and captures were inspected. Final cancellation/framing regression and baseline browser/format verification are recorded below after completion.

No personal Foundry/Scene Loom library was read or modified. Synthetic destination isolated-ref-test/reference-destination is deliberately different from fish-exe/startup-journey. Temporary libraries/services are cleaned by the integration harness; ignored artifacts retain diagnostic captures. No Scene Loom source/schema, fish.exe, commits, pushes or deployment. All creative assets/reference quality remain unaccepted; real transfer still requires an explicit owner request.

Final verification: typecheck/production build, format check, all 14 automated storage/job/security tests, baseline studio Chrome regressions and the expanded real Blender/Scene Loom CLI/Chrome integration pass. The final integration additionally cancels a real Blender process while an ordinary CLI project write succeeds, preserves the previous completed set, and verifies both CLI and browser cancellation of a prepared handoff leave Scene Loom content unchanged. Corrected centred framing and full identity footers are captured in ignored artifacts/reference-{front,right-side,three-quarter}.png, reference-manifest.json and reference-ui-{desktop,narrow}.png. Independent final read-only verdict confirms all four findings resolved and no material regression within that review scope; current render and desktop/narrow captures were inspected. Scene Loom checkout remains clean. Existing Three.js bundle-size warning persists; no performance or visual acceptance is implied. Remaining owner judgments: creative/reference quality and any future real destination transfer, which is still not performed.

## 2026-11-05 — rebuilt asset 404 correction

Owner's browser loaded current index.html but received 404 for both hashed JS/CSS assets. The static plugin was configured with wildcard:false, registering only files present at startup. Switched to per-request wildcard resolution so newly rebuilt filenames are served. Added an isolated regression that starts the app, introduces new hashed files/index afterward, checks both asset types and preserves API/agent authentication routing. The already-running server requires one restart to load this server-code change. No project library access or changes.

## 2026-11-05 — restore/job and handoff-preview review patches

Patched the three follow-up findings. Reference work now registers a per-project activity guard through the storage queue; restore rejects while that project's job is active without blocking normal writes or other projects. Missing/changed render and handoff journals fail explicitly instead of assigning array index -1. Restore and portable import immediately mark detached running renders interrupted, preserving completed sets/provenance. Handoff UI filters to the selected set and identifies its exact source revision/set and acceptance snapshot.

Added gated regressions for restore during rendering/import, ordinary writes/other-project restore while a handoff is active, guard release after success/failure, missing-journal rejection before downstream apply, and restore/import of running snapshots without a service restart. All 19 tests and typecheck pass. Focused independent read-only review confirms these fixes with no material regression within its scope. Real isolated Blender/CLI/browser source-switch regression and final verification are recorded below after completion. No personal libraries, commits, pushes or deployment; the owner's studio is not started or managed by these checks.

Final patch verification: all 19 tests, typecheck, production build, format/diff checks, baseline studio Chrome regression and real isolated Blender/Scene Loom CLI/browser integration pass. Browser regression switches from the prepared handoff's source set to another set, asserts no old handoffs/Send controls remain, then switches back and verifies the pinned identity. Current desktop/narrow diagnostic captures are updated; desktop source labels were visually inspected. Temporary integration libraries/services cleaned up normally. Existing Three.js bundle-size warning remains. Owner's studio process and personal libraries were not accessed or restarted.

## 2026-11-06 — Scene Loom UI system alignment

Owner requested full Scene Loom UI direction while retaining Mesh Foundry's product context. Read Scene Loom's current source/design and inspected its disposable After Hours captures. Applied its exact core tokens and locally hosted Syne Variable/DM Sans Variable fonts (with licenses), expressive 800-weight wordmark, neutral secondary typography, studio header, quiet controls, raised menus, 10px review surfaces, feedback/acceptance inspector, transport, reference panels, error/toast treatment and artwork-led empty state. Asset/revision, playback, annotations, acceptance and reference-transfer behavior remain intact. No service/storage contracts or personal libraries changed; Scene Loom source was read-only. Existing repository guidance remains sufficient; no capabilities/dependencies added.

Verification: production build/typecheck, all 19 repository tests, baseline and expanded isolated Chrome checks (including exact tokens, font availability, empty states, keyboard menus and 390px overflow), and real isolated Blender/Scene Loom CLI/Chrome reference integration pass. Actual desktop/narrow comparison, menus and reference panels were inspected. Read-only independent review found selected-text contrast; corrected to Scene Loom's exact accent/on-accent pairing. Final verification/capture and reviewer verdict recorded below. Impeccable context/detector could not run: launcher lacks execute permission and its engine is not installed; written guidance and rendered review used without claiming automated certification. Existing Three.js chunk-size warning remains. DESIGN.md refresh choice requested under the skill's existing-file workflow; awaiting owner response. No commit, push, deployment or asset acceptance.

Final correction verification: rebuilt production assets, reran expanded Chrome checks successfully, and passed formatting/diff checks. Desktop/narrow empty states, loaded variable fonts, project menu and reference panels were inspected. No functional blockers found. Design-document choice remains pending; current implementation tokens in client/tokens.css are the exact Scene Loom reference palette.

Reviewer verdict pass scored the contrast correction resolved. A desktop empty-state capture had a transient duplicate-header artifact immediately after viewport resizing; added a bounded settle before that capture, reran Chrome checks successfully, and visually verified the clean recapture. Other reviewed desktop/narrow/menu/reference captures were coherent. Documentation choice is the only pending workflow item.

## 2026-11-06 — design-system documentation refreshed

Owner selected “Refresh it to match Scene Loom” for the existing design brief. Refreshed DESIGN.md to document the implemented After Hours system, replacing superseded palette/font proposals while retaining asset-review, annotation, playback, reference and acceptance constraints. Added token frontmatter and .impeccable/design.json with observed motion/elevation/breakpoints and component previews. Palette values were checked against client/tokens.css; documentation reflects current CSS and the completed rendered verification. Earlier pending-choice notes above are now resolved. No application behavior changed, and no new creative acceptance, commit, push or deployment is implied.

## 2026-11-06 — revision selection visibility correction

Patched the confirmed review finding: resting revision-trail buttons now use the card surface while the active selection retains surface-hover. Hover behavior remains consistent. Isolated Chrome computed styles confirm distinct selected/resting backgrounds (#282e38 versus #20242b). Production build/typecheck, studio browser workflows, formatting and diff checks pass; refreshed comparison capture inspected. Main-agent review used for this one-line styling correction. No storage, acceptance or source-asset changes; no commit or push.

## 2026-11-07 — asset stage terminology and authorized Pondshift reset

Updated stage display labels to 2D Concepts, 3D Prototypes and Developed Models,
with concise explanations and an explicit separation of owner acceptance from
development stage. Stored sketch/study/model values remain compatible. Updated
revision labels, empty stage messages and copied stage prompts as well.

Added authenticated CLI/service clear-assets with exact project confirmation,
optimistic version checking, global active-reference-job exclusion, project-wide
decision preservation, and removal of asset review/reference history and target
backups/recovery copies. Shared blobs are removed only after scanning all other
project metadata copies; a durable cleanup manifest supports interrupted cleanup.
No Scene Loom mutations occur. Existing repository guidance was sufficient; no
additional tools/dependencies or guidance changes were needed.

At the owner's explicit request, restarted the service safely with its existing
operator settings and cleared Pondshift through the supported CLI. Verified
Pondshift version 7 exists with zero assets, revisions, feedback, acceptance,
render sets and handoffs. Its name, brief, categories and currentTask match the
pre-reset state. Both existing decisions were asset-scoped and were removed;
there were no project-wide decisions. Removed 17 unreferenced content-addressed
blobs and target history copies. No other projects were present. Service remains
available at http://127.0.0.1:4323. Source files outside service-owned storage
were not altered.

Verification: build/typecheck, all 20 tests (including isolated reset, version,
confirmation, active-job and shared-blob coverage), isolated Chrome workflows,
formatting and diff checks pass. Desktop and 390px renders inspected. Independent
read-only review identified shared-job exclusion, empty-stage copy and cleanup
retry resilience; all corrected and reviewer confirmed no remaining blockers.
Impeccable launcher lacked execute permission; written guidance and rendered
review used, without automated certification. Existing build chunk-size warning
remains. No commit, push, deployment or creative acceptance.

## 2026-11-07 — creator-controlled asset progression

Added Copy 3D prototype prompt for selected concepts and Copy developed model
prompt for selected prototypes, gated by explicit approval of that exact revision.
Unavailable actions identify the revision requiring approval. Copy revision prompt
works for every selected stage without requiring approval. Empty 3D stages direct
the creator to the preceding revision instead of offering an unguarded prompt.
Selecting another asset resets the stage filter to avoid hiding its selection.
Copy actions only write clipboard text; they neither generate nor send messages.

Inspected acceptance: owner review already accepts every stage, but its current
pointer is per asset. Reused existing immutable acceptance history to resolve the
latest approval per asset/stage, retaining legacy pointer support and unchanged
schemas/stored stage values. Accepting another stage preserves earlier approval;
accepting another revision in the same stage supersedes that stage's selection.
Reference snapshots use the same rule while retaining model/non-fixture guards.
No approval implies production readiness or automatically approves new work.

Service publication now requires concepts as roots, same-asset parent links for
3D revisions, adjacent stages for advancement, and exact source approval for
cross-stage transitions. Same-stage improvement needs no approval. Existing
projects/backups/imports remain readable; 3D-only assets can be refined through
same-stage parent links. Legacy regression fixtures now load through portable
imports instead of relying on the newly prohibited unlinked 3D publication path.

Prompts specify project/asset/revision IDs, immutable source manifests and hashes,
fresh decisions/feedback/approval checks, linked new candidates and source
preservation. Concepts request faithful real geometry plus clarification of
consequential unknowns. Model development refines editable source, explains
changes, establishes intended production requirements and treats rigging/animation
as conditional. Prompts and toast support any compatible local agent harness.
Updated product and agent-interface guidance. Scene Loom's separate storyboard
asset-list/concept batch workflow was not changed.

Verification: build/typecheck, all 21 storage/security/progression tests, expanded
isolated Chrome workflows and real isolated Blender/Scene Loom CLI/Chrome handoff
integration pass. Coverage includes exact and superseded approvals, independent
assets, skipped/unlinked stages, legacy revision work, same-stage unapproved
improvement, source manifests, revision prompts at every stage, clipboard-only
behavior, retained history and narrow overflow. Desktop/narrow progression renders
inspected. Independent read-only review identified empty-stage, generic prompt
scope and root-stage bypasses; all corrected and final review found no blockers.
Impeccable written guidance/rendered review used; launcher remains unavailable,
with no automated certification claimed. Existing chunk-size warning remains.

Safely restarted Mesh Foundry with existing operator settings after confirming no
active jobs. All project metadata matched before/after restart; Pondshift remains
at zero assets. Service is running on loopback port 4323. Tests used disposable
libraries only. No personal asset mutation, Scene Loom personal data change,
commit, push, deployment or new creative acceptance.

## 2026-11-07 — review findings patched

Fixed empty-stage live refresh: a waiting stage resolves its first matching new
revision and pins it, so subsequent publications do not steal the selection.
Expanded the Chrome progression flow to wait on the empty prototype stage during
publication, verify the viewer appears automatically, then publish a second
prototype and verify the first stays selected.

Preserved legacy pointer approvals after later owner actions by consulting saved
previousRevisionId only when the stage has no explicit acceptance event. Explicit
newer same-stage approval still wins. Added regression coverage for pointer moves,
portable round trips and subsequent supersession without changing stored data.

Render/handoff work directories now live under jobs/projects/PROJECT_ID before
source/output writes. Asset clearing removes only its project's namespace while
retaining other projects' work and the existing active-job guard. Old unscoped
render-/handoff- folders cannot be attributed safely from identical source hashes;
they remain untouched and are reported as unattributedJobDirectories. Regression
coverage checks owned cleanup, foreign/shared-source preservation, unknown legacy
folders and active-job rejection. The live library has zero old unscoped job
folders, so there is no outstanding historical cleanup there.

Verification: build/typecheck, all 23 tests, expanded isolated Chrome workflow,
real isolated Blender/Scene Loom CLI/browser integration, formatting and diff
checks pass. Narrow rendered result inspected. Independent read-only review
confirmed all three fixes with no remaining blockers; rejected hash-based legacy
attribution was removed before completion. Safely restarted the service with its
operator settings preserved and verified identical project metadata. Pondshift
remains at zero assets. No personal asset changes, commit, push or deployment.

## Incoming Scene Loom asset handoff — 2026-11-12

Mesh Foundry resolves one library per stable Scene Loom project ID. The
read-only lookup checks the exact storyboard's live setting. A scoped apply
batch can reuse an existing revision or publish a 2D concept with its
suggestion pin in one commit. Pins retain the storyboard, suggestion, linked
scenes and reviewed source revision. Publishing on a different storyboard
preserves existing pins. Older projects remain readable.

The isolated real Scene Loom CLI run (`test:references -- --incoming-only`)
covered Baseline and a named copy, shared suggestions, repeated lookup and
batch replay, reuse, independent pins, and switching the toggle off before
publication. All 23 local tests passed. The integration guide records the
Scene Loom work still needed for copied prompts, draft suggestions and result
writeback. No personal data or Scene Loom source was changed.

Review follow-up: scoped generation permits only category creation, asset
creation, concept publication and suggestion pins. The service checks live
source eligibility before installing new blobs and again before committing
metadata. The inbound integration covers rejected unrelated operations and
verifies that a disabled target leaves the blob directory unchanged.

## Scene Rehearsal prompt — 2026-11-12

The developed model review copies a source-pinned handoff prompt for the
current model-stage approval, including when another stage holds the asset's
latest acceptance. The prompt identifies the library and exact GLB, requires
live acceptance and embedded clip verification, and describes draft publication
with owner review. The checked Scene Rehearsal CLI can publish drafts, while
asset import requires an owner session. The prompt stops at that blocker until
Scene Rehearsal provides an authorized agent import workflow.

The isolated Chrome check exercises the real clipboard with a fictional
asset before acceptance, after model acceptance, and after a prototype
acceptance. It verifies the exact payload against the fixture GLB and checks
that copying leaves project state unchanged and makes no external requests.
The live Kairo handoff remains pending agent import support.

Review fixes: the copy action waits for the session's source library path and
reads exact animation names from the hash-verified GLB. Missing names are
represented as null and flagged as incompatible with Scene Rehearsal import.
The isolated browser test held the session response and checked the clipboard
against a modified fixture with both named and unnamed animations. The build,
all 23 tests, formatting, and browser checks passed. The local Mesh Foundry
service was restarted and its project metadata matched before and after.

## Per-asset turnaround prompt — 2026-11-14

Assets with an approved 2D concept expose Copy turnaround prompt in asset
review, including while reviewing a 3D revision. The prompt pins the current
concept-stage approval and requests a linked sketch candidate with aligned
orthographic front, side and back views. The selected 3D revision supplies
feedback context. Copying is clipboard-only and approval remains an owner action.

The production build, 23 unit tests, formatting check and isolated Chrome
assertions passed. Reviewed desktop concept and narrow prototype captures.

## Bun reference study — 2026-11-14

The live project `scene-loom-6e02728c2523398103ff0475cb4ab97d84140806d22785121493258f954e9998`
at version 47 contains asset `kairo-researcher-bun` with one concept,
`kairo-researcher-bun-turnaround-1`. Its single PNG
(`f_ad6b745dce9e2d517c25`, SHA-256
`ad6b745dce9e2d517c258edd35cf85cb1f898ac862f749ecbe9fb75ddd9d21aa`)
was hash-verified and inspected. It contains front, right and back views.
Its summary describes extraction from an approved group sheet. The Bun
revision itself has no accepted pointer or approval event. No owner
decision or personal project data was changed.

The concept viewer now browses every image on the existing revision
manifest. The detailed concept prompt pins the approved sketch and asks
for eight ordered image files as an unapproved linked revision. Prototype
advancement still requires approval of the exact sketch and the prompt
requires every source image.

Record the baseline from the original sheet after the owner approves it
and before the eight-view revision supersedes it. Use separate modeling
sessions with the same agent model, Blender version, starting conditions,
time budget, and modeling brief; keep the baseline agent blind to the
extra angles and the eight-view agent blind to the baseline mesh. Keep
both models as unapproved prototypes with their exact source links.
Before the second run, check the eight images together against the
original: align the ground, eye and shoulder heights; check how the side
and diagonals carry the bun attachment, hairline, glasses temples and
overall straps. Record inferred features and any contradictions for
owner approval. Render both prototypes using the same orthographic
angles, framing, scale, baseline and lighting. Compare head and bun
silhouette, face and glasses placement, and body proportions; distinguish
ambiguity resolved by the reference from clear shapes missed in modeling.
The trial is pending; there is no fidelity result yet.

Implementation verification: production build and all 23 automated tests
passed. Chrome exercised single-sheet compatibility, all eight picker
entries, exact revision approval, and the copied manifest. Desktop and
narrow captures were reviewed. Independent review caught repeated file
IDs for identical bytes and unconditional orthographic guidance for
arbitrary eight-image sets; the picker now uses manifest position and
the guidance applies to orthographic sets.

## Mannequin-first prototype prompt — 2026-11-15

Bun's local staged trial exposed pelvis and foot placement errors at the
mannequin checkpoint. The main shapes pass improved fringe continuity
and the final head revision corrected the nape and glasses in profile.
The owner chose to adopt the workflow after reviewing Bun.

The prototype prompt now asks for a plain mannequin, main shapes, and
details, with editable checkpoints and matched clay renders. It keeps
the approved concept manifest pinned and uses every image. Original
views govern conflicts with inferred angles. Final Blender and GLB
verification and owner review are part of the prompt.

## Optional detail references and part fitting — 2026-11-15

The detailed concept prompt keeps the eight full-asset views first and
requests named detail images only when they answer a modeling or fit
question. The prototype prompt uses the full-asset views to establish
proportions and the detail images to clarify construction. It asks the
agent to fit separately editable parts directly against the main form
and review them assembled from the matched cameras. The owner plans to
test the updated workflow on Bun.

The Bun detail trial exposed a mismatch in the crop-first instructions:
the agent supplied seven enlarged crops. The prompt now asks for
dedicated drawings of parts that benefit from separate modeling.
Crops can support the drawings, and the approved full-asset views
govern how the parts look together.

The prototype review button copies a read-only brief pinned to the selected
prototype and its linked concept. The reviewer inspects the exported GLB
and returns numbered annotated captures for visible findings, plus a
correction prompt when warranted. The owner decides what to send back.
