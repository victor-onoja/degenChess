import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Color, Move, PieceSymbol, Square } from "chess.js";
import { trackPieces, type MoveEvent, type TrackedPiece } from "../../lib/pieces";
import { sfx } from "../../lib/sound";
import { ChessPiece, PIECE_HEIGHT } from "./pieces3d";

// ------------------------------------------------------------------ constants

const KIND: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const SIDE_COLOR: Record<Color, string> = { w: "#00ff66", b: "#ff3355" };
// Colours brighter than 1.0 are what the bloom pass picks up as glow.
const SIDE_GLOW: Record<Color, THREE.Color> = {
  w: new THREE.Color("#00ff66").multiplyScalar(1.2),
  b: new THREE.Color("#ff3355").multiplyScalar(1.3),
};
const CHECK_GLOW = new THREE.Color("#ffd23f").multiplyScalar(2.2);
const BODY_COLOR: Record<Color, string> = { w: "#f1e3c0", b: "#2a2f3a" };
const BANK: Record<Color, [number, number]> = { w: [5.1, 3.2], b: [-5.1, -3.2] };

const xz = (square: string): [number, number] => [square.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(square[1]) - 1)];
const now = () => performance.now() / 1000;
const FOV = 42;

/**
 * Timing of a move's animation, in seconds. A piece hops to its square; a capture is the same hop,
 * higher, landing on the victim, which shatters on impact. Short on purpose: it has to keep up with blitz.
 */
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

// ------------------------------------------------------------------ pieces

function Piece({
  piece,
  animation,
  selectable,
  selected,
  inCheck,
  toppled,
  onPick,
}: {
  piece: TrackedPiece;
  animation: Animation;
  selectable: boolean;
  selected: boolean;
  /** This king is in check: its ring flashes. */
  inCheck: boolean;
  /** This king has been mated: it falls over. */
  toppled: boolean;
  onPick: (square: Square) => void;
}) {
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lift = useRef(0);
  const fall = useRef(0);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: SIDE_GLOW[piece.color], transparent: true, opacity: 0.7, toneMapped: false }),
    [piece.color]
  );
  const home = piece.color === "w" ? Math.PI : 0; // only the knights have a front: they face the enemy

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

  useFrame(({ clock }) => {
    const group = outer.current;
    const mesh = body.current;
    if (!group || !mesh) return;
    const [hx, hz] = xz(piece.square);
    let x = hx;
    let z = hz;
    let y = 0;
    let stretch = 1;
    let lean = 0;
    let heading = 0;
    let visible = piece.alive;
    let settled = true;

    if (event && role) {
      const t = now() - start;
      const tl = timeline(event);
      if (role === "victim") {
        visible = t < tl.dieAt; // gone on impact; the Shatter effect takes over
      } else {
        const [fx, fz] = xz(role === "rook" ? event.rook!.from : event.from);
        const dx = hx - fx;
        const dz = hz - fz;
        if (t < tl.hop) {
          settled = false;
          const k = t / tl.hop;
          const ease = k * k * (3 - 2 * k);
          const arc = Math.sin(Math.PI * k);
          const height = (piece.kind === "n" ? 1.25 : 0.55) + (role === "mover" && event.victimId ? 0.45 : 0);
          x = fx + dx * ease;
          z = fz + dz * ease;
          y = arc * height;
          stretch = 1 + arc * 0.16; // stretch in flight
          lean = Math.cos(Math.PI * k) * 0.22; // tip forward on the way up, back on the way down
          heading = Math.atan2(dx, dz);
        } else if (t < tl.total) {
          // squash on landing, then spring back
          const since = t - tl.hop;
          stretch = 1 - 0.24 * Math.exp(-since * 13) * Math.cos(since * 34);
        }
      }
    }

    lift.current += ((selected && settled ? 0.16 : 0) - lift.current) * 0.25;
    fall.current += ((toppled ? 1 : 0) - fall.current) * 0.06;

    group.visible = visible;
    group.position.set(x, 0, z);
    mesh.position.y = y + lift.current;
    mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch)); // keep volume
    // Lean along the direction of travel; a mated king tips over sideways.
    mesh.rotation.set(Math.cos(heading) * lean, home, -Math.sin(heading) * lean + fall.current * 1.45, "YXZ");

    if (ring.current) {
      ring.current.visible = visible && fall.current < 0.5;
      const pulse = inCheck ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 9) : 0;
      ringMaterial.color.copy(inCheck ? CHECK_GLOW : SIDE_GLOW[piece.color]);
      ringMaterial.opacity = inCheck ? 0.5 + pulse * 0.5 : selected ? 1 : 0.7;
      ring.current.scale.setScalar(inCheck ? 1.05 + pulse * 0.12 : 1);
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
      onPointerOver={() => selectable && (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.012} material={ringMaterial}>
        <ringGeometry args={[0.4, 0.46, 40]} />
      </mesh>
      <group ref={body} rotation-y={home}>
        <ChessPiece kind={piece.kind} color={piece.color} />
      </group>
    </group>
  );
}

