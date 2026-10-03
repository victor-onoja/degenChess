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
import { Figure, GlyphDisc, gemY, type FigureParts } from "./armies";
import type { PieceSet } from "../../lib/pieceSet";

// The arena: a living board floating in an indigo dimension. Pieces turn towards the play, breathe,
// flinch when attacked and lean in when they can capture. Each carries its share of the stake as a
// glowing core; a capture tears the core out of the victim and it flies into the piece that took it.

// ------------------------------------------------------------------ constants

const FIELD = "#08070d";
const SQUARES = { light: "#5f4fd0", dark: "#35297f", lastLight: "#8a7bf0", lastDark: "#4c3db0" };
const GOLD = "#ffc233";
const GOLD_GLOW = new THREE.Color(GOLD).multiplyScalar(2.2);
const ALERT_GLOW = new THREE.Color("#ff5a45").multiplyScalar(1.6);
const BODY_COLOR: Record<Color, string> = { w: "#efe5cf", b: "#1a1a26" };
const KIND: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

const xz = (square: string): [number, number] => [square.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(square[1]) - 1)];
const now = () => performance.now() / 1000;
/** The square under a point on the board, or null off the board. */
const squareAt = (p: THREE.Vector3): Square | null => {
  const file = Math.round(p.x + 3.5);
  const rank = Math.round(3.5 - p.z) + 1;
  return file < 0 || file > 7 || rank < 1 || rank > 8 ? null : ((String.fromCharCode(97 + file) + rank) as Square);
};
/** A stable small number per piece, to pick between a character's looks. */
const variantOf = (id: string) => [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
type Drag = { square: Square; at: THREE.Vector3; moved: boolean };
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
  onPick,
  figure,
  celebrating,
  drag,
  onDragStart,
  rise,
}: {
  piece: TrackedPiece;
  animation: Animation;
  gaze: MutableRefObject<Gaze>;
  selectable: boolean;
  selected: boolean;
  /** Attacked by an enemy piece: trembles. */
  nervous: boolean;
  /** Has a capture available on this turn: leans in. */
  eager: boolean;
  inCheck: boolean;
  /** A mated king falls over. */
  toppled: boolean;
  onPick: (square: Square) => void;
  /** Played by a character (the armies) instead of a chess piece. */
  figure: boolean;
  /** Its side just delivered checkmate. */
  celebrating: boolean;
  /** The piece being dragged, if any, and where it is. */
  drag: MutableRefObject<Drag | null>;
  onDragStart: (square: Square) => void;
  /** A new game is starting: characters that can, rise out of the board. */
  rise: boolean;
}) {
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const parts = useRef<PieceParts & Partial<FigureParts>>(null);
  const turn = useRef(0);
  const lift = useRef(0);
  const fall = useRef(0);
  const swell = useRef(0);
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
        // A chess piece shatters on impact; a character falls, then sinks into the board.
        visible = since < tl.dieAt + (figure ? 1.5 : 0);
        if (figure && since > tl.dieAt + 0.8) y = -(since - tl.dieAt - 0.8) * 0.9;
        coreGone = since > tl.dieAt || !figure; // the core is in flight (CoreFlight draws it)
      } else {
        const [fx, fz] = xz(role === "rook" ? event.rook!.from : event.from);
        const dx = hx - fx;
        const dz = hz - fz;
        if (since < tl.hop) {
          settled = false;
          const k = since / tl.hop;
          const ease = k * k * (3 - 2 * k);
          const arc = Math.sin(Math.PI * k);
          // Characters walk (a knight leaps); chess pieces hop with a squash and stretch.
          const height = figure
            ? piece.kind === "n"
              ? 0.7
              : 0.06
            : (piece.kind === "n" ? 1.25 : 0.55) + (role === "mover" && event.victimId ? 0.45 : 0);
          x = fx + dx * ease;
          z = fz + dz * ease;
          y = arc * height;
          stretch = figure ? 1 : 1 + arc * 0.16;
          lean = figure ? 0 : Math.cos(Math.PI * k) * 0.22;
          heading = Math.atan2(dx, dz);
        } else if (since < tl.total && !figure) {
          const after = since - tl.hop;
          stretch = 1 - 0.24 * Math.exp(-after * 13) * Math.cos(after * 34);
        }
        // The capturer swells as the stolen core arrives.
        if (role === "mover" && event.victimId && since > tl.dieAt + 0.5 && since < tl.dieAt + 0.6) swell.current = 1;
      }
    }

    // Being dragged: it follows the pointer, held up off the board.
    const held = drag.current?.square === piece.square && piece.alive ? drag.current : null;
    if (held) {
      x = held.at.x;
      z = held.at.z;
      y = 0.45;
      settled = false;
      heading = Math.atan2(held.at.x - hx, held.at.z - hz);
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
    if (gaze.current.until > now()) {
      const dx = gaze.current.target.x - scratch.x;
      const dz = gaze.current.target.z - scratch.z;
      // Angle to the target, measured from the direction this piece faces.
      let rel = Math.atan2(dx, dz) - home;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      look = THREE.MathUtils.clamp(rel, -1.1, 1.1);
    } else {
      look = Math.sin(t * 0.31) * 0.35; // idle: glance around
    }
    turn.current += ((settled ? look * 0.35 : 0) - turn.current) * 0.08;

    mesh.position.y = y + lift.current;
    mesh.scale.set(breath / Math.sqrt(stretch), breath * stretch, breath / Math.sqrt(stretch));
    const p = parts.current;
    if (figure) {
      // A walking character faces where it is going, then turns back to face the enemy.
      const facing = settled ? home + turn.current : heading;
      let d = facing - mesh.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      mesh.rotation.set(0, mesh.rotation.y + d * (settled ? 0.12 : 0.35), 0, "YXZ");
      const since = event ? now() - start : Infinity;
      const tl = event ? timeline(event) : null;
      if (toppled || (role === "victim" && tl && since > tl.dieAt)) p?.act?.("Death_A");
      else if (role === "victim" && tl && since > tl.dieAt - 0.25) p?.act?.("Hit_A");
      else if (celebrating && settled) p?.act?.("Cheer");
      else if (role === "mover" && tl && event?.victimId && since > tl.hop - 0.35 && since < tl.total) p?.act?.("Attack");
      else if (role === "mover" && tl && event?.victimId && since >= tl.total && since < tl.total + 1.8) p?.act?.("Taunt");
      else p?.act?.(settled ? "Idle" : "Walking_A");
    } else {
      mesh.rotation.set(Math.cos(heading) * lean, home + turn.current, -Math.sin(heading) * lean + fall.current * 1.45, "YXZ");
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
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!selectable) return;
        e.stopPropagation();
        onDragStart(piece.square);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (selectable) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {(inCheck || selected) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <ringGeometry args={[0.4, 0.46, 40]} />
          <meshBasicMaterial color={inCheck ? ALERT_GLOW : GOLD_GLOW} toneMapped={false} />
        </mesh>
      )}
      {figure && <GlyphDisc color={piece.color} kind={piece.kind} />}
      <group ref={body} rotation-y={home}>
        {figure ? (
          <Figure ref={parts as never} color={piece.color} kind={piece.kind} rise={rise} variant={variantOf(piece.id)} />
        ) : (
          <ChessPiece ref={parts} kind={piece.kind} color={piece.color} />
        )}
      </group>
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
        <meshStandardMaterial color="#15121f" roughness={0.5} metalness={0.4} />
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
      <meshBasicMaterial color="#8573ee" transparent opacity={0.55} side={THREE.DoubleSide} />
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
  /** The armies (default) or the classic Staunton set. */
  set?: PieceSet;
  /** Show a switch between the two sets. */
  onSetChange?: (set: PieceSet) => void;
}

