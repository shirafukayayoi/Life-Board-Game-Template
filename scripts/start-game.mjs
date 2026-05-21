#!/usr/bin/env node
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const options = {
    port: 4173,
    tunnel: false,
    name: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--port" && next) {
      options.port = Number(next);
      index += 1;
    } else if (arg === "--name" && next) {
      options.name = next;
      index += 1;
    } else if (arg === "--tunnel") {
      options.tunnel = true;
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const gameName = options.name || `Campus Life Game :${options.port}`;
const separator = "=".repeat(64);

function printBox(lines) {
  console.log(`\n${separator}`);
  for (const line of lines) console.log(line);
  console.log(`${separator}\n`);
}

function startServer() {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(options.port),
    },
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  return child;
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--url", `http://localhost:${options.port}`],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Timed out waiting for a Cloudflare Tunnel URL"));
    }, 60_000);

    const resolveIfUrlAppears = (chunk) => {
      if (settled) return;
      const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (!match) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ url: match[0], process: child });
    };

    child.stdout.on("data", resolveIfUrlAppears);
    child.stderr.on("data", resolveIfUrlAppears);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`cloudflared exited with code ${code ?? "unknown"}`));
    });
  });
}

async function notifyServer(url) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${options.port}/admin/tunnel-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (response.ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

async function main() {
  if (!options.tunnel) {
    printBox([
      gameName,
      `Mode: local Wi-Fi`,
      `Host: http://localhost:${options.port}/`,
      `Display: http://localhost:${options.port}/display.html?host=${encodeURIComponent(`http://localhost:${options.port}`)}`,
      `Controller: http://localhost:${options.port}/controller.html?host=${encodeURIComponent(`http://localhost:${options.port}`)}`,
    ]);
    startServer();
    return;
  }

  const server = startServer();
  let tunnelProcess = null;

  process.on("SIGINT", () => {
    tunnelProcess?.kill();
    server.kill();
    process.exit(0);
  });

  try {
    console.log(`Starting ${gameName} with Cloudflare Tunnel on port ${options.port}...`);
    const tunnel = await startTunnel();
    tunnelProcess = tunnel.process;
    const notified = await notifyServer(tunnel.url);

    printBox([
      gameName,
      `Mode: Cloudflare Tunnel`,
      `Participant URL: ${tunnel.url}/controller.html?host=${encodeURIComponent(tunnel.url)}`,
      `Host: ${tunnel.url}/`,
      `Display: ${tunnel.url}/display.html?host=${encodeURIComponent(tunnel.url)}`,
      notified ? "The host QR has been updated with the public URL." : "The tunnel is running, but the host QR update did not confirm.",
      "Keep this terminal open while the game is running.",
    ]);
  } catch (error) {
    console.error(`Tunnel startup failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error("The local server is still running. Use the local Wi-Fi URL from the host screen.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