/** The captured piece bursts into shards where it stood. */
function Shatter({ at, start, color, height }: { at: [number, number]; start: number; color: Color; height: number }) {
  const COUNT = 26;
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
          size: 0.07 + Math.random() * 0.1,
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
      <meshStandardMaterial color={BODY_COLOR[color]} metalness={0.4} roughness={0.4} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ board

function Board({
  selected,
  targets,
  lastMove,
  onPick,
}: {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  onPick: (square: Square) => void;
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
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[8.7, 0.2, 8.7]} />
        <meshStandardMaterial color="#0b100d" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Each army's baseline glows in its colour. */}
      {(["w", "b"] as const).map((color) => (
        <mesh key={color} position={[0, -0.05, color === "w" ? 4.3 : -4.3]}>
          <boxGeometry args={[8.7, 0.06, 0.08]} />
          <meshBasicMaterial color={SIDE_GLOW[color]} toneMapped={false} />
        </mesh>
      ))}
      {squares.map(({ square, x, z, dark }) => {
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const isTarget = targets.includes(square);
        const color =
          selected === square
            ? "#ffe066"
            : hovered === square && isTarget
              ? "#ffe9a0"
              : isLast
                ? dark
                  ? "#4d8f69"
                  : "#9fd9b4"
                : dark
                  ? "#1c2b25"
                  : "#8fa596";
        return (
          <mesh
            key={square}
            position={[x, -0.05, z]}
            receiveShadow
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onPick(square);
            }}
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
            <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} envMapIntensity={0.5} />
          </mesh>
        );
      })}
      {targets.map((square) => {
        const [x, z] = xz(square);
        return (
          <mesh key={square} position={[x, 0.02, z]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.17, 24]} />
            <meshBasicMaterial color={[2.2, 1.9, 0.6]} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ capture effects

/** Coins arc from a captured piece to the capturer's vault, with the amount floating above. */
function CoinBurst({ from, to, start, label }: { from: [number, number]; to: [number, number]; start: number; label?: string }) {
  const COUNT = 16;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [labelVisible, setLabelVisible] = useState(false);
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        delay: i * 0.045,
        lift: 1.6 + Math.random() * 1.4,
        side: (Math.random() - 0.5) * 1.2,
        spin: Math.random() * 6,
      })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const t = now() - start;
    const show = t >= 0 && t < 2.2;
    if (show !== labelVisible) setLabelVisible(show);
    if (!mesh.current) return;
    seeds.forEach((s, i) => {
      const k = THREE.MathUtils.clamp((t - s.delay) / 1.1, 0, 1);
      const ease = k * k * (3 - 2 * k);
      dummy.position.set(
        from[0] + (to[0] - from[0]) * ease + s.side * Math.sin(Math.PI * k),
        0.4 + Math.sin(Math.PI * k) * s.lift,
        from[1] + (to[1] - from[1]) * ease
      );
      dummy.rotation.set(s.spin + t * 9, t * 7, 0);
      dummy.scale.setScalar(k <= 0 || k >= 1 ? 0 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 20]} />
        <meshStandardMaterial
          color="#ffd23f"
          emissive="#ffb300"
          emissiveIntensity={2.2}
          metalness={0.4}
          roughness={0.3}
          toneMapped={false}
        />
      </instancedMesh>
      {label && labelVisible && (
        <Html position={[from[0], 1.7, from[1]]} center style={{ pointerEvents: "none" }}>
          <div className="arena-capture-label">{label}</div>
        </Html>
      )}
    </>
  );
}

/** A flash of sparks where the strike lands. */
function Sparks({ at, start }: { at: [number, number]; start: number }) {
  const COUNT = 22;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        return { vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 1.5 + Math.random() * 3.5 };
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!mesh.current) return;
    const t = now() - start;
    const alive = t >= 0 && t < 0.55;
    seeds.forEach((s, i) => {
      dummy.position.set(at[0] + s.vx * t, 0.7 + s.vy * t - 6 * t * t, at[1] + s.vz * t);
      dummy.scale.setScalar(alive ? 1 - t / 0.55 : 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.07, 0.07, 0.07]} />
      <meshBasicMaterial color={[3, 2.4, 1]} toneMapped={false} />
    </instancedMesh>
  );
}

