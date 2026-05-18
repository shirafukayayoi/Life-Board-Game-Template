import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

import { EVENTS, RANDOM_POOL, REFLECTION_GUIDE, THRESHOLD_EVENTS, VACATION_POOL } from "./events.js";
import { BOARD, getNextSquareId, meetsCondition } from "./board.js";
import { generateResults } from "./endings.js";
import { TIMELINE_EVENTS, getPublicTimelineEvent } from "./timelineEvents.js";
import {
  buildLifeMap,
  getPublicLifeMapSquares,
  getRouteSquareId,
  getSeasonHubSquareId,
} from "./lifeMap.js";
import {
  applyTimelineChoice,
  createTimelinePlayer,
  generateTimelineResults,
  getVisibleStatEffects,
  normalizeChoiceEffects,
} from "./timelineGame.js";
import { writeSessionLog } from "./sessionLogger.js";

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

const BOARD_FINAL_ROUND = 48;
const CREDIT_CHECKPOINTS = {
  12: 30,  // End of Year 1
  24: 62,  // End of Year 2
  36: 96,  // End of Year 3
  48: 124, // Graduation
};

const SEASON_LABELS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const ACADEMIC_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const FACULTIES = new Set(["humanities", "science", "education", "medical", "arts_sports"]);
const VACATION_MONTHS = new Map([
  [5, "summer"],
  [11, "spring"],
  [12, "spring"],
  [17, "summer"],
  [23, "spring"],
  [24, "spring"],
  [29, "summer"],
  [35, "spring"],
]);
const RANDOM_EVENT_MONTHS = new Set([15, 18, 26, 40]);
const LIFE_MAP = buildLifeMap(TIMELINE_EVENTS);
const PUBLIC_LIFE_MAP_SQUARES = getPublicLifeMapSquares(LIFE_MAP);

