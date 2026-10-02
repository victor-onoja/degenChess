import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { trackPieces, type MoveEvent, type TrackedPiece } from "../../lib/pieces";
import { sfx } from "../../lib/sound";
import { ChessPiece, PIECE_HEIGHT, type PieceParts } from "./pieces3d";
import { ANATOMY } from "../../lib/pieceShapes";

// The arena: a living board floating in an indigo dimension. Pieces watch the play, breathe, blink,
// flinch when attacked and lean in when they can capture. Each carries its share of the stake as a
// glowing core; a capture tears the core out of the victim and it flies into the piece that took it.

// ------------------------------------------------------------------ constants

const FIELD = "#0c0f33";
const SQUARES = { light: "#3a45b8", dark: "#222a85", lastLight: "#5560cf", lastDark: "#323ca3" };
const GOLD = "#ffc233";
const GOLD_GLOW = new THREE.Color(GOLD).multiplyScalar(2.2);
const ALERT_GLOW = new THREE.Color("#ff5a45").multiplyScalar(1.6);
const BODY_COLOR: Record<Color, string> = { w: "#efe5cf", b: "#1a1a26" };
const KIND: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

const xz = (square: string): [number, number] => [square.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(square[1]) - 1)];
const now = () => performance.now() / 1000;
const FOV = 40;

/** Timing of a move: a hop to the square; a capture is a higher hop that lands on the victim. */
function timeline(event: MoveEvent) {
  const [fx, fz] = xz(event.from);
  const [tx, tz] = xz(event.to);
  const dist = Math.hypot(tx - fx, tz - fz);
  const hop = 0.34 + dist * 0.045;
  return { dist, hop, dieAt: hop, total: hop + 0.3 };
}

interface Animation {
  event: MoveEvent | null;
  start: number;
}

/** Where everyone is looking: the pointer, the last move, or nowhere in particular. */
interface Gaze {
  target: THREE.Vector3;
  until: number;
}

/** Two quick beats, then rest: the rhythm every core keeps. */
function heartbeat(t: number) {
  const phase = t % 1.15;
  return Math.exp(-((phase - 0.05) ** 2) / 0.0015) + 0.6 * Math.exp(-((phase - 0.27) ** 2) / 0.002);
}

// ------------------------------------------------------------------ pieces

