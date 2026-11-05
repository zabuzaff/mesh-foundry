# Mesh Foundry

A local, agent-driven asset and design studio. Discuss work in Codex, inspect sketches and editable 3D assets in Mesh Foundry, give precise feedback, and explicitly accept revisions before game integration.

Status: local implementation authorized. The first studio review increment is implemented: durable agent ingestion, asset stages, revision comparison, clip playback, feedback pins, decisions and explicit acceptance. Animation compositions, reference-render handoff and game integration remain later work.

- [Product brief](PRODUCT.md)
- [Design brief](DESIGN.md)
- [Implementation plan](docs/implementation-plan.md)
- [Agent and data contract](docs/agent-interface.md)
- [Progress and open decisions](docs/progress.md)

This repository tracks the studio source and guidance. Personal projects and binary assets will live separately. fish.exe is the first consumer, not a dependency.

## Authoring proof

Requires Node.js 22.12+ and Blender 5.2.3 LTS (verified on Apple Silicon). Set BLENDER_BIN if Blender is not on PATH.

```sh
npm ci
npm run proof:generate
npm run proof:verify -- artifacts/authoring-proof
npm run proof:build
npm run proof:preview -- --port 4322
```

Open http://127.0.0.1:4322/proof.html. Select a clip, orbit the model, pause playback, or switch the edited shirt material. In another terminal, `npm run proof:browser` runs actual Chrome checks. Chrome must be installed. Generated models, editable .blend files and screenshots are ignored; regenerate them rather than committing them. These fixtures are disposable and unaccepted.

## Studio

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4323. The default personal library starts empty. Use **Copy starting prompt** to direct Codex to the [agent interface](docs/agent-interface.md), then publish sketches or editable 3D revisions through the CLI. Rebuild and restart after source changes. Set an absolute MESH_FOUNDRY_DATA_DIR to use a separate library.

For verification, generate fixtures with `npm run proof:generate`, then run `npm test`, `npm run test:browser`, `npm run typecheck`, and `npm run format:check`. Browser tests start and stop their own isolated service on port 4324 and require Chrome. They never use your personal library.

Current review preview uses a disposable library at /private/tmp/mesh-foundry-studio-review and contains clearly labelled technical fixtures. Its acceptance state does not represent accepted game assets.
