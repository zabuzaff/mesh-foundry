import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.argv[2] ?? "/private/tmp/mesh-foundry-proof";
function parse(b) {
  assert.equal(b.toString("utf8", 0, 4), "glTF");
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  return JSON.parse(b.toString("utf8", 20, 20 + b.readUInt32LE(12)));
}
const original = parse(await readFile(`${root}/human.glb`)),
  edited = parse(await readFile(`${root}/human-edited.glb`));
for (const g of [original, edited]) {
  assert.deepEqual(g.animations.map((a) => a.name).sort(), [
    "fishing_idle",
    "neutral",
    "walk",
  ]);
  assert.equal(g.skins.length, 1);
  assert.equal(g.skins[0].joints.length, 14);
  assert(g.buffers.every((b) => !b.uri));
  assert((g.images ?? []).every((i) => i.bufferView !== undefined));
  for (const a of g.animations) {
    assert(a.channels.length > 0);
    const end = Math.max(...a.samplers.map((s) => g.accessors[s.input].max[0]));
    assert(Math.abs(end - 2) < 0.0001, `${a.name}: ${end}`);
  }
}
const color = (g) =>
  g.materials.find((m) => m.name === "shirt").pbrMetallicRoughness
    .baseColorFactor;
assert.notDeepEqual(color(original), color(edited));
const report = {
  clips: original.animations.map((a) => a.name),
  joints: 14,
  embeddedResources: true,
  materialEditVerified: true,
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/glb-check.json", JSON.stringify(report, null, 2));
console.log(report);
