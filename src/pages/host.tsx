import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import "../App.css";
import {
  choosePrimaryHostUrl,
  colorForPlayer,
  getRoundInfo,
  type ClientMessage,
  type GameState,
  type ServerMessage,
  defaultGameState,
  wsUrlFromInput,
} from "../domain/gameShared";

function App() {
  const [name, setName] = useState("Host");
  const [hostUrlInput, setHostUrlInput] = useState("");
  const [status, setStatus] = useState("未接続");
  const [clientId, setClientId] = useState<string | null>(null);
  const [hostUrls, setHostUrls] = useState<string[]>([]);
  const [state, setState] = useState<GameState>(defaultGameState);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const primaryHostUrl = useMemo(
    () => choosePrimaryHostUrl(hostUrls),
    [hostUrls],
  );

  const controllerEntryUrl = useMemo(() => {
    if (!primaryHostUrl) return "";
    return `${primaryHostUrl}/controller.html?host=${encodeURIComponent(primaryHostUrl)}`;
  }, [primaryHostUrl]);

  const displayUrl = useMemo(() => {
    const hostBase = primaryHostUrl || window.location.origin;
    return `${hostBase}/display.html?host=${encodeURIComponent(hostBase)}`;
  }, [primaryHostUrl]);

  const roundInfo = useMemo(
    () => getRoundInfo(state.currentRound),
    [state.currentRound],
  );

  const currentPlayer = useMemo(() => {
    if (state.players.length === 0 || state.turnOrder.length === 0) return undefined;
    const currentId = state.turnOrder[state.turnIndex % state.turnOrder.length];
    return state.players.find((p) => p.id === currentId);
  }, [state.players, state.turnIndex, state.turnOrder]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const connectHost = () => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;
    if (isConnecting || clientId) return;
    if (!name.trim()) {
      setStatus("名前を入力してください");
      return;
    }

    const targetUrl = hostUrlInput
      ? wsUrlFromInput(hostUrlInput)
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    if (!targetUrl) {
      setStatus("接続先URLが正しくありません");
      return;
    }

    setStatus("接続中...");
    setIsConnecting(true);
    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "join",
        name: name.trim(),
        role: "host",
      };
      socket.send(JSON.stringify(payload));
      setStatus("接続済み");
      setIsConnecting(false);
      sessionStorage.setItem("clg_host", hostUrlInput.trim());
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "welcome") {
        setClientId(message.clientId);
        setHostUrls(message.urls ?? []);
      }
      if (message.type === "state") {
        setState(message.state);
      }
      if (message.type === "system") {
        setStatus(message.message);
      }
    };

    socket.onclose = () => {
      setStatus("切断されました");
      setClientId(null);
      setHostUrls([]);
      setState(defaultGameState);
      setIsConnecting(false);
    };

    socket.onerror = () => {
      setStatus("接続に失敗しました");
      setIsConnecting(false);
    };
  };

  const sendMessage = (payload: ClientMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const startGame = () => {
    if (!clientId) return;
    if (state.players.length < 1) {
      setStatus("参加者が必要です");
      return;
    }
    sendMessage({ type: "start_game" });
  };

  const openDisplay = () => {
    window.open(displayUrl, "_blank");
  };

  const controllerPlayUrl = useMemo(() => {
    const hostBase = primaryHostUrl || window.location.origin;
    return `${hostBase}/controller-play.html?host=${encodeURIComponent(hostBase)}`;
  }, [primaryHostUrl]);

  const openDebugAll = () => {
    const hostBase = primaryHostUrl || window.location.origin;
    // Open display
    window.open(displayUrl, "clg-display", "width=1280,height=720");
    // Open 2 controller tabs for testing
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        window.open(
          `${hostBase}/controller.html?host=${encodeURIComponent(hostBase)}`,
          `clg-controller-${i}`,
          "width=400,height=750"
        );
      }, 300 * (i + 1));
    }
  };

  const openOneController = () => {
    const hostBase = primaryHostUrl || window.location.origin;
    window.open(
      `${hostBase}/controller.html?host=${encodeURIComponent(hostBase)}`,
      "_blank",
      "width=400,height=750"
    );
  };

  const isInGame = state.phase !== "lobby";

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Campus Life Game</span>
          <span className="status">{status}</span>
        </div>
        <h1>キャンパスライフゲーム</h1>
        <p>
          モニターは表示専用、参加者はスマホで入力。順番制サイコロで会話が生まれる構成です。
        </p>
      </header>

      {/* ── Connection Panel ──────────────────────────────────────── */}
      {!clientId && (
        <section className="panel">
          <h2>ホスト接続</h2>
          <div className="grid">
            <label>
              ホスト名
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              接続先URL（通常は空欄）
              <input
                value={hostUrlInput}
                onChange={(e) => setHostUrlInput(e.target.value)}
                placeholder="例: http://192.168.0.5:4173"
              />
            </label>
          </div>
          <div className="actions">
            <button onClick={connectHost} disabled={isConnecting || !!clientId}>
              ホストとして開始
            </button>
          </div>
        </section>
      )}

      {/* ── QR Code Panel ─────────────────────────────────────────── */}
      {clientId && controllerEntryUrl && (
        <section className="panel">
          <h2>参加者向けQR（Controller）</h2>
          <div className="controller-qr">
            <QRCodeCanvas value={controllerEntryUrl} size={220} />
            <div className="note-urls">{controllerEntryUrl}</div>
          </div>
        </section>
      )}

      {/* ── Game Info Panel (during game) ─────────────────────────── */}
      {isInGame && (
        <section className="panel">
          <h2>ゲーム進行</h2>
          <div className="host-round-info">
            <span>
              <strong>{roundInfo.label}</strong>
            </span>
            <span>
              Round {state.currentRound}/16
            </span>
            <span>
              フェーズ: <strong>{state.phase}</strong>
            </span>
            {currentPlayer && (
              <span>
                現在のプレイヤー: <strong>{currentPlayer.name}</strong>
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── Player List ───────────────────────────────────────────── */}
      <section className="panel">
        <h2>プレイヤー一覧 ({state.players.length}人)</h2>
        <div className="players">
          {state.players.length === 0 && (
            <div className="placeholder">まだ参加者はいません。</div>
          )}
          {state.players.map((player, index) => {
            const isTurn = currentPlayer?.id === player.id;
            return (
              <div
                key={player.id}
                className={`player-card ${isTurn ? "current-turn" : ""}`}
              >
                <div className="player-name">
                  <span
                    className="player-color-dot"
                    style={{ background: colorForPlayer(index) }}
                  />
                  {player.name}
                  {isTurn && (
                    <span style={{ fontSize: 12, color: "var(--accent)" }}>
                      {" "}
                      (今の番)
                    </span>
                  )}
                  {!player.online && (
                    <span style={{ fontSize: 12, color: "var(--year-4)" }}>
                      {" "}
                      offline
                    </span>
                  )}
                </div>
                <div className="player-stats">
                  <span>📍 {player.position}</span>
                  <span>⏱ {player.resources.time}</span>
                  <span>💰 {player.resources.money}</span>
                  <span>❤️ {player.resources.health}</span>
                  <span>📚 {player.resources.credits}</span>
                  <span>🧠 {player.experience.intellect}</span>
                  <span>🤝 {player.experience.connections}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Actions ───────────────────────────────────────────────── */}
      {clientId && !isInGame && (
        <section className="panel">
          <h2>アクション</h2>
          <div className="actions">
            <button
              onClick={startGame}
              disabled={state.players.length < 1}
            >
              ゲームを開始！
              {state.players.length < 1 && " (参加者が必要)"}
            </button>
            <button className="ghost" onClick={openDisplay}>
              ディスプレイを開く
            </button>
          </div>
        </section>
      )}

      {clientId && isInGame && (
        <section className="panel">
          <div className="actions">
            <button className="ghost" onClick={openDisplay}>
              ディスプレイを開く
            </button>
            <button className="ghost" onClick={openOneController}>
              コントローラーを追加
            </button>
          </div>
        </section>
      )}

      {/* ── Debug Panel ──────────────────────────────────────────── */}
      {clientId && (
        <section className="panel" style={{ borderLeft: "3px solid var(--year-2)" }}>
          <h2>デバッグモード（PC1台でテスト）</h2>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 12px" }}>
            全画面を別ウィンドウで開きます。コントローラーで名前を入れて参加してください。
          </p>
          <div className="actions">
            <button onClick={openDebugAll} style={{ background: "var(--year-2)" }}>
              全画面を一括オープン（Display + Controller ×2）
            </button>
            <button className="ghost" onClick={openOneController}>
              コントローラーを1つ追加
            </button>
            <button className="ghost" onClick={openDisplay}>
              ディスプレイだけ開く
            </button>
          </div>
          {isInGame && controllerPlayUrl && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                ゲーム中のコントローラー直リンク:
              </p>
              <a
                href={controllerPlayUrl}
                target="_blank"
                rel="noopener"
                style={{ fontSize: 13, wordBreak: "break-all" }}
              >
                {controllerPlayUrl}
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
