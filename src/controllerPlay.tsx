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
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import {
  type ClientMessage,
  type ServerMessage,
  type GameState,
  type GameEvent,
  type ChoiceResult,
  type PlayerResult,
  type Player,
  type StatEffects,
  type ResourceKey,
  type ExperienceKey,
  RESOURCE_KEYS,
  RESOURCE_LABELS,
  RESOURCE_RANGES,
  EXPERIENCE_KEYS,
  EXPERIENCE_LABELS,
  EXPERIENCE_RANGES,
  colorForPlayer,
  getRoundInfo,
  wsUrlFromInput,
  defaultGameState,
} from "./gameShared";

// ─── Flag display helpers ────────────────────────────────────────
const FLAG_DISPLAY: Record<string, { emoji: string; label: string }> = {
  living_alone: { emoji: "\u{1F3E0}", label: "\u4E00\u4EBA\u66AE\u3089\u3057" },
  has_partner: { emoji: "\u{1F495}", label: "\u604B\u4EBA\u3042\u308A" },
  has_license: { emoji: "\u{1F697}", label: "\u514D\u8A31\u3042\u308A" },
  studying_abroad: { emoji: "\u2708\uFE0F", label: "\u7559\u5B66\u4E2D" },
  on_leave: { emoji: "\u{1F4A4}", label: "\u4F11\u5B66\u4E2D" },
  in_seminar: { emoji: "\u{1F393}", label: "\u30BC\u30DF\u6240\u5C5E" },
  teaching_cert: { emoji: "\u{1F4DC}", label: "\u6559\u8077\u8AB2\u7A0B" },
};

const RESOURCE_EMOJI: Record<ResourceKey, string> = {
  time: "\u23F0",
  health: "\u2764\uFE0F",
  money: "\u{1F4B0}",
  credits: "\u{1F4DA}",
};

