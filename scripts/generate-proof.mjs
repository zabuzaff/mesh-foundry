import { spawnSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve(process.argv[2] ?? "artifacts/authoring-proof");
await mkdir(out, { recursive: true });
for (const args of [
  [
    "--background",
    "--python-exit-code",
    "1",
    "--python",
    "authoring/human-proof.py",
    "--",
    out,
  ],
  [
    "--background",
    `${out}/human.blend`,
    "--python-exit-code",
    "1",
    "--python",
    "authoring/verify-proof.py",
    "--",
    out,
  ],
]) {
  const r = spawnSync(process.env.BLENDER_BIN ?? "blender", args, {
    stdio: "inherit",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
await mkdir("public/proof", { recursive: true });
for (const file of ["human.glb", "human-edited.glb"])
  await copyFile(`${out}/${file}`, `public/proof/${file}`);
console.log(`Editable source and exports: ${out}`);
