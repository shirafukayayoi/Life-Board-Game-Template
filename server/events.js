import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = path.resolve(__dirname, "..", "data", "events");

function loadEventJson(fileName) {
  const filePath = path.join(EVENTS_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export const EVENTS = loadEventJson("main.json");
export const THRESHOLD_EVENTS = loadEventJson("threshold.json");