function Piece({
  piece,
  animation,
  gaze,
  selectable,
  selected,
  nervous,
  eager,
  inCheck,
  toppled,
  tag,
  onPick,
  onHover,
}: {
  piece: TrackedPiece;
  animation: Animation;
  gaze: MutableRefObject<Gaze>;
  selectable: boolean;
  selected: boolean;
  /** Attacked by an enemy piece: trembles, eyes wide. */
  nervous: boolean;
  /** Has a capture available on this turn: leans in. */
  eager: boolean;
  inCheck: boolean;
  /** A mated king falls over. */
  toppled: boolean;
  /** Worth shown on a tag above the piece. */
  tag?: string;
  onPick: (square: Square) => void;
  onHover: (id: string | null) => void;
}) {
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const parts = useRef<PieceParts>(null);
  const turn = useRef(0);
  const lift = useRef(0);
  const fall = useRef(0);
  const swell = useRef(0);
  const blink = useRef({ next: now() + 1 + Math.random() * 4, until: 0 });
  const phase = useMemo(() => Math.random() * 10, []);
  const home = piece.color === "w" ? Math.PI : 0; // pieces face the enemy

  const { event, start } = animation;
  const role = !event
    ? null
    : event.moverId === piece.id
      ? "mover"
      : event.victimId === piece.id
        ? "victim"
        : event.rook?.id === piece.id
          ? "rook"
          : null;
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const group = outer.current;
    const mesh = body.current;
    if (!group || !mesh) return;
    const t = clock.elapsedTime + phase;
    const [hx, hz] = xz(piece.square);
    let x = hx;
    let z = hz;
    let y = 0;
    let stretch = 1;
    let lean = 0;
    let heading = 0;
    let visible = piece.alive;
    let settled = true;
    let coreGone = false;

    if (event && role) {
      const since = now() - start;
      const tl = timeline(event);
      if (role === "victim") {
        visible = since < tl.dieAt;
        coreGone = true; // the core is in flight (CoreFlight draws it)
      } else {
        const [fx, fz] = xz(role === "rook" ? event.rook!.from : event.from);
        const dx = hx - fx;
        const dz = hz - fz;
        if (since < tl.hop) {
          settled = false;
          const k = since / tl.hop;
          const ease = k * k * (3 - 2 * k);
          const arc = Math.sin(Math.PI * k);
          const height = (piece.kind === "n" ? 1.25 : 0.55) + (role === "mover" && event.victimId ? 0.45 : 0);
          x = fx + dx * ease;
          z = fz + dz * ease;
          y = arc * height;
          stretch = 1 + arc * 0.16;
          lean = Math.cos(Math.PI * k) * 0.22;
          heading = Math.atan2(dx, dz);
        } else if (since < tl.total) {
          const after = since - tl.hop;
          stretch = 1 - 0.24 * Math.exp(-after * 13) * Math.cos(after * 34);
        }
        // The capturer swells as the stolen core arrives.
        if (role === "mover" && event.victimId && since > tl.dieAt + 0.5 && since < tl.dieAt + 0.6) swell.current = 1;
      }
    }

    // Life: breathing, trembling when attacked, leaning in with a capture available.
    const breath = 1 + Math.sin(t * 1.7) * 0.012;
    const tremble = nervous && settled ? Math.sin(t * 47) * 0.008 : 0;
    if (eager && settled) lean = Math.sin(t * 3) * 0.025 + 0.07;

    lift.current += ((selected && settled ? 0.16 : 0) - lift.current) * 0.25;
    fall.current += ((toppled ? 1 : 0) - fall.current) * 0.06;
    swell.current *= 0.93;

    group.visible = visible;
    group.position.set(x + tremble, 0, z);

    // Turn a little towards whatever has everyone's attention.
    group.getWorldPosition(scratch);
    let look = 0;
    let lookUp = 0;
    if (gaze.current.until > now()) {
      const dx = gaze.current.target.x - scratch.x;
      const dz = gaze.current.target.z - scratch.z;
      // Angle to the target, measured from the direction this piece faces.
      let rel = Math.atan2(dx, dz) - home;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      look = THREE.MathUtils.clamp(rel, -1.1, 1.1);
      lookUp = THREE.MathUtils.clamp(
        (gaze.current.target.y - (scratch.y + ANATOMY[piece.kind].eyeY)) / Math.max(Math.hypot(dx, dz), 0.6),
        -0.4,
        0.5
      );
    } else {
      look = Math.sin(t * 0.31) * 0.35; // idle: glance around
    }
    turn.current += ((settled ? look * 0.35 : 0) - turn.current) * 0.08;

    mesh.position.y = y + lift.current;
    mesh.scale.set(breath / Math.sqrt(stretch), breath * stretch, breath / Math.sqrt(stretch));
    mesh.rotation.set(Math.cos(heading) * lean, home + turn.current, -Math.sin(heading) * lean + fall.current * 1.45, "YXZ");

    const p = parts.current;
    if (p?.eyes) {
      p.eyes.rotation.y += ((settled ? look * 0.65 : 0) - p.eyes.rotation.y) * 0.15;
      p.eyes.rotation.x += (-lookUp - p.eyes.rotation.x) * 0.15;
      const b = blink.current;
      const wall = now();
      if (wall > b.next) {
        b.until = wall + 0.11;
        b.next = wall + 2.5 + Math.random() * 4.5;
      }
      const closed = wall < b.until || toppled;
      const wide = nervous ? 1.25 : eager ? 0.75 : 1;
      p.eyes.scale.set(1, closed ? 0.12 : wide, 1);
    }
    if (p?.core) {
      const beat = heartbeat(t * (nervous ? 1.6 : 1));
      p.core.visible = !coreGone;
      p.core.scale.setScalar(p.coreRadius * (1 + beat * 0.22 + swell.current * 0.9));
    }
  });

  if (!piece.alive && role !== "victim") return null;
  const [x0, z0] = xz(piece.square);
  return (
    <group
      ref={outer}
      position={[x0, 0, z0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onPick(piece.square);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(piece.id);
        if (selectable) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "";
      }}
    >
      {(inCheck || selected) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <ringGeometry args={[0.4, 0.46, 40]} />
          <meshBasicMaterial color={inCheck ? ALERT_GLOW : GOLD_GLOW} toneMapped={false} />
        </mesh>
      )}
      <group ref={body} rotation-y={home}>
        <ChessPiece ref={parts} kind={piece.kind} color={piece.color} />
      </group>
      {tag && (
        <Html position={[0, PIECE_HEIGHT[piece.kind] + 0.35, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="value-tag">
            <span className="value-tag__kind">{KIND[piece.kind]}</span>
            <span className="value-tag__amount">{tag}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ capture effects

/** The victim's core is torn out and flies into the piece that took it. */
function CoreFlight({
  from,
  to,
  start,
  size,
  label,
}: {
  from: [number, number, number];
  to: [number, number, number];
  start: number;
  size: number;
  label?: string;
}) {
  const TRAIL = 12;
  const FLIGHT = 0.55;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [labelVisible, setLabelVisible] = useState(false);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const t = now() - start;
    const show = t > FLIGHT * 0.6 && t < FLIGHT + 1.8;
    if (show !== labelVisible) setLabelVisible(show);
    if (!mesh.current) return;
    for (let i = 0; i < TRAIL; i++) {
      const k = THREE.MathUtils.clamp((t - i * 0.022) / FLIGHT, 0, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      const arc = Math.sin(Math.PI * ease) * 1.3;
      dummy.position.set(from[0] + (to[0] - from[0]) * ease, from[1] + (to[1] - from[1]) * ease + arc, from[2] + (to[2] - from[2]) * ease);
      const alive = t > i * 0.022 && k < 1;
      dummy.scale.setScalar(alive ? size * (1 - i / TRAIL) * (i === 0 ? 1.4 : 0.8) : 0);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, TRAIL]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color={GOLD_GLOW} toneMapped={false} />
      </instancedMesh>
      {label && labelVisible && (
        <Html position={[to[0], to[1] + 1.1, to[2]]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="capture-amount">{label}</div>
        </Html>
      )}
    </>
  );
}

/** The captured piece bursts into shards where it stood. */
function Shatter({ at, start, color, height }: { at: [number, number]; start: number; color: Color; height: number }) {
  const COUNT = 28;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.6;
        return {
          y0: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vz: Math.sin(angle) * speed,
          vy: 1 + Math.random() * 3.2,
          spin: (Math.random() - 0.5) * 16,
          size: 0.06 + Math.random() * 0.1,
        };
      }),
    [height]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!mesh.current) return;
    const t = now() - start;
    const alive = t >= 0 && t < 0.9;
    seeds.forEach((s, i) => {
      dummy.position.set(at[0] + s.vx * t, Math.max(s.y0 + s.vy * t - 6.5 * t * t, 0.03), at[1] + s.vz * t);
      dummy.rotation.set(s.spin * t, s.spin * t * 0.7, 0);
      dummy.scale.setScalar(alive ? s.size * (1 - t / 0.9) : 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false} castShadow>
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={BODY_COLOR[color]} metalness={0.3} roughness={0.4} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ board and dimension

function Board({
  selected,
  targets,
  lastMove,
  onPick,
  onPoint,
}: {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  onPick: (square: Square) => void;
  onPoint: (point: THREE.Vector3) => void;
}) {
  const [hovered, setHovered] = useState<Square | null>(null);
  const squares = useMemo(() => {
    const all: { square: Square; x: number; z: number; dark: boolean }[] = [];
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const square = (String.fromCharCode(97 + f) + (r + 1)) as Square;
        const [x, z] = xz(square);
        all.push({ square, x, z, dark: (f + r) % 2 === 0 });
      }
    }
    return all;
  }, []);

  return (
    <group>
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[8.6, 0.28, 8.6]} />
        <meshStandardMaterial color="#0a0d2c" roughness={0.5} metalness={0.4} />
      </mesh>
      {squares.map(({ square, x, z, dark }) => {
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const isTarget = targets.includes(square);
        const color =
          selected === square
            ? GOLD
            : hovered === square && isTarget
              ? "#ffe08a"
              : isLast
                ? dark
                  ? SQUARES.lastDark
                  : SQUARES.lastLight
                : dark
                  ? SQUARES.dark
                  : SQUARES.light;
        return (
          <mesh
            key={square}
            position={[x, -0.05, z]}
            receiveShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onPick(square);
            }}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => onPoint(e.point)}
            onPointerOver={() => {
              setHovered(square);
              if (isTarget) document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered((h) => (h === square ? null : h));
              document.body.style.cursor = "";
            }}
          >
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.15} envMapIntensity={0.6} />
          </mesh>
        );
      })}
      {targets.map((square) => {
        const [x, z] = xz(square);
        return (
          <mesh key={square} position={[x, 0.02, z]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.15, 28]} />
            <meshBasicMaterial color={GOLD_GLOW} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** The dimension around the board: squares of the field drifting slowly upward, as if the board breathes them out. */
function Motes() {
  const COUNT = 150;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: COUNT }, () => {
      const angle = random() * Math.PI * 2;
      const radius = 6.5 + random() * 12;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y0: random() * 9 - 2,
        speed: 0.08 + random() * 0.18,
        size: 0.06 + random() * 0.22,
        spin: random() * Math.PI,
      };
    });
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const y = ((s.y0 + t * s.speed + 2) % 9) - 2;
      dummy.position.set(s.x, y, s.z);
      dummy.rotation.set(s.spin + t * 0.2, s.spin, 0);
      dummy.scale.setScalar(s.size * Math.min(1, (y + 2) / 1.5, (7 - y) / 1.5));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#4d58d6" transparent opacity={0.55} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ camera

/**
 * Keeps the board framed for any canvas shape and HUD, leans in on captures, shakes on impact,
 * and circles slowly when the board is a backdrop.
 */
function CameraRig({
  orientation,
  attract,
  animation,
  insets,
}: {
  orientation: Color;
  attract: boolean;
  animation: Animation;
  insets?: { top: number; bottom: number };
}) {
  const { camera, size, scene } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const fitted = useRef("");

  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!controls) return;

    const key = `${orientation}:${attract}:${size.width}x${size.height}:${insets?.top ?? 0}:${insets?.bottom ?? 0}`;
    if (fitted.current !== key) {
      fitted.current = key;
      const aspect = size.width / size.height;
      const portrait = aspect < 0.85;
      // As a backdrop the camera sits low and close, so the pieces' faces are the subject.
      const elevation = attract ? (portrait ? 0.62 : 0.4) : portrait ? 0.98 : aspect > 1.5 ? 0.6 : 0.5;
      const vHalf = THREE.MathUtils.degToRad(FOV / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      const near = 4.25 * Math.cos(elevation);
      const top = insets?.top ?? 0;
      const bottom = insets?.bottom ?? 0;
      const usable = Math.max((size.height - top - bottom) / size.height, 0.4);
      const fitWidth = (attract ? (portrait ? 3.9 : 4.6) : 4.7) / Math.tan(hHalf) + near;
      const fitHeight = (4.25 * Math.sin(elevation) + 1.5) / (Math.tan(vHalf) * usable) + near * 0.5;
      const distance = Math.max(fitWidth, fitHeight) * (attract ? 0.82 : 1);
      // The haze starts behind the board however far back a narrow screen pushes the camera.
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.near = distance + 7;
        scene.fog.far = distance + 30;
      }
      const sign = orientation === "w" ? 1 : -1;
      cam.position.set(attract ? distance * 0.35 : 0, Math.sin(elevation) * distance, Math.cos(elevation) * distance * sign);
      controls.target.set(0, 0.3, 0);
      controls.minDistance = distance * 0.5;
      controls.maxDistance = distance * 1.5;
      // Positive values slide the picture up: as a backdrop the board sits above the statement.
      const shiftUp = attract ? size.height * (portrait ? 0.17 : 0.12) : (bottom - top) / 2;
      if (shiftUp !== 0) cam.setViewOffset(size.width, size.height, 0, shiftUp, size.width, size.height);
      else cam.clearViewOffset();
    }

    const { event, start } = animation;
    let focus: [number, number] = [0, 0];
    let fov = FOV;
    if (event?.victimSquare) {
      const t = now() - start;
      const tl = timeline(event);
      if (t < tl.total + 0.9) {
        const [vx, vz] = xz(event.victimSquare);
        focus = [vx * 0.45, vz * 0.45];
        fov = FOV - 6;
      }
      if (t > tl.dieAt && t < tl.dieAt + 0.22) {
        controls.target.x += (Math.random() - 0.5) * 0.09;
        controls.target.y += (Math.random() - 0.5) * 0.09;
      }
    }
    controls.target.x += (focus[0] - controls.target.x) * 0.06;
    controls.target.y += (0.3 - controls.target.y) * 0.2;
    controls.target.z += (focus[1] - controls.target.z) * 0.06;
    if (Math.abs(cam.fov - fov) > 0.02) {
      cam.fov += (fov - cam.fov) * 0.07;
      cam.updateProjectionMatrix();
    }
    controls.autoRotate = attract;
    controls.autoRotateSpeed = 0.28;
    if (attract) controls.update();
  });
  return null;
}

