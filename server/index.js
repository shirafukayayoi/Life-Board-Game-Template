import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

import { EVENTS, THRESHOLD_EVENTS } from "./events.js";
import { meetsCondition } from "./board.js";
import { generateResults } from "./endings.js";

// ═══════════════════════════════════════════════════════════════════
//  Constants & Helpers
// ═══════════════════════════════════════════════════════════════════

const PORT = Number(process.env.PORT ?? 4173);
const STATIC_DIR = process.env.STATIC_DIR ?? "dist";

const RESOURCE_KEYS = ["time", "money", "credits", "health"];
const EXPERIENCE_KEYS = ["intellect", "connections", "work_tolerance", "action_power", "romance_exp"];

const RESOURCE_RANGES = {
  time:    { min: 0,  max: 12 },
  money:   { min: -5, max: 99 },
  credits: { min: 0,  max: 160 },
  health:  { min: 0,  max: 12 },
};

const EXPERIENCE_RANGES = {
  intellect:       { min: 0, max: 10 },
  connections:     { min: 0, max: 10 },
  work_tolerance:  { min: 0, max: 10 },
  action_power:    { min: 0, max: 10 },
  romance_exp:     { min: 0, max: 10 },
};

/**
 * Credit checkpoints — all are WARNING ONLY (no penalty).
 * Key = last month of that year (end-of-year check).
 * Month 47 is the single graduation check (handled separately in endRound).
 */
const CREDIT_CHECKPOINTS = {
  12: 25,  // End of Year 1 — warning if below
  24: 55,  // End of Year 2 — warning if below
  36: 90,  // End of Year 3 — warning if below
};

const GRADUATION_REQUIRED = 124; // Month 47 留年判定ライン
const TOTAL_ROUNDS = 48;

/** Month names indexed 0-11 → [4月, 5月, ..., 3月] */
const MONTH_NAMES = ["4月","5月","6月","7月","8月","9月","10月","11月","12月","1月","2月","3月"];

function clampResource(key, value) {
  const r = RESOURCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

function clampExperience(key, value) {
  const r = EXPERIENCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

/**
 * Returns display info for a given round (1-48).
 * 1ラウンド = 1ヶ月 = 大学1年4月〜4年3月
 */
function getRoundInfo(round) {
  const clamped = Math.max(1, Math.min(TOTAL_ROUNDS, round));
  const year = Math.ceil(clamped / 12);
  const monthIndex = (clamped - 1) % 12;
  const monthName = MONTH_NAMES[monthIndex];
  return {
    round: clamped,
    year,
    monthIndex,
    label: `${year}年生 ${monthName}`,
  };
}

function defaultResources() {
  return { time: 10, money: 3, credits: 0, health: 10 };
}

function defaultExperience() {
  return { intellect: 1, connections: 1, work_tolerance: 0, action_power: 1, romance_exp: 0 };
}

function defaultFlags() {
  return {
    living_alone: false,
    has_partner: false,
    has_license: false,
    studying_abroad: false,
    on_leave: false,
    in_seminar: false,
    teaching_cert: false,
    club_type: null,
    job_type: null,
  };
}

function defaultGameState() {
  return {
    phase: "lobby",
    currentRound: 1,
    players: [],
    turnIndex: 0,
    turnOrder: [],
    completedTurns: [],
    lastRoll: null,
    currentEvent: null,
    availableChoiceIds: [],
    lastChoiceResult: null,
    /** Track which players already had a threshold event this round */
    thresholdFiredThisRound: new Set(),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  Server Setup
// ═══════════════════════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** @type {string | null} */
let hostId = null;
let state = defaultGameState();

/** @type {Map<import('ws').WebSocket, {id: string|null, role: string|null, name: string|null}>} */
const sockets = new Map();

// ═══════════════════════════════════════════════════════════════════
//  Network Helpers
// ═══════════════════════════════════════════════════════════════════

function getHostUrls() {
  const urls = new Set([`http://localhost:${PORT}`]);
  const nets = os.networkInterfaces();
  Object.values(nets).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.add(`http://${entry.address}:${PORT}`);
      }
    });
  });
  return Array.from(urls);
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const socket of sockets.keys()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

