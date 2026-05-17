import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = path.resolve(__dirname, "..", "data", "events");

function loadEventJson(fileName, fallback) {
  const filePath = path.join(EVENTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing event data file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export const EVENTS = loadEventJson("main.json");
export const THRESHOLD_EVENTS = loadEventJson("threshold.json");
export const VACATION_POOL = loadEventJson("vacationPool.json", {});
export const RANDOM_POOL = loadEventJson("randomPool.json", {});
export const REFLECTION_GUIDE = loadEventJson("../reflection.json", {});
