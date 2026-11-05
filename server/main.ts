import { start } from "./app.js";
start().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