function broadcastState() {
  broadcast({ type: "state", state });
}

function broadcastNavigate(url, targetRoles) {
  const message = JSON.stringify({ type: "navigate", url, targetRoles });
  for (const [socket, client] of sockets.entries()) {
    if (socket.readyState !== socket.OPEN) continue;
    if (!targetRoles.includes(client.role)) continue;
    socket.send(message);
  }
}

function sendTo(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Player Management
// ═══════════════════════════════════════════════════════════════════

function addOrRestorePlayer(clientId, name) {
  const existingIndex = state.players.findIndex((p) => p.id === clientId);
  if (existingIndex !== -1) {
    state.players[existingIndex] = {
      ...state.players[existingIndex],
      name,
      online: true,
    };
    return clientId;
  }

  const player = {
    id: clientId,
    name,
    resources: defaultResources(),
    experience: defaultExperience(),
    flags: defaultFlags(),
    position: "1",
    lastRoll: undefined,
    online: true,
    flagHistory: [],
  };
  state.players.push(player);
  return clientId;
}

function markOffline(clientId) {
  const index = state.players.findIndex((p) => p.id === clientId);
  if (index === -1) return;
  state.players[index] = { ...state.players[index], online: false };
}

// ═══════════════════════════════════════════════════════════════════
//  Game Logic Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the event for the current round number.
 * Events in EVENTS are now keyed by round number string (e.g. "1", "12", "48").
 */
function getEventForRound(round) {
  return EVENTS[String(round)] ?? null;
}

/**
 * Check threshold events in priority order.
 * Returns an overriding event or null.
 */
function checkThresholdEvents(player) {
  // One threshold event per player per round max
  if (state.thresholdFiredThisRound.has(player.id)) {
    return null;
  }

  const res = player.resources;
  let result = null;

  // 1. time < 4 AND random < 0.5 → 緊急入院
  if (res.time < 4 && Math.random() < 0.5) {
    result = THRESHOLD_EVENTS["緊急入院"];
  }
  // 2. time < 6 AND random < 0.2 → 留年危機
  else if (res.time < 6 && Math.random() < 0.2) {
    result = THRESHOLD_EVENTS["留年危機"];
  }
  // 3. money <= -3 → 金欠 (guaranteed)
  else if (res.money <= -3) {
    result = THRESHOLD_EVENTS["金欠"];
  }
  // 4. has_license AND random < 0.1 → 無灯火運転
  else if (player.flags.has_license && Math.random() < 0.1) {
    result = THRESHOLD_EVENTS["無灯火運転"];
  }

  if (result) {
    state.thresholdFiredThisRound.add(player.id);
  }
  return result;
}

/**
 * Resolve the event choices considering conditional variants.
 */
function resolveEventChoices(event, player) {
  if (event.conditionalVariants) {
    for (const variant of event.conditionalVariants) {
      if (meetsCondition(player, variant.condition)) {
        return {
          ...event,
          description: variant.description ?? event.description,
          choices: variant.choices,
        };
      }
    }
  }
  return event;
}

/**
 * Filter choices by their conditions against the player.
 */
function filterAvailableChoices(choices, player) {
  return choices.filter((choice) => {
    if (!choice.condition) return true;
    return meetsCondition(player, choice.condition);
  });
}

/**
 * Apply stat effects to a player. Mutates the player object.
 */
function applyEffects(player, effects) {
  if (!effects) return;
  for (const key of RESOURCE_KEYS) {
    if (effects[key] !== undefined) {
      player.resources[key] = clampResource(key, player.resources[key] + effects[key]);
    }
  }
  for (const key of EXPERIENCE_KEYS) {
    if (effects[key] !== undefined) {
      player.experience[key] = clampExperience(key, player.experience[key] + effects[key]);
    }
  }
}

/**
 * Apply flag effects to a player. Mutates the player object.
 */
function applyFlagEffects(player, flagEffects) {
  if (!flagEffects) return;
  for (const [key, value] of Object.entries(flagEffects)) {
    player.flags[key] = value;
    if (value && value !== "none" && !player.flagHistory.includes(key)) {
      player.flagHistory.push(key);
    }
  }
}

/**
 * Apply per-quarter flag effects (every 3 rounds).
 * This keeps balance equivalent to the original 4-seasons-per-year model.
 */
function applyPerRoundFlagEffects(player) {
  if (player.flags.living_alone) {
    player.resources.money = clampResource("money", player.resources.money - 1);
  }
  if (player.flags.has_partner) {
    player.resources.time = clampResource("time", player.resources.time - 1);
    player.resources.health = clampResource("health", player.resources.health + 1);
  }
  if (player.flags.teaching_cert) {
    player.resources.time = clampResource("time", player.resources.time - 1);
  }
}

/**
 * Get the current player whose turn it is.
 */
function getCurrentPlayer() {
  if (state.turnOrder.length === 0) return null;
  const playerId = state.turnOrder[state.turnIndex];
  return state.players.find((p) => p.id === playerId) ?? null;
}

/**
 * Present the event for a given player at the current round.
 * Sets state phase to "choosing" and broadcasts show_event.
 */
function presentEvent(player) {
  // Check threshold events first
  let event = checkThresholdEvents(player);

  if (!event) {
    event = getEventForRound(state.currentRound);
  }

  if (!event) {
    // No event for this round — auto-advance turn
    advanceTurn();
    return;
  }

  // Resolve conditional variants
  const resolvedEvent = resolveEventChoices(event, player);

  // If no choices, auto-advance
  if (!resolvedEvent.choices || resolvedEvent.choices.length === 0) {
    advanceTurn();
    return;
  }

  // Filter available choices
  const available = filterAvailableChoices(resolvedEvent.choices, player);

  if (available.length === 0) {
    advanceTurn();
    return;
  }

  const availableIds = available.map((c) => c.id);

  state.phase = "choosing";
  state.currentEvent = resolvedEvent;
  state.availableChoiceIds = availableIds;

  broadcast({
    type: "show_event",
    event: resolvedEvent,
    availableChoiceIds: availableIds,
    playerId: player.id,
  });
  broadcastState();
}

/**
 * Process a player's choice.
 */
function processChoice(player, choiceId) {
  const event = state.currentEvent;
  if (!event) return;

  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return;

  const appliedEffects = { ...choice.effects };

  applyEffects(player, choice.effects);

  if (choice.flagEffects) {
    applyFlagEffects(player, choice.flagEffects);
  }

  if (choice.randomChance !== undefined) {
    const roll = Math.random();
    if (roll < choice.randomChance) {
      if (choice.randomBonusEffects && Object.keys(choice.randomBonusEffects).length > 0) {
        applyEffects(player, choice.randomBonusEffects);
        for (const [k, v] of Object.entries(choice.randomBonusEffects)) {
          appliedEffects[k] = (appliedEffects[k] ?? 0) + v;
        }
      }
    } else {
      if (choice.randomPenaltyEffects && Object.keys(choice.randomPenaltyEffects).length > 0) {
        applyEffects(player, choice.randomPenaltyEffects);
        for (const [k, v] of Object.entries(choice.randomPenaltyEffects)) {
          appliedEffects[k] = (appliedEffects[k] ?? 0) + v;
        }
      }
    }
  }

  const result = {
    playerId: player.id,
    playerName: player.name,
    choiceId: choice.id,
    choiceLabel: choice.label,
    effects: appliedEffects,
    flagEffects: choice.flagEffects,
  };

  state.lastChoiceResult = result;
  broadcast({ type: "choice_result", result });

  advanceTurn();
}

/**
 * Advance to the next player's turn, or end the round.
 * In the new fixed-progression system there is no "rolling" phase —
 * the next player's event is presented immediately.
 */
function advanceTurn() {
  const currentPlayerId = state.turnOrder[state.turnIndex];
  if (currentPlayerId && !state.completedTurns.includes(currentPlayerId)) {
    state.completedTurns.push(currentPlayerId);
  }

  // Clear event state
  state.currentEvent = null;
  state.availableChoiceIds = [];

  // Check if all players have completed their turn this round
  const allDone = state.turnOrder.every((id) => state.completedTurns.includes(id));

  if (allDone) {
    endRound();
  } else {
    // Find next player who hasn't completed their turn
    let nextIndex = (state.turnIndex + 1) % state.turnOrder.length;
    let attempts = 0;
    while (state.completedTurns.includes(state.turnOrder[nextIndex]) && attempts < state.turnOrder.length) {
      nextIndex = (nextIndex + 1) % state.turnOrder.length;
      attempts++;
    }

    state.turnIndex = nextIndex;
    state.lastChoiceResult = null;

    const nextPlayer = state.players.find((p) => p.id === state.turnOrder[nextIndex]);

    // Skip offline players
    if (nextPlayer && !nextPlayer.online) {
      state.completedTurns.push(state.turnOrder[nextIndex]);
      advanceTurn();
      return;
    }

    broadcastState();

    // Auto-present event for the next player (no dice roll needed)
    if (nextPlayer) {
      presentEvent(nextPlayer);
    }
  }
}

/**
 * End the current round, apply quarterly flag effects, check credit checkpoints.
 */
function endRound() {
  const finishedRound = state.currentRound;
  const roundInfo = getRoundInfo(finishedRound);

  // Apply per-quarter lifestyle flag effects (every 3 months)
  if (finishedRound % 3 === 0) {
    for (const player of state.players) {
      if (player.online) {
        applyPerRoundFlagEffects(player);
      }
    }
  }

  // Check credit checkpoints (warning only — no penalty)
  const creditWarnThreshold = CREDIT_CHECKPOINTS[finishedRound];
  if (creditWarnThreshold !== undefined) {
    for (const player of state.players) {
      if (player.resources.credits < creditWarnThreshold) {
        broadcast({
          type: "system",
          message: `⚠️ ${player.name} の単位が少ない！（${player.resources.credits}/${creditWarnThreshold}単位）ペナルティはありませんが注意！`,
        });
      }
    }
  }

  // Month 47: Graduation check — 留年判定（唯一）
  if (finishedRound === 47) {
    for (const player of state.players) {
      if (player.resources.credits < GRADUATION_REQUIRED) {
        broadcast({
          type: "system",
          message: `🔄 ${player.name} は単位不足で留年が確定しました（${player.resources.credits}/${GRADUATION_REQUIRED}単位）`,
        });
      } else {
        broadcast({
          type: "system",
          message: `🎓 ${player.name} の卒業が確定しました！（${player.resources.credits}/${GRADUATION_REQUIRED}単位）`,
        });
      }
    }
  }

  // Broadcast round end
  broadcast({ type: "round_end", round: finishedRound, roundInfo });

  // Check if game is over (round 48)
  if (finishedRound >= TOTAL_ROUNDS) {
    endGame();
    return;
  }

  // Start next round
  state.currentRound = finishedRound + 1;
  state.completedTurns = [];
  state.thresholdFiredThisRound = new Set();
  state.turnIndex = 0;
  state.lastRoll = null;
  state.lastChoiceResult = null;
  state.currentEvent = null;
  state.availableChoiceIds = [];

  broadcastState();

  // Auto-present event for first player (no dice roll)
  const firstPlayer = state.players.find((p) => p.id === state.turnOrder[0]);
  if (firstPlayer && firstPlayer.online) {
    presentEvent(firstPlayer);
  }
}

/**
 * End the game, calculate results, broadcast.
 */
function endGame() {
  const activePlayers = state.players.slice();
  const results = generateResults(activePlayers);

  state.phase = "result";
  state.currentEvent = null;
  state.availableChoiceIds = [];
  state.lastChoiceResult = null;

  broadcast({ type: "game_result", results });
  broadcastState();
}

// ═══════════════════════════════════════════════════════════════════
//  WebSocket Connection Handler
// ═══════════════════════════════════════════════════════════════════

wss.on("connection", (socket) => {
  sockets.set(socket, { id: null, role: null, name: null });

  socket.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ─── join ──────────────────────────────────────────────────
    if (payload.type === "join") {
      const role = payload.role;
      const requestedId = typeof payload.clientId === "string" ? payload.clientId : null;
      const name = typeof payload.name === "string" ? payload.name : "Guest";

      let clientId = requestedId ?? randomUUID();

      if (role === "controller") {
        const knownPlayer = requestedId
          ? state.players.find((p) => p.id === requestedId)
          : null;
        if (!knownPlayer && requestedId) {
          clientId = randomUUID();
        }
        addOrRestorePlayer(clientId, name);
      } else {
        if (!clientId) {
          clientId = randomUUID();
        }
      }

      sockets.set(socket, { id: clientId, role, name });

      if (role === "host") {
        hostId = clientId;
      }

      sendTo(socket, {
        type: "welcome",
        clientId,
        hostId,
        urls: role === "host" ? getHostUrls() : undefined,
      });
      broadcastState();
      return;
    }

    const client = sockets.get(socket);
    if (!client?.id) return;

    // ─── start_game ────────────────────────────────────────────
    if (payload.type === "start_game") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.players.length === 0) return;

      state.phase = "choosing";
      state.currentRound = 1;
      state.turnOrder = state.players.map((p) => p.id);
      state.completedTurns = [];
      state.turnIndex = 0;
      state.lastRoll = null;
      state.currentEvent = null;
      state.availableChoiceIds = [];
      state.lastChoiceResult = null;

      for (const player of state.players) {
        player.resources = defaultResources();
        player.experience = defaultExperience();
        player.flags = defaultFlags();
        player.position = "1";
        player.lastRoll = undefined;
        player.flagHistory = [];
      }

      broadcastState();
      broadcastNavigate("/controller-play.html", ["controller"]);

      // Auto-present first event (no dice roll in new system)
      const firstPlayer = state.players.find((p) => p.id === state.turnOrder[0]);
      if (firstPlayer && firstPlayer.online) {
        presentEvent(firstPlayer);
      }
      return;
    }

    // ─── player_choice ─────────────────────────────────────────
    if (payload.type === "player_choice") {
      if (client.role !== "controller") return;
      if (state.phase !== "choosing") return;

      const currentPlayer = getCurrentPlayer();
      if (!currentPlayer || currentPlayer.id !== client.id) return;

      const choiceId = payload.choiceId;
      if (!state.availableChoiceIds.includes(choiceId)) return;

      processChoice(currentPlayer, choiceId);
      return;
    }

    // ─── request_state ─────────────────────────────────────────
    if (payload.type === "request_state") {
      sendTo(socket, { type: "state", state });
      return;
    }
  });

  socket.on("close", () => {
    const client = sockets.get(socket);
    sockets.delete(socket);
    if (!client?.id) return;

    if (client.role === "controller") {
      markOffline(client.id);
    }

    if (client.role === "host" && client.id === hostId) {
      hostId = null;
      state = defaultGameState();
      broadcast({
        type: "system",
        message: "ホストが切断されました。ロビーに戻ります。",
      });
    }

    broadcastState();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Static File Serving
// ═══════════════════════════════════════════════════════════════════

if (fs.existsSync(path.join(process.cwd(), STATIC_DIR))) {
  app.use(express.static(STATIC_DIR));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(process.cwd(), STATIC_DIR, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send("<h1>Campus Life Game Server</h1><p>Run npm run build first.</p>");
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const urls = getHostUrls();
  if (urls.length > 1) {
    console.log("Also available at:");
    urls.filter((u) => !u.includes("localhost")).forEach((u) => console.log(`  ${u}`));
  }
});
