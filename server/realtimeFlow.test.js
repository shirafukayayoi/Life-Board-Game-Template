import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import WebSocket from "ws";

const TEST_TIMEOUT_MS = 2500;

function randomPort() {
  return 45000 + Math.floor(Math.random() * 10000);
}

async function startServer(t) {
  const port = randomPort();
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      STATIC_DIR: "__missing_static_for_tests__",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, TEST_TIMEOUT_MS);

    child.stdout.on("data", () => {
      if (!stdout.includes(`http://localhost:${port}`)) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited early with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  t.after(() => {
    child.kill();
  });

  return { port };
}

async function connectClient(t, port, joinPayload) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()));
  });

  await once(socket, "open");
  socket.send(JSON.stringify({ type: "join", ...joinPayload }));

  const welcome = await waitForMessage(messages, (message) => message.type === "welcome");
  t.after(() => {
    socket.close();
  });

  return {
    socket,
    clientId: welcome.clientId,
    messages,
    send(payload) {
      socket.send(JSON.stringify(payload));
    },
    waitFor(predicate) {
      return waitForMessage(messages, predicate);
    },
  };
}

async function connectRaw(port, joinPayload) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()));
  });

  await once(socket, "open");
  socket.send(JSON.stringify({ type: "join", ...joinPayload }));
  return {
    socket,
    messages,
    waitFor(predicate) {
      return waitForMessage(messages, predicate);
    },
  };
}

async function waitForMessage(messages, predicate) {
  const startedAt = Date.now();
  let cursor = 0;

  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    while (cursor < messages.length) {
      const message = messages[cursor];
      cursor += 1;
      if (predicate(message)) {
        return message;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Timed out waiting for expected WebSocket message");
}

test("controller joining during life-map play is added to the current season event", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  await connectClient(t, port, { role: "controller", name: "Aoi" });
  await connectClient(t, port, { role: "controller", name: "Ren" });

  host.send({ type: "start_life_map_game" });
  await host.waitFor((message) => message.type === "state" && message.state.mode === "life_map");

  const latePlayer = await connectClient(t, port, { role: "controller", name: "Mio" });
  const eventMessage = await latePlayer.waitFor((message) => message.type === "show_life_event");
  const stateMessage = await latePlayer.waitFor(
    (message) => message.type === "state" && message.state.lifePlayers.some((player) => player.id === latePlayer.clientId),
  );

  assert.equal(eventMessage.event.id, stateMessage.state.currentEvent.id);
  assert.equal(stateMessage.state.lifePlayerPositions[latePlayer.clientId], `${eventMessage.event.id}:hub`);
  assert.deepEqual(stateMessage.state.lifePlayerRoutes[latePlayer.clientId], []);
});

test("removing an unsubmitted life-map player advances once remaining players are done", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  const aoi = await connectClient(t, port, { role: "controller", name: "Aoi" });
  const ren = await connectClient(t, port, { role: "controller", name: "Ren" });
  const mio = await connectClient(t, port, { role: "controller", name: "Mio" });

  host.send({ type: "start_life_map_game" });
  const eventMessage = await aoi.waitFor((message) => message.type === "show_life_event");
  const [firstChoice, secondChoice] = eventMessage.availableChoiceIds;

  aoi.send({ type: "player_choice", choiceId: firstChoice });
  ren.send({ type: "player_choice", choiceId: secondChoice });
  await host.waitFor(
    (message) => message.type === "state" && Object.keys(message.state.pendingLifeChoices).length === 2,
  );

  host.send({ type: "remove_player", playerId: mio.clientId });

  const nextSeason = await host.waitFor(
    (message) => message.type === "state" && message.state.mode === "life_map" && message.state.currentSeasonIndex === 1,
  );
  assert.equal(nextSeason.state.currentRound, 2);
  assert.equal(nextSeason.state.players.some((player) => player.id === mio.clientId), false);
});

