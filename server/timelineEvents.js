import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getChoicePreview } from "./timelineGame.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = path.resolve(__dirname, "..", "data", "events", "timeline.json");

export const TIMELINE_EVENTS = JSON.parse(fs.readFileSync(EVENTS_PATH, "utf8"));

export function getPublicTimelineEvent(event) {
  return {
    id: event.id,
    year: event.year,
    season: event.season,
    label: event.label,
    theme: event.theme,
    description: event.description,
    choices: event.choices.map(getChoicePreview),
  };
}
