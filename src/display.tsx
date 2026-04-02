import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import "./App.css";
import "./index.css";
import {
  BOARD_SIZE,
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

function DisplayPage() {
  const [status, setStatus] = useState("接続準備中");
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);

  const currentTurnPlayer = useMemo(() => {
    if (state.players.length === 0) return undefined;
    return state.players[state.turnIndex % state.players.length];
  }, [state.players, state.turnIndex]);

  useEffect(() => {
    const targetUrl = wsUrlFromInput(hostUrl);
    if (!targetUrl) {
      setStatus("接続先URLが不正です");
      return;
    }

    setStatus("接続中...");
    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "join",
        name: "Display",
        role: "display",
      };
      socket.send(JSON.stringify(payload));
      setStatus("接続済み");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "state") {
        setState(message.state);
      }
      if (message.type === "system") {
        setStatus(message.message);
      }
    };

    socket.onclose = () => setStatus("切断されました");
    socket.onerror = () => setStatus("接続エラー");

    return () => socket.close();
  }, [hostUrl]);

  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setStatus("フルスクリーンに失敗しました");
    }
  };

  return (
    <div className="display-page">
      <header className="display-header">
        <div className="display-brand">Campus Life Game / Display</div>
        <div className="display-turn">今の番: {currentTurnPlayer?.name ?? "待機中"}</div>
        <div className="display-roll">
          直近の出目:{" "}
          {state.lastRoll ? `${state.lastRoll.playerName} が ${state.lastRoll.value}` : "-"}
        </div>
        <button className="display-fullscreen" onClick={requestFullscreen}>
          フルスクリーン
        </button>
      </header>

      <main className="display-main">
        <section className="display-board">
          <Board players={state.players} />
        </section>
        <section className="display-side">
          <div className="panel">
            <h2>接続状態</h2>
            <div className="stats">
              <span>{status}</span>
              <span>Round {state.round}</span>
              <span>参加 {state.players.length}人</span>
            </div>
          </div>
          <div className="panel">
            <h2>プレイヤー位置</h2>
            <div className="players compact">
              {state.players.map((player, index) => (
                <div key={player.id} className="player-card">
                  <div className="player-name">
                    {player.name} {state.turnIndex === index ? "(今の番)" : ""}
                  </div>
                  <div className="stats">
                    <span>位置 {player.position} / {BOARD_SIZE}</span>
                    <span>出目 {player.lastRoll ?? "-"}</span>
                    <span>{player.online ? "接続中" : "オフライン"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DisplayPage />
  </StrictMode>
);
