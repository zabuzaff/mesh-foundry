import Fastify from "fastify";
import statics from "@fastify/static";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { readFile, writeFile, mkdir, unlink, open } from "node:fs/promises";
import { homedir } from "node:os";
import { References } from "./references.js";
import { Store, Conflict } from "./store.js";
import { id } from "../shared/schema.js";
export const defaultRoot = () =>
  process.env.MESH_FOUNDRY_DATA_DIR ??
  join(homedir(), "Library/Application Support/Mesh Foundry");
export async function makeApp(
  root: string,
  port = 4323,
  staticRoot = resolve("dist"),
) {
  const store = new Store(root);
  await store.init();
  const references = new References(store, {
    blender: process.env.MESH_FOUNDRY_BLENDER ?? "/opt/homebrew/bin/blender",
    sceneCheckout: process.env.SCENE_LOOM_CLI_DIR,
    sceneRoot: process.env.SCENE_LOOM_DATA_DIR,
  });
  await references.recover();
  const agentToken = randomBytes(32).toString("hex"),
    ownerToken = randomBytes(32).toString("hex");
  const app = Fastify({ bodyLimit: 180 * 1024 * 1024 });
  app.setErrorHandler((e: any, _req, reply) =>
    reply.code(e instanceof Conflict ? 409 : (e.statusCode ?? 400)).send({
      success: false,
      error: {
        code: e instanceof Conflict ? "CONFLICT" : "INVALID_REQUEST",
        message: e.message,
      },
    }),
  );
  app.addHook("onRequest", async (req, reply) => {
    const allowed = `127.0.0.1:${port}`;
    if (req.headers.host !== allowed) {
      return reply.code(403).send({ error: "Host rejected" });
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${allowed}`)
      return reply.code(403).send({ error: "Origin rejected" });
    if (req.url.startsWith("/agent/")) {
      if (origin || req.headers.authorization !== `Bearer ${agentToken}`)
        return reply.code(401).send({ error: "Agent authentication required" });
    } else if (
      req.url.startsWith("/api/") &&
      req.method !== "GET" &&
      req.headers.authorization !== `Bearer ${ownerToken}`
    )
      return reply.code(401).send({ error: "Review authentication required" });
  });
  app.get("/api/session", async () => ({ token: ownerToken, dataRoot: root }));
  app.get("/api/projects", async () => store.list());
  app.get("/agent/projects", async () => store.list());
  for (const prefix of ["/api", "/agent"]) {
    app.get(`${prefix}/projects/:id`, async (req: any) =>
      store.read(req.params.id),
    );
    app.get(`${prefix}/projects/:id/backups`, async (req: any) =>
      store.backups(req.params.id),
    );
  }
  for (const prefix of ["/api", "/agent"]) {
    app.post(`${prefix}/projects/:id/renders/:rid/cancel`, async (req: any) =>
      references.cancel(req.params.id, req.params.rid),
    );
    app.post(`${prefix}/projects/:id/renders`, async (req: any) =>
      references.generate(req.params.id, req.body),
    );
    app.post(`${prefix}/projects/:id/handoffs/:hid/cancel`, async (req: any) =>
      references.cancelHandoff(req.params.id, req.params.hid),
    );
    app.post(`${prefix}/projects/:id/handoffs`, async (req: any) =>
      references.prepare(req.params.id, req.body),
    );
    app.post(`${prefix}/projects/:id/handoffs/:hid/send`, async (req: any) =>
      references.resume(req.params.id, req.params.hid),
    );
  }
  app.get("/api/projects/:id/renders/:rid/:view", async (req: any, reply) => {
    const p = await store.read(req.params.id),
      r = p.renderSets.find(
        (r) => r.id === req.params.rid && r.status === "completed",
      ),
      o = r?.outputs.find((o) => o.view === req.params.view);
    if (!o) throw Error("Render output not found");
    return reply
      .type("image/png")
      .header("X-Content-Type-Options", "nosniff")
      .send(await references.bytes(o.hash));
  });
  app.post("/agent/projects", async (req) => store.create(req.body));
  app.post("/agent/projects/:id/apply", async (req: any) =>
    store.apply(req.params.id, req.body),
  );
  app.post("/agent/projects/:id/restore", async (req: any) =>
    store.restore(req.params.id, req.body),
  );
  app.post("/agent/import", async (req) => store.importBundle(req.body));
  app.get("/agent/projects/:id/export", async (req: any) =>
    store.bundle(req.params.id),
  );
  app.post("/api/projects/:id/review", async (req: any) =>
    store.apply(req.params.id, req.body, true),
  );
  app.get(
    "/api/projects/:id/revisions/:rid/files/:fid",
    async (req: any, reply) => {
      id.parse(req.params.id);
      const result = await store.blob(
        req.params.id,
        req.params.rid,
        req.params.fid,
      );
      if (!["image", "model", "texture"].includes(result.file.kind))
        reply.header("Content-Disposition", "attachment");
      return reply
        .type(result.file.mime)
        .header("X-Content-Type-Options", "nosniff")
        .send(result.bytes);
    },
  );
  // Resolve build assets per request so a rebuild can introduce new hashed filenames.
  await app.register(statics, { root: staticRoot, wildcard: true });

  return { app, store, agentToken, references };
}
export async function start() {
  const root = defaultRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, "service.lock");
  try {
    const handle = await open(lock, "wx", 0o600);
    await handle.writeFile(String(process.pid));
    await handle.close();
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    let pid;
    try {
      pid = Number(await readFile(lock, "utf8"));
      if (!Number.isInteger(pid) || pid < 1)
        throw Error("Unreadable service lock; inspect before removal");
      process.kill(pid, 0);
    } catch (err: any) {
      if (err.code !== "ESRCH") throw err;
      throw Error(
        `Stale service lock for PID ${pid}. Confirm no service is running, then remove ${lock} before restarting.`,
      );
    }
    throw Error(`Mesh Foundry is already running (PID ${pid})`);
  }
  const port = Number(process.env.MESH_FOUNDRY_PORT ?? 4323);
  let app: Awaited<ReturnType<typeof makeApp>>["app"] | undefined;
  try {
    const instance = await makeApp(root, port);
    app = instance.app;
    await app.listen({ host: "127.0.0.1", port });
    await writeFile(
      join(root, "runtime.json"),
      JSON.stringify({
        url: `http://127.0.0.1:${port}`,
        token: instance.agentToken,
        pid: process.pid,
      }),
      { mode: 0o600 },
    );
  } catch (e) {
    await unlink(lock).catch(() => {});
    throw e;
  }
  const stop = async () => {
    await app!.close();
    await unlink(join(root, "runtime.json")).catch(() => {});
    await unlink(lock).catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`Mesh Foundry: http://127.0.0.1:${port}\nData: ${root}`);
}