function clampResource(key, value) {
  const r = RESOURCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

function clampExperience(key, value) {
  const r = EXPERIENCE_RANGES[key];
  return Math.max(r.min, Math.min(r.max, value));
}

function diceToSquares(roll) {
  return roll;
}

function monthToSeason(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function getRoundInfo(round) {
  const clamped = Math.max(1, Math.min(BOARD_FINAL_ROUND, round));
  const year = Math.ceil(clamped / 12);
  const month = ACADEMIC_MONTHS[(clamped - 1) % 12];
  const season = monthToSeason(month);
  return {
    round: clamped,
    year,
    season,
    label: `${year}年 ${month}月（${SEASON_LABELS[season]}）`,
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
    cheating: false,
    career_path: null,
    career_failed: false,
    club_type: null,
    job_type: null,
  };
}

function defaultGameState() {
  return {
    mode: "board",
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
    fallbackMode: false,
    startedAt: null,
    turnStartedAt: null,
    roundDurations: [],
    /** Track which players already had a threshold event this round */
    thresholdFiredThisRound: new Set(),
    currentSeasonIndex: 0,
    lifePlayers: [],
    lifeMapSquares: [],
    lifePlayerPositions: {},
    lifePlayerRoutes: {},
    pendingLifeChoices: {},
    pendingLifeResults: {},
    currentChoiceMode: "sequential",
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
let sessionId = null;
let sessionStartedAtIso = null;

/** @type {Map<import('ws').WebSocket, {id: string|null, role: string|null, name: string|null}>} */
const sockets = new Map();
/** @type {Map<string, {name: string, passkey: string}>} */
const playerAuth = new Map();

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

function sendHostPlayerManagement() {
  const players = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    faculty: player.faculty,
    passkey: playerAuth.get(player.id)?.passkey ?? "",
    online: player.online,
  }));

  for (const [socket, client] of sockets.entries()) {
    if (socket.readyState !== socket.OPEN || client.role !== "host") continue;
    sendTo(socket, { type: "host_player_management", players });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Player Management
// ═══════════════════════════════════════════════════════════════════

function generatePasskey() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizeFaculty(value) {
  return FACULTIES.has(value) ? value : "humanities";
}

function createPlayer(clientId, name, faculty) {
  const player = {
    id: clientId,
    name,
    faculty,
    resources: defaultResources(),
    experience: defaultExperience(),
    flags: defaultFlags(),
    position: "1",
    lastRoll: undefined,
    online: true,
    badLuckPoints: 0,
    flagHistory: [],
    choiceHistory: [],
  };
  state.players.push(player);
  return player;
}

function addOrRestorePlayer(clientId, name, faculty = "humanities") {
  const existingIndex = state.players.findIndex((p) => p.id === clientId);
  if (existingIndex !== -1) {
    state.players[existingIndex] = {
      ...state.players[existingIndex],
      name,
      faculty,
      online: true,
    };
    return clientId;
  }

  createPlayer(clientId, name, faculty);
  return clientId;
}

function registerOrRestorePlayer({ requestedId, name, passkey, faculty }) {
  const normalizedFaculty = normalizeFaculty(faculty);
  if (requestedId) {
    const existing = state.players.find((p) => p.id === requestedId);
    if (existing) {
      const auth = playerAuth.get(requestedId);
      if (auth?.passkey && auth.passkey !== passkey) {
        return { error: "パスキーが一致しません。" };
      }
      addOrRestorePlayer(requestedId, name, existing.faculty ?? normalizedFaculty);
      if (!auth) {
        playerAuth.set(requestedId, { name, passkey: generatePasskey() });
      } else {
        playerAuth.set(requestedId, { ...auth, name });
      }
      return { clientId: requestedId, passkey: playerAuth.get(requestedId).passkey };
    }
  }

  if (passkey) {
    const matched = state.players.find((player) => {
      const auth = playerAuth.get(player.id);
      return player.name === name && auth?.passkey === passkey;
    });
    if (matched) {
      addOrRestorePlayer(matched.id, name, matched.faculty);
      return { clientId: matched.id, passkey };
    }

    if (state.players.some((player) => player.name === name)) {
      return { error: "名前またはパスキーが一致しません。" };
    }
  }

  const clientId = randomUUID();
  const issuedPasskey = generatePasskey();
  createPlayer(clientId, name, normalizedFaculty);
  playerAuth.set(clientId, { name, passkey: issuedPasskey });
  return { clientId, passkey: issuedPasskey };
}

function addPlayerToActiveGame(clientId) {
  const player = state.players.find((p) => p.id === clientId);
  if (!player || state.phase === "lobby" || state.phase === "result") return;

  if (!state.turnOrder.includes(clientId)) {
    state.turnOrder.push(clientId);
  }

  if (state.mode !== "life_map") return;

  if (!state.lifePlayers.some((lifePlayer) => lifePlayer.id === clientId)) {
    state.lifePlayers.push(createTimelinePlayer(player.id, player.name));
  }
  if (state.lifeMapSquares.length === 0) {
    state.lifeMapSquares = PUBLIC_LIFE_MAP_SQUARES;
  }

  const currentTimelineEvent = getCurrentTimelineEvent();
  const joinSquareId = currentTimelineEvent
    ? getSeasonHubSquareId(currentTimelineEvent)
    : LIFE_MAP.startSquareId;

  const existingPosition = state.lifePlayerPositions[clientId];
  state.lifePlayerPositions = {
    ...state.lifePlayerPositions,
    [clientId]: existingPosition ?? joinSquareId,
  };
  state.lifePlayerRoutes = {
    ...state.lifePlayerRoutes,
    [clientId]: state.lifePlayerRoutes[clientId] ?? [],
  };
}

function markOffline(clientId) {
  const index = state.players.findIndex((p) => p.id === clientId);
  if (index === -1) return;
  state.players[index] = { ...state.players[index], online: false };
}

function removePlayer(playerId) {
  const removedPlayer = state.players.find((p) => p.id === playerId);
  if (!removedPlayer) return null;

  for (const [socket, client] of sockets.entries()) {
    if (client.role !== "controller" || client.id !== playerId) continue;
    sendTo(socket, {
      type: "player_removed",
      playerId,
      playerName: removedPlayer.name,
    });
  }

  state.players = state.players.filter((p) => p.id !== playerId);
  playerAuth.delete(playerId);
  state.turnOrder = state.turnOrder.filter((id) => id !== playerId);
  state.completedTurns = state.completedTurns.filter((id) => id !== playerId);
  state.thresholdFiredThisRound.delete(playerId);
  state.lifePlayers = state.lifePlayers.filter((p) => p.id !== playerId);

  const pendingLifeChoices = { ...state.pendingLifeChoices };
  const lifePlayerPositions = { ...state.lifePlayerPositions };
  const lifePlayerRoutes = { ...state.lifePlayerRoutes };
  delete pendingLifeChoices[playerId];
  delete lifePlayerPositions[playerId];
  delete lifePlayerRoutes[playerId];
  state.pendingLifeChoices = pendingLifeChoices;
  state.lifePlayerPositions = lifePlayerPositions;
  state.lifePlayerRoutes = lifePlayerRoutes;

  if (state.players.length === 0) {
    state = defaultGameState();
    return removedPlayer;
  }

  if (state.turnOrder.length === 0) {
    state.phase = "lobby";
    state.turnIndex = 0;
    state.currentEvent = null;
    state.availableChoiceIds = [];
    state.lastChoiceResult = null;
    return removedPlayer;
  }

  if (state.turnIndex >= state.turnOrder.length) {
    state.turnIndex = 0;
  }

  if (state.mode !== "life_map") {
    const currentPlayerStillExists = state.turnOrder[state.turnIndex] !== undefined;
    if (!currentPlayerStillExists || state.phase === "choosing") {
      state.phase = "rolling";
      state.currentEvent = null;
      state.availableChoiceIds = [];
      state.lastChoiceResult = null;
    }
  } else {
    tryAdvanceTimelineEvent();
  }

  return removedPlayer;
}

// ═══════════════════════════════════════════════════════════════════
//  Game Logic Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the event ID from the board square at a given position.
 * Events in EVENTS are keyed by position ID (e.g. "1", "9A-1").
 */
function getEventForPosition(positionId) {
  const month = Number(positionId);
  if (VACATION_MONTHS.has(month)) {
    return buildVacationEvent(month) ?? EVENTS[positionId] ?? null;
  }
  if (RANDOM_EVENT_MONTHS.has(month)) {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer) {
      return pickRandomPoolEvent(currentPlayer) ?? EVENTS[positionId] ?? null;
    }
  }
  // Events are keyed by the square ID directly
  return EVENTS[positionId] ?? null;
}

function eventListFromPool(pool) {
  return Array.isArray(pool) ? pool : Object.values(pool ?? {});
}

function choiceFromPoolItem(item, index) {
  if (item.choices?.length) {
    return item.choices.map((choice, choiceIndex) => ({
      ...choice,
      id: `${item.id ?? `pool_${index}`}:${choice.id ?? choiceIndex}`,
      label: item.title ?? choice.label,
      description: choice.description ?? item.description,
      storyTags: choice.storyTags ?? item.storyTags,
      polarity: choice.polarity ?? item.polarity,
      badLuckDelta: choice.badLuckDelta ?? item.badLuckDelta,
    }));
  }
  return [{
    id: item.id ?? `pool_${index}`,
    label: item.title ?? `Route ${index + 1}`,
    description: item.description,
    effects: item.effects ?? {},
    flagEffects: item.flagEffects ?? item.setFlags,
    condition: item.condition,
    tone: item.tone,
    preview: item.preview,
    storyTags: item.storyTags,
    polarity: item.polarity,
    badLuckDelta: item.badLuckDelta,
  }];
}

function buildVacationEvent(month) {
  const vacationType = VACATION_MONTHS.get(month);
  const currentPlayer = getCurrentPlayer();
  if (!currentPlayer || !vacationType) return null;

  const routeChoices = eventListFromPool(VACATION_POOL)
    .filter((item) => {
      const contextualPlayer = { ...currentPlayer, currentRound: state.currentRound };
      const itemType = item.vacationType ?? item.type ?? item.season;
      if (itemType && itemType !== vacationType && itemType !== "both") return false;
      if (item.condition && !meetsCondition(contextualPlayer, item.condition)) return false;
      return true;
    })
    .flatMap(choiceFromPoolItem)
    .filter((choice) => !choice.condition || meetsCondition({ ...currentPlayer, currentRound: state.currentRound }, choice.condition));

  if (routeChoices.length === 0) return null;

  return {
    id: String(month),
    title: vacationType === "summer" ? "夏休みの過ごし方" : "春休みの過ごし方",
    description: "自由な時間をどう使うかで、次の学期の景色が変わる。",
    year: Math.ceil(month / 12),
    category: "vacation",
    pool: "vacation",
    vacationType,
    choices: routeChoices,
  };
}

function pickWeighted(items, getWeight) {
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (total <= 0) return items[0] ?? null;
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Math.max(0, getWeight(item));
    if (cursor <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

function pickRandomPoolEvent(player) {
  const contextualPlayer = { ...player, currentRound: state.currentRound };
  const available = eventListFromPool(RANDOM_POOL).filter((event) => {
    if (event.condition && !meetsCondition(contextualPlayer, event.condition)) return false;
    return true;
  });
  const selected = pickWeighted(available, (event) => {
    const baseWeight = Number(event.weight ?? 1);
    if (event.polarity === "positive") {
      return baseWeight * (1 + 0.3 * Math.max(0, player.badLuckPoints ?? 0));
    }
    return baseWeight;
  });
  return selected ? { ...selected, pool: "random" } : null;
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
  const contextualPlayer = { ...player, currentRound: state.currentRound };
  if (event.conditionalVariants) {
    for (const variant of event.conditionalVariants) {
      if (meetsCondition(contextualPlayer, variant.condition)) {
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
  const contextualPlayer = { ...player, currentRound: state.currentRound };
  return choices.filter((choice) => {
    if (!choice.condition) return true;
    return meetsCondition(contextualPlayer, choice.condition);
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
  if (state.currentRound % 3 !== 0) return;

  if (player.flags.living_alone) {
    player.resources.money = clampResource("money", player.resources.money - 1);
    player.experience.action_power = clampExperience(
      "action_power",
      player.experience.action_power + 0.3,
    );
  }
  if (player.flags.has_partner) {
    player.resources.time = clampResource("time", player.resources.time - 1);
    player.resources.health = clampResource("health", player.resources.health + 1);
  }
  if (player.flags.teaching_cert) {
    player.resources.time = clampResource("time", player.resources.time - 1);
  }
  if (player.faculty === "medical") {
    player.resources.health = clampResource("health", player.resources.health - 1);
    player.experience.intellect = clampExperience("intellect", player.experience.intellect + 0.5);
  }
  if (player.faculty === "science") {
    player.experience.intellect = clampExperience("intellect", player.experience.intellect + 0.3);
  }
}

function calcRomanceChance(player) {
  const base = 0.3;
  const bonus = (player.experience.romance_exp * 0.05)
    + (player.experience.connections * 0.03);
  return Math.min(base + bonus, 0.85);
}

function mergeEffects(target, effects) {
  if (!effects) return;
  for (const [key, value] of Object.entries(effects)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function effectsPolarity(effects) {
  const values = Object.entries(effects ?? {})
    .filter(([key]) => key !== "credits")
    .map(([, value]) => Number(value));
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum > 0) return "positive";
  if (sum < 0) return "negative";
  return "mixed";
}

function updateBadLuck(player, event, choice, appliedEffects) {
  if (typeof choice.badLuckDelta === "number") {
    player.badLuckPoints = Math.max(0, (player.badLuckPoints ?? 0) + choice.badLuckDelta);
    return;
  }

  const polarity = choice.polarity ?? event.polarity ?? effectsPolarity(appliedEffects);
  if (polarity === "negative") {
    player.badLuckPoints = (player.badLuckPoints ?? 0) + 1;
    return;
  }
  if (polarity === "positive") {
    player.badLuckPoints = Math.max(0, (player.badLuckPoints ?? 0) - 1);
  }
}

function resolveReflectionForResult(result) {
  const endingId = result.ending?.id
    ?? result.academicStatus?.id
    ?? result.lifeArchetype?.id
    ?? result.storyAward?.id;
  return REFLECTION_GUIDE[endingId] ?? REFLECTION_GUIDE.default;
}

function enrichResults(results) {
  return results.map((result) => ({
    ...result,
    reflection: resolveReflectionForResult(result),
  }));
}

function startSession(mode) {
  sessionId = randomUUID();
  sessionStartedAtIso = new Date().toISOString();
  state.startedAt = Date.now();
  state.turnStartedAt = null;
  state.roundDurations = [];
  state.mode = mode;
}

function writeSessionLogIfPossible(results) {
  if (!sessionId) return;
  try {
    writeSessionLog({
      sessionId,
      startedAt: sessionStartedAtIso,
      endedAt: new Date().toISOString(),
      mode: state.mode,
      players: state.players,
      results,
    });
  } catch (error) {
    console.error("Failed to write session log", error);
  }
  sessionId = null;
  sessionStartedAtIso = null;
}

function recordTurnDuration(player) {
  if (!state.turnStartedAt) return;
  const durationSeconds = Math.max(0, Math.round((Date.now() - state.turnStartedAt) / 1000));
  state.roundDurations = [
    ...(state.roundDurations ?? []),
    {
      round: state.currentRound,
      playerId: player.id,
      playerName: player.name,
      durationSeconds,
    },
  ].slice(-20);
}

function recordChoiceHistory(player, event, choice, appliedEffects, flagEffects, submittedBy) {
  const entry = {
    round: state.currentRound,
    eventId: event.id,
    eventTitle: event.title,
    choiceId: choice.id,
    choiceLabel: choice.label,
    effects: appliedEffects,
    flagEffects,
    submittedBy,
  };
  player.choiceHistory = [...(player.choiceHistory ?? []), entry];
}

function getCurrentTimelineEvent() {
  return TIMELINE_EVENTS[state.currentSeasonIndex] ?? null;
}

function setLifePlayersAtSquare(squareId) {
  if (!squareId) return;
  const nextPositions = { ...state.lifePlayerPositions };
  for (const lifePlayer of state.lifePlayers) {
    nextPositions[lifePlayer.id] = squareId;
  }
  state.lifePlayerPositions = nextPositions;
}

function moveLifePlayerToRoute(playerId, event, choice) {
  const routeSquareId = getRouteSquareId(event, choice);
  state.lifePlayerPositions = {
    ...state.lifePlayerPositions,
    [playerId]: routeSquareId,
  };
  const previousRoutes = state.lifePlayerRoutes[playerId] ?? [];
  if (previousRoutes[previousRoutes.length - 1] === routeSquareId) return;
  state.lifePlayerRoutes = {
    ...state.lifePlayerRoutes,
    [playerId]: [...previousRoutes, routeSquareId],
  };
}

function presentTimelineEvent() {
  const event = getCurrentTimelineEvent();
  if (!event) {
    endTimelineGame();
    return;
  }

  const publicEvent = getPublicTimelineEvent(event);
  state.mode = "life_map";
  state.phase = "choosing";
  state.currentRound = state.currentSeasonIndex + 1;
  state.currentEvent = publicEvent;
  state.availableChoiceIds = publicEvent.choices.map((choice) => choice.id);
  state.pendingLifeChoices = {};
  state.pendingLifeResults = {};
  state.currentChoiceMode = event.choiceMode ?? "sequential";
  state.lastChoiceResult = null;
  state.turnStartedAt = Date.now();
  setLifePlayersAtSquare(getSeasonHubSquareId(event));

  broadcast({
    type: "show_life_event",
    event: publicEvent,
    availableChoiceIds: state.availableChoiceIds,
  });
  broadcastState();
}

function processTimelineChoice(player, choiceId, submittedBy = "controller") {
  const event = getCurrentTimelineEvent();
  if (!event) return;
  if (state.pendingLifeChoices[player.id]) return;
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return;

  const lifeEffects = normalizeChoiceEffects(choice.effects ?? {});
  const visibleEffects = getVisibleStatEffects(lifeEffects);
  applyEffects(player, visibleEffects);

  state.pendingLifeChoices[player.id] = choiceId;
  moveLifePlayerToRoute(player.id, event, choice);

  const result = {
    playerId: player.id,
    playerName: player.name,
    choiceId: choice.id,
    choiceLabel: choice.label,
    effects: visibleEffects,
    tone: choice.tone,
    storyTags: choice.storyTags,
  };
  state.lastChoiceResult = result;
  state.pendingLifeResults[player.id] = result;
  recordChoiceHistory(player, event, choice, visibleEffects, choice.flagEffects ?? choice.setFlags, submittedBy);

  if (state.currentChoiceMode === "simultaneous") {
    // 一斉モード: 全員揃うまで結果を隠す
    if (tryAdvanceTimelineEvent(event)) {
      return;
    }
    broadcastState();
  } else {
    broadcast({ type: "choice_result", result });
    if (tryAdvanceTimelineEvent(event)) {
      return;
    }
    broadcastState();
  }
}

function tryAdvanceTimelineEvent(event = getCurrentTimelineEvent()) {
  if (!event || state.mode !== "life_map" || state.phase !== "choosing") return false;

  const activePlayerIds = state.players.filter((p) => p.online).map((p) => p.id);
  if (activePlayerIds.length === 0) return false;

  const allDone = activePlayerIds.every((id) => state.pendingLifeChoices[id]);
  if (!allDone) {
    return false;
  }

  if (state.currentChoiceMode === "simultaneous") {
    // 一斉モード: 結果開示フェーズに移行し、ホストの確認を待つ
    const results = activePlayerIds.map((playerId) => state.pendingLifeResults[playerId]).filter(Boolean);
    state.phase = "revealed";
    broadcast({ type: "all_choices_revealed", results });
    broadcastState();
    return true;
  }

  // 個別モード: 即座に次のイベントへ
  state.lifePlayers = state.lifePlayers.map((lifePlayer) => {
    const selectedId = state.pendingLifeChoices[lifePlayer.id];
    const selectedChoice = event.choices.find((c) => c.id === selectedId);
    if (!selectedChoice) return lifePlayer;
    return applyTimelineChoice(lifePlayer, event, selectedChoice);
  });

  state.currentSeasonIndex += 1;
  if (state.currentSeasonIndex >= TIMELINE_EVENTS.length) {
    endTimelineGame();
    return true;
  }
  presentTimelineEvent();
  return true;
}

function advanceAfterReveal() {
  if (state.mode !== "life_map" || state.phase !== "revealed") return;
  const event = getCurrentTimelineEvent();
  if (!event) return;

  state.lifePlayers = state.lifePlayers.map((lifePlayer) => {
    const selectedId = state.pendingLifeChoices[lifePlayer.id];
    const selectedChoice = event.choices.find((c) => c.id === selectedId);
    if (!selectedChoice) return lifePlayer;
    return applyTimelineChoice(lifePlayer, event, selectedChoice);
  });

  state.currentSeasonIndex += 1;
  if (state.currentSeasonIndex >= TIMELINE_EVENTS.length) {
    endTimelineGame();
    return;
  }
  presentTimelineEvent();
}

function endTimelineGame() {
  const lifeResults = generateTimelineResults(state.lifePlayers);
  const results = enrichResults(lifeResults.map((result) => {
    const player = state.players.find((p) => p.id === result.playerId);
    return {
      playerId: result.playerId,
      playerName: result.playerName,
      academicStatus: result.academicStatus,
      lifeArchetype: result.lifeArchetype,
      storyAward: result.storyAward,
      summary: result.summary,
      resources: player?.resources ?? defaultResources(),
      experience: player?.experience ?? defaultExperience(),
      flags: player?.flags ?? defaultFlags(),
      flagHistory: player?.flagHistory ?? [],
      choiceHistory: player?.choiceHistory ?? [],
      storyTags: result.storyTags,
    };
  }));

  state.phase = "result";
  state.currentEvent = null;
  state.availableChoiceIds = [];
  state.lastChoiceResult = null;

  writeSessionLogIfPossible(results);
  broadcast({ type: "game_result", results });
  broadcastState();
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
    // Stop at branch points — player must choose a route
    const square = BOARD[currentPos];
    if (square && square.type === "branch_point") break;
  }
  player.position = currentPos;
}

/**
 * Present the event for the current player's position.
 * Sets state phase to "choosing" and broadcasts show_event.
 */
function presentEvent(player) {
  // Branch points always show their own event (route selection)
  const square = BOARD[player.position];
  const isBranchPoint = square && square.type === "branch_point";

  // Check threshold events first (but not at branch points)
  let event = null;
  if (!isBranchPoint) {
    event = checkThresholdEvents(player);
  }

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
  state.turnStartedAt = Date.now();

  broadcast({
    type: "show_event",
    event: resolvedEvent,
    availableChoiceIds: availableIds,
    playerId: player.id,
  });
  broadcastState();
}

function rollForPlayer(player) {
  const monthSquare = String(Math.min(state.currentRound, BOARD_FINAL_ROUND));
  const roll = 1;
  const squaresToMove = 1;

  player.position = monthSquare;
  player.lastRoll = roll;

  state.lastRoll = {
    playerId: player.id,
    playerName: player.name,
    value: roll,
    squaresAdvanced: squaresToMove,
  };

  presentEvent(player);
}

function submitChoiceForPlayer(player, choiceId, submittedBy = "controller") {
  if (!state.availableChoiceIds.includes(choiceId)) return false;

  if (state.mode === "life_map") {
    processTimelineChoice(player, choiceId, submittedBy);
    return true;
  }

  const currentPlayer = getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== player.id) return false;
  processChoice(currentPlayer, choiceId, submittedBy);
  return true;
}

/**
 * Process a player's choice.
 */
function processChoice(player, choiceId, submittedBy = "controller") {
  const event = state.currentEvent;
  if (!event) return;

  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) return;

  // Build the combined effects that will be reported
  const appliedEffects = { ...choice.effects };
  const flagEffects = choice.flagEffects ?? choice.setFlags;
  let randomOutcome;

  // Apply base effects
  applyEffects(player, choice.effects);

  // Apply flag effects
  if (flagEffects) {
    applyFlagEffects(player, flagEffects);
  }

  if (choice.dynamicRandomChance?.formula === "romance_success") {
    const success = Math.random() < calcRomanceChance(player);
    const randomEffects = success
      ? choice.dynamicRandomChance.onSuccess
      : choice.dynamicRandomChance.onFailure;
    applyEffects(player, randomEffects);
    mergeEffects(appliedEffects, randomEffects);
    randomOutcome = success ? "success" : "failure";
  }

  if (choice.cheatAction && player.flags.has_partner) {
    const exposed = Math.random() < 0.7;
    if (exposed) {
      const exposedEffects = {
        romance_exp: -5,
        connections: -4,
        health: -3,
      };
      applyEffects(player, exposedEffects);
      mergeEffects(appliedEffects, exposedEffects);
      applyFlagEffects(player, { has_partner: false, cheating: false });
      randomOutcome = "cheat_exposed";
    } else {
      applyFlagEffects(player, { cheating: true });
      randomOutcome = "cheat_hidden";
    }
  }

  // Handle random chance
  if (choice.randomChance !== undefined) {
    const roll = Math.random();
    if (roll < choice.randomChance) {
      // Bonus
      if (choice.randomBonusEffects && Object.keys(choice.randomBonusEffects).length > 0) {
        applyEffects(player, choice.randomBonusEffects);
        // Merge bonus into applied effects for display
        mergeEffects(appliedEffects, choice.randomBonusEffects);
      }
    } else {
      // Penalty
      if (choice.randomPenaltyEffects && Object.keys(choice.randomPenaltyEffects).length > 0) {
        applyEffects(player, choice.randomPenaltyEffects);
        // Merge penalty into applied effects for display
        mergeEffects(appliedEffects, choice.randomPenaltyEffects);
      }
    }
  }

  updateBadLuck(player, event, choice, appliedEffects);
  recordTurnDuration(player);
  recordChoiceHistory(player, event, choice, appliedEffects, flagEffects, submittedBy);

  const result = {
    playerId: player.id,
    playerName: player.name,
    choiceId: choice.id,
    choiceLabel: choice.label,
    effects: appliedEffects,
    flagEffects,
    randomOutcome,
  };

  state.lastChoiceResult = result;

  broadcast({ type: "choice_result", result });

  // If choice has a branchRoute, move player to that branch start
  if (choice.branchRoute) {
    player.position = choice.branchRoute;
  }

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
    state.lastRoll = null;
    state.lastChoiceResult = null;
    state.turnStartedAt = null;
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

  // Check if game is over (month 48)
  if (finishedRound >= BOARD_FINAL_ROUND) {
    endGame();
    return;
  }

  // Apply lifestyle effects at the end of the finished month.
  for (const player of state.players) {
    if (player.online) {
      applyPerRoundFlagEffects(player);
    }
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
  state.turnStartedAt = null;

  state.phase = "rolling";
  broadcastState();
}

/**
 * End the game, calculate results, broadcast.
 */
function endGame() {
  const activePlayers = state.players.slice(); // Include all players regardless of online status
  const results = enrichResults(generateResults(activePlayers));

  state.phase = "result";
  state.currentEvent = null;
  state.availableChoiceIds = [];
  state.lastChoiceResult = null;

  writeSessionLogIfPossible(results);
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
      const passkey = typeof payload.passkey === "string" ? payload.passkey.trim() : "";
      const faculty = normalizeFaculty(payload.faculty);

      let clientId = requestedId ?? randomUUID();
      let issuedPasskey;

      if (role === "controller") {
        const registration = registerOrRestorePlayer({
          requestedId,
          name,
          passkey,
          faculty,
        });
        if (registration.error) {
          sendTo(socket, { type: "auth_error", message: registration.error });
          return;
        }
        clientId = registration.clientId;
        issuedPasskey = registration.passkey;
        addPlayerToActiveGame(clientId);
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
        passkey: issuedPasskey,
      });
      if (role === "controller" && state.mode === "life_map" && state.phase === "choosing" && state.currentEvent) {
        sendTo(socket, {
          type: "show_life_event",
          event: state.currentEvent,
          availableChoiceIds: state.availableChoiceIds,
        });
      }
      if (role === "controller" && state.mode !== "life_map" && state.phase === "choosing" && state.currentEvent) {
        const currentPlayer = getCurrentPlayer();
        if (currentPlayer?.id === clientId) {
          sendTo(socket, {
            type: "show_event",
            event: state.currentEvent,
            availableChoiceIds: state.availableChoiceIds,
            playerId: currentPlayer.id,
          });
        }
      }
      broadcastState();
      sendHostPlayerManagement();
      return;
    }

    const client = sockets.get(socket);
    if (!client?.id) return;

    // ─── start_game ────────────────────────────────────────────
    if (payload.type === "start_game") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.players.length === 0) return;

      // Initialize game state
      startSession("board");
      state.phase = "rolling";
      state.currentRound = 1;
      state.turnOrder = state.players.map((p) => p.id);
      state.completedTurns = [];
      state.turnIndex = 0;
      state.lastRoll = null;
      state.currentEvent = null;
      state.availableChoiceIds = [];
      state.lastChoiceResult = null;
      state.currentSeasonIndex = 0;
      state.lifePlayers = [];
      state.lifeMapSquares = [];
      state.lifePlayerPositions = {};
      state.lifePlayerRoutes = {};
      state.pendingLifeChoices = {};
      state.fallbackMode = false;

      // Reset all players
      for (const player of state.players) {
        player.resources = defaultResources();
        player.experience = defaultExperience();
        player.flags = defaultFlags();
        player.position = "1";
        player.lastRoll = undefined;
        player.badLuckPoints = 0;
        player.flagHistory = [];
        player.choiceHistory = [];
      }

      broadcastState();
      sendHostPlayerManagement();
      broadcastNavigate("/controller-play.html", ["controller"]);
      return;
    }

    // ─── start_life_map_game ────────────────────────────────────
    if (payload.type === "start_life_map_game") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.players.length === 0) return;

      startSession("life_map");
      state.phase = "choosing";
      state.currentRound = 1;
      state.turnOrder = state.players.map((p) => p.id);
      state.completedTurns = [];
      state.turnIndex = 0;
      state.lastRoll = null;
      state.currentEvent = null;
      state.availableChoiceIds = [];
      state.lastChoiceResult = null;
      state.currentSeasonIndex = 0;
      state.pendingLifeChoices = {};
      state.fallbackMode = false;
      for (const player of state.players) {
        player.resources = defaultResources();
        player.experience = defaultExperience();
        player.flags = defaultFlags();
        player.position = "1";
        player.lastRoll = undefined;
        player.badLuckPoints = 0;
        player.flagHistory = [];
        player.choiceHistory = [];
      }
      state.lifePlayers = state.players.map((player) => createTimelinePlayer(player.id, player.name));
      state.lifeMapSquares = PUBLIC_LIFE_MAP_SQUARES;
      state.lifePlayerPositions = Object.fromEntries(
        state.lifePlayers.map((player) => [player.id, LIFE_MAP.startSquareId]),
      );
      state.lifePlayerRoutes = Object.fromEntries(
        state.lifePlayers.map((player) => [player.id, []]),
      );

      broadcastNavigate("/controller-play.html", ["controller"]);
      presentTimelineEvent();
      return;
    }

    // ─── reset_game ────────────────────────────────────────────
    if (payload.type === "reset_game") {
      if (client.role !== "host" || client.id !== hostId) return;

      // Drop all players & game state, return to lobby
      state = defaultGameState();
      playerAuth.clear();
      sessionId = null;
      sessionStartedAtIso = null;
      broadcast({
        type: "system",
        message: "ホストがゲームをリセットしました。ロビーに戻ります。",
      });
      broadcastNavigate("/controller.html", ["controller"]);
      broadcastState();
      sendHostPlayerManagement();
      return;
    }

    // ─── remove_player ──────────────────────────────────────────
    if (payload.type === "remove_player") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (typeof payload.playerId !== "string") return;

      const removedPlayer = removePlayer(payload.playerId);
      if (!removedPlayer) return;

      broadcast({
        type: "system",
        message: `${removedPlayer.name} をプレイヤー一覧から削除しました。`,
      });
      broadcastState();
      sendHostPlayerManagement();
      return;
    }

    // ─── fallback mode ─────────────────────────────────────────
    if (payload.type === "set_fallback_mode") {
      if (client.role !== "host" || client.id !== hostId) return;
      state.fallbackMode = Boolean(payload.enabled);
      broadcastState();
      return;
    }

    if (payload.type === "host_player_roll") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.mode === "life_map") return;
      if (state.phase !== "rolling") return;
      if (typeof payload.playerId !== "string") return;

      const currentPlayer = getCurrentPlayer();
      if (!currentPlayer || currentPlayer.id !== payload.playerId) return;
      rollForPlayer(currentPlayer);
      return;
    }

    if (payload.type === "host_player_choice") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.phase !== "choosing") return;
      if (typeof payload.playerId !== "string" || typeof payload.choiceId !== "string") return;

      const targetPlayer = state.players.find((player) => player.id === payload.playerId);
      if (!targetPlayer) return;
      submitChoiceForPlayer(targetPlayer, payload.choiceId, "host");
      return;
    }

    // ─── host_force_advance_choices ────────────────────────────
    if (payload.type === "host_force_advance_choices") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.mode !== "life_map" || state.phase !== "choosing") return;
      if (state.currentChoiceMode !== "simultaneous") return;

      const firstChoiceId = state.availableChoiceIds[0];
      if (!firstChoiceId) return;

      const activePlayerIds = state.players.filter((p) => p.online).map((p) => p.id);
      for (const playerId of activePlayerIds) {
        if (!state.pendingLifeChoices[playerId]) {
          const player = state.players.find((p) => p.id === playerId);
          if (player) submitChoiceForPlayer(player, firstChoiceId, "host_force");
        }
      }
      return;
    }

    // ─── host_advance_after_reveal ─────────────────────────────
    if (payload.type === "host_advance_after_reveal") {
      if (client.role !== "host" || client.id !== hostId) return;
      if (state.mode !== "life_map" || state.phase !== "revealed") return;
      advanceAfterReveal();
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

      rollForPlayer(currentPlayer);
      return;
    }

    // ─── player_choice ─────────────────────────────────────────
    if (payload.type === "player_choice") {
      if (client.role !== "controller") return;
      if (state.phase !== "choosing") return;

      const currentPlayer = getCurrentPlayer();
      const timelinePlayer = state.mode === "life_map"
        ? state.players.find((p) => p.id === client.id)
        : null;
      if (state.mode !== "life_map" && (!currentPlayer || currentPlayer.id !== client.id)) return;
      if (state.mode === "life_map" && !timelinePlayer) return;

      const choiceId = payload.choiceId;
      if (!state.availableChoiceIds.includes(choiceId)) return;

      submitChoiceForPlayer(state.mode === "life_map" ? timelinePlayer : currentPlayer, choiceId);
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
      sendHostPlayerManagement();
    }

    if (client.role === "host" && client.id === hostId) {
      hostId = null;
      state = defaultGameState();
      playerAuth.clear();
      sessionId = null;
      sessionStartedAtIso = null;
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
