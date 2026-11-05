# Mesh Foundry repository guidance

- Read PRODUCT.md, DESIGN.md, docs/implementation-plan.md and docs/progress.md before implementation. Read docs/agent-interface.md for storage or ingestion changes.
- Owner authorized local implementation on 2026-11-05. Work through the approved phase gates; phase 1 workflow was accepted by the owner; character/motion designs remain unaccepted. Do not commit, push or deploy without separate authorization.
- Node 22.21.1 and Blender 5.2.3 LTS verified locally. npm ci installs pinned dependencies. npm run proof:generate generates ignored fixtures; npm run proof:verify -- artifacts/authoring-proof checks those exports. npm run proof:build builds the diagnostic viewer. npm run proof:preview -- --port 4322 serves it locally; with that running, npm run proof:browser checks Chrome/WebGL playback. Studio commands: npm run build, npm start (loopback port 4323), npm run cli -- help, npm run typecheck, npm test, npm run test:browser and npm run format:check. Generate proof fixtures before tests on a clean checkout. Browser tests use Chrome and isolated temporary storage/port 4324. Tests must never mutate personal project storage. Restart service after rebuilding static files.
- Keep Blender authoring separate from studio review. Preserve editable geometry, materials, rigs and animation sources; generated images are not models.
- Keep personal asset data outside studio source. Never mutate fish.exe or Scene Loom as a side effect of studio work.
- Only explicit owner acceptance marks a revision accepted. Technical validation, concept selection and agent confidence do not imply visual acceptance.
- Preserve accepted revisions and pin downstream references to exact revisions. Agent updates must preserve owner feedback and review state.
- Use Impeccable for UI design and actual rendered review. The design brief governs aesthetics; do not claim automated certification when tooling did not run.
- Implement in the approved phases, update the existing progress record at usable checkpoints, and use one read-only review agent for substantial implementation. Keep edits and integration with the main agent.