const STAT_COLORS: Record<string, string> = {
  time: "#3b82f6",
  health: "#ef4444",
  money: "#f59e0b",
  credits: "#8b5cf6",
  intellect: "#6366f1",
  connections: "#ec4899",
  work_tolerance: "#f97316",
  action_power: "#14b8a6",
  romance_exp: "#e11d48",
};

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
    paddingBottom: 32,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  roundBadge: {
    fontSize: 13,
    fontWeight: 600,
    color: "#6b7280",
  },
  statusDot: (connected: boolean) => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: connected ? "#22c55e" : "#ef4444",
    marginRight: 6,
  }),
  statusText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  section: {
    padding: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "20px",
    margin: "0 16px 16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  },
  waitingMsg: (pulse: boolean) => ({
    textAlign: "center" as const,
    padding: "40px 20px",
    fontSize: 18,
    fontWeight: 500,
    color: "#6b7280",
    animation: pulse ? "pulse 2s ease-in-out infinite" : "none",
  }),
  diceButton: (color: string) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 140,
    height: 140,
    borderRadius: 28,
    border: "none",
    background: `linear-gradient(135deg, ${color}, ${color}dd)`,
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    cursor: "pointer",
    margin: "20px auto",
    boxShadow: `0 8px 24px ${color}44`,
    transition: "transform 0.15s, box-shadow 0.15s",
    touchAction: "manipulation" as const,
  }),
  diceResult: {
    textAlign: "center" as const,
    padding: "24px 0",
  },
  diceNumber: {
    fontSize: 64,
    fontWeight: 800,
    lineHeight: 1,
  },
  diceAdvanced: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 8,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 8,
  },
  eventDesc: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 1.6,
    marginBottom: 20,
  },
  choiceCard: (available: boolean, selected: boolean) => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "16px",
    borderRadius: 16,
    border: selected
      ? "2px solid #3b82f6"
      : available
        ? "1px solid #e5e7eb"
        : "1px solid #e5e7eb",
    background: available ? "#fff" : "#f3f4f6",
    opacity: available ? 1 : 0.55,
    cursor: available ? "pointer" : "default",
    marginBottom: 12,
    boxShadow: available
      ? "0 1px 3px rgba(0,0,0,0.06)"
      : "none",
    transition: "border-color 0.15s, transform 0.1s",
    touchAction: "manipulation" as const,
  }),
  choiceLetter: (color: string) => ({
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: color,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
  }),
  choiceLabel: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 6,
  },
  effectBadge: (positive: boolean) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    marginRight: 4,
    marginBottom: 4,
    background: positive ? "#dcfce7" : "#fef2f2",
    color: positive ? "#166534" : "#991b1b",
  }),
  conditionText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  confirmOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24,
  },
  confirmDialog: {
    background: "#fff",
    borderRadius: 20,
    padding: "28px 24px",
    maxWidth: 340,
    width: "100%",
    textAlign: "center" as const,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 20,
  },
  confirmBtns: {
    display: "flex",
    gap: 12,
  },
  confirmBtn: (primary: boolean) => ({
    flex: 1,
    padding: "14px 0",
    borderRadius: 12,
    border: primary ? "none" : "1px solid #d1d5db",
    background: primary ? "#3b82f6" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation" as const,
  }),
  // Stats dashboard
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 16,
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statEmoji: {
    fontSize: 20,
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
  },
  statBar: (pct: number, color: string) => ({
    height: 4,
    borderRadius: 2,
    background: "#e5e7eb",
    marginTop: 2,
    position: "relative" as const,
    overflow: "hidden" as const,
    width: "100%",
    backgroundImage: `linear-gradient(to right, ${color} ${pct}%, #e5e7eb ${pct}%)`,
  }),
  expItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "4px 0",
    fontSize: 14,
  },
  flagBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 16,
    background: "#ede9fe",
    color: "#5b21b6",
    fontSize: 13,
    fontWeight: 500,
    marginRight: 6,
    marginBottom: 6,
  },
  // Animation badges
  animBadge: (positive: boolean) => ({
    display: "inline-block",
    fontSize: 20,
    fontWeight: 700,
    color: positive ? "#22c55e" : "#ef4444",
    animation: "floatUp 1.5s ease-out forwards",
    marginRight: 8,
  }),
  // Result
  resultEmoji: {
    fontSize: 64,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: 800,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  resultDesc: {
    fontSize: 15,
    color: "#4b5563",
    textAlign: "center" as const,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  resultRank: {
    fontSize: 40,
    fontWeight: 800,
    textAlign: "center" as const,
    marginBottom: 16,
  },
  // Tab bar
  tabBar: {
    display: "flex",
    borderBottom: "2px solid #e5e7eb",
    marginBottom: 16,
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: "10px 0",
    textAlign: "center" as const,
    fontSize: 14,
    fontWeight: 600,
    color: active ? "#3b82f6" : "#9ca3af",
    borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomStyle: "solid" as const,
    borderBottomWidth: 2,
    borderBottomColor: active ? "#3b82f6" : "transparent",
    touchAction: "manipulation" as const,
  }),
} as const;

// ─── Inject keyframe animations ─────────────────────────────────
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes floatUp {
    0% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-40px); }
  }
  @keyframes diceShake {
    0%, 100% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(-8deg) scale(1.05); }
    75% { transform: rotate(8deg) scale(1.05); }
  }
