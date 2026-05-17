import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import "../App.css";
import {
  choosePrimaryHostUrl,
  colorForPlayer,
  getRoundInfo,
  type ClientMessage,
  type Faculty,
  type GameState,
  type HostManagedPlayer,
  type ServerMessage,
  defaultGameState,
  wsUrlFromInput,
} from "../domain/gameShared";

const FACULTY_LABELS: Record<Faculty, string> = {
  humanities: "文系",
  science: "理系",
  education: "教育",
  medical: "医療",
  arts_sports: "芸術・スポーツ",
};

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function App() {
  const [name, setName] = useState("Host");
  const [hostUrlInput, setHostUrlInput] = useState("");
  const [status, setStatus] = useState("未接続");
  const [clientId, setClientId] = useState<string | null>(null);
  const [hostUrls, setHostUrls] = useState<string[]>([]);
  const [state, setState] = useState<GameState>(defaultGameState);
  const [managedPlayers, setManagedPlayers] = useState<HostManagedPlayer[]>([]);
  const [fallbackPlayerId, setFallbackPlayerId] = useState("");
  const [now, setNow] = useState(Date.now());
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

  const visibleChoices = useMemo(() => {
    if (!state.currentEvent) return [];
    const availableIds = new Set(state.availableChoiceIds);
    if (availableIds.size === 0) return state.currentEvent.choices;
    return state.currentEvent.choices.filter((choice) => availableIds.has(choice.id));
  }, [state.availableChoiceIds, state.currentEvent]);

  const fallbackTargetPlayerId = state.mode === "life_map"
    ? fallbackPlayerId || state.players[0]?.id || ""
    : currentPlayer?.id || "";

  const selectedFallbackPlayer = state.players.find(
    (player) => player.id === fallbackTargetPlayerId,
  );

  const currentElapsedSeconds = state.startedAt
    ? (now - state.startedAt) / 1000
    : 0;
  const currentTurnSeconds = state.turnStartedAt
    ? (now - state.turnStartedAt) / 1000
    : 0;
  const recordedRoundSeconds = (state.roundDurations ?? []).reduce(
    (total, entry) => total + entry.durationSeconds,
    0,
  );

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.mode !== "life_map") return;
    if (fallbackPlayerId && state.players.some((player) => player.id === fallbackPlayerId)) return;
    setFallbackPlayerId(state.players[0]?.id ?? "");
  }, [fallbackPlayerId, state.mode, state.players]);

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
      if (message.type === "host_player_management") {
        setManagedPlayers(message.players);
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
      setManagedPlayers([]);
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

  const startLifeMapGame = () => {
    if (!clientId) return;
    if (state.players.length < 1) {
      setStatus("参加者が必要です");
      return;
    }
    sendMessage({ type: "start_life_map_game" });
  };

  const resetGame = () => {
    if (!clientId) return;
    if (!window.confirm("ゲームをリセットしてロビーに戻します。よろしいですか？")) return;
    sendMessage({ type: "reset_game" });
  };

  const removePlayer = (playerId: string, playerName: string) => {
    if (!clientId) return;
    if (!window.confirm(`${playerName} をプレイヤー一覧から削除します。よろしいですか？`)) return;
    sendMessage({ type: "remove_player", playerId });
  };

  const setFallbackMode = (enabled: boolean) => {
    sendMessage({ type: "set_fallback_mode", enabled });
  };

  const rollForPlayer = (playerId: string) => {
    if (!playerId) return;
    sendMessage({ type: "host_player_roll", playerId });
  };

  const chooseForPlayer = (playerId: string, choiceId: string) => {
    if (!playerId) return;
    sendMessage({ type: "host_player_choice", playerId, choiceId });
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
  const managementRows: HostManagedPlayer[] = managedPlayers.length > 0
    ? managedPlayers
    : state.players.map((player) => ({
        id: player.id,
        name: player.name,
        faculty: player.faculty,
        passkey: "",
        online: player.online,
      }));

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="badge">Campus Life Game</span>
          <span className="status">{status}</span>
        </div>
        <h1>キャンパスライフゲーム</h1>
        <p>
          48か月のキャンパスカレンダーを進みながら、大学4年間の選択を全員で見比べるモードです。
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
        <section className={`panel ${isInGame ? "host-ops-qr-panel--compact" : ""}`}>
          <h2>参加者向けQR（Controller）</h2>
          <div className="controller-qr">
            <QRCodeCanvas value={controllerEntryUrl} size={isInGame ? 132 : 220} />
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
              モード: <strong>{state.mode === "life_map" ? "人生マップ" : "48か月ボード"}</strong>
            </span>
            <span>
              <strong>{roundInfo.label}</strong>
            </span>
            <span>
              {state.mode === "life_map"
                ? `Season ${state.currentRound}/16`
                : `Month ${state.currentRound}/48`}
            </span>
            <span>
              フェーズ: <strong>{state.phase}</strong>
            </span>
            <span>
              経過: <strong>{formatDuration(currentElapsedSeconds)}</strong>
            </span>
            <span>
              現ターン: <strong>{formatDuration(currentTurnSeconds)}</strong>
            </span>
            <span>
              記録済み: <strong>{formatDuration(recordedRoundSeconds)}</strong>
            </span>
            {currentPlayer && (
              <span>
                現在のプレイヤー: <strong>{currentPlayer.name}</strong>
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── Host Player Management ───────────────────────────────── */}
      <section className="panel">
        <h2>ホスト用プレイヤー管理</h2>
        <div className="host-ops-management-table">
          <div className="host-ops-management-row host-ops-management-row--head">
            <span>名前</span>
            <span>学部</span>
            <span>パスキー</span>
            <span>状態</span>
            <span>操作</span>
          </div>
          {managementRows.length === 0 && (
            <div className="placeholder">まだ参加者はいません。</div>
          )}
          {managementRows.map((player) => (
            <div
              key={player.id}
              className={`host-ops-management-row ${player.online ? "" : "host-ops-management-row--offline"}`}
            >
              <span className="host-ops-management-name">{player.name}</span>
              <span>{FACULTY_LABELS[player.faculty]}</span>
              <span className="host-ops-passkey">{player.passkey || "-"}</span>
              <span>{player.online ? "online" : "offline"}</span>
              <span>
                {clientId && (
                  <button
                    className="player-remove-button"
                    onClick={() => removePlayer(player.id, player.name)}
                  >
                    削除
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Host Fallback Controls ───────────────────────────────── */}
      {clientId && isInGame && (
        <section className="panel">
          <div className="host-ops-section-header">
            <h2>ホスト代理操作</h2>
            <label className="host-ops-toggle">
              <input
                type="checkbox"
                checked={Boolean(state.fallbackMode)}
                onChange={(event) => setFallbackMode(event.target.checked)}
              />
              フォールバックモード
            </label>
          </div>

          {state.fallbackMode && (
            <div className="host-ops-fallback">
              {currentPlayer && state.mode !== "life_map" && (
                <div className="host-ops-fallback-target">
                  対象: <strong>{currentPlayer.name}</strong>
                  <button
                    className="ghost"
                    onClick={() => rollForPlayer(currentPlayer.id)}
                    disabled={state.phase !== "rolling"}
                  >
                    代理で月イベントを開く
                  </button>
                </div>
              )}

              {state.mode === "life_map" && (
                <label className="host-ops-player-select">
                  代理送信するプレイヤー
                  <select
                    value={fallbackTargetPlayerId}
                    onChange={(event) => setFallbackPlayerId(event.target.value)}
                  >
                    {state.players.map((player) => {
                      const alreadySubmitted = Boolean(state.pendingLifeChoices?.[player.id]);
                      return (
                        <option
                          key={player.id}
                          value={player.id}
                          disabled={alreadySubmitted}
                        >
                          {player.name}{alreadySubmitted ? "（選択済み）" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}

              {state.currentEvent ? (
                <div className="host-ops-choice-list">
                  <div className="host-ops-event-title">{state.currentEvent.title}</div>
                  {selectedFallbackPlayer && state.pendingLifeChoices?.[selectedFallbackPlayer.id] && (
                    <div className="host-ops-choice-note">
                      {selectedFallbackPlayer.name} はこのイベントを選択済みです。
                    </div>
                  )}
                  {visibleChoices.map((choice) => {
                    const lifeChoiceAlreadySubmitted = Boolean(
                      state.mode === "life_map" &&
                        selectedFallbackPlayer &&
                        state.pendingLifeChoices?.[selectedFallbackPlayer.id],
                    );
                    return (
                      <button
                        key={choice.id}
                        className="host-ops-choice-button"
                        onClick={() => chooseForPlayer(fallbackTargetPlayerId, choice.id)}
                        disabled={
                          state.phase !== "choosing" ||
                          !fallbackTargetPlayerId ||
                          lifeChoiceAlreadySubmitted
                        }
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="placeholder">現在のイベントはありません。</div>
              )}
            </div>
          )}
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
                <div className="player-card__header">
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
                  {clientId && (
                    <button
                      className="player-remove-button"
                      onClick={() => removePlayer(player.id, player.name)}
                    >
                      削除
                    </button>
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
              onClick={startLifeMapGame}
              disabled={state.players.length < 1}
            >
              人生マップで開始
              {state.players.length < 1 && " (参加者が必要)"}
            </button>
            <button
              className="ghost"
              onClick={startGame}
              disabled={state.players.length < 1}
            >
              48か月ボードで開始
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
            <button
              onClick={resetGame}
              style={{ background: "#dc2626", color: "#fff" }}
            >
              ゲームをリセット
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