/** Tracks the pointer over the board in attract mode, where the canvas sits behind the page. */
function PointerGaze({ gaze }: { gaze: MutableRefObject<Gaze> }) {
  const { camera, pointer } = useThree();
  const last = useRef({ x: 0, y: 0 });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (pointer.x === last.current.x && pointer.y === last.current.y) return;
    last.current = { x: pointer.x, y: pointer.y };
    ray.setFromCamera(pointer, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      gaze.current.target.copy(hit).setY(1.2);
      gaze.current.until = now() + 2.5;
    }
  });
  return null;
}

// ------------------------------------------------------------------ arena

export interface ArenaProps {
  /** Full move list (include an optimistic pending move so the board reacts instantly). */
  history: readonly Move[];
  /** Which side the camera sits behind. */
  orientation: Color;
  /** The colour the viewer may move right now, or null. */
  movable: Color | null;
  legalTargets: (from: Square) => { to: Square; promotion: boolean }[];
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  /** A piece's worth as text, e.g. "0.77 tUSD". */
  captureLabel?: (kind: PieceSymbol) => string;
  /** Fill the parent element instead of rendering a square. */
  immersive?: boolean;
  /** Fill a sized parent (used for the side-by-side view). */
  fill?: boolean;
  /** Backdrop mode: slowly circle the board, no interaction, no sound. */
  attract?: boolean;
  /** Pixels covered by overlays at the top and bottom, so the board is framed in the space between. */
  insets?: { top: number; bottom: number };
}

