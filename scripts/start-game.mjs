/**
 * ゲームサーバー起動スクリプト
 *
 * 使い方:
 *   node scripts/start-game.mjs                        # ローカルWiFiモード（ポート4173）
 *   node scripts/start-game.mjs --tunnel               # Cloudflare Tunnelモード
 *   node scripts/start-game.mjs --port 4174 --tunnel   # 2ゲーム目（別ポート）
 *   node scripts/start-game.mjs --port 4175 --name "Aチーム" --tunnel
 *
 * npm scripts:
 *   npm run game              # ローカルモード
 *   npm run game:tunnel       # トンネルモード
 */

import { spawn } from "node:child_process";

// ─── CLI 引数 ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(`--${name}`); return i === -1 ? def : (args[i + 1] ?? def); };
const hasFlag = (name) => args.includes(`--${name}`);

const PORT      = parseInt(getArg("port", "4173"), 10);
const USE_TUNNEL = hasFlag("tunnel");
const GAME_NAME  = getArg("name", `ゲーム (ポート ${PORT})`);

// ─── ユーティリティ ───────────────────────────────────────────────
const sep = "═".repeat(60);

function printBox(lines) {
  console.log("\n" + sep);
  lines.forEach((l) => console.log(l));
  console.log(sep + "\n");
}

// ─── サーバー起動 ─────────────────────────────────────────────────
function startServer(tunnelUrl = null) {
  const env = { ...process.env, PORT: String(PORT) };
  if (tunnelUrl) env.PUBLIC_URL = tunnelUrl;

  const server = spawn("node", ["server/index.js"], {
    env,
    stdio: "inherit",
    cwd: process.cwd(),
  });

  server.on("exit", (code) => process.exit(code ?? 0));
  return server;
}

// ─── Cloudflare Tunnel 起動 & URL取得 ────────────────────────────
function startTunnel() {
  return new Promise((resolve, reject) => {
    const cf = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--url", `http://localhost:${PORT}`],
      { stdio: ["ignore", "pipe", "pipe"], cwd: process.cwd() }
    );

    const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    const onData = (data) => {
      const text = data.toString();
      const match = text.match(urlPattern);
      if (match) resolve({ url: match[0], process: cf });
    };

    cf.stdout.on("data", onData);
    cf.stderr.on("data", onData);
    cf.on("error", reject);
    cf.on("exit", (code) => {
      if (code !== 0) reject(new Error(`cloudflared exited with code ${code}`));
    });

    setTimeout(() => reject(new Error("Tunnel URL取得タイムアウト (60秒)")), 60_000);
  });
}

// ─── サーバーにトンネルURLを通知 ──────────────────────────────────
async function notifyServer(url, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/admin/tunnel-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) return true;
    } catch {
      // サーバー起動待ち
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// ─── メイン ───────────────────────────────────────────────────────
async function main() {
  if (!USE_TUNNEL) {
    // ── ローカルWiFiモード ──────────────────────────────────────
    printBox([
      `🎮  ${GAME_NAME}`,
      `📡  モード: ローカルWiFi`,
      `🔌  ポート: ${PORT}`,
      ``,
      `参加者と同じWiFiに繋いで、ホスト画面のQRコードを共有してください。`,
    ]);
    startServer();
    return;
  }

  // ── Cloudflare Tunnelモード ──────────────────────────────────
  console.log(`\n🚀 ${GAME_NAME} を起動中... (Cloudflare Tunnelモード)`);
  console.log(`   ポート: ${PORT}`);

  // 1. サーバー起動
  const server = startServer();

  // 2. Tunnel起動
  console.log("🌐 Cloudflare Tunnel を起動中... (10〜30秒かかります)");
  let tunnelProc;
  try {
    const { url, process: cf } = await startTunnel();
    tunnelProc = cf;

    // 3. サーバーにURL通知
    const notified = await notifyServer(url);
    if (!notified) {
      console.warn("⚠️  サーバーへのURL通知に失敗しましたが、起動は続行します。");
    }

    printBox([
      `🎮  ${GAME_NAME} — 起動完了！`,
      ``,
      `📱  参加者向けURL (どこからでもアクセス可):`,
      `    ${url}`,
      ``,
      `🖥️   ホスト管理画面:`,
      `    ${url}/host.html`,
      ``,
      `💡  このURLをQRコードに変換してプロジェクターに映すか、`,
      `    参加者に直接送ってください。`,
      ``,
      `⚠️   このターミナルを閉じるとゲームが終了します。`,
    ]);

    // Ctrl+C でクリーンアップ
    process.on("SIGINT", () => {
      console.log("\nゲームを終了します...");
      tunnelProc?.kill();
      server?.kill();
      process.exit(0);
    });
  } catch (err) {
    console.error(`\n❌ Tunnel起動失敗: ${err.message}`);
    console.error("ローカルWiFiモードで継続します。");
    console.error("cloudflared がインストールされていない場合: npm install -g cloudflared");
    // サーバーはそのまま継続
  }
}

main().catch((err) => {
  console.error("起動エラー:", err);
  process.exit(1);
});
