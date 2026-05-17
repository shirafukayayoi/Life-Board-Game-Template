import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve(process.cwd(), "logs");

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function writeSessionLog({ sessionId, startedAt, endedAt, mode, players, results }) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const filePath = path.join(LOG_DIR, `session_${safeTimestamp()}_${sessionId}.json`);
  const payload = {
    sessionId,
    startedAt,
    endedAt,
    mode,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      faculty: player.faculty,
      resources: player.resources,
      experience: player.experience,
      flags: player.flags,
      badLuckPoints: player.badLuckPoints,
      choiceHistory: player.choiceHistory ?? [],
    })),
    results,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}
