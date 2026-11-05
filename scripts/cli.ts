import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultRoot } from "../server/app.js";
import { batch, createProject, project } from "../shared/schema.js";
import { renderInput, handoffInput } from "../shared/references.js";
import { z } from "zod";
const [command, pid, path] = process.argv.slice(2);
async function main() {
  if (command === "help" || !command) {
    console.log(
      "Mesh Foundry CLI\nlist | cancel-render PROJECT RENDER_ID | render PROJECT INPUT.json | renders PROJECT | handoff PROJECT INPUT.json | handoffs PROJECT | send PROJECT HANDOFF_ID | cancel-handoff PROJECT HANDOFF_ID | read PROJECT | create INPUT.json | apply PROJECT INPUT.json | backups PROJECT | restore PROJECT INPUT.json | export PROJECT OUTPUT.json | import INPUT.json | schema batch|project|create|render|handoff\nSet absolute MESH_FOUNDRY_DATA_DIR to match the running service. Mutations are JSON files (or - for stdin).",
    );
    return;
  }
  if (command === "schema") {
    const schemas = {
      batch,
      project,
      create: createProject,
      render: renderInput,
      handoff: handoffInput,
    };
    const schema = schemas[pid as keyof typeof schemas];
    if (!schema) throw Error("Unknown schema");
    console.log(JSON.stringify(z.toJSONSchema(schema), null, 2));
    return;
  }
  const runtime = JSON.parse(
    await readFile(join(defaultRoot(), "runtime.json"), "utf8"),
  );
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url))
    throw Error("Invalid service URL");
  async function input(file: string) {
    if (file === "-") {
      let text = "";
      for await (const chunk of process.stdin) text += chunk;
      return JSON.parse(text);
    }
    return JSON.parse(await readFile(resolve(file), "utf8"));
  }
  let route = "",
    method = "GET",
    body;
  if (["render", "handoff"].includes(command)) {
    route = `/projects/${encodeURIComponent(pid)}/${command === "render" ? "renders" : "handoffs"}`;
    method = "POST";
    body = await input(path);
  } else if (command === "cancel-render") {
    route = `/projects/${encodeURIComponent(pid)}/renders/${encodeURIComponent(path)}/cancel`;
    method = "POST";
    body = {};
  } else if (command === "cancel-handoff") {
    route = `/projects/${encodeURIComponent(pid)}/handoffs/${encodeURIComponent(path)}/cancel`;
    method = "POST";
    body = {};
  } else if (command === "send") {
    route = `/projects/${encodeURIComponent(pid)}/handoffs/${encodeURIComponent(path)}/send`;
    method = "POST";
    body = {};
  } else if (command === "renders" || command === "handoffs")
    route = `/projects/${encodeURIComponent(pid)}`;
  else if (command === "list") route = "/projects";
  else if (command === "read") route = `/projects/${encodeURIComponent(pid)}`;
  else if (command === "create") {
    route = "/projects";
    method = "POST";
    body = await input(pid);
  } else if (command === "apply" || command === "restore") {
    route = `/projects/${encodeURIComponent(pid)}/${command}`;
    method = "POST";
    body = await input(path);
  } else if (command === "backups" || command === "export")
    route = `/projects/${encodeURIComponent(pid)}/${command}`;
  else if (command === "import") {
    route = "/import";
    method = "POST";
    body = await input(pid);
  } else throw Error("Unknown command; run help");
  const response = await fetch(runtime.url + "/agent" + route, {
    method,
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Error(JSON.stringify(result));
  if (command === "export") {
    await writeFile(resolve(path), JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(JSON.stringify({ success: true, path: resolve(path) }));
  } else
    console.log(
      JSON.stringify(
        {
          success: true,
          data:
            command === "renders"
              ? result.renderSets
              : command === "handoffs"
                ? result.handoffs
                : result,
        },
        null,
        2,
      ),
    );
}
main().catch((e) => {
  console.error(JSON.stringify({ success: false, error: e.message }));
  process.exitCode = 1;
});
