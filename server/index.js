import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

import { EVENTS, THRESHOLD_EVENTS } from "./events.js";
import { BOARD, getNextSquareId, meetsCondition } from "./board.js";
import { generateResults } from "./endings.js";

// ═══════════════════════════════════════════════════════════════════
//  Constants & Helpers (mirrored from gameShared.ts)
// ═══════════════════════════════════════════════════════════════════

const PORT = Number(process.env.PORT ?? 4173);
const STATIC_DIR = process.env.STATIC_DIR ?? "dist";

const RESOURCE_KEYS = ["time", "money", "credits", "health"];
const EXPERIENCE_KEYS = ["intellect", "connections", "work_tolerance", "action_power", "romance_exp"];

const RESOURCE_RANGES = {
  time:    { min: 0,  max: 12 },
  money:   { min: -5, max: 99 },
  credits: { min: 0,  max: 130 },
  health:  { min: 0,  max: 12 },
};

const EXPERIENCE_RANGES = {
  intellect:       { min: 0, max: 10 },
  connections:     { min: 0, max: 10 },
  work_tolerance:  { min: 0, max: 10 },
  action_power:    { min: 0, max: 10 },
  romance_exp:     { min: 0, max: 10 },
};

const CREDIT_CHECKPOINTS = {
  4: 20,   // End of Year 1
  8: 50,   // End of Year 2
  12: 80,  // End of Year 3
  16: 110, // Graduation
};

const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
const SEASON_LABELS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