// ------------------------------------------------------------------ the multiverse

/** A checkerboard texture for the far boards: other games, in other dimensions. */
function ghostTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d")!;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    g.fillStyle = (r + f) % 2 ? "#3b2e8c" : "#8573ee";
    g.fillRect(f * 8, r * 8, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Other boards hang in the void around this one, tilted at their own angles and drifting: the same
 * game being played in other dimensions. Cheap: a dozen textured slabs, no lights, no shadows.
 */
function Multiverse() {
  const boards = useMemo(() => {
    const texture = ghostTexture();
    const rand = (() => {
      let seed = 7;
      return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    })();
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + rand() * 0.4;
      const distance = 16 + rand() * 18;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.16 + rand() * 0.22, fog: false, depthWrite: false });
      return {
        position: [Math.cos(angle) * distance, -4 + rand() * 12, Math.sin(angle) * distance] as [number, number, number],
        rotation: [rand() * 1.4 - 0.7, rand() * Math.PI, rand() * 1.2 - 0.6] as [number, number, number],
        size: 3 + rand() * 4,
        spin: (rand() - 0.5) * 0.08,
        material,
      };
    });
  }, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, delta) => {
    boards.forEach((b, i) => {
      const mesh = refs.current[i];
      if (mesh) mesh.rotation.y += b.spin * delta;
    });
  });
  return (
    <group>
      {boards.map((b, i) => (
        <mesh key={i} ref={(m) => {
            refs.current[i] = m;
          }} position={b.position} rotation={b.rotation} material={b.material}>
          <boxGeometry args={[b.size, 0.06, b.size]} />
        </mesh>
      ))}
    </group>
  );
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
  set,
}: ArenaProps & { askPromotion: (from: Square, to: Square) => void; set: PieceSet }) {
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
    // Characters walk, so they are heard walking (a knight leaps, so it only lands).
    const mover = pieces.find((p) => p.id === event.moverId);
    if (set === "armies" && mover && mover.kind !== "n") sfx.steps(tl.hop, mover.color === "b");
    if (event.victimId) {
      sfx.hit(tl.dieAt);
      sfx.coins(tl.dieAt + 0.4);
    } else {
      sfx.land(tl.hop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  useEffect(() => setSelected(null), [history.length, movable]);
  const targets = useMemo(() => (selected ? legalTargets(selected) : []), [selected, legalTargets]);

  // Drag and drop: press on one of your pieces, carry it, let go on a highlighted square.
  // A press that never leaves its square is a tap, and tap-to-move carries on as before.
  const drag = useRef<Drag | null>(null);
  const ignoreClickUntil = useRef(0);
  const controls = useThree((st) => st.controls) as OrbitControlsImpl | null;
  const onDragStart = (square: Square) => {
    if (!movable || !pieces.some((p) => p.alive && p.square === square && p.color === movable)) return;
    const [x, z] = xz(square);
    drag.current = { square, at: new THREE.Vector3(x, 0, z), moved: false };
    if (selected !== square) sfx.select();
    setSelected(square);
    if (controls) controls.enabled = false; // the camera holds still while a piece is carried
  };
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ raycaster, pointer, camera }) => {
    const d = drag.current;
    if (!d) return;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(GROUND, hit)) return;
    d.at.copy(hit);
    if (squareAt(hit) !== d.square) d.moved = true;
  });
  useEffect(() => {
    const drop = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (controls) controls.enabled = !attract;
      if (!d.moved) return;
      ignoreClickUntil.current = now() + 0.35; // the browser's click after a drop must not re-select
      const to = squareAt(d.at);
      const target = to ? legalTargets(d.square).find((t) => t.to === to) : undefined;
      setSelected(null);
      if (!to || !target) return;
      if (target.promotion) askPromotion(d.square, to);
      else onMove(d.square, to);
    };
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
  }, [controls, attract, legalTargets, askPromotion, onMove]);

  const pick = (square: Square) => {
    if (!movable || now() < ignoreClickUntil.current) return;
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

  const coreHeight = (kind: PieceSymbol) => (set === "armies" ? gemY(kind) : ANATOMY[kind].coreY);
  const lastMove = history.length ? history[history.length - 1] : null;
  const victim = event?.victimId ? pieces.find((p) => p.id === event.victimId) : null;
  const capturer = event?.victimId ? pieces.find((p) => p.id === event.moverId) : null;
  const hitAt = event ? start + timeline(event).dieAt : 0;
  const sideToMove: Color = history.length % 2 === 0 ? "w" : "b";
  const checked = lastMove?.san.includes("+") ? sideToMove : null;
  const mated = lastMove?.san.includes("#") ? sideToMove : null;


  return (
    <>
      <CameraRig orientation={orientation} attract={attract} animation={animation.current} insets={insets} />
      {attract && <PointerGaze gaze={gaze} />}
      <color attach="background" args={[FIELD]} />
      <fog attach="fog" args={[FIELD, 14, 36]} />
      <hemisphereLight args={["#ece6ff", "#2a2440", 0.8]} />
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
      <directionalLight position={[-6, 4, -8]} intensity={1.2} color="#a493ff" />
      <Environment resolution={256} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#b0a4ff" position={[0, 2, 9]} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#b0a4ff" position={[0, 2, -9]} rotation-y={Math.PI} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffe6c4" position={[9, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>

      <Motes />
      <Multiverse />
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
          onPick={pick}
          figure={set === "armies"}
          celebrating={mated !== null && mated !== piece.color}
          drag={drag}
          onDragStart={onDragStart}
          rise={history.length === 0}
        />
      ))}
      {event && victim && capturer && event.victimSquare && (
        <>
          {set === "classic" && (
          <Shatter
            key={`x${event.ply}`}
            at={xz(event.victimSquare)}
            start={hitAt}
            color={victim.color}
            height={PIECE_HEIGHT[event.victimKind ?? "p"]}
          />
          )}
          <CoreFlight
            key={`c${event.ply}`}
            from={[xz(event.victimSquare)[0], coreHeight(event.victimKind ?? "p"), xz(event.victimSquare)[1]]}
            to={[xz(event.to)[0], coreHeight(capturer.kind), xz(event.to)[1]]}
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
  const set = props.set ?? "armies";
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  // Phones skip shadows and glow, and render at a lower resolution; any device drops further if it struggles.
  const [lite, setLite] = useState(() => typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 640);
  // Render close to the screen's real density so the characters stay crisp on phones (which are 3x);
  // the glow and shadows are what phones skip, not sharpness.
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1.5 : Math.min(window.devicePixelRatio || 1, lite ? 2.5 : 2)));

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
            // Struggling: drop the effects first, then sharpness a step at a time, never below 1.25x.
            setLite(true);
            setDpr((d) => Math.max(1.25, d - 0.5));
          }}
        />
        <Suspense
          fallback={
            <Html center>
              <div className="arena-loading">Setting the board...</div>
            </Html>
          }
        >
          <Scene {...props} set={set} askPromotion={(from, to) => setPromotion({ from, to })} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} enabled={!props.attract} minPolarAngle={0.2} maxPolarAngle={1.38} />
        {!lite && (
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
      {props.onSetChange && (
        <button
          className="ghost absolute right-3 z-10 text-sm"
          style={{ bottom: (props.insets?.bottom ?? 0) + 12 }}
          onClick={() => props.onSetChange?.(set === "armies" ? "classic" : "armies")}
          title="Switch between the armies and the classic chess set"
        >
          {set === "armies" ? "Classic set" : "Armies"}
        </button>
      )}
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
