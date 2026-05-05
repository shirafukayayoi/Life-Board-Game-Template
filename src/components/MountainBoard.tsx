import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Sky, Text } from "@react-three/drei";
import * as THREE from "three";
import { BOARD, getNextSquareId } from "../domain/boardData";
import { colorForPlayer, type Player } from "../domain/gameShared";
import {
  MOUNTAIN_PEAK_HEIGHT,
  allSquareIds,
  branchTrackPoints,
  colorForYear,
  mainTrackPoints,
  squareWorldPos,
  terrainHeight,
  yearForZ,
  type Vec3,
} from "../domain/mountainLayout";

// ─── Camera modes ────────────────────────────────────────────────
export type CameraMode = "overview" | "follow" | "cinema";

interface MountainBoardProps {
  players: Player[];
  currentPlayerId?: string;
  highlightSquareId?: string;
  cameraMode?: CameraMode;
}

// ═══════════════════════════════════════════════════════════════════
//  Terrain — displaced plane with vertex colors per year zone
// ═══════════════════════════════════════════════════════════════════
function Terrain() {
  const geometry = useMemo(() => {
    const size = 60;
    const segments = 96;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      // Color by year zone, blended near snow line for softness
      const year = yearForZ(z);
      const [r, g, b] = colorForYear(year);

      // Add altitude-based snow blend on upper slope
      const snowBlend = Math.max(0, Math.min(1, (y - 12) / 4));
      const fr = r * (1 - snowBlend) + 0.95 * snowBlend;
      const fg = g * (1 - snowBlend) + 0.96 * snowBlend;
      const fb = b * (1 - snowBlend) + 1.0 * snowBlend;

      colors.push(fr, fg, fb);
    }

    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.95}
        metalness={0.0}
        flatShading
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Trail lines (main + branches)
// ═══════════════════════════════════════════════════════════════════
function TrailLines() {
  const main = useMemo(() => mainTrackPoints(), []);
  const branches = useMemo(() => branchTrackPoints(), []);

  const mainArr = useMemo<[number, number, number][]>(
    () => main.map((p) => [p.x, p.y + 0.05, p.z]),
    [main],
  );

  return (
    <>
      <Line points={mainArr} color="#ffe9a8" lineWidth={3} transparent opacity={0.85} />
      {branches.map(({ key, points }) => (
        <Line
          key={key}
          points={points.map((p) => [p.x, p.y + 0.04, p.z])}
          color="#9ad1ff"
          lineWidth={1.5}
          dashed
          dashSize={0.6}
          gapSize={0.4}
          transparent
          opacity={0.65}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Square markers
// ═══════════════════════════════════════════════════════════════════
function SquareMarkers({ highlightId }: { highlightId?: string }) {
  const ids = useMemo(() => allSquareIds(), []);
  const pulseRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.18;
      pulseRef.current.scale.set(s, s, s);
    }
  });

  return (
    <>
      {ids.map((id) => {
        const sq = BOARD[id];
        const p = squareWorldPos(id);
        if (!sq || !p) return null;

        const isHighlight = highlightId === id;
        const isStart = sq.type === "start";
        const isGoal = sq.type === "goal";
        const isBranchPoint = sq.type === "branch_point";
        const isCheckpoint = sq.type === "checkpoint";
        const isBranch = sq.type === "branch";

        let color = "#ffffff";
        let radius = 0.45;
        let height = 0.18;
        if (isStart) { color = "#22c55e"; radius = 0.7; height = 0.4; }
        else if (isGoal) { color = "#fbbf24"; radius = 0.85; height = 0.6; }
        else if (isBranchPoint) { color = "#a855f7"; radius = 0.6; height = 0.3; }
        else if (isCheckpoint) { color = "#60a5fa"; radius = 0.55; height = 0.25; }
        else if (isBranch) { color = "#cbd5e1"; radius = 0.32; height = 0.12; }

        return (
          <group key={id} position={[p.x, p.y, p.z]}>
            <mesh castShadow>
              <cylinderGeometry args={[radius, radius, height, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHighlight ? 0.6 : 0.15}
                roughness={0.5}
              />
            </mesh>
            {/* Pulse ring on highlighted square */}
            {isHighlight && (
              <group ref={pulseRef} position={[0, 0.05, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[radius + 0.2, radius + 0.45, 32]} />
                  <meshBasicMaterial color="#fde68a" transparent opacity={0.7} side={THREE.DoubleSide} />
                </mesh>
              </group>
            )}
            {/* Big landmarks: floating label */}
            {(isStart || isGoal) && (
              <Billboard position={[0, 1.6, 0]}>
                <Text
                  fontSize={0.7}
                  color={color}
                  outlineWidth={0.04}
                  outlineColor="#0b1020"
                  anchorY="bottom"
                >
                  {isStart ? "入学" : "卒業"}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Player avatars (capsules with floating name labels)
// ═══════════════════════════════════════════════════════════════════
interface AvatarProps {
  player: Player;
  index: number;
  isCurrent: boolean;
  jitterOffset: number; // group-mate fan-out
  fanCount: number;
}

// ─── Hop animation tuning ──────────────────────────────────────────
const HOP_DURATION = 0.28;   // seconds per square hop
const HOP_GAP = 0.04;        // small pause between hops
const HOP_HEIGHT = 1.1;      // arc height in world units
const HOP_STEP_TOTAL = HOP_DURATION + HOP_GAP;

/**
 * Compute the chain of squares a player passes through, from
 * `fromId` to `toId`, by walking `getNextSquareId`.
 * Returns [fromId, ..., toId] or [toId] if no path found.
 */
function computePath(fromId: string, toId: string, player: Player): string[] {
  if (fromId === toId) return [toId];
  const path: string[] = [fromId];
  let cur = fromId;
  for (let i = 0; i < 16; i++) {
    const next = getNextSquareId(cur, player);
    if (!next) break;
    path.push(next);
    if (next === toId) return path;
    cur = next;
  }
  // No clean path discovered — fall back to direct snap
  return [toId];
}

function fanOffset(jitter: number, count: number): { ox: number; oz: number } {
  if (count <= 1) return { ox: 0, oz: 0 };
  const angle = (jitter / count) * Math.PI * 2;
  const r = 1.4;
  return { ox: Math.cos(angle) * r, oz: Math.sin(angle) * r };
}

function squarePos(squareId: string, jitter: number, count: number) {
  const base = squareWorldPos(squareId);
  if (!base) return null;
  const { ox, oz } = fanOffset(jitter, count);
  const x = base.x + ox;
  const z = base.z + oz;
  const y = terrainHeight(x, z) + 0.35;
  return new THREE.Vector3(x, y, z);
}

function PlayerAvatar({ player, index, isCurrent, jitterOffset, fanCount }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const restPos = useRef(new THREE.Vector3());     // resting position after all hops
  const currentPos = useRef(new THREE.Vector3());  // displayed position
  const hopWaypoints = useRef<THREE.Vector3[]>([]); // [start, ..., end] for current hop sequence
  const hopTime = useRef(0);                       // elapsed time within hop sequence
  const lastPosId = useRef<string | null>(null);
  const initialized = useRef(false);

  // Build a hop sequence whenever player.position changes
  useEffect(() => {
    const newRest = squarePos(player.position, jitterOffset, fanCount);
    if (!newRest) return;
    restPos.current.copy(newRest);

    if (!initialized.current) {
      currentPos.current.copy(newRest);
      lastPosId.current = player.position;
      initialized.current = true;
      hopWaypoints.current = [];
      return;
    }

    if (lastPosId.current === player.position) return;

    const path = computePath(lastPosId.current ?? player.position, player.position, player);
    if (path.length < 2) {
      // No multi-step path — just place at rest
      currentPos.current.copy(newRest);
      hopWaypoints.current = [];
    } else {
      const wps = path
        .map((id) => squarePos(id, jitterOffset, fanCount))
        .filter((v): v is THREE.Vector3 => v !== null);
      // Make sure the visible position starts at the first waypoint
      currentPos.current.copy(wps[0]);
      hopWaypoints.current = wps;
      hopTime.current = 0;
    }
    lastPosId.current = player.position;
  }, [player.position, jitterOffset, fanCount, player]);

  // Re-anchor rest position when fan layout shifts (others joining the same square)
  useEffect(() => {
    if (hopWaypoints.current.length > 0) return;
    const r = squarePos(player.position, jitterOffset, fanCount);
    if (r) {
      restPos.current.copy(r);
      currentPos.current.lerp(r, 0.6);
    }
  }, [jitterOffset, fanCount, player.position]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;

    if (hopWaypoints.current.length >= 2) {
      hopTime.current += dt;
      const wps = hopWaypoints.current;
      const totalSteps = wps.length - 1;
      const stepIndex = Math.min(
        totalSteps - 1,
        Math.floor(hopTime.current / HOP_STEP_TOTAL),
      );
      const tInStep = (hopTime.current - stepIndex * HOP_STEP_TOTAL) / HOP_DURATION;

      if (hopTime.current >= totalSteps * HOP_STEP_TOTAL) {
        // Hop sequence complete
        currentPos.current.copy(wps[wps.length - 1]);
        hopWaypoints.current = [];
      } else {
        const from = wps[stepIndex];
        const to = wps[stepIndex + 1];
        const e = Math.max(0, Math.min(1, tInStep));
        const eased = e * e * (3 - 2 * e);
        const x = from.x + (to.x - from.x) * eased;
        const z = from.z + (to.z - from.z) * eased;
        const baseY = from.y + (to.y - from.y) * eased;
        // Parabolic arc — only while in the active hop part (e <= 1), flat during gap
        const arc = e < 1 ? Math.sin(e * Math.PI) * HOP_HEIGHT : 0;
        currentPos.current.set(x, baseY + arc, z);
      }
    } else {
      // Idle: ease toward resting position (handles fan-out adjustments)
      currentPos.current.lerp(restPos.current, Math.min(1, dt * 6));
    }

    groupRef.current.position.copy(currentPos.current);

    // Pulse glow when current player
    if (isCurrent) {
      const s = 1 + Math.sin(performance.now() / 200) * 0.06;
      groupRef.current.scale.set(s, s, s);
    } else {
      groupRef.current.scale.set(1, 1, 1);
    }
  });

  const color = colorForPlayer(index);

  return (
    <group ref={groupRef}>
      {/* body */}
      <mesh castShadow position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.55, 1.2, 6, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isCurrent ? 0.6 : 0.22}
          roughness={0.4}
        />
      </mesh>
      {/* head */}
      <mesh castShadow position={[0, 2.1, 0]}>
        <sphereGeometry args={[0.48, 16, 12]} />
        <meshStandardMaterial color="#f5d6b1" roughness={0.7} />
      </mesh>
      {/* shadow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.95, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} />
      </mesh>
      {/* name label */}
      <Billboard position={[0, 3.1, 0]}>
        <Text
          fontSize={0.7}
          color="#ffffff"
          outlineWidth={0.06}
          outlineColor="#0b1020"
          anchorY="bottom"
        >
          {player.name}
        </Text>
      </Billboard>
      {/* current-turn arrow + spotlight beam */}
      {isCurrent && (
        <>
          <Billboard position={[0, 4.0, 0]}>
            <Text fontSize={0.95} color="#fde68a" outlineWidth={0.06} outlineColor="#0b1020">
              ▼
            </Text>
          </Billboard>
          {/* Vertical light beam — visible from any angle */}
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.05, 1.2, 10, 12, 1, true]} />
            <meshBasicMaterial
              color="#fde68a"
              transparent
              opacity={0.18}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Camera rig — overview / follow / cinema
// ═══════════════════════════════════════════════════════════════════
interface CameraRigProps {
  mode: CameraMode;
  followPos: Vec3 | null;
}

const OVERVIEW_CAM_POS = new THREE.Vector3(0, 26, 42);
const OVERVIEW_TARGET = new THREE.Vector3(0, 4, -4);

function CameraRig({ mode, followPos }: CameraRigProps) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 8, 0));
  const targetCam = useRef(new THREE.Vector3().copy(OVERVIEW_CAM_POS));
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const prevMode = useRef<CameraMode | null>(null);

  // Snap camera back to overview when entering overview mode
  useEffect(() => {
    if (mode === "overview" && prevMode.current !== "overview") {
      camera.position.copy(OVERVIEW_CAM_POS);
      camera.lookAt(OVERVIEW_TARGET);
      if (orbitRef.current) {
        orbitRef.current.target.copy(OVERVIEW_TARGET);
        orbitRef.current.update();
      }
    }
    prevMode.current = mode;
  }, [mode, camera]);

  useFrame((state, dt) => {
    if (mode === "overview") {
      // OrbitControls handle it
      return;
    }
    if (mode === "follow" && followPos) {
      // Position camera behind & above the player, looking at them
      const desired = new THREE.Vector3(
        followPos.x,
        followPos.y + 6,
        followPos.z + 10,
      );
      targetCam.current.lerp(desired, Math.min(1, dt * 1.8));
      targetPos.current.lerp(
        new THREE.Vector3(followPos.x, followPos.y + 1, followPos.z),
        Math.min(1, dt * 1.8),
      );
      camera.position.copy(targetCam.current);
      camera.lookAt(targetPos.current);
    }
    if (mode === "cinema") {
      // Slow orbit around center for ambient cinematic feel.
      // Start near the default front-view, then drift slowly.
      const t = state.clock.elapsedTime * 0.06;
      const radius = 32;
      const desired = new THREE.Vector3(
        Math.sin(t) * radius * 0.6,
        15 + Math.sin(t * 0.5) * 2,
        Math.cos(t * 0.7) * radius,
      );
      targetCam.current.lerp(desired, Math.min(1, dt * 1.2));
      targetPos.current.lerp(
        new THREE.Vector3(0, MOUNTAIN_PEAK_HEIGHT * 0.4, 0),
        Math.min(1, dt * 1.2),
      );
      camera.position.copy(targetCam.current);
      camera.lookAt(targetPos.current);
    }
  });

  return (
    <OrbitControls
      ref={orbitRef}
      enabled={mode === "overview"}
      target={[0, 6, 0]}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={15}
      maxDistance={70}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Year zone signposts — float labels at zone centers
// ═══════════════════════════════════════════════════════════════════
function YearSignposts() {
  const zones: Array<{ year: 1 | 2 | 3 | 4; z: number; label: string }> = [
    { year: 1, z: 14.5, label: "1年生" },
    { year: 2, z: 4.5, label: "2年生" },
    { year: 3, z: -5.5, label: "3年生" },
    { year: 4, z: -15, label: "4年生" },
  ];

  return (
    <>
      {zones.map(({ year, z, label }) => {
        const x = -22;
        const y = terrainHeight(x, z) + 0.5;
        const [r, g, b] = colorForYear(year);
        const hex = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        return (
          <Billboard key={year} position={[x, y + 1.5, z]}>
            <Text
              fontSize={0.85}
              color={hex}
              outlineWidth={0.05}
              outlineColor="#0b1020"
            >
              {label}
            </Text>
          </Billboard>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Main component
// ═══════════════════════════════════════════════════════════════════
export function MountainBoard({
  players,
  currentPlayerId,
  highlightSquareId,
  cameraMode = "overview",
}: MountainBoardProps) {
  // Group players by square so we can fan them out
  const fanInfo = useMemo(() => {
    const counts = new Map<string, number>();
    const order = new Map<string, number>();
    players.forEach((p) => {
      const idx = counts.get(p.position) ?? 0;
      order.set(p.id, idx);
      counts.set(p.position, idx + 1);
    });
    return { counts, order };
  }, [players]);

  const currentPlayer = useMemo(
    () => players.find((p) => p.id === currentPlayerId),
    [players, currentPlayerId],
  );
  const followPos = useMemo<Vec3 | null>(() => {
    if (!currentPlayer) return null;
    return squareWorldPos(currentPlayer.position);
  }, [currentPlayer]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      camera={{ position: [0, 26, 42], fov: 50, near: 0.1, far: 200 }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <color attach="background" args={["#0b1224"]} />
      <fog attach="fog" args={["#0b1224", 45, 90]} />

      {/* Lighting */}
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[15, 28, 18]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <hemisphereLight args={["#bcd9ff", "#3a3520", 0.4]} />

      <Sky
        distance={4000}
        sunPosition={[15, 25, 18]}
        inclination={0.49}
        azimuth={0.25}
        turbidity={6}
        rayleigh={1.5}
      />

      <Terrain />
      <TrailLines />
      <SquareMarkers highlightId={highlightSquareId} />
      <YearSignposts />

      {players.map((player, i) => {
        const fanIdx = fanInfo.order.get(player.id) ?? 0;
        const fanCount = fanInfo.counts.get(player.position) ?? 1;
        return (
          <PlayerAvatar
            key={player.id}
            player={player}
            index={i}
            isCurrent={currentPlayerId === player.id}
            jitterOffset={fanIdx}
            fanCount={fanCount}
          />
        );
      })}

      <CameraRig mode={cameraMode} followPos={followPos} />
    </Canvas>
  );
}
