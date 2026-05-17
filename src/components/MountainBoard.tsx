import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Billboard,
  Cloud,
  Clouds,
  Line,
  OrbitControls,
  Sky,
  Text,
} from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
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
//  Deterministic PRNG so scenery is stable across renders
// ═══════════════════════════════════════════════════════════════════
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════
//  Terrain — smoother, with per-vertex color variation
// ═══════════════════════════════════════════════════════════════════
function Terrain() {
  const geometry = useMemo(() => {
    const size = 70;
    const segments = 144;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const rand = mulberry32(7);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      // Smooth blend across year zone borders so transitions look natural
      const yFloat = (() => {
        if (z > 10) return 1;
        if (z > 0) return 1 + (10 - z) / 10;
        if (z > -10) return 2 + -z / 10;
        return Math.min(4, 3 + (-z - 10) / 10);
      })();

      const yLow = Math.max(1, Math.floor(yFloat)) as 1 | 2 | 3 | 4;
      const yHigh = Math.min(4, yLow + 1) as 1 | 2 | 3 | 4;
      const t = yFloat - yLow;
      const cLow = colorForYear(yLow);
      const cHigh = colorForYear(yHigh);
      let r = cLow[0] * (1 - t) + cHigh[0] * t;
      let g = cLow[1] * (1 - t) + cHigh[1] * t;
      let b = cLow[2] * (1 - t) + cHigh[2] * t;

      // Snow blend on high altitude
      const snowBlend = Math.max(0, Math.min(1, (y - 11) / 5));
      r = r * (1 - snowBlend) + 0.96 * snowBlend;
      g = g * (1 - snowBlend) + 0.97 * snowBlend;
      b = b * (1 - snowBlend) + 1.0 * snowBlend;

      // Subtle per-vertex noise for variation
      const nz = (rand() - 0.5) * 0.06;
      r = Math.max(0, Math.min(1, r + nz));
      g = Math.max(0, Math.min(1, g + nz));
      b = Math.max(0, Math.min(1, b + nz));

      colors.push(r, g, b);
    }

    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.92}
        metalness={0.0}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Trail — wider ribbon, with stones along the path
// ═══════════════════════════════════════════════════════════════════
function TrailLines() {
  const main = useMemo(() => mainTrackPoints(), []);
  const branches = useMemo(() => branchTrackPoints(), []);

  return (
    <>
      <Line
        points={main.map((p) => [p.x, p.y + 0.06, p.z])}
        color="#f3d27e"
        lineWidth={5}
        transparent
        opacity={0.92}
      />
      {branches.map(({ key, points }) => (
        <Line
          key={key}
          points={points.map((p) => [p.x, p.y + 0.05, p.z])}
          color="#bcd6ff"
          lineWidth={2.2}
          dashed
          dashSize={0.55}
          gapSize={0.4}
          transparent
          opacity={0.7}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Trees — instanced low-poly conifers on year 1-2 slopes
// ═══════════════════════════════════════════════════════════════════
function Trees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const COUNT = 120;

  const matrices = useMemo(() => {
    const rand = mulberry32(42);
    const trunk: THREE.Matrix4[] = [];
    const leaves: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    let placed = 0;
    let attempts = 0;
    while (placed < COUNT && attempts < COUNT * 6) {
      attempts++;
      const x = (rand() - 0.5) * 60;
      const z = 4 + rand() * 22; // year 1 + part of year 2
      // avoid placing near trail (within 2.5 units of the polyline)
      const distToTrail = trailDistance(x, z);
      if (distToTrail < 2.5) continue;
      const y = terrainHeight(x, z);
      if (y < 0.4) continue;
      const scale = 0.7 + rand() * 0.7;
      const rotY = rand() * Math.PI * 2;

      dummy.position.set(x, y + scale * 0.6, z);
      dummy.scale.set(scale, scale * 1.1, scale);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      trunk.push(dummy.matrix.clone());

      dummy.position.set(x, y + scale * 1.6, z);
      dummy.scale.set(scale * 1.4, scale * 2.0, scale * 1.4);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      leaves.push(dummy.matrix.clone());
      placed++;
    }
    return { trunk, leaves };
  }, []);

  useEffect(() => {
    if (!trunkRef.current || !leavesRef.current) return;
    matrices.trunk.forEach((m, i) => trunkRef.current!.setMatrixAt(i, m));
    matrices.leaves.forEach((m, i) => leavesRef.current!.setMatrixAt(i, m));
    trunkRef.current.instanceMatrix.needsUpdate = true;
    leavesRef.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, matrices.trunk.length]}
        castShadow
      >
        <cylinderGeometry args={[0.18, 0.26, 1.2, 8]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={leavesRef}
        args={[undefined, undefined, matrices.leaves.length]}
        castShadow
      >
        <coneGeometry args={[0.85, 1.7, 8]} />
        <meshStandardMaterial color="#2c5b3a" roughness={0.88} flatShading />
      </instancedMesh>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Rocks — scattered on year 3 ridge
// ═══════════════════════════════════════════════════════════════════
function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 50;

  const matrices = useMemo(() => {
    const rand = mulberry32(99);
    const result: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    let placed = 0;
    let attempts = 0;
    while (placed < COUNT && attempts < COUNT * 6) {
      attempts++;
      const x = (rand() - 0.5) * 56;
      const z = -16 + rand() * 18; // year 3 + into year 4
      const distToTrail = trailDistance(x, z);
      if (distToTrail < 2.0) continue;
      const y = terrainHeight(x, z);
      const scale = 0.4 + rand() * 0.9;
      dummy.position.set(x, y + scale * 0.3, z);
      dummy.scale.set(scale, scale * 0.7, scale);
      dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
      dummy.updateMatrix();
      result.push(dummy.matrix.clone());
      placed++;
    }
    return result;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    matrices.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, matrices.length]}
      castShadow
      receiveShadow
    >
      <icosahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial color="#7a7268" roughness={0.95} flatShading />
    </instancedMesh>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Snow particles — drifting near the summit
// ═══════════════════════════════════════════════════════════════════
function Snow() {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 800;

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const rand = mulberry32(123);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3 + 0] = (rand() - 0.5) * 50;
      positions[i * 3 + 1] = 8 + rand() * 18;
      positions[i * 3 + 2] = -22 + rand() * 18;
      velocities[i * 3 + 0] = (rand() - 0.5) * 0.4;
      velocities[i * 3 + 1] = -0.6 - rand() * 0.5;
      velocities[i * 3 + 2] = (rand() - 0.5) * 0.3;
    }
    return { positions, velocities };
  }, []);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 0] += velocities[i * 3 + 0] * dt;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      // Reset when below ground
      if (arr[i * 3 + 1] < terrainHeight(arr[i * 3 + 0], arr[i * 3 + 2])) {
        arr[i * 3 + 0] = (Math.random() - 0.5) * 50;
        arr[i * 3 + 1] = 22 + Math.random() * 6;
        arr[i * 3 + 2] = -22 + Math.random() * 18;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Trail proximity helper for scenery placement ─────────────────
const TRAIL_POINTS_CACHE: { val: Vec3[] | null } = { val: null };
function trailDistance(x: number, z: number): number {
  if (!TRAIL_POINTS_CACHE.val) {
    const all = [
      ...mainTrackPoints(),
      ...branchTrackPoints().flatMap((b) => b.points),
    ];
    TRAIL_POINTS_CACHE.val = all;
  }
  let min = Infinity;
  for (const p of TRAIL_POINTS_CACHE.val) {
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < min) min = d;
  }
  return min;
}

// ═══════════════════════════════════════════════════════════════════
//  Square markers — small flagposts instead of plain discs
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

        // Special landmarks: render as flagposts
        if (isStart || isGoal) {
          const flagColor = isStart ? "#22c55e" : "#fbbf24";
          const labelText = isStart ? "入学" : "卒業";
          return (
            <group key={id} position={[p.x, p.y, p.z]}>
              {/* base disc */}
              <mesh receiveShadow position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.85, 0.85, 0.12, 24]} />
                <meshStandardMaterial color={flagColor} emissive={flagColor} emissiveIntensity={0.25} roughness={0.4} />
              </mesh>
              {/* pole */}
              <mesh castShadow position={[0, 1.2, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 2.2, 8]} />
                <meshStandardMaterial color="#3a3a3a" roughness={0.7} />
              </mesh>
              {/* flag */}
              <mesh castShadow position={[0.55, 2.05, 0]}>
                <boxGeometry args={[1.0, 0.55, 0.02]} />
                <meshStandardMaterial color={flagColor} emissive={flagColor} emissiveIntensity={0.4} roughness={0.45} side={THREE.DoubleSide} />
              </mesh>
              <Billboard position={[0, 2.95, 0]}>
                <Text fontSize={0.55} color={flagColor} outlineWidth={0.05} outlineColor="#0b1020" anchorY="bottom">
                  {labelText}
                </Text>
              </Billboard>
            </group>
          );
        }

        let color = "#ffffff";
        let radius = 0.4;
        let height = 0.16;
        if (isBranchPoint) { color = "#c084fc"; radius = 0.55; height = 0.28; }
        else if (isCheckpoint) { color = "#7dd3fc"; radius = 0.5; height = 0.22; }
        else if (isBranch) { color = "#dde6f2"; radius = 0.28; height = 0.1; }

        return (
          <group key={id} position={[p.x, p.y, p.z]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[radius, radius * 1.05, height, 18]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHighlight ? 0.65 : (isBranchPoint ? 0.3 : 0.12)}
                roughness={0.4}
              />
            </mesh>
            {/* Small fork marker on branch points */}
            {isBranchPoint && (
              <mesh castShadow position={[0, 0.55, 0]}>
                <coneGeometry args={[0.25, 0.5, 6]} />
                <meshStandardMaterial color="#c084fc" emissive="#c084fc" emissiveIntensity={0.5} />
              </mesh>
            )}
            {isHighlight && (
              <group ref={pulseRef} position={[0, 0.05, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[radius + 0.2, radius + 0.5, 32]} />
                  <meshBasicMaterial color="#fde68a" transparent opacity={0.7} side={THREE.DoubleSide} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Year signposts — wooden posts with year labels
// ═══════════════════════════════════════════════════════════════════
function YearSignposts() {
  const zones: Array<{ year: 1 | 2 | 3 | 4; z: number; label: string }> = [
    { year: 1, z: 14, label: "1年生" },
    { year: 2, z: 4, label: "2年生" },
    { year: 3, z: -6, label: "3年生" },
    { year: 4, z: -14, label: "4年生" },
  ];

  return (
    <>
      {zones.map(({ year, z, label }) => {
        const x = -23;
        const y = terrainHeight(x, z);
        const [r, g, b] = colorForYear(year);
        const hex = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        return (
          <group key={year} position={[x, y, z]}>
            {/* post */}
            <mesh castShadow position={[0, 0.9, 0]}>
              <cylinderGeometry args={[0.1, 0.13, 1.8, 8]} />
              <meshStandardMaterial color="#6b4a2c" roughness={0.85} />
            </mesh>
            {/* sign plate */}
            <mesh castShadow position={[0, 1.85, 0]} rotation={[0, 0.25, 0]}>
              <boxGeometry args={[1.6, 0.55, 0.08]} />
              <meshStandardMaterial color="#a37a4e" roughness={0.8} />
            </mesh>
            <Billboard position={[0, 1.85, 0]}>
              <Text
                fontSize={0.42}
                color={hex}
                outlineWidth={0.04}
                outlineColor="#2b1e10"
              >
                {label}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Hop animation tuning
// ═══════════════════════════════════════════════════════════════════
const HOP_DURATION = 0.28;
const HOP_GAP = 0.04;
const HOP_HEIGHT = 1.1;
const HOP_STEP_TOTAL = HOP_DURATION + HOP_GAP;

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

// ═══════════════════════════════════════════════════════════════════
//  Player avatars — chibi/marshmallow style
// ═══════════════════════════════════════════════════════════════════
interface AvatarProps {
  player: Player;
  index: number;
  isCurrent: boolean;
  jitterOffset: number;
  fanCount: number;
}

function PlayerAvatar({ player, index, isCurrent, jitterOffset, fanCount }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const restPos = useRef(new THREE.Vector3());
  const currentPos = useRef(new THREE.Vector3());
  const hopWaypoints = useRef<THREE.Vector3[]>([]);
  const hopTime = useRef(0);
  const lastPosId = useRef<string | null>(null);
  const initialized = useRef(false);

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
      currentPos.current.copy(newRest);
      hopWaypoints.current = [];
    } else {
      const wps = path
        .map((id) => squarePos(id, jitterOffset, fanCount))
        .filter((v): v is THREE.Vector3 => v !== null);
      currentPos.current.copy(wps[0]);
      hopWaypoints.current = wps;
      hopTime.current = 0;
    }
    lastPosId.current = player.position;
  }, [player.position, jitterOffset, fanCount, player]);

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
        const arc = e < 1 ? Math.sin(e * Math.PI) * HOP_HEIGHT : 0;
        currentPos.current.set(x, baseY + arc, z);
      }
    } else {
      currentPos.current.lerp(restPos.current, Math.min(1, dt * 6));
      // Idle bob
      const t = performance.now() / 1000;
      const bob = Math.sin(t * 2 + jitterOffset) * 0.06;
      groupRef.current.position.set(
        currentPos.current.x,
        currentPos.current.y + bob,
        currentPos.current.z,
      );
      // Pulse glow when current player
      if (isCurrent) {
        const s = 1 + Math.sin(performance.now() / 200) * 0.06;
        groupRef.current.scale.set(s, s, s);
      } else {
        groupRef.current.scale.set(1, 1, 1);
      }
      return;
    }

    groupRef.current.position.copy(currentPos.current);

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
      {/* shadow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.95, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} />
      </mesh>
      {/* body — squishy rounded shape */}
      <mesh castShadow position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.65, 24, 18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isCurrent ? 0.5 : 0.18}
          roughness={0.45}
        />
      </mesh>
      {/* slight body bottom bulge */}
      <mesh castShadow position={[0, 0.3, 0]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.55, 20, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isCurrent ? 0.45 : 0.15} roughness={0.5} />
      </mesh>
      {/* head */}
      <mesh castShadow position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.5, 24, 18]} />
        <meshStandardMaterial color="#ffd9b5" roughness={0.6} />
      </mesh>
      {/* eyes */}
      <mesh position={[-0.18, 1.6, 0.42]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color="#1a1a2a" />
      </mesh>
      <mesh position={[0.18, 1.6, 0.42]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color="#1a1a2a" />
      </mesh>
      {/* graduation cap */}
      <mesh castShadow position={[0, 1.95, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.18, 12]} />
        <meshStandardMaterial color="#1f1f33" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 2.07, 0]}>
        <boxGeometry args={[0.95, 0.05, 0.95]} />
        <meshStandardMaterial color="#1f1f33" roughness={0.6} />
      </mesh>
      {/* tassel */}
      <mesh position={[0.4, 2.07, 0.4]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.4} />
      </mesh>
      {/* name label */}
      <Billboard position={[0, 2.85, 0]}>
        <Text
          fontSize={0.55}
          color="#ffffff"
          outlineWidth={0.06}
          outlineColor="#0b1020"
          anchorY="bottom"
        >
          {player.name}
        </Text>
      </Billboard>
      {/* current-turn indicator */}
      {isCurrent && (
        <>
          <Billboard position={[0, 3.6, 0]}>
            <Text fontSize={0.85} color="#fde68a" outlineWidth={0.06} outlineColor="#0b1020">
              ▼
            </Text>
          </Billboard>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.06, 1.4, 10, 16, 1, true]} />
            <meshBasicMaterial
              color="#fde68a"
              transparent
              opacity={0.22}
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
const OVERVIEW_CAM_POS = new THREE.Vector3(0, 26, 42);
const OVERVIEW_TARGET = new THREE.Vector3(0, 4, -4);

interface CameraRigProps {
  mode: CameraMode;
  followPos: Vec3 | null;
}

function CameraRig({ mode, followPos }: CameraRigProps) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 8, 0));
  const targetCam = useRef(new THREE.Vector3().copy(OVERVIEW_CAM_POS));
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const prevMode = useRef<CameraMode | null>(null);

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
    if (mode === "overview") return;
    if (mode === "follow" && followPos) {
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
//  Main component
// ═══════════════════════════════════════════════════════════════════
export function MountainBoard({
  players,
  currentPlayerId,
  highlightSquareId,
  cameraMode = "overview",
}: MountainBoardProps) {
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
      <color attach="background" args={["#cfe6ff"]} />
      <fog attach="fog" args={["#dfeeff", 50, 110]} />

      {/* Lighting */}
      <ambientLight intensity={0.55} color="#ddeeff" />
      <directionalLight
        position={[18, 32, 14]}
        intensity={1.4}
        color="#fff5d6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-bias={-0.0005}
      />
      <hemisphereLight args={["#cfe6ff", "#3a3520", 0.5]} />

      <Sky
        distance={4000}
        sunPosition={[18, 25, 14]}
        inclination={0.49}
        azimuth={0.25}
        turbidity={4.5}
        rayleigh={1.3}
      />

      {/* Volumetric clouds */}
      <Clouds material={THREE.MeshBasicMaterial} limit={20}>
        <Cloud position={[-22, 22, 8]} segments={28} bounds={[10, 4, 6]} volume={6} color="#ffffff" opacity={0.55} fade={50} />
        <Cloud position={[22, 24, -4]} segments={24} bounds={[8, 3, 5]} volume={5} color="#ffffff" opacity={0.5} fade={50} />
        <Cloud position={[0, 27, -22]} segments={28} bounds={[12, 4, 6]} volume={7} color="#ffffff" opacity={0.55} fade={50} />
      </Clouds>

      <Terrain />
      <Trees />
      <Rocks />
      <Snow />
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

      <EffectComposer>
        <Bloom intensity={0.45} luminanceThreshold={0.55} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}
