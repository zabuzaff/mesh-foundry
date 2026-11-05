# Agent interface

Mesh Foundry is authored from Codex chats. Use its CLI; do not edit running project JSON or blob files directly. The studio is an inspector and review worktable, not a modeling engine. Blender scripts create editable sources and exports outside the service.

## Start and discover

From the repository, use Node.js 22.12+, `npm ci`, `npm run build`, then `npm start`. Default studio URL: http://127.0.0.1:4323. `MESH_FOUNDRY_DATA_DIR` overrides the default `~/Library/Application Support/Mesh Foundry` and must be absolute. The service binds only to loopback and takes a single-service lock. Restart after rebuilding: the service registers the built static files at startup.

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
      "id": "human-v1",
      "assetId": "human",
      "stage": "study",
      "summary": "Initial form and rig",
      "files": [
        { "kind": "blend", "path": "/absolute/human.blend" },
        { "kind": "model", "path": "/absolute/human.glb" },
        { "kind": "recipe", "path": "/absolute/create-human.py" }
      ],
      "toolVersions": { "Blender": "5.2.3" },
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

Restore input: `{"backupId":"RETURNED_FILENAME.json","expectedVersion":3}`. Restoration advances version and clears replay receipts. A missing/corrupt primary requires explicit `{"backupId":"RETURNED_FILENAME.json","recoverCorrupt":true}`; existing damaged bytes are preserved in recovery/. Healthy projects cannot bypass version checks through corrupt recovery. Inspect owner intent before intentional rollback.

Every mutation snapshots previous metadata. Blobs are retained, including those needed by backups; no garbage collection or backup pruning yet. A portable bundle embeds metadata and owned file bytes, verifies hashes and decodes resources again on import. Imports require a new project ID/destination and cannot overwrite an existing project. Bundles are unencrypted personal files. The current service body limit is 180 MB; this JSON/base64 transfer is suitable for the small first workflow, not a large archive format. External backup and Git LFS policy remain open before production asset accumulation.

## Scene Loom and game boundary

Do not modify Scene Loom or fish.exe automatically. Reference-render generation/handoff and game import remain later phases. When authorized, use Scene Loom's documented CLI to import owned image copies and pin provenance to the exact Foundry revision; never change its live JSON or automatically replace its scene images.
