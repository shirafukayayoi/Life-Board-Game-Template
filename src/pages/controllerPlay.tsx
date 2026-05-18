import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateResultCard } from "../utils/generateCard";
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
  type EventChoice,
  type ChoiceResult,
  type PlayerResult,
  type Player,
  type StatEffects,
  type ResourceKey,
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
} from "../domain/gameShared";

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

const SCORE_BREAKDOWN_LABELS = {
  experience: "経験",
  health: "体力",
  money: "お金",
  credits: "単位",
  total: "合計",
} as const;

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
export function EffectBadges({ effects }: { effects?: StatEffects }) {
  if (!effects) return null;
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

export function ChoicePreview({ choice }: { choice: EventChoice }) {
  if (!choice.preview) return <EffectBadges effects={choice.effects} />;
  const riskLabel: Record<string, string> = {
    low: "低",
    medium: "中",
    high: "高",
    unknown: "不明",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {choice.tone && <span style={S.effectBadge(true)}>{choice.tone}</span>}
        {choice.preview.gain.map((item) => (
          <span key={`gain-${item}`} style={S.effectBadge(true)}>
            得られそう: {item}
          </span>
        ))}
        {choice.preview.cost.map((item) => (
          <span key={`cost-${item}`} style={S.effectBadge(false)}>
            失いそう: {item}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>
        リスク: {riskLabel[choice.preview.risk]}
        {choice.storyTags?.length ? ` / ${choice.storyTags.join("・")}` : ""}
      </div>
    </div>
  );
}

// ─── Stats Dashboard Component ──────────────────────────────────
export function StatsDashboard({ player }: { player: Player }) {
  const [tab, setTab] = useState<"resources" | "experience" | "flags">(
    "resources"
  );

  const activeFlags = useMemo(() => {
    const result: { key: string; emoji: string; label: string }[] = [];
    for (const [key, info] of Object.entries(FLAG_DISPLAY)) {
      if ((player.flags as unknown as Record<string, unknown>)[key]) {
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
                      ...S.statBar(pct, STAT_COLORS[key]),
                      width: 80,
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
export function ControllerPlayPage() {
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
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [cardGenerating, setCardGenerating] = useState(false);

  const [revealedResults, setRevealedResults] = useState<ChoiceResult[] | null>(null);

  // UI state
  const [confirmChoice, setConfirmChoice] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [showStatChanges, setShowStatChanges] = useState(false);
  const [myDiceResult, setMyDiceResult] = useState<{ value: number; squares: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(clientId);
  clientIdRef.current = clientId;
  const stateRef = useRef<GameState>(state);
  const showStatChangesRef = useRef(showStatChanges);
  showStatChangesRef.current = showStatChanges;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removedByHostRef = useRef(false);

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
    if (state.turnOrder.length === 0 || state.players.length === 0) return undefined;
    const currentId = state.turnOrder[state.turnIndex % state.turnOrder.length];
    return state.players.find((p) => p.id === currentId);
  }, [state.players, state.turnIndex, state.turnOrder]);

  const isMyTurn = useMemo(
    () => !!clientId && currentTurnPlayer?.id === clientId,
    [clientId, currentTurnPlayer]
  );

  const myLifeChoiceSubmitted = useMemo(
    () => Boolean(clientId && state.pendingLifeChoices?.[clientId]),
    [clientId, state.pendingLifeChoices]
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
        passkey: sessionStorage.getItem("clg_passkey") ?? undefined,
      };
      socket.send(JSON.stringify(payload));
    };

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;

      switch (msg.type) {
        case "welcome":
          setClientId(msg.clientId);
          sessionStorage.setItem("clg_controller_id", msg.clientId);
          if (msg.passkey) {
            sessionStorage.setItem("clg_passkey", msg.passkey);
          }
          setConnected(true);
          setStatus("接続済み");
          break;

        case "auth_error":
          sessionStorage.removeItem("clg_controller_id");
          setClientId(null);
          setConnected(false);
          setStatus(msg.message);
          window.location.href = `/controller.html?host=${encodeURIComponent(hostUrl)}`;
          break;

        case "state": {
          const prev = stateRef.current;
          setState(msg.state);
          stateRef.current = msg.state;

          // Detect my dice roll result
          if (
            msg.state.lastRoll &&
            msg.state.lastRoll.playerId === clientIdRef.current &&
            (!prev.lastRoll || prev.lastRoll.playerId !== clientIdRef.current || prev.phase === "rolling")
          ) {
            setMyDiceResult({
              value: msg.state.lastRoll.value,
              squares: msg.state.lastRoll.squaresAdvanced,
            });
            setRolling(false);
          }

          // Clear event if phase changed away from choosing
          if (
            msg.state.phase !== "choosing" &&
            msg.state.phase !== "animating"
          ) {
            setCurrentEvent(null);
            setAvailableChoiceIds([]);
            setEventTargetPlayerId(null);
          }
          // When it's a new turn (rolling phase, no lastRoll), clear dice result
          if (msg.state.phase === "rolling" && !msg.state.lastRoll) {
            setMyDiceResult(null);
          }
          // Don't clear animation state if we're currently showing stat changes
          if (!showStatChangesRef.current) {
            setLastChoiceResult(null);
          }
          break;
        }

        case "show_event": {
          setRolling(false);
          // If this event is for me and I just rolled, delay showing
          // the event so the dice result is visible for 1.5 seconds
          const isForMe = msg.playerId === clientIdRef.current;
          const delay = isForMe ? 1500 : 0;
          setTimeout(() => {
            setMyDiceResult(null);
            setCurrentEvent(msg.event);
            setAvailableChoiceIds(msg.availableChoiceIds);
            setEventTargetPlayerId(msg.playerId);
          }, delay);
          break;
        }

        case "show_life_event": {
          setRolling(false);
          setMyDiceResult(null);
          setCurrentEvent(msg.event);
          setAvailableChoiceIds(msg.availableChoiceIds);
          setEventTargetPlayerId(clientIdRef.current);
          setRevealedResults(null);
          break;
        }

        case "choice_result": {
          const isLifeMap = stateRef.current.mode === "life_map";
          const isMine = msg.result.playerId === clientIdRef.current;
          if (isLifeMap && !isMine) break;

          setLastChoiceResult(msg.result);
          setCurrentEvent(null);
          setConfirmChoice(null);
          setShowStatChanges(true);
          setTimeout(() => setShowStatChanges(false), isLifeMap ? 5000 : 2000);
          break;
        }

        case "all_choices_revealed": {
          setRevealedResults(msg.results);
          setCurrentEvent(null);
          setConfirmChoice(null);
          break;
        }

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

        case "player_removed":
          removedByHostRef.current = true;
          sessionStorage.removeItem("clg_controller_id");
          sessionStorage.removeItem("clg_name");
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          wsRef.current?.close();
          window.location.href = `/controller.html?host=${encodeURIComponent(hostUrl)}`;
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
      if (removedByHostRef.current) return;
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
    | "revealed"
    | "result";

  const viewState = useMemo((): ViewState => {
    if (gameResults || state.phase === "result") return "result";
    if (revealedResults && state.phase === "revealed") return "revealed";
    if (showStatChanges && lastChoiceResult) return "animating";
    if (currentEvent && eventTargetPlayerId === clientId) return "choosing";
    if (myDiceResult && !currentEvent) return "dice_result";
    if (isMyTurn && state.phase === "rolling") return "rolling";
    return "waiting";
  }, [
    state.phase,
    isMyTurn,
    currentEvent,
    eventTargetPlayerId,
    clientId,
    lastChoiceResult,
    showStatChanges,
    gameResults,
    revealedResults,
    myDiceResult,
  ]);

  // ─── Render helpers ─────────────────────────────────────────

  const renderWaiting = () => (
    <div style={S.card}>
      <div style={S.waitingMsg(true)}>
        {state.phase === "lobby"
          ? "ゲーム開始を待っています..."
          : state.mode === "life_map" && state.phase === "choosing" && state.currentChoiceMode === "simultaneous"
            ? myLifeChoiceSubmitted
              ? "送信済み。全員の選択を待っています..."
              : "みんなが同時に選択中..."
            : `${currentTurnPlayer?.name ?? "..."}のターン中...`}
      </div>
    </div>
  );

  const renderRolling = () => (
    <div style={S.card}>
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          あなたの月です!
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
          {rolling ? "..." : "今月のイベントを開く"}
        </button>
        <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 8 }}>
          タップして今月のイベントを開こう
        </div>
      </div>
    </div>
  );

  const renderDiceResult = () => {
    if (!myDiceResult) return null;
    return (
      <div style={S.card}>
        <div style={S.diceResult}>
          <div style={{ ...S.diceNumber, color: accentColor, fontSize: 36 }}>
            OPEN
          </div>
          <div style={S.diceAdvanced}>
            今月のイベントへ
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
                <ChoicePreview choice={choice} />
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

  const renderRevealed = () => {
    if (!revealedResults) return null;
    const myResult = revealedResults.find((r) => r.playerId === clientId);
    return (
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
          全員の選択が明らかに！
        </div>
        {myResult && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>あなたの選択</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>「{myResult.choiceLabel}」</div>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>全員の選択</div>
        {revealedResults.map((r) => (
          <div key={r.playerId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: r.playerId === clientId ? "#60a5fa" : "#e5e7eb" }}>{r.playerName}</span>
            <span style={{ color: "#d1d5db" }}>→ {r.choiceLabel}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
          ホストが次のイベントに進めます
        </div>
      </div>
    );
  };

  const buildShareText = useCallback((result: PlayerResult) => {
    const lines = [
      "Campus Life Game",
      `${result.playerName} の結果`,
      result.academicStatus
        ? `称号: ${result.storyAward?.title ?? result.lifeArchetype?.title ?? result.academicStatus.title}`
        : `エンディング: ${result.ending?.title ?? "キャンパスライフ完走"}`,
    ];

    if (result.rank !== undefined) {
      lines.push(`順位: ${result.rank}位`);
    }
    const score = result.score ?? result.scoreBreakdown?.total;
    if (score !== undefined) {
      lines.push(`スコア: ${score}`);
    }
    if (result.ending?.flavorText) {
      lines.push(result.ending.flavorText);
    }

    return lines.join("\n");
  }, []);

  const handleShareResult = useCallback(
    async (result: PlayerResult) => {
      const text = buildShareText(result);
      try {
        if (navigator.share) {
          await navigator.share({
            title: "Campus Life Game",
            text,
          });
          setShareStatus("共有しました");
          return;
        }
        await navigator.clipboard.writeText(text);
        setShareStatus("結果をコピーしました");
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          setShareStatus("結果をコピーしました");
        } catch {
          setShareStatus("共有できませんでした");
        }
      }
    },
    [buildShareText],
  );

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
      <div style={S.card} className="controller-result-card">
        <div style={S.resultEmoji}>
          {myResult.academicStatus ? "\u{1F393}" : myResult.ending?.emoji ?? "\u{1F3C1}"}
        </div>
        <div style={S.resultTitle}>
          {myResult.academicStatus
            ? myResult.storyAward?.title ?? myResult.lifeArchetype?.title ?? myResult.academicStatus.title
            : myResult.ending?.title ?? "キャンパスライフ完走"}
        </div>
        <div style={S.resultDesc}>
          {myResult.summary ?? myResult.ending?.description ?? "4年間の選択がここに刻まれました。"}
        </div>
        {myResult.ending?.flavorText && (
          <div className="controller-result-flavor">
            {myResult.ending.flavorText}
          </div>
        )}
        {myResult.rank !== undefined && (
          <div style={S.resultRank}>
            {myResult.rank}位
          </div>
        )}

        <div
          style={{
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {myResult.academicStatus
            ? `${myResult.lifeArchetype?.title} / 学業: ${myResult.academicStatus.title}`
            : `スコア: ${myResult.score ?? myResult.scoreBreakdown?.total ?? "-"}`}
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
        {myResult.scoreBreakdown && (
          <div className="controller-score-breakdown">
            {Object.entries(myResult.scoreBreakdown).map(([key, value]) => (
              <span key={key}>
                {SCORE_BREAKDOWN_LABELS[key as keyof typeof SCORE_BREAKDOWN_LABELS]}: {value}
              </span>
            ))}
          </div>
        )}
        <div className="share-card">
          <div>
            <div className="share-card__title">結果をシェア</div>
            <div className="share-card__text">
              名前、エンディング、順位、スコアを共有できます。
            </div>
            {shareStatus && (
              <div className="share-card__status">{shareStatus}</div>
            )}
          </div>
          <button
            className="share-card__button"
            type="button"
            onClick={() => void handleShareResult(myResult)}
          >
            共有
          </button>
        </div>

        {/* Card image generator — only shown for life_map mode */}
        {myResult.lifeArchetype && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              className="share-card__button"
              type="button"
              disabled={cardGenerating}
              style={{ width: "100%", opacity: cardGenerating ? 0.6 : 1 }}
              onClick={() => {
                if (!myResult.lifeArchetype) return;
                setCardGenerating(true);
                generateResultCard({
                  playerName: myResult.playerName,
                  archetypeId: myResult.lifeArchetype.id,
                  archetypeTitle: myResult.lifeArchetype.title,
                  archetypeDescription: myResult.lifeArchetype.description,
                  storyTags: myResult.storyTags ?? [],
                })
                  .then((url) => setCardImageUrl(url))
                  .catch(() => {/* silently ignore */})
                  .finally(() => setCardGenerating(false));
              }}
            >
              {cardGenerating ? "カード生成中..." : "📸 結果カードを作る"}
            </button>
          </div>
        )}

        {/* Full-screen card preview overlay */}
        {cardImageUrl && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.85)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={() => setCardImageUrl(null)}
          >
            <p style={{ color: "#fff", marginBottom: 12, fontSize: 14 }}>
              スクリーンショットで保存してください
            </p>
            <img
              src={cardImageUrl}
              alt="結果カード"
              style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12 }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              style={{
                marginTop: 16,
                padding: "10px 32px",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 8,
                fontSize: 14,
              }}
              onClick={() => setCardImageUrl(null)}
            >
              閉じる
            </button>
          </div>
        )}
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
          <ChoicePreview choice={choice} />
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
        {viewState === "revealed" && renderRevealed()}
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
