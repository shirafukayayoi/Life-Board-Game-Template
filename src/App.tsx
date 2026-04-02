import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import "./App.css";
import {
  choosePrimaryHostUrl,
  type ClientMessage,
  type GameState,
  type ServerMessage,
  wsUrlFromInput,
} from "./gameShared";

const DEFAULT_STATE: GameState = {
  phase: "lobby",
  round: 0,
  players: [],
  turnIndex: 0,
  lastRoll: null,
};

function App() {
  const [name, setName] = useState("Host");
  const [hostUrlInput, setHostUrlInput] = useState("");
  const [status, setStatus] = useState("未接続");
  const [clientId, setClientId] = useState<string | null>(null);
  const [hostUrls, setHostUrls] = useState<string[]>([]);
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const primaryHostUrl = useMemo(
    () => choosePrimaryHostUrl(hostUrls),
    [hostUrls]
  );

  const controllerEntryUrl = useMemo(() => {
    if (!primaryHostUrl) return "";
    return `${primaryHostUrl}/controller.html?host=${encodeURIComponent(primaryHostUrl)}`;
  }, [primaryHostUrl]);

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
      setState(DEFAULT_STATE);
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
    sendMessage({ type: "start_game" });
    const hostBase = primaryHostUrl || window.location.origin;
    window.location.href = `/display.html?host=${encodeURIComponent(hostBase)}`;
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Campus Life Game</span>
          <span className="status">{status}</span>
        </div>
        <h1>モニター共有型 人生ゲーム</h1>
        <p>
          モニターは表示専用、参加者はスマホで入力。順番制サイコロで会話が生まれる構成です。
        </p>
      </header>

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
          <button onClick={startGame} className="ghost" disabled={!clientId}>
            ゲームを開始！
          </button>
        </div>
      </section>

      {clientId && controllerEntryUrl && (
        <section className="panel">
          <h2>参加者向けQR（Controller）</h2>
          <div className="controller-qr">
            <QRCodeCanvas value={controllerEntryUrl} size={220} />
            <div className="note-urls">{controllerEntryUrl}</div>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>プレイヤー一覧</h2>
        <div className="players">
          {state.players.length === 0 && (
            <div className="placeholder">まだ参加者はいません。</div>
          )}
          {state.players.map((player, index) => (
            <div key={player.id} className="player-card">
              <div className="player-name">
                {player.name} {state.turnIndex === index ? "(今の番)" : ""}
              </div>
              <div className="stats">
                <span>状態 {player.online ? "接続中" : "オフライン"}</span>
                <span>位置 {player.position} / 30</span>
                <span>出目 {player.lastRoll ?? "-"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
