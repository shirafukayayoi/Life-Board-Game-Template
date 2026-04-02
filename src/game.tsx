import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import "./index.css";

type Role = "host" | "player";

type StatKey = "money" | "relations" | "growth" | "fulfillment";

type Player = {
  id: string;
  name: string;
  stats: Record<StatKey, number>;
  position: number;
  lastRoll?: number;
};

type GameState = {
  phase: "lobby" | "playing" | "result";
  round: number;
  players: Player[];
  turnIndex: number;
};

type ServerMessage =
  | { type: "welcome"; clientId: string; hostId?: string; urls?: string[] }
  | { type: "state"; state: GameState }
  | { type: "system"; message: string };

type ClientMessage =
  | { type: "hello"; name: string; role: Role }
  | { type: "player_roll" }
  | { type: "request_state" };

const BOARD_SIZE = 30;
const BOARD_COLUMNS = 10;
const BOARD_ROWS = 8;

const EVENT_TEMPLATES = Array.from({ length: BOARD_SIZE }, (_, index) => ({
  id: `evt-${index + 1}`,
  title: `イベント ${index + 1}`,
  description: "（内容は後で入れ替え予定）",
  choices: [],
}));

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

function getEventByPosition(position: number) {
  if (position <= 0) return null;
  const index = (position - 1) % EVENT_TEMPLATES.length;
  return EVENT_TEMPLATES[index];
}

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

function GamePage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [hostUrlInput, setHostUrlInput] = useState("");
  const [status, setStatus] = useState("未接続");
  const [clientId, setClientId] = useState<string | null>(null);
  const [state, setState] = useState<GameState>({
    phase: "playing",
    round: 0,
    players: [],
    turnIndex: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);

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

  useEffect(() => {
    const savedName = sessionStorage.getItem("clg_name") ?? "";
    const savedRole = (sessionStorage.getItem("clg_role") ?? "") as Role | "";
    const savedHost = sessionStorage.getItem("clg_host") ?? "";
    if (savedName) setName(savedName);
    if (savedRole) setRole(savedRole);
    if (savedHost) setHostUrlInput(savedHost);
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!name || !role || clientId) return;
    if (wsRef.current) return;
    connect();
  }, [name, role, hostUrlInput, clientId]);

  const connect = () => {
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

    setStatus("接続中...");
    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "hello",
        name: name.trim(),
        role: role === "host" ? "host" : "player",
      };
      socket.send(JSON.stringify(payload));
      setStatus("接続済み");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "welcome") {
        setClientId(message.clientId);
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
      setState({ phase: "playing", round: 0, players: [], turnIndex: 0 });
    };
  };

  const sendMessage = (payload: ClientMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const rollDice = () => {
    sendMessage({ type: "player_roll" });
  };

  const outerPath = useMemo(() => {
    const positions: Array<{ row: number; col: number }> = [];
    for (let col = 0; col < BOARD_COLUMNS; col += 1) {
      positions.push({ row: 0, col });
    }
    for (let row = 1; row < BOARD_ROWS - 1; row += 1) {
      positions.push({ row, col: BOARD_COLUMNS - 1 });
    }
    for (let col = BOARD_COLUMNS - 1; col >= 0; col -= 1) {
      positions.push({ row: BOARD_ROWS - 1, col });
    }
    for (let row = BOARD_ROWS - 2; row >= 1; row -= 1) {
      positions.push({ row, col: 0 });
    }
    return positions.slice(0, BOARD_SIZE);
  }, []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    outerPath.forEach((pos, index) => {
      map.set(`${pos.row}-${pos.col}`, index + 1);
    });
    return map;
  }, [outerPath]);

  const directionMap = useMemo(() => {
    const map = new Map<number, string>();
    outerPath.forEach((pos, index) => {
      const next = outerPath[(index + 1) % outerPath.length];
      if (!next) return;
      let arrow = "right";
      if (next.row > pos.row) arrow = "down";
      if (next.row < pos.row) arrow = "up";
      if (next.col < pos.col) arrow = "left";
      map.set(index + 1, arrow);
    });
    return map;
  }, [outerPath]);

  const gridCells = useMemo(
    () =>
      Array.from({ length: BOARD_ROWS * BOARD_COLUMNS }, (_, index) => ({
        row: Math.floor(index / BOARD_COLUMNS),
        col: index % BOARD_COLUMNS,
      })),
    []
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Campus Life Game</span>
          <span className="status">{status}</span>
        </div>
        <h1>サイコロで進む人生ゲーム</h1>
        <p>30マスを進みながら、イベントの枠だけ先に進めます。</p>
      </header>

      {!clientId && (
        <section className="panel">
          <h2>接続</h2>
          <div className="grid">
            <label>
              名前
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              接続先URL
              <input
                value={hostUrlInput}
                onChange={(e) => setHostUrlInput(e.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button onClick={connect}>接続する</button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>あなたのターン</h2>
          <span className="round">位置 {myPlayer?.position ?? 0} / {BOARD_SIZE}</span>
        </div>
        <div className="turn-banner">
          今の番: {currentTurnPlayer?.name ?? "待機中"}
        </div>
        <div className="actions">
          <button
            onClick={rollDice}
            disabled={
              !clientId ||
              state.phase !== "playing" ||
              currentTurnPlayer?.id !== clientId
            }
          >
            サイコロを振る
          </button>
        </div>
        <div className="placeholder">
          出目: {myPlayer?.lastRoll ?? "-"}
        </div>
        {currentEvent && (
          <div className="event">
            <h3>{currentEvent.title}</h3>
            <p>{currentEvent.description}</p>
            <div className="placeholder">選択肢は後で入ります。</div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>ボード</h2>
          <span className="round">{BOARD_COLUMNS} x {BOARD_ROWS}</span>
        </div>
        <div
          className="board"
          style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))` }}
        >
          {gridCells.map((cell) => {
            const position = cellMap.get(`${cell.row}-${cell.col}`) ?? null;
            const occupants = position
              ? state.players.filter((player) => player.position === position)
              : [];
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                className={`board-cell ${position ? "active" : "empty"}`}
              >
                {position ? (
                  <>
                    <div className="cell-number">{position}</div>
                    <span
                      className={`cell-arrow dir-${directionMap.get(position) ?? "right"}`}
                      aria-hidden
                    />
                    <div className="cell-tokens">
                      {occupants.map((player) => (
                        <div
                          key={player.id}
                          className="token"
                          style={{ backgroundColor: colorForId(player.id) }}
                          title={player.name}
                        >
                          {player.name.slice(0, 1)}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="cell-center">
                    <div className="center-title">Campus Life</div>
                    <div className="center-sub">人生ゲーム</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>進行状況（共有）</h2>
        <div className="players">
          {state.players.length === 0 && (
            <div className="placeholder">参加者がまだいません。</div>
          )}
          {state.players.map((player) => (
            <div key={player.id} className="player-card">
              <div className="player-name">{player.name}</div>
              <div className="stats">
                <span>位置 {player.position} / {BOARD_SIZE}</span>
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
    </div>
  );
}

export default GamePage;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GamePage />
  </StrictMode>
);
