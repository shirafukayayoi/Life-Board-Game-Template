import express from "express";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 4173);
const STATIC_DIR = process.env.STATIC_DIR ?? "dist";
const BOARD_SIZE = 30;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const defaultStats = () => ({
  money: 2,
  relations: 2,
  growth: 2,
  fulfillment: 2,
});

let hostId = null;
let state = {
  phase: "lobby",
  round: 0,
  players: [],
  turnIndex: 0,
  lastRoll: null,
};

const sockets = new Map();

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

function nextOnlineTurnIndex(startIndex) {
  if (state.players.length === 0) return 0;
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = (startIndex + offset) % state.players.length;
    if (state.players[candidate]?.online) {
      return candidate;
    }
  }
  return startIndex % state.players.length;
}

function normalizeTurnIndex() {
  if (state.players.length === 0) {
    state.turnIndex = 0;
    return;
  }
  if (state.turnIndex >= state.players.length) {
    state.turnIndex = 0;
  }
  if (!state.players[state.turnIndex]?.online) {
    state.turnIndex = nextOnlineTurnIndex(state.turnIndex);
  }
}

function addOrRestorePlayer(clientId, name) {
  const existingIndex = state.players.findIndex((player) => player.id === clientId);
  if (existingIndex !== -1) {
    state.players[existingIndex] = {
      ...state.players[existingIndex],
      name,
      online: true,
    };
    normalizeTurnIndex();
    return clientId;
  }

  const player = {
    id: clientId,
    name,
    stats: defaultStats(),
    position: state.phase === "playing" ? 1 : 0,
    lastRoll: undefined,
    online: true,
  };
  state = { ...state, players: [...state.players, player] };
  normalizeTurnIndex();
  return clientId;
}

function markOffline(clientId) {
  const index = state.players.findIndex((player) => player.id === clientId);
  if (index === -1) return;
  state.players[index] = { ...state.players[index], online: false };
  if (index === state.turnIndex) {
    state.turnIndex = nextOnlineTurnIndex(state.turnIndex);
  }
  normalizeTurnIndex();
}

wss.on("connection", (socket) => {
  sockets.set(socket, { id: null, role: null, name: null });

  socket.on("message", (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (payload.type === "join") {
      const role = payload.role;
      const requestedId = typeof payload.clientId === "string" ? payload.clientId : null;
      const name = typeof payload.name === "string" ? payload.name : "Guest";

      let clientId = requestedId ?? randomUUID();
      if (role === "controller") {
        const knownPlayer = requestedId
          ? state.players.find((player) => player.id === requestedId)
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

      socket.send(
        JSON.stringify({
          type: "welcome",
          clientId,
          hostId,
          urls: role === "host" ? getHostUrls() : undefined,
        })
      );
      broadcastState();
      return;
    }

    const client = sockets.get(socket);
    if (!client?.id) return;

    if (payload.type === "start_game") {
      if (client.role !== "host" || client.id !== hostId) return;
      state = {
        ...state,
        phase: "playing",
        round: 0,
        lastRoll: null,
        players: state.players.map((player) => ({
          ...player,
          position: 1,
          lastRoll: undefined,
        })),
      };
      normalizeTurnIndex();
      broadcastState();
      broadcastNavigate("/controller-play.html", ["controller"]);
      return;
    }

    if (payload.type === "player_roll") {
      if (client.role !== "controller") return;
      if (state.phase !== "playing") return;
      if (state.players.length === 0) return;
      const currentPlayer = state.players[state.turnIndex];
      if (!currentPlayer || currentPlayer.id !== client.id) return;
      if (!currentPlayer.online) return;

      const roll = Math.floor(Math.random() * 6) + 1;
      state = {
        ...state,
        round: state.round + 1,
        players: state.players.map((player) => {
          if (player.id !== client.id) return player;
          const nextPosition = Math.min(BOARD_SIZE, player.position + roll);
          return {
            ...player,
            position: nextPosition,
            lastRoll: roll,
          };
        }),
        lastRoll: {
          playerId: client.id,
          playerName: currentPlayer.name,
          value: roll,
        },
      };
      state.turnIndex = nextOnlineTurnIndex(state.turnIndex);
      normalizeTurnIndex();
      broadcastState();
      return;
    }

    if (payload.type === "request_state") {
      socket.send(JSON.stringify({ type: "state", state }));
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
      state = { ...state, phase: "lobby" };
      broadcast({
        type: "system",
        message: "ホストが切断されました。ロビーに戻ります。",
      });
    }

    broadcastState();
  });
});

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
});
