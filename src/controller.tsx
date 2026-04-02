import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import "./index.css";
import {
  type ClientMessage,
  type GameState,
  type ServerMessage,
  wsUrlFromInput,
} from "./gameShared";

const INITIAL_STATE: GameState = {
  phase: "lobby",
  round: 0,
  players: [],
  turnIndex: 0,
  lastRoll: null,
};

function ControllerLobbyPage() {
  const [name, setName] = useState(sessionStorage.getItem("clg_name") ?? "");
  const [status, setStatus] = useState("未接続");
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [connecting, setConnecting] = useState(false);
  const [clientId, setClientId] = useState<string | null>(
    sessionStorage.getItem("clg_controller_id")
  );
  const wsRef = useRef<WebSocket | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);

  const navigateToPlay = () => {
    window.location.href = `/controller-play.html?host=${encodeURIComponent(hostUrl)}`;
  };

  const connect = () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (!name.trim()) {
      setStatus("名前を入力してください");
      return;
    }

    const targetUrl = wsUrlFromInput(hostUrl);
    if (!targetUrl) {
      setStatus("接続先URLが不正です");
      return;
    }

    setConnecting(true);
    setStatus("接続中...");
    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "join",
        name: name.trim(),
        role: "controller",
        clientId: sessionStorage.getItem("clg_controller_id") ?? undefined,
      };
      socket.send(JSON.stringify(payload));
      sessionStorage.setItem("clg_name", name.trim());
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "welcome") {
        setClientId(message.clientId);
        sessionStorage.setItem("clg_controller_id", message.clientId);
        setStatus("接続済み");
        setConnecting(false);
      }
      if (message.type === "state") {
        setState(message.state);
      }
      if (message.type === "system") {
        setStatus(message.message);
      }
      if (message.type === "navigate" && message.targetRoles.includes("controller")) {
        navigateToPlay();
      }
    };

    socket.onerror = () => {
      setStatus("接続エラー");
      setConnecting(false);
    };

    socket.onclose = () => {
      setStatus("切断されました");
      setConnecting(false);
      wsRef.current = null;
    };
  };

  useEffect(() => {
    if (
      name &&
      (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)
    ) {
      connect();
    }
    return () => wsRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.phase === "playing") {
      navigateToPlay();
    }
  }, [state.phase]);

  return (
    <div className="controller-page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Controller Lobby</span>
          <span className="status">{status}</span>
        </div>
        <h1>参加準備</h1>
        <p>ゲーム開始後、自動でサイコロ専用画面へ移動します。</p>
      </header>

      <section className="panel">
        <h2>参加</h2>
        <div className="grid">
          <label>
            名前
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button onClick={connect} disabled={connecting}>
            参加する
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>待機中メンバー</h2>
        <div className="players">
          {state.players.length === 0 && (
            <div className="placeholder">ホストの開始を待っています。</div>
          )}
          {state.players.map((player, index) => (
            <div key={player.id} className="player-card">
              <div className="player-name">
                {player.name} {state.turnIndex === index ? "(先手)" : ""}
              </div>
              <div className="stats">
                <span>{player.online ? "接続中" : "オフライン"}</span>
                <span>位置 {player.position}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>接続情報</h2>
        <div className="stats">
          <span>ホストURL: {hostUrl}</span>
          <span>ID: {clientId ?? "-"}</span>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControllerLobbyPage />
  </StrictMode>
);
