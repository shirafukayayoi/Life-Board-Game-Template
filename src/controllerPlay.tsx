import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import "./index.css";
import {
  BOARD_SIZE,
  getEventByPosition,
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

function ControllerPlayPage() {
  const [name] = useState(sessionStorage.getItem("clg_name") ?? "");
  const [status, setStatus] = useState("未接続");
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [clientId, setClientId] = useState<string | null>(
    sessionStorage.getItem("clg_controller_id")
  );
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);

  const myPlayer = useMemo(() => {
    if (!clientId) return undefined;
    return state.players.find((player) => player.id === clientId);
  }, [clientId, state.players]);

  const currentTurnPlayer = useMemo(() => {
    if (state.players.length === 0) return undefined;
    return state.players[state.turnIndex % state.players.length];
  }, [state.players, state.turnIndex]);

  const currentEvent = useMemo(() => {
    if (!myPlayer) return null;
    return getEventByPosition(myPlayer.position);
  }, [myPlayer]);

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

  const sendMessage = (payload: ClientMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const rollDice = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      return;
    }
    sendMessage({ type: "player_roll" });
  };
  const canRoll =
    !!clientId &&
    state.phase === "playing" &&
    currentTurnPlayer?.id === clientId &&
    myPlayer?.online;

  return (
    <div className="controller-page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Dice Controller</span>
          <span className="status">{status}</span>
        </div>
        <h1>サイコロ専用画面</h1>
        <p>今の番: {currentTurnPlayer?.name ?? "待機中"}</p>
      </header>

      <section className="panel">
        <h2>あなたのターン</h2>
        <div className="stats">
          <span>位置 {myPlayer?.position ?? 0} / {BOARD_SIZE}</span>
          <span>出目 {myPlayer?.lastRoll ?? "-"}</span>
        </div>
        <div className="actions">
          <button onClick={rollDice} disabled={!canRoll || connecting}>
            サイコロを振る
          </button>
          <button onClick={connect} className="ghost" disabled={connecting}>
            再接続
          </button>
        </div>
        {!canRoll && (
          <div className="placeholder">
            {state.phase !== "playing"
              ? "ゲーム開始待ちです。"
              : `現在の番: ${currentTurnPlayer?.name ?? "-"}`}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>イベント枠</h2>
        {currentEvent ? (
          <div className="event">
            <h3>{currentEvent.title}</h3>
            <p>{currentEvent.description}</p>
          </div>
        ) : (
          <div className="placeholder">ゲーム開始待ちです。</div>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControllerPlayPage />
  </StrictMode>
);
