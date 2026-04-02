import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import "./App.css";

type Role = "host" | "player";

type StatKey = "money" | "relations" | "growth" | "fulfillment";

type Player = {
  id: string;
  name: string;
  stats: Record<StatKey, number>;
  lastChoiceId?: string;
  position: number;
  lastRoll?: number;
};

type GameState = {
  phase: "lobby" | "playing" | "result";
  round: number;
  players: Player[];
};

type ServerMessage =
  | { type: "welcome"; clientId: string; hostId?: string; urls?: string[] }
  | { type: "state"; state: GameState }
  | { type: "system"; message: string }
  | { type: "navigate"; url: string };

type ClientMessage =
  | { type: "hello"; name: string; role: Role }
  | { type: "navigate"; url: string }
  | { type: "request_state" };

const DEFAULT_STATE: GameState = {
  phase: "lobby",
  round: 0,
  players: [],
};

function wsUrlFromInput(input: string) {
  if (!input) return "";
  try {
    const url = new URL(input);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${url.host}`;
  } catch {
    return "";
  }
}

function App() {
  const [role, setRole] = useState<Role | "">("");
  const [name, setName] = useState("");
  const [hostUrlInput, setHostUrlInput] = useState("");
  const [status, setStatus] = useState("未接続");
  const [clientId, setClientId] = useState<string | null>(null);
  const [hostUrls, setHostUrls] = useState<string[]>([]);
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const isHost = role === "host";

  const joinParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("join") ?? "";
  }, []);

  const filteredHostUrls = useMemo(() => {
    return hostUrls.filter((url) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        return host.startsWith("192.168.");
      } catch {
        return false;
      }
    });
  }, [hostUrls]);

  const primaryHostUrl = useMemo(() => {
    if (filteredHostUrls.length > 0) return filteredHostUrls[0];
    if (hostUrls.length === 0) return "";
    return hostUrls.find((url) => !url.includes("localhost")) ?? hostUrls[0];
  }, [filteredHostUrls, hostUrls]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (joinParam) {
      setHostUrlInput(joinParam);
    }
  }, [joinParam]);

  const connect = (selectedRole: Role) => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      return;
    }
    if (isConnecting || role) return;
    if (!name.trim()) {
      setStatus("名前を入力してください");
      return;
    }
    const targetUrl = hostUrlInput
      ? wsUrlFromInput(hostUrlInput)
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${
          window.location.host
        }`;
    if (!targetUrl) {
      setStatus("接続先URLが正しくありません");
      return;
    }

    setRole(selectedRole);
    setStatus("接続中...");
    setIsConnecting(true);

    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "hello",
        name: name.trim(),
        role: selectedRole,
      };
      socket.send(JSON.stringify(payload));
      setStatus("接続済み");
      setIsConnecting(false);
      sessionStorage.setItem("clg_name", name.trim());
      sessionStorage.setItem("clg_role", selectedRole);
      if (hostUrlInput) {
        sessionStorage.setItem("clg_host", hostUrlInput.trim());
      }
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
      if (message.type === "navigate") {
        window.location.href = message.url;
      }
    };

    socket.onclose = () => {
      setStatus("切断されました");
      setRole("");
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
    if (!isHost) return;
    sendMessage({ type: "navigate", url: "/game.html" });
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Campus Life Game</span>
          <span className="status">{status}</span>
        </div>
        <div className="hero-main">
          <div>
            <h1>人生ゲームを、同じ場でつなぐ。</h1>
            <p>
              オフライン会場で動く、ホスト方式のキャンパス人生ゲーム。
              進むほど広がる選択肢を、全員が同じタイミングで共有できます。
            </p>
          </div>
          {isHost && primaryHostUrl && (
            <div className="hero-qr">
              <QRCodeCanvas
                value={`${primaryHostUrl}/?join=${encodeURIComponent(
                  primaryHostUrl
                )}`}
                size={160}
              />
              <span>参加用QR</span>
            </div>
          )}
        </div>
      </header>

      <section className="panel">
        <h2>参加の準備</h2>
        <div className="grid">
          <label>
            名前
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: まゆ"
            />
          </label>
          <label>
            接続先URL（ホストのみ空欄でOK）
            <input
              value={hostUrlInput}
              onChange={(e) => setHostUrlInput(e.target.value)}
              placeholder="例: http://192.168.0.5:4173"
            />
          </label>
        </div>
        <div className="actions">
          <button onClick={() => connect("host")} disabled={isConnecting || !!role}>
            ホストとして開始
          </button>
          <button
            className="ghost"
            onClick={() => connect("player")}
            disabled={isConnecting || !!role}
          >
            参加する
          </button>
        </div>
        {isHost && (filteredHostUrls.length > 0 || hostUrls.length > 0) && (
          <div className="note">
            <div className="note-title">参加者向けURL</div>
            <div className="note-urls">
              {(filteredHostUrls.length > 0 ? filteredHostUrls : hostUrls).join(
                " / "
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>ゲーム進行</h2>
          <span className="round">{state.phase === "playing" ? "進行中" : "待機中"}</span>
        </div>

        {isHost && (
          <div className="actions">
            <button onClick={startGame} disabled={!clientId}>
              ゲームを開始！
            </button>
          </div>
        )}

        {state.phase === "lobby" && (
          <div className="placeholder">
            ホストが開始ボタンを押すと全員がゲーム画面へ移動します。
          </div>
        )}
      </section>

      <section className="panel">
        <h2>プレイヤー状況</h2>
        <div className="players">
          {state.players.length === 0 && (
            <div className="placeholder">参加者がまだいません。</div>
          )}
          {state.players.map((player) => (
            <div key={player.id} className="player-card">
              <div className="player-name">{player.name}</div>
              <div className="stats">
                <span>位置 {player.position} / 30</span>
                <span>出目 {player.lastRoll ?? "-"}</span>
                <span>お金 {player.stats.money}</span>
                <span>人間関係 {player.stats.relations}</span>
                <span>成長 {player.stats.growth}</span>
                <span>充実度 {player.stats.fulfillment}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        ホストは同じWi-Fi内で参加者にURLを共有してください。
      </footer>
    </div>
  );
}

export default App;
