import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  type ClientMessage,
  type GameState,
  type ServerMessage,
  colorForPlayer,
  getRoundInfo,
  wsUrlFromInput,
  defaultGameState,
} from "./gameShared";

// ─── Styles ──────────────────────────────────────────────────────
const S = {
  root: {
    background: "#fafafa",
    minHeight: "100vh",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 16,
    color: "#1a1a2e",
    touchAction: "manipulation" as const,
    overscrollBehavior: "none" as const,
  },
  header: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    padding: "40px 24px 32px",
    textAlign: "center" as const,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 8,
  },
  headerSub: {
    fontSize: 15,
    opacity: 0.85,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "24px 20px",
    margin: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    border: "1px solid #d1d5db",
    borderRadius: 12,
    outline: "none",
    boxSizing: "border-box" as const,
    marginBottom: 12,
    background: "#f9fafb",
  },
  joinBtn: (disabled: boolean) => ({
    width: "100%",
    padding: "16px 0",
    fontSize: 16,
    fontWeight: 700,
    border: "none",
    borderRadius: 12,
    background: disabled ? "#d1d5db" : "#6366f1",
    color: disabled ? "#9ca3af" : "#fff",
    cursor: disabled ? "default" : "pointer",
    touchAction: "manipulation" as const,
    transition: "background 0.2s",
  }),
  statusBar: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    fontSize: 14,
  },
  statusDot: (connected: boolean) => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: connected ? "#22c55e" : "#ef4444",
  }),
  statusText: {
    color: "#6b7280",
  },
  playerList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  playerItem: (color: string) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 12,
    background: "#f9fafb",
    border: `2px solid ${color}33`,
  }),
  playerDot: (color: string, online: boolean) => ({
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: online ? color : "#d1d5db",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  }),
  playerName: {
    fontSize: 15,
    fontWeight: 600,
    flex: 1,
  },
  playerStatus: (online: boolean) => ({
    fontSize: 12,
    color: online ? "#22c55e" : "#9ca3af",
    fontWeight: 500,
  }),
  emptyState: {
    textAlign: "center" as const,
    color: "#9ca3af",
    fontSize: 14,
    padding: "20px 0",
  },
  roundBadge: {
    display: "inline-block",
    padding: "6px 14px",
    borderRadius: 20,
    background: "#ede9fe",
    color: "#6366f1",
    fontSize: 13,
    fontWeight: 600,
    marginTop: 12,
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#9ca3af",
    padding: "6px 0",
  },
} as const;

// ─── Controller Lobby Page ──────────────────────────────────────
function ControllerLobbyPage() {
  const [name, setName] = useState(sessionStorage.getItem("clg_name") ?? "");
  const [state, setState] = useState<GameState>(defaultGameState());
  const [status, setStatus] = useState("未接続");
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [clientId, setClientId] = useState<string | null>(
    sessionStorage.getItem("clg_controller_id")
  );
  const wsRef = useRef<WebSocket | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);

  const navigateToPlay = useCallback(() => {
    window.location.href = `/controller-play.html?host=${encodeURIComponent(hostUrl)}`;
  }, [hostUrl]);

  const connect = useCallback(() => {
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

    setJoining(true);
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

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;

      switch (msg.type) {
        case "welcome":
          setClientId(msg.clientId);
          sessionStorage.setItem("clg_controller_id", msg.clientId);
          setConnected(true);
          setJoined(true);
          setJoining(false);
          setStatus("接続済み");
          break;

        case "state":
          setState(msg.state);
          break;

        case "system":
          setStatus(msg.message);
          break;

        case "navigate":
          if (msg.targetRoles.includes("controller")) {
            navigateToPlay();
          }
          break;
      }
    };

    socket.onerror = () => {
      setStatus("接続エラー");
      setConnected(false);
      setJoining(false);
    };

    socket.onclose = () => {
      setStatus("切断されました");
      setConnected(false);
      setJoining(false);
      wsRef.current = null;
    };
  }, [hostUrl, name, navigateToPlay]);

  // Auto-connect if name is saved
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

  // Redirect if game is already in progress
  useEffect(() => {
    if (
      state.phase !== "lobby" &&
      state.phase !== "result" &&
      joined
    ) {
      navigateToPlay();
    }
  }, [state.phase, joined, navigateToPlay]);

  const handleJoin = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      connect();
    },
    [connect]
  );

  const roundInfo = useMemo(
    () => getRoundInfo(state.currentRound),
    [state.currentRound]
  );

  const isGameInProgress =
    state.phase !== "lobby" && state.phase !== "result";

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTitle}>Campus Life Game</div>
        <div style={S.headerSub}>
          スマホコントローラーで参加しよう
        </div>
        {isGameInProgress && (
          <div style={S.roundBadge}>
            {roundInfo.label} - Round {state.currentRound}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={S.statusBar}>
        <span style={S.statusDot(connected)} />
        <span style={S.statusText}>{status}</span>
      </div>

      {/* Join form */}
      {!joined && (
        <form onSubmit={handleJoin} style={S.card}>
          <div style={S.cardTitle}>参加する</div>
          <input
            style={S.input}
            type="text"
            placeholder="名前を入力..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            autoComplete="off"
          />
          <button
            type="submit"
            style={S.joinBtn(!name.trim() || joining)}
            disabled={!name.trim() || joining}
          >
            {joining ? "接続中..." : "参加する"}
          </button>
        </form>
      )}

      {/* Joined confirmation */}
      {joined && state.phase === "lobby" && (
        <div style={S.card}>
          <div
            style={{
              textAlign: "center",
              padding: "12px 0",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>{"\u2705"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              参加完了!
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              ホストがゲームを開始するまで待ってください
            </div>
          </div>
        </div>
      )}

      {/* Player list */}
      <div style={S.card}>
        <div style={S.cardTitle}>
          待機中メンバー ({state.players.length}人)
        </div>
        {state.players.length === 0 ? (
          <div style={S.emptyState}>
            まだ誰も参加していません
          </div>
        ) : (
          <div style={S.playerList}>
            {state.players.map((player, i) => {
              const color = colorForPlayer(i);
              const initial = player.name.charAt(0).toUpperCase();
              return (
                <div key={player.id} style={S.playerItem(color)}>
                  <div style={S.playerDot(color, player.online)}>
                    {initial}
                  </div>
                  <div style={S.playerName}>
                    {player.name}
                    {player.id === clientId && (
                      <span style={{ color: "#9ca3af", fontWeight: 400 }}>
                        {" "}
                        (あなた)
                      </span>
                    )}
                  </div>
                  <div style={S.playerStatus(player.online)}>
                    {player.online ? "接続中" : "オフライン"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connection info */}
      <div style={S.card}>
        <div style={S.cardTitle}>接続情報</div>
        <div style={S.infoRow}>
          <span>ホスト</span>
          <span style={{ color: "#374151" }}>{hostUrl}</span>
        </div>
        <div style={S.infoRow}>
          <span>ID</span>
          <span style={{ color: "#374151" }}>{clientId ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControllerLobbyPage />
  </StrictMode>
);
