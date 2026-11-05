import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { validateBytes } from "gltf-validator";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { z } from "zod";
import { upload } from "../shared/schema.js";
export const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
export async function inspectBytes(kind: string, bytes: Buffer) {
  let mime = "application/octet-stream",
    clips: { name: string; duration: number }[] = [];
  if (kind === "image" || kind === "texture") {
    const image = sharp(bytes, { limitInputPixels: 40000000 });
    const meta = await image.metadata();
    if (
      !["png", "jpeg", "webp", "avif"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      throw Error("Use a static PNG, JPEG, WebP or AVIF image");
    await image.raw().toBuffer();
    mime = `image/${meta.format}`;
  } else if (kind === "model") {
    if (
      bytes.length < 20 ||
      bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length
    )
      throw Error("Invalid GLB header");
    if (bytes.readUInt32LE(16) !== 0x4e4f534a)
      throw Error("Missing GLB JSON chunk");
    const report = await validateBytes(new Uint8Array(bytes), {
      maxIssues: 100,
      externalResourceFunction: async () => {
        throw Error("External GLB resources are not allowed");
      },
    });
    if (report.issues.numErrors)
      throw Error(
        "Invalid GLB: " +
          report.issues.messages
            .filter((m) => m.severity === 0)
            .map((m) => m.message)
            .join("; "),
      );
    const json = JSON.parse(
      bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
    );
    if (
      (json.buffers ?? []).some((b: any) => b.uri) ||
      (json.images ?? []).some((i: any) => i.uri || i.bufferView === undefined)
    )
      throw Error("GLB must embed all buffers and textures");
    // Server decoder proves geometry/skin/clip parseability. Image decoding is done
    // separately by sharp; remove images only for this Node-only loader invocation.
    for (const image of json.images ?? []) {
      const view = json.bufferViews[image.bufferView];
      const offset = 20 + bytes.readUInt32LE(12) + 8 + (view.byteOffset ?? 0);
      await sharp(bytes.subarray(offset, offset + view.byteLength))
        .raw()
        .toBuffer();
    }
    const clean = structuredClone(json);
    delete clean.images;
    delete clean.textures;
    delete clean.materials;
    for (const mesh of clean.meshes ?? [])
      for (const primitive of mesh.primitives ?? []) delete primitive.material;
    const encoded = Buffer.from(JSON.stringify(clean));
    const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
    encoded.copy(padded);
    const rest = bytes.subarray(20 + bytes.readUInt32LE(12));
    const rebuilt = Buffer.alloc(20 + padded.length + rest.length);
    bytes.copy(rebuilt, 0, 0, 12);
    rebuilt.writeUInt32LE(rebuilt.length, 8);
    rebuilt.writeUInt32LE(padded.length, 12);
    rebuilt.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(rebuilt, 20);
    rest.copy(rebuilt, 20 + padded.length);
    const gltf = await new GLTFLoader().parseAsync(
      rebuilt.buffer.slice(
        rebuilt.byteOffset,
        rebuilt.byteOffset + rebuilt.byteLength,
      ),
      "",
    );
    clips = gltf.animations.map((c) => ({
      name: c.name,
      duration: c.duration,
    }));
    if (new Set(clips.map((c) => c.name)).size !== clips.length)
      throw Error("Clip names must be unique");
    let meshes = 0;
    gltf.scene.traverse((o: any) => {
      if (o.isMesh) {
        meshes++;
        const a = o.geometry.attributes.position;
        if (!a || !Array.from(a.array).every(Number.isFinite))
          throw Error("Invalid model positions");
        o.geometry.dispose();
      }
    });
    if (!meshes) throw Error("GLB contains no geometry");
    mime = "model/gltf-binary";
  } else if (kind === "blend") {
    // Modern Blender may save compressed sources. Strong verification is an
    // explicit Blender reopen report, not a filename or this signature check.
    if (
      bytes.toString("ascii", 0, 7) !== "BLENDER" &&
      bytes.readUInt32LE(0) !== 0xfd2fb528 &&
      bytes.readUInt16LE(0) !== 0x8b1f
    )
      throw Error("Unrecognized Blender source");
  } else if (kind === "recipe") {
    if (bytes.includes(0)) throw Error("Recipe must be text");
    mime = "text/plain";
  }
  return { mime, clips };
}
export async function inspect(input: z.infer<typeof upload>) {
  if (!isAbsolute(input.path)) throw Error("Import paths must be absolute");
  const s = await stat(input.path);
  if (!s.isFile() || s.size > 100 * 1024 * 1024 || s.size < 1)
    throw Error("File must be between 1 byte and 100 MB");
  const bytes = await readFile(input.path);
  const info = await inspectBytes(input.kind, bytes);
  return {
    bytes,
    clips: info.clips,
    file: {
      id: "f_" + hash(bytes).slice(0, 20),
      kind: input.kind,
      name: basename(input.path),
      hash: hash(bytes),
      size: bytes.length,
      mime: info.mime,
    },
  };
}
