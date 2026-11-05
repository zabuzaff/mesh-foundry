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