function Vault({ color }: { color: Color }) {
  const [x, z] = BANK[color];
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.25} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.8]} />
        <meshStandardMaterial color="#161c18" emissive={SIDE_COLOR[color]} emissiveIntensity={0.35} />
      </mesh>
      <mesh position-y={0.51} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.2, 0.36, 32]} />
        <meshBasicMaterial color={SIDE_GLOW[color]} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ scenery

/** A ring of candlesticks around the arena: the market the two armies are fighting over. */
function Skyline() {
  const COUNT = 84;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const wicks = useRef<THREE.InstancedMesh>(null);
  const candles = useMemo(() => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let price = 3;
    return Array.from({ length: COUNT }, (_, i) => {
      const open = price;
      price = THREE.MathUtils.clamp(price + (random() - 0.48) * 1.6, 1, 7);
      const angle = (i / COUNT) * Math.PI * 2;
      const radius = 16 + random() * 6;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        low: (Math.min(open, price) - 1) * 0.45,
        height: Math.max(Math.abs(price - open), 0.25) * 1.5,
        wick: 0.6 + random() * 1.2,
        up: price >= open,
        phase: random() * Math.PI * 2,
      };
    });
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const up = new THREE.Color("#00c853").multiplyScalar(1.5);
    const down = new THREE.Color("#e53950").multiplyScalar(1.5);
    candles.forEach((c, i) => {
      bodies.current?.setColorAt(i, c.up ? up : down);
      wicks.current?.setColorAt(i, c.up ? up : down);
    });
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    if (wicks.current?.instanceColor) wicks.current.instanceColor.needsUpdate = true;
  }, [candles]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    candles.forEach((c, i) => {
      const pulse = 1 + Math.sin(t * 0.8 + c.phase) * 0.08;
      const height = c.height * pulse;
      dummy.position.set(c.x, c.low + (height * 1.3) / 2, c.z);
      dummy.scale.set(1.1, height * 1.3, 1.1);
      dummy.updateMatrix();
      bodies.current?.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(0.12, height * 1.3 + c.wick, 0.12);
      dummy.updateMatrix();
      wicks.current?.setMatrixAt(i, dummy.matrix);
    });
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (wicks.current) wicks.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={wicks} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Dark floor with faint concentric rings, so the board reads as the centre of an arena. */
function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.27} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#0a0f0c" roughness={1} metalness={0} envMapIntensity={0.15} />
      </mesh>
      {[6.6, 8.4, 10.2].map((r) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position-y={-0.262}>
          <ringGeometry args={[r, r + 0.035, 96]} />
          <meshBasicMaterial color="#1f7a48" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ camera

/**
 * Keeps the whole board in frame for any canvas shape, leans in on captures, shakes on the hit,
 * and slowly circles in attract mode.
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
  const { camera, size } = useThree();
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
      // Radians above the board. The circling backdrop uses one cinematic angle for every screen.
      const elevation = attract ? 0.55 : portrait ? 0.98 : aspect > 1.5 ? 0.6 : 0.5;
      const vHalf = THREE.MathUtils.degToRad(FOV / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      const near = 4.25 * Math.cos(elevation); // the closest rank is this much nearer than the centre
      // While circling, the board's diagonal has to fit, not just its width (phones let the corners clip to keep it big).
      const fitWidth = (attract ? (portrait ? 4.6 : 6.3) : 4.7) / Math.tan(hHalf) + near;
      // HUD overlays eat into the canvas; fit the board into what's left and centre it there.
      const top = insets?.top ?? 0;
      const bottom = insets?.bottom ?? 0;
      const usable = Math.max((size.height - top - bottom) / size.height, 0.4);
      const fitHeight = (4.25 * Math.sin(elevation) + 1.5) / (Math.tan(vHalf) * usable) + near * 0.5;
      const distance = Math.max(fitWidth, fitHeight);
      const sign = orientation === "w" ? 1 : -1;
      cam.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance * sign);
      controls.target.set(0, 0.3, 0);
      controls.minDistance = distance * 0.5;
      controls.maxDistance = distance * 1.5;
      // As a backdrop, slide the whole picture up so the board sits above the headline.
      const shiftUp = attract ? size.height * (portrait ? 0.22 : 0.27) : (bottom - top) / 2;
      if (shiftUp !== 0) cam.setViewOffset(size.width, size.height, 0, shiftUp, size.width, size.height);
      else cam.clearViewOffset();
    }

    // Lean towards the action during a capture, then ease back.
    const { event, start } = animation;
    let focus: [number, number] = [0, 0];
    let fov = FOV;
    if (event?.victimSquare) {
      const t = now() - start;
      const tl = timeline(event);
      if (t < tl.total + 0.8) {
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
    controls.autoRotateSpeed = 0.55;
    // Disabled controls (attract mode) aren't updated by drei, so aim and rotate the camera here.
    if (attract) controls.update();
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
  /** Text shown above a captured piece, e.g. "+0.23 tUSD". */
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

  useEffect(() => {
    if (!event || attract) return;
    const tl = timeline(event);
    if (event.victimId) {
      sfx.hit(tl.dieAt);
      sfx.coins(tl.dieAt + 0.25);
    } else {
      sfx.land(tl.hop);
    }
  }, [event, attract]);

  const [selected, setSelected] = useState<Square | null>(null);
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

  const lastMove = history.length ? history[history.length - 1] : null;
  const victim = event?.victimId ? pieces.find((p) => p.id === event.victimId) : null;
  const capturer: Color | null = victim ? (victim.color === "w" ? "b" : "w") : null;
  const hitAt = event ? start + timeline(event).dieAt : 0;
  // The last move's notation says whether the side now to move is in check ("+") or mated ("#").
  const sideToMove: Color = history.length % 2 === 0 ? "w" : "b";
  const checked = lastMove?.san.includes("+") ? sideToMove : null;
  const mated = lastMove?.san.includes("#") ? sideToMove : null;

  return (
    <>
      <CameraRig orientation={orientation} attract={attract} animation={animation.current} insets={insets} />
      <color attach="background" args={["#060908"]} />
      <fog attach="fog" args={["#060908", 26, 70]} />
      <hemisphereLight args={["#cfe8ff", "#0a1a10", 0.3]} />
      {/* A small studio built from light panels: gives the polished pieces something to reflect. */}
      <Environment resolution={256} environmentIntensity={0.42}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#00ff88" position={[0, 2, 9]} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ff4466" position={[0, 2, -9]} rotation-y={Math.PI} scale={[14, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[9, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-9, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>
      <directionalLight
        position={[5, 12, 6]}
        intensity={1.7}
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
      {/* Each army is rim-lit from behind in its own colour. */}
      <pointLight position={[0, 3.5, 7.5]} color="#00ff66" intensity={40} distance={14} />
      <pointLight position={[0, 3.5, -7.5]} color="#ff3355" intensity={40} distance={14} />

      <Floor />
      <Skyline />
      <Vault color="w" />
      <Vault color="b" />

      <Board selected={selected} targets={targets.map((t) => t.to)} lastMove={lastMove} onPick={pick} />
      {pieces.map((piece) => (
        <Piece
          key={`${piece.id}-${piece.kind}`}
          piece={piece}
          animation={animation.current}
          selectable={movable === piece.color}
          selected={selected === piece.square && piece.alive}
          inCheck={piece.kind === "k" && (checked === piece.color || mated === piece.color)}
          toppled={piece.kind === "k" && mated === piece.color}
          onPick={pick}
        />
      ))}
      {event && victim && capturer && event.victimSquare && (
        <>
          <Sparks key={`s${event.ply}`} at={xz(event.victimSquare)} start={hitAt} />
          <Shatter
            key={`x${event.ply}`}
            at={xz(event.victimSquare)}
            start={hitAt}
            color={victim.color}
            height={PIECE_HEIGHT[event.victimKind ?? "p"]}
          />
          <CoinBurst
            key={`c${event.ply}`}
            from={xz(event.victimSquare)}
            to={BANK[capturer]}
            start={hitAt + 0.1}
            label={event.victimKind && captureLabel ? captureLabel(event.victimKind) : undefined}
          />
        </>
      )}
    </>
  );
}

export default function Arena3D(props: ArenaProps) {
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  // Phones skip shadows and glow, and render at a lower resolution; any device drops further if it struggles.
  const [lite, setLite] = useState(
    () => typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 640
  );
  const [dpr, setDpr] = useState(lite ? 1.5 : 1.75);

  return (
    <div
      className={
        props.immersive
          ? "absolute inset-0"
          : props.fill
            ? "relative h-full w-full overflow-hidden rounded-xl border border-white/10"
          : "relative w-full aspect-square overflow-hidden rounded-xl border border-retroGreen/40"
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
            <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
      {promotion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
          <div className="glass flex flex-col items-center gap-3 p-5">
            <span>Promote to</span>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as const).map((kind) => (
                <button
                  key={kind}
                  className="btn capitalize"
                  onClick={() => {
                    props.onMove(promotion.from, promotion.to, kind);
                    setPromotion(null);
                  }}
                >
                  {KIND[kind]}
                </button>
              ))}
            </div>
            <button className="underline opacity-80" onClick={() => setPromotion(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