`;
document.head.appendChild(styleTag);

// ─── Helper: render stat effects as badges ──────────────────────
function EffectBadges({ effects }: { effects: StatEffects }) {
  const allKeys = [...RESOURCE_KEYS, ...EXPERIENCE_KEYS] as string[];
  const labels: Record<string, string> = { ...RESOURCE_LABELS, ...EXPERIENCE_LABELS };
  const entries = allKeys
    .filter((k) => (effects as Record<string, number>)[k] !== undefined)
    .map((k) => ({
      key: k,
      value: (effects as Record<string, number>)[k],
      label: labels[k],
    }));
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {entries.map((e) => (
        <span key={e.key} style={S.effectBadge(e.value > 0)}>
          {e.value > 0 ? "+" : ""}
          {e.value} {e.label}
        </span>
      ))}
    </div>
  );
}

// ─── Stats Dashboard Component ──────────────────────────────────
function StatsDashboard({ player }: { player: Player }) {
  const [tab, setTab] = useState<"resources" | "experience" | "flags">(
    "resources"
  );

  const activeFlags = useMemo(() => {
    const result: { key: string; emoji: string; label: string }[] = [];
    for (const [key, info] of Object.entries(FLAG_DISPLAY)) {
      if ((player.flags as Record<string, unknown>)[key]) {
        result.push({ key, ...info });
      }
    }
    if (player.flags.club_type && player.flags.club_type !== "none") {
      result.push({
        key: "club",
        emoji: "\u{1F3AF}",
        label: player.flags.club_type,
      });
    }
    if (player.flags.job_type) {
      result.push({
        key: "job",
        emoji: "\u{1F4BC}",
        label: player.flags.job_type,
      });
    }
    return result;
  }, [player.flags]);

  return (
    <div>
      <div style={S.tabBar}>
        <button
          style={S.tab(tab === "resources")}
          onClick={() => setTab("resources")}
        >
          リソース
        </button>
        <button
          style={S.tab(tab === "experience")}
          onClick={() => setTab("experience")}
        >
          経験値
        </button>
        <button
          style={S.tab(tab === "flags")}
          onClick={() => setTab("flags")}
        >
          状態
        </button>
      </div>

      {tab === "resources" && (
        <div style={S.statsGrid}>
          {RESOURCE_KEYS.map((key) => {
            const range = RESOURCE_RANGES[key];
            const val = player.resources[key];
            const pct = Math.max(
              0,
              Math.min(
                100,
                ((val - range.min) / (range.max - range.min)) * 100
              )
            );
            return (
              <div key={key}>
                <div style={S.statItem}>
                  <span style={S.statEmoji}>{RESOURCE_EMOJI[key]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={S.statLabel}>{RESOURCE_LABELS[key]}</div>
                    <div style={S.statValue}>{val}</div>
                    <div style={S.statBar(pct, STAT_COLORS[key])} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "experience" && (
        <div>
          {EXPERIENCE_KEYS.map((key) => {
            const range = EXPERIENCE_RANGES[key];
            const val = player.experience[key];
            const pct = Math.max(
              0,
              Math.min(
                100,
                ((val - range.min) / (range.max - range.min)) * 100
              )
            );
            return (
              <div key={key} style={S.expItem}>
                <span>{EXPERIENCE_LABELS[key]}</span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      ...S.statBar(pct, STAT_COLORS[key]),
                    }}
                  />
                  <span style={{ fontWeight: 700, minWidth: 20 }}>{val}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "flags" && (
        <div style={{ padding: "8px 0" }}>
          {activeFlags.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              まだ特殊な状態はありません
            </div>
          ) : (
            activeFlags.map((f) => (
              <span key={f.key} style={S.flagBadge}>
                {f.emoji}
                {f.label}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Controller Play Page ──────────────────────────────────
function ControllerPlayPage() {
  const [state, setState] = useState<GameState>(defaultGameState());
  const [clientId, setClientId] = useState<string | null>(
    sessionStorage.getItem("clg_controller_id")
  );
  const [name] = useState(sessionStorage.getItem("clg_name") ?? "");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("接続中...");

  // Event/choice state from server messages
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const [availableChoiceIds, setAvailableChoiceIds] = useState<string[]>([]);
  const [eventTargetPlayerId, setEventTargetPlayerId] = useState<string | null>(
    null
  );
  const [lastChoiceResult, setLastChoiceResult] =
    useState<ChoiceResult | null>(null);
  const [gameResults, setGameResults] = useState<PlayerResult[] | null>(null);

  // UI state
  const [confirmChoice, setConfirmChoice] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [showStatChanges, setShowStatChanges] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);

  const myPlayer = useMemo(() => {
    if (!clientId) return undefined;
    return state.players.find((p) => p.id === clientId);
  }, [clientId, state.players]);

  const myPlayerIndex = useMemo(() => {
    if (!clientId) return 0;
    const idx = state.players.findIndex((p) => p.id === clientId);
    return idx >= 0 ? idx : 0;
  }, [clientId, state.players]);

  const currentTurnPlayer = useMemo(() => {
    if (state.players.length === 0) return undefined;
    return state.players[state.turnIndex % state.players.length];
  }, [state.players, state.turnIndex]);

  const isMyTurn = useMemo(
    () => !!clientId && currentTurnPlayer?.id === clientId,
    [clientId, currentTurnPlayer]
  );

  const roundInfo = useMemo(
    () => getRoundInfo(state.currentRound),
    [state.currentRound]
  );

  const accentColor = useMemo(
    () => colorForPlayer(myPlayerIndex),
    [myPlayerIndex]
  );

  // ─── WebSocket connection ───────────────────────────────────
  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
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
        name: name.trim(),
        role: "controller",
        clientId: sessionStorage.getItem("clg_controller_id") ?? undefined,
      };
      socket.send(JSON.stringify(payload));
    };

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;

      switch (msg.type) {
        case "welcome":
          setClientId(msg.clientId);
          sessionStorage.setItem("clg_controller_id", msg.clientId);
          setConnected(true);
          setStatus("接続済み");
          break;

        case "state":
          setState(msg.state);
          // Clear event if phase changed away from choosing
          if (
            msg.state.phase !== "choosing" &&
            msg.state.phase !== "animating"
          ) {
            setCurrentEvent(null);
            setAvailableChoiceIds([]);
            setEventTargetPlayerId(null);
          }
          if (msg.state.phase !== "animating") {
            setLastChoiceResult(null);
            setShowStatChanges(false);
          }
          break;

        case "show_event":
          setCurrentEvent(msg.event);
          setAvailableChoiceIds(msg.availableChoiceIds);
          setEventTargetPlayerId(msg.playerId);
          setRolling(false);
          break;

        case "choice_result":
          setLastChoiceResult(msg.result);
          setCurrentEvent(null);
          setConfirmChoice(null);
          setShowStatChanges(true);
          setTimeout(() => setShowStatChanges(false), 2000);
          break;

        case "game_result":
          setGameResults(msg.results);
          break;

        case "system":
          setStatus(msg.message);
          break;

        case "navigate":
          if (msg.targetRoles.includes("controller")) {
            window.location.href = msg.url;
          }
          break;
      }
    };

    socket.onerror = () => {
      setStatus("接続エラー");
      setConnected(false);
    };

    socket.onclose = () => {
      setStatus("切断されました");
      setConnected(false);
      wsRef.current = null;
      // Auto reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, [hostUrl, name]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    (payload: ClientMessage) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  // ─── Actions ────────────────────────────────────────────────
  const handleRoll = useCallback(() => {
    setRolling(true);
    sendMessage({ type: "player_roll" });
  }, [sendMessage]);

  const handleChoiceConfirm = useCallback(() => {
    if (!confirmChoice) return;
    sendMessage({ type: "player_choice", choiceId: confirmChoice });
    setConfirmChoice(null);
  }, [confirmChoice, sendMessage]);

  // ─── Determine visual state ─────────────────────────────────
  type ViewState =
    | "waiting"
    | "rolling"
    | "dice_result"
    | "choosing"
    | "animating"
    | "result";

  const viewState = useMemo((): ViewState => {
    if (gameResults || state.phase === "result") return "result";
    if (showStatChanges && lastChoiceResult) return "animating";
    if (currentEvent && eventTargetPlayerId === clientId) return "choosing";
    if (isMyTurn && state.phase === "rolling" && state.lastRoll) return "dice_result";
    if (isMyTurn && state.phase === "rolling") return "rolling";
    return "waiting";
  }, [
    state.phase,
    state.lastRoll,
    isMyTurn,
    currentEvent,
    eventTargetPlayerId,
    clientId,
    lastChoiceResult,
    showStatChanges,
    gameResults,
  ]);

  // ─── Render helpers ─────────────────────────────────────────

  const renderWaiting = () => (
    <div style={S.card}>
      <div style={S.waitingMsg(true)}>
        {state.phase === "lobby"
          ? "ゲーム開始を待っています..."
          : `${currentTurnPlayer?.name ?? "..."}のターン中...`}
      </div>
    </div>
  );

  const renderRolling = () => (
    <div style={S.card}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          あなたのターン!
        </div>
        <button
          style={{
            ...S.diceButton(accentColor),
            ...(rolling
              ? { animation: "diceShake 0.3s ease-in-out infinite" }
              : {}),
          }}
          onClick={handleRoll}
          disabled={rolling}
        >
          {rolling ? "..." : "\u{1F3B2}\u0020振る"}
        </button>
        <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 8 }}>
          タップしてサイコロを振ろう
        </div>
      </div>
    </div>
  );

  const renderDiceResult = () => {
    const roll = state.lastRoll;
    if (!roll) return null;
    return (
      <div style={S.card}>
        <div style={S.diceResult}>
          <div style={{ ...S.diceNumber, color: accentColor }}>
            {roll.value}
          </div>
          <div style={S.diceAdvanced}>
            {roll.squaresAdvanced}マス進む
          </div>
        </div>
      </div>
    );
  };

  const renderChoosing = () => {
    if (!currentEvent) return null;
    const CHOICE_COLORS = [
      "#3b82f6",
      "#f59e0b",
      "#ef4444",
      "#22c55e",
      "#8b5cf6",
    ];
    return (
      <div style={S.card}>
        <div style={S.eventTitle}>{currentEvent.title}</div>
        <div style={S.eventDesc}>{currentEvent.description}</div>

        {currentEvent.choices.map((choice, i) => {
          const isAvailable = availableChoiceIds.includes(choice.id);
          const letter = String.fromCharCode(65 + i);
          return (
            <div
              key={choice.id}
              style={S.choiceCard(isAvailable, confirmChoice === choice.id)}
              onClick={() => {
                if (isAvailable) setConfirmChoice(choice.id);
              }}
            >
              <div
                style={S.choiceLetter(
                  isAvailable ? CHOICE_COLORS[i % CHOICE_COLORS.length] : "#9ca3af"
                )}
              >
                {letter}
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.choiceLabel}>{choice.label}</div>
                <EffectBadges effects={choice.effects} />
                {!isAvailable && choice.condition && (
                  <div style={S.conditionText}>
                    条件:{" "}
                    {choice.condition.requiredFlags
                      ? Object.entries(choice.condition.requiredFlags)
                          .filter(([, v]) => v)
                          .map(
                            ([k]) =>
                              FLAG_DISPLAY[k]?.label ?? k
                          )
                          .join(", ")
                      : ""}
                    {choice.condition.minStats
                      ? Object.entries(choice.condition.minStats)
                          .map(([k, v]) => {
                            const label =
                              (RESOURCE_LABELS as Record<string, string>)[k] ??
                              (EXPERIENCE_LABELS as Record<string, string>)[k] ??
                              k;
                            return `${label} ${v}以上`;
                          })
                          .join(", ")
                      : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAnimating = () => {
    if (!lastChoiceResult) return null;
    const allKeys = [...RESOURCE_KEYS, ...EXPERIENCE_KEYS] as string[];
    const labels: Record<string, string> = {
      ...RESOURCE_LABELS,
      ...EXPERIENCE_LABELS,
    };
    const changes = allKeys
      .filter(
        (k) =>
          (lastChoiceResult.effects as Record<string, number>)[k] !== undefined
      )
      .map((k) => ({
        key: k,
        value: (lastChoiceResult.effects as Record<string, number>)[k],
        label: labels[k],
      }));

    return (
      <div style={S.card}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            「{lastChoiceResult.choiceLabel}」を選択
          </div>
          <div>
            {changes.map((c) => (
              <span key={c.key} style={S.animBadge(c.value > 0)}>
                {c.value > 0 ? "+" : ""}
                {c.value} {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderResult = () => {
    const results = gameResults;
    if (!results) return null;
    const myResult = results.find((r) => r.playerId === clientId);
    if (!myResult) return null;

    const radarData = EXPERIENCE_KEYS.map((key) => ({
      stat: EXPERIENCE_LABELS[key],
      value: myResult.experience[key],
      max: EXPERIENCE_RANGES[key].max,
    }));

    return (
      <div style={S.card}>
        <div style={S.resultEmoji}>{myResult.ending.emoji}</div>
        <div style={S.resultTitle}>{myResult.ending.title}</div>
        <div style={S.resultDesc}>{myResult.ending.description}</div>
        <div style={S.resultRank}>
          {myResult.rank}位
        </div>

        <div
          style={{
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          スコア: {myResult.score}
        </div>

        {/* Radar chart */}
        <div style={{ width: "100%", height: 240, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid />
              <PolarAngleAxis dataKey="stat" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke={accentColor}
                fill={accentColor}
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Final resources */}
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          最終ステータス
        </div>
        <div style={S.statsGrid}>
          {RESOURCE_KEYS.map((key) => (
            <div key={key} style={S.statItem}>
              <span style={S.statEmoji}>{RESOURCE_EMOJI[key]}</span>
              <span style={{ fontSize: 14 }}>
                {RESOURCE_LABELS[key]}: {myResult.resources[key]}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Confirmation Dialog ────────────────────────────────────
  const renderConfirmDialog = () => {
    if (!confirmChoice || !currentEvent) return null;
    const choice = currentEvent.choices.find((c) => c.id === confirmChoice);
    if (!choice) return null;

    return (
      <div style={S.confirmOverlay} onClick={() => setConfirmChoice(null)}>
        <div style={S.confirmDialog} onClick={(e) => e.stopPropagation()}>
          <div style={S.confirmTitle}>この選択でいい?</div>
          <div style={{ fontSize: 15, marginBottom: 16 }}>{choice.label}</div>
          <EffectBadges effects={choice.effects} />
          <div style={{ ...S.confirmBtns, marginTop: 20 }}>
            <button
              style={S.confirmBtn(false)}
              onClick={() => setConfirmChoice(null)}
            >
              キャンセル
            </button>
            <button style={S.confirmBtn(true)} onClick={handleChoiceConfirm}>
              決定
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.root}>
      {/* Top bar */}
      <div style={S.topBar}>
        <div style={S.roundBadge}>
          {roundInfo.label} - Round {state.currentRound}
        </div>
        <div style={S.statusText}>
          <span style={S.statusDot(connected)} />
          {status}
        </div>
      </div>

      {/* Main content area */}
      <div style={S.section}>
        {viewState === "waiting" && renderWaiting()}
        {viewState === "rolling" && renderRolling()}
        {viewState === "dice_result" && renderDiceResult()}
        {viewState === "choosing" && renderChoosing()}
        {viewState === "animating" && renderAnimating()}
        {viewState === "result" && renderResult()}
      </div>

      {/* Stats dashboard (always shown unless result) */}
      {myPlayer && viewState !== "result" && (
        <div style={S.card}>
          <StatsDashboard player={myPlayer} />
        </div>
      )}

      {/* Confirm dialog overlay */}
      {renderConfirmDialog()}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControllerPlayPage />
  </StrictMode>
);
