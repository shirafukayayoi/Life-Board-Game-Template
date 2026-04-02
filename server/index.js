import express from "express";
import http from "http";
import os from "os";
import path from "path";
import fs from "fs";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

const PORT = Number(process.env.PORT ?? 4173);
const STATIC_DIR = process.env.STATIC_DIR ?? "dist";

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

function applyEffects(stats, effects, direction = 1) {
  const next = { ...stats };
  for (const key of Object.keys(effects)) {
    const value = effects[key] ?? 0;
    const updated = (next[key] ?? 0) + value * direction;
    next[key] = Math.max(0, Math.min(5, updated));
  }
  return next;
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

    if (payload.type === "hello") {
      const clientId = randomUUID();
      const role = payload.role;
      sockets.set(socket, { id: clientId, role, name: payload.name });

      if (role === "host" && !hostId) {
        hostId = clientId;
      }

  const newPlayer = {
    id: clientId,
    name: payload.name,
    stats: defaultStats(),
    position: 0,
    lastRoll: undefined,
  };
  state.players = [...state.players, newPlayer];
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

    if (payload.type === "navigate") {
      if (client.id !== hostId) return;
      state = { ...state, phase: "playing" };
      broadcastState();
      broadcast({ type: "navigate", url: payload.url });
      return;
    }

    if (payload.type === "player_roll") {
      if (state.phase !== "playing") return;
      const roll = Math.floor(Math.random() * 6) + 1;
      state = {
        ...state,
        players: state.players.map((player) => {
          if (player.id !== client.id) return player;
          if (player.position >= 30) return player;
          const nextPosition = Math.min(30, player.position + roll);
          return {
            ...player,
            position: nextPosition,
            lastRoll: roll,
          };
        }),
      };
      broadcastState();
      return;
    }
  });

  socket.on("close", () => {
    const client = sockets.get(socket);
    sockets.delete(socket);
    if (!client?.id) return;

    state = {
      ...state,
      players: state.players.filter((player) => player.id !== client.id),
    };

    if (client.id === hostId) {
      hostId = null;
      broadcast({
        type: "system",
        message: "ホストが切断されました。再接続してください。",
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