function Scene({
  history,
  orientation,
  movable,
  legalTargets,
  onMove,
  captureLabel,
  attract = false,
  insets,
  askPromotion,
}: ArenaProps & { askPromotion: (from: Square, to: Square) => void }) {
  const { pieces, last } = useMemo(() => trackPieces(history), [history]);

  // Animate only when exactly one new move arrives; anything else (first load, undo) snaps.
  const seen = useRef(history.length);
  const animation = useRef<Animation>({ event: null, start: 0 });
  if (history.length !== seen.current) {
    animation.current = history.length === seen.current + 1 && last ? { event: last, start: now() } : { event: null, start: 0 };
    seen.current = history.length;
  }
  const { event, start } = animation.current;

  // Everyone turns to look at a move as it lands.
  const gaze = useRef<Gaze>({ target: new THREE.Vector3(), until: 0 });
  useEffect(() => {
    if (!event) return;
    const [x, z] = xz(event.to);
    gaze.current.target.set(x, 0.6, z);
    gaze.current.until = now() + 2.2;
  }, [event]);

  useEffect(() => {
    if (!event || attract) return;
    const tl = timeline(event);
    if (event.victimId) {
      sfx.hit(tl.dieAt);
      sfx.coins(tl.dieAt + 0.4);
    } else {
      sfx.land(tl.hop);
    }
  }, [event, attract]);

  // Who is in danger, and who has a capture to make, in the current position.
  const { nervous, eager } = useMemo(() => {
    const game = new Chess();
    try {
      for (const m of history) game.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      return { nervous: new Set<string>(), eager: new Set<string>() };
    }
    const nervousSquares = new Set<string>();
    for (const p of pieces) {
      if (p.alive && p.kind !== "k" && game.isAttacked(p.square, p.color === "w" ? "b" : "w")) nervousSquares.add(p.square);
    }
    const eagerSquares = new Set(
      game
        .moves({ verbose: true })
        .filter((m) => m.captured)
        .map((m) => m.from as string)
    );
    return { nervous: nervousSquares, eager: eagerSquares };
  }, [history, pieces]);

  const [selected, setSelected] = useState<Square | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => setSelected(null), [history.length, movable]);
  const targets = useMemo(() => (selected ? legalTargets(selected) : []), [selected, legalTargets]);

  const pick = (square: Square) => {
    if (!movable) return;
    const target = targets.find((t) => t.to === square);
    if (selected && target) {
      setSelected(null);
      if (target.promotion) askPromotion(selected, square);
      else onMove(selected, square);
      return;
    }
    const own = pieces.find((p) => p.alive && p.square === square && p.color === movable);
    if (own) sfx.select();
    setSelected(own ? square : null);
  };

  const pointAt = (point: THREE.Vector3) => {
    gaze.current.target.set(point.x, 1.2, point.z);
    gaze.current.until = now() + 2.5;
  };

  const lastMove = history.length ? history[history.length - 1] : null;
  const victim = event?.victimId ? pieces.find((p) => p.id === event.victimId) : null;
  const capturer = event?.victimId ? pieces.find((p) => p.id === event.moverId) : null;
  const hitAt = event ? start + timeline(event).dieAt : 0;
  const sideToMove: Color = history.length % 2 === 0 ? "w" : "b";
  const checked = lastMove?.san.includes("+") ? sideToMove : null;
  const mated = lastMove?.san.includes("#") ? sideToMove : null;

  // Which piece wears a worth tag: the one under the pointer, the selected one, or (as a backdrop)
  // the most valuable piece still standing, so the first thing anyone reads is a price on a piece.
  const tagged = useMemo(() => {
    if (!captureLabel) return null;
    if (hovered) return hovered;
    if (selected) return pieces.find((p) => p.alive && p.square === selected)?.id ?? null;
    if (!attract) return null;
    for (const kind of ["q", "r", "b", "n", "p"] as PieceSymbol[]) {
      const found = pieces.find((p) => p.alive && p.color === "w" && p.kind === kind);
      if (found) return found.id;
    }
    return null;
  }, [hovered, selected, attract, pieces, captureLabel]);

  return (
    <>
      <CameraRig orientation={orientation} attract={attract} animation={animation.current} insets={insets} />
      {attract && <PointerGaze gaze={gaze} />}
      <color attach="background" args={[FIELD]} />
      <fog attach="fog" args={[FIELD, 14, 36]} />
      <hemisphereLight args={["#c9d2ff", "#0c0f33", 0.45]} />
      <directionalLight
        position={[5, 12, 6]}
        intensity={1.6}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <directionalLight position={[-6, 4, -8]} intensity={1.2} color="#8f9cff" />
      <Environment resolution={256} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#9aa6ff" position={[0, 2, 9]} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#9aa6ff" position={[0, 2, -9]} rotation-y={Math.PI} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffe6c4" position={[9, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>

      <Motes />
      <Board selected={selected} targets={targets.map((t) => t.to)} lastMove={lastMove} onPick={pick} onPoint={pointAt} />
      {pieces.map((piece) => (
        <Piece
          key={`${piece.id}-${piece.kind}`}
          piece={piece}
          animation={animation.current}
          gaze={gaze}
          selectable={movable === piece.color}
          selected={selected === piece.square && piece.alive}
          nervous={nervous.has(piece.square)}
          eager={eager.has(piece.square) && piece.color === sideToMove}
          inCheck={piece.kind === "k" && (checked === piece.color || mated === piece.color)}
          toppled={piece.kind === "k" && mated === piece.color}
          tag={tagged === piece.id && piece.kind !== "k" && captureLabel ? captureLabel(piece.kind) : undefined}
          onPick={pick}
          onHover={setHovered}
        />
      ))}
      {event && victim && capturer && event.victimSquare && (
        <>
          <Shatter
            key={`x${event.ply}`}
            at={xz(event.victimSquare)}
            start={hitAt}
            color={victim.color}
            height={PIECE_HEIGHT[event.victimKind ?? "p"]}
          />
          <CoreFlight
            key={`c${event.ply}`}
            from={[xz(event.victimSquare)[0], ANATOMY[event.victimKind ?? "p"].coreY, xz(event.victimSquare)[1]]}
            to={[xz(event.to)[0], ANATOMY[capturer.kind].coreY, xz(event.to)[1]]}
            start={hitAt}
            size={0.09}
            label={event.victimKind && captureLabel ? `+${captureLabel(event.victimKind)}` : undefined}
          />
        </>
      )}
    </>
  );
}

