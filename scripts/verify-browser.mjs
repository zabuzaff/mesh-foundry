import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4322/proof.html");
  await page.waitForFunction(() => window.proof?.ready || window.proof?.error);
  const info = await page.evaluate(() => window.proof);
  assert(!info.error, info.error);
  assert(info.skinned > 0);
  assert(info.height > 1.5 && info.height < 2.1);
  const motion = await page.evaluate(() =>
    Object.fromEntries(
      ["neutral", "walk", "fishing_idle"].map((name) => {
        const a = window.sampleProof(name, 0),
          b = window.sampleProof(name, 0.5),
          end = window.sampleProof(name, 2);
        return [
          name,
          {
            movement: Math.max(...a.map((v, i) => Math.abs(v - b[i]))),
            loopDelta: Math.max(...a.map((v, i) => Math.abs(v - end[i]))),
          },
        ];
      }),
    ),
  );
  assert(motion.walk.movement > 0.02);
  assert(motion.fishing_idle.movement > 0.001);
  assert(motion.neutral.movement < 0.0001);
  for (const m of Object.values(motion)) assert(m.loopDelta < 0.001);
  await page.selectOption("#clip", "walk");
  await page.waitForTimeout(350);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/proof-walk.png" });
  await page.click("#variant");
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.startsWith("Edited"),
  );
  await page.selectOption("#clip", "fishing_idle");
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/proof-fishing.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/browser-check.json",
    JSON.stringify({ info, motion, errors }, null, 2),
  );
  console.log({ info, motion, errors });
} finally {
  await browser.close();
}
