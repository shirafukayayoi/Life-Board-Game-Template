import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostSource = readFileSync(join(repoRoot, "src/pages/host.tsx"), "utf8");

test("host lobby exposes one player-facing start action", () => {
  assert.match(hostSource, /ゲームを開始/);
  assert.doesNotMatch(hostSource, /人生マップで開始/);
  assert.doesNotMatch(hostSource, /48か月ボードで開始/);
});