export default function Arena3D(props: ArenaProps) {
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  // Phones skip shadows and glow, and render at a lower resolution; any device drops further if it struggles.
  const [lite, setLite] = useState(() => typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 640);
  const [dpr, setDpr] = useState(lite ? 1.5 : 1.75);

  return (
    <div
      className={
        props.immersive
          ? "absolute inset-0"
          : props.fill
            ? "relative h-full w-full overflow-hidden rounded-[3px]"
            : "relative aspect-square w-full overflow-hidden rounded-[3px]"
      }
    >
      <Canvas key={props.orientation} shadows={!lite} camera={{ position: [0, 7, 13], fov: FOV }} dpr={dpr}>
        <PerformanceMonitor
          onDecline={() => {
            setDpr(1);
            setLite(true);
          }}
        />
        <Suspense
          fallback={
            <Html center>
              <div className="arena-loading">Setting the board...</div>
            </Html>
          }
        >
          <Scene {...props} askPromotion={(from, to) => setPromotion({ from, to })} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} enabled={!props.attract} minPolarAngle={0.2} maxPolarAngle={1.38} />
        {!lite && (
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
      {promotion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(8,10,34,0.72)]">
          <div className="slab flex flex-col items-center gap-4 p-6">
            <span className="text-lg font-bold">Promote to</span>
            <div className="rank">
              {(["q", "r", "b", "n"] as const).map((kind) => (
                <button
                  key={kind}
                  className="rank__square capitalize"
                  onClick={() => {
                    props.onMove(promotion.from, promotion.to, kind);
                    setPromotion(null);
                  }}
                >
                  {KIND[kind]}
                </button>
              ))}
            </div>
            <button className="link" onClick={() => setPromotion(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