test("life-map choices change visible stats with a net +3 effect", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  const aoi = await connectClient(t, port, { role: "controller", name: "Aoi" });
  await connectClient(t, port, { role: "controller", name: "Ren" });

  host.send({ type: "start_life_map_game" });
  const eventMessage = await aoi.waitFor((message) => message.type === "show_life_event");

  aoi.send({ type: "player_choice", choiceId: eventMessage.availableChoiceIds[0] });
  const resultMessage = await aoi.waitFor((message) => message.type === "choice_result");
  const effectTotal = Object.values(resultMessage.result.effects).reduce((total, value) => total + value, 0);
  assert.equal(effectTotal, 3);
  assert.equal(resultMessage.result.effects.credits, 1);

  const stateMessage = await host.waitFor(
    (message) => message.type === "state" && message.state.pendingLifeChoices[aoi.clientId],
  );
  const updatedAoi = stateMessage.state.players.find((player) => player.id === aoi.clientId);
  assert.equal(updatedAoi.resources.credits, 1);
  assert.equal(updatedAoi.experience.work_tolerance, 2);
  assert.equal(updatedAoi.resources.time, 9);
  assert.equal(updatedAoi.experience.intellect, 2);
});

test("rejoining life-map player keeps an already selected route position", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  const aoi = await connectClient(t, port, { role: "controller", name: "Aoi" });
  const passkey = aoi.messages.find((message) => message.type === "welcome")?.passkey;
  assert.ok(passkey);
  await connectClient(t, port, { role: "controller", name: "Ren" });

  host.send({ type: "start_life_map_game" });
  const eventMessage = await aoi.waitFor((message) => message.type === "show_life_event");
  aoi.send({ type: "player_choice", choiceId: eventMessage.availableChoiceIds[0] });

  const selectedState = await host.waitFor(
    (message) => message.type === "state" && message.state.pendingLifeChoices[aoi.clientId],
  );
  const selectedPosition = selectedState.state.lifePlayerPositions[aoi.clientId];
  assert.match(selectedPosition, /:route:/);

  aoi.socket.close();
  const restoredAoi = await connectClient(t, port, {
    role: "controller",
    name: "Aoi",
    clientId: aoi.clientId,
    passkey,
  });
  const restoredState = await restoredAoi.waitFor(
    (message) => message.type === "state" && message.state.players.some((player) => player.id === aoi.clientId && player.online),
  );

  assert.equal(restoredState.state.lifePlayerPositions[aoi.clientId], selectedPosition);
});

test("controller passkey restores a player and rejects wrong passkeys", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  const aoi = await connectClient(t, port, {
    role: "controller",
    name: "Aoi",
    faculty: "education",
  });
  const management = await host.waitFor(
    (message) => message.type === "host_player_management"
      && message.players.some((player) => player.id === aoi.clientId && player.passkey),
  );
  const managedAoi = management.players.find((player) => player.id === aoi.clientId);
  assert.equal(managedAoi.faculty, "education");
  assert.equal(aoi.messages.some((message) => message.type === "host_player_management"), false);

  aoi.socket.close();
  await host.waitFor(
    (message) => message.type === "host_player_management"
      && message.players.some((player) => player.id === aoi.clientId && !player.online),
  );

  const rejected = await connectRaw(port, {
    role: "controller",
    name: "Aoi",
    passkey: "0000",
  });
  t.after(() => rejected.socket.close());
  const authError = await rejected.waitFor((message) => message.type === "auth_error");
  assert.match(authError.message, /一致/);

  const restored = await connectClient(t, port, {
    role: "controller",
    name: "Aoi",
    passkey: managedAoi.passkey,
  });
  assert.equal(restored.clientId, aoi.clientId);
});

test("host fallback can open a board month and submit the current player's choice", async (t) => {
  const { port } = await startServer(t);
  const host = await connectClient(t, port, { role: "host", name: "Host" });
  const aoi = await connectClient(t, port, { role: "controller", name: "Aoi" });

  host.send({ type: "start_game" });
  await host.waitFor((message) => message.type === "state" && message.state.phase === "rolling");
  host.send({ type: "set_fallback_mode", enabled: true });
  await host.waitFor((message) => message.type === "state" && message.state.fallbackMode === true);

  host.send({ type: "host_player_roll", playerId: aoi.clientId });
  const choosing = await host.waitFor(
    (message) => message.type === "state"
      && message.state.phase === "choosing"
      && message.state.currentEvent?.id === "1",
  );
  const choiceId = choosing.state.availableChoiceIds[0];

  host.send({ type: "host_player_choice", playerId: aoi.clientId, choiceId });
  const result = await host.waitFor(
    (message) => message.type === "choice_result"
      && message.result.playerId === aoi.clientId
      && message.result.choiceId === choiceId,
  );
  assert.equal(result.result.playerName, "Aoi");

  const nextMonth = await host.waitFor(
    (message) => message.type === "state"
      && message.state.phase === "rolling"
      && message.state.currentRound === 2,
  );
  assert.equal(nextMonth.state.completedTurns.length, 0);
});