function clampResource(key, value) {
  const r = RESOURCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

function clampExperience(key, value) {
  const r = EXPERIENCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

function diceToSquares(roll) {
  return roll <= 3 ? 1 : 2;
}

function getRoundInfo(round) {
  const clamped = Math.max(1, Math.min(16, round));
  const year = Math.ceil(clamped / 4);
  const season = SEASON_ORDER[(clamped - 1) % 4];
  return {
    round: clamped,
    year,
    season,
    label: `${year}年 ${SEASON_LABELS[season]}`,
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
 * Get the event ID from the board square at a given position.
 * Events in EVENTS are keyed by position ID (e.g. "1", "9A-1").
 */
function getEventForPosition(positionId) {
  // Events are keyed by the square ID directly
  return EVENTS[positionId] ?? null;
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

  // 1. time < 4 AND random < 0.5 -> emergency hospitalization
  if (res.time < 4 && Math.random() < 0.5) {
    result = THRESHOLD_EVENTS["緊急入院"];
  }
  // 2. time < 6 AND random < 0.2 -> ryuunen crisis
  else if (res.time < 6 && Math.random() < 0.2) {
    result = THRESHOLD_EVENTS["留年危機"];
  }
  // 3. money <= -3 -> broke (guaranteed)
  else if (res.money <= -3) {
    result = THRESHOLD_EVENTS["金欠"];
  }
  // 4. has_license AND random < 0.1 -> bike stop
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
 * Returns the appropriate choices array for the player.
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
 * Returns the actual effects applied (after clamping).
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
 * Tracks new true flags in flagHistory.
 */
function applyFlagEffects(player, flagEffects) {
  if (!flagEffects) return;
  for (const [key, value] of Object.entries(flagEffects)) {
    player.flags[key] = value;
    // Track truthy flags in history
    if (value && value !== "none" && !player.flagHistory.includes(key)) {
      player.flagHistory.push(key);
    }
  }
}

/**
 * Apply per-round flag effects at the start of each round.
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
 * Move a player forward by a number of squares on the board.
 */
function movePlayer(player, squaresToMove) {
  let currentPos = player.position;
  for (let i = 0; i < squaresToMove; i++) {
    const nextId = getNextSquareId(currentPos, player);
    if (nextId === null) break; // Already at goal
    currentPos = nextId;
  }
  player.position = currentPos;
}

/**
 * Present the event for the current player's position.
 * Sets state phase to "choosing" and broadcasts show_event.
 */
function presentEvent(player) {
  // Check threshold events first
  let event = checkThresholdEvents(player);

  if (!event) {
    event = getEventForPosition(player.position);
  }

  if (!event) {
    // No event (e.g. at goal) — auto-advance turn
    advanceTurn();
    return;
  }

  // Resolve conditional variants
  const resolvedEvent = resolveEventChoices(event, player);

  // If no choices (branch point / goal), auto-advance
  if (!resolvedEvent.choices || resolvedEvent.choices.length === 0) {
    advanceTurn();
    return;
  }

  // Filter available choices
  const available = filterAvailableChoices(resolvedEvent.choices, player);

  if (available.length === 0) {
    // No choices available — auto-advance
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

  // Build the combined effects that will be reported
  const appliedEffects = { ...choice.effects };

  // Apply base effects
  applyEffects(player, choice.effects);

  // Apply flag effects
  if (choice.flagEffects) {
    applyFlagEffects(player, choice.flagEffects);
  }

  // Handle random chance
  if (choice.randomChance !== undefined) {
    const roll = Math.random();
    if (roll < choice.randomChance) {
      // Bonus
      if (choice.randomBonusEffects && Object.keys(choice.randomBonusEffects).length > 0) {
        applyEffects(player, choice.randomBonusEffects);
        // Merge bonus into applied effects for display
        for (const [k, v] of Object.entries(choice.randomBonusEffects)) {
          appliedEffects[k] = (appliedEffects[k] ?? 0) + v;
        }
      }
    } else {
      // Penalty
      if (choice.randomPenaltyEffects && Object.keys(choice.randomPenaltyEffects).length > 0) {
        applyEffects(player, choice.randomPenaltyEffects);
        // Merge penalty into applied effects for display
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

  // Advance turn
  advanceTurn();
}

/**
 * Advance to the next player's turn, or end the round.
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

    // Skip offline players
    const nextPlayer = state.players.find((p) => p.id === state.turnOrder[nextIndex]);
    if (nextPlayer && !nextPlayer.online) {
      state.completedTurns.push(state.turnOrder[nextIndex]);
      state.turnIndex = nextIndex;
      advanceTurn();
      return;
    }

    state.turnIndex = nextIndex;
    state.phase = "rolling";
    state.lastChoiceResult = null;
    broadcastState();
  }
}

/**
 * End the current round, apply per-round effects, check credit checkpoints.
 */
function endRound() {
  const finishedRound = state.currentRound;
  const roundInfo = getRoundInfo(finishedRound);

  // Check credit checkpoints
  const creditReq = CREDIT_CHECKPOINTS[finishedRound];
  if (creditReq !== undefined) {
    for (const player of state.players) {
      if (player.resources.credits < creditReq) {
        broadcast({
          type: "system",
          message: `${player.name} の単位が不足しています！（${player.resources.credits}/${creditReq}単位）`,
        });
      }
    }
  }

  // Broadcast round end
  broadcast({ type: "round_end", round: finishedRound, roundInfo });

  // Check if game is over (round 16)
  if (finishedRound >= 16) {
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

  // Apply per-round flag effects at end of previous round (not start of new)
  // This way players see costs as a result of their lifestyle, not as a surprise
  // before they can act. Threshold checks happen during turns, after the player
  // has had a chance to earn money/time.
  for (const player of state.players) {
    if (player.online) {
      applyPerRoundFlagEffects(player);
    }
  }

  state.phase = "rolling";
  broadcastState();
}

/**
 * End the game, calculate results, broadcast.
 */
function endGame() {
  const activePlayers = state.players.slice(); // Include all players regardless of online status
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

      // Initialize game state
      state.phase = "rolling";
      state.currentRound = 1;
      state.turnOrder = state.players.map((p) => p.id);
      state.completedTurns = [];
      state.turnIndex = 0;
      state.lastRoll = null;
      state.currentEvent = null;
      state.availableChoiceIds = [];
      state.lastChoiceResult = null;

      // Reset all players
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
      return;
    }

    // ─── player_roll ───────────────────────────────────────────
    if (payload.type === "player_roll") {
      if (client.role !== "controller") return;
      if (state.phase !== "rolling") return;
      if (state.turnOrder.length === 0) return;

      const currentPlayer = getCurrentPlayer();
      if (!currentPlayer || currentPlayer.id !== client.id) return;
      if (!currentPlayer.online) return;

      // Roll dice
      const roll = Math.floor(Math.random() * 6) + 1;
      const squaresToMove = diceToSquares(roll);

      // Move player
      movePlayer(currentPlayer, squaresToMove);
      currentPlayer.lastRoll = roll;

      state.lastRoll = {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        value: roll,
        squaresAdvanced: squaresToMove,
      };

      // Present event for the new position
      presentEvent(currentPlayer);
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
