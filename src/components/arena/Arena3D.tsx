import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, PerformanceMonitor, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { Color, Move, PieceSymbol, Square } from "chess.js";
import { trackPieces, type MoveEvent, type TrackedPiece } from "../../lib/pieces";

// ------------------------------------------------------------------ constants

const KIND: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
// The models are all 1.8 units tall; a board square is 1 unit.
const SCALE: Record<PieceSymbol, number> = { p: 0.5, n: 0.58, b: 0.6, r: 0.6, q: 0.66, k: 0.72 };
const SIDE_COLOR: Record<Color, string> = { w: "#00ff66", b: "#ff3355" };
const BANK: Record<Color, [number, number]> = { w: [5.1, 3.2], b: [-5.1, -3.2] };
const modelUrl = (color: Color, kind: PieceSymbol) => `/models/${color === "w" ? "bulls" : "bears"}-${KIND[kind]}.glb`;

const xz = (square: string): [number, number] => [square.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(square[1]) - 1)];
const now = () => performance.now() / 1000;

/** How long each phase of a move's animation lasts, in seconds. */
function timeline(event: MoveEvent) {
  const [fx, fz] = xz(event.from);
  const [tx, tz] = xz(event.to);
  const dist = Math.hypot(tx - fx, tz - fz);
  if (!event.victimId) return { dist, walk1: 0.3 + dist * 0.22, attack: 0, walk2: 0, dieAt: 0, total: 0.3 + dist * 0.22 };
  const walk1 = 0.25 + Math.max(dist - STOP_SHORT, 0) * 0.22;
  return { dist, walk1, attack: 0.9, walk2: 0.3, dieAt: walk1 + 0.4, total: walk1 + 0.9 + 0.3 };
}
const STOP_SHORT = 0.75; // an attacker stops this far from its victim to strike
const DEATH_SECONDS = 2.4;

// ------------------------------------------------------------------ pieces

interface Animation {
  event: MoveEvent | null;
  start: number;
}

function Piece({
  piece,
  animation,
  onPick,
}: {
  piece: TrackedPiece;
  animation: Animation;
  onPick: (square: Square) => void;
}) {
  const { scene, animations } = useGLTF(modelUrl(piece.color, piece.kind));
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // skinned bounds are stale while animating
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.metalness = Math.min(material.metalness, 0.15); // no environment map to reflect
      material.roughness = Math.max(material.roughness, 0.6);
    });
    return clone;
  }, [scene]);

  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const { actions } = useAnimations(animations, inner);
  const clip = useRef("");
  const home = piece.color === "w" ? Math.PI : 0; // Bulls face up the board, Bears face down it

  useEffect(() => {
    const idle = actions.idle;
    if (!idle) return;
    idle.reset().play();
    idle.time = Math.random() * idle.getClip().duration; // don't breathe in unison
    clip.current = "idle";
  }, [actions]);

  const play = (name: "idle" | "walk" | "attack" | "death") => {
    if (clip.current === name) return;
    const next = actions[name];
    if (!next) return;
    const once = name === "attack" || name === "death";
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.15).play();
    actions[clip.current]?.fadeOut(0.15);
    clip.current = name;
  };

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

  useFrame(() => {
    const group = outer.current;
    const body = inner.current;
    if (!group || !body) return;
    const [hx, hz] = xz(piece.square);
    let x = hx;
    let z = hz;
    let facing = home;
    let visible = piece.alive;
    let shrink = 1;
    let pose: "idle" | "walk" | "attack" | "death" = "idle";

    if (event && role) {
      const t = now() - start;
      const tl = timeline(event);
      if (role === "victim") {
        visible = t < tl.dieAt + DEATH_SECONDS;
        if (t >= tl.dieAt) pose = "death";
        shrink = 1 - THREE.MathUtils.clamp((t - tl.dieAt - DEATH_SECONDS + 0.5) / 0.5, 0, 1);
      } else {
        const [fx, fz] = xz(role === "rook" ? event.rook!.from : event.from);
        const dx = hx - fx;
        const dz = hz - fz;
        const length = Math.hypot(dx, dz) || 1;
        const walking = Math.atan2(dx, dz);
        if (role === "mover" && event.victimId) {
          const stop = Math.max(length - STOP_SHORT, 0) / length; // fraction of the way to the stop point
          if (t < tl.walk1) {
            const k = (t / tl.walk1) * stop;
            [x, z, facing, pose] = [fx + dx * k, fz + dz * k, walking, "walk"];
          } else if (t < tl.walk1 + tl.attack) {
            [x, z, facing, pose] = [fx + dx * stop, fz + dz * stop, walking, "attack"];
          } else if (t < tl.total) {
            const k = stop + ((t - tl.walk1 - tl.attack) / tl.walk2) * (1 - stop);
            [x, z, facing, pose] = [fx + dx * k, fz + dz * k, walking, "walk"];
          }
        } else if (t < tl.walk1) {
          const k = t / tl.walk1;
          [x, z, facing, pose] = [fx + dx * k, fz + dz * k, walking, "walk"];
        }
      }
    }

    group.visible = visible;
    group.position.set(x, 0, z);
    body.scale.setScalar(SCALE[piece.kind] * shrink);
    // Turn towards the target heading the short way round.
    const delta = Math.atan2(Math.sin(facing - body.rotation.y), Math.cos(facing - body.rotation.y));
    body.rotation.y += delta * 0.25;
    if (ring.current) ring.current.visible = pose !== "death";
    play(pose);
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
    >
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.012}>
        <ringGeometry args={[0.36, 0.44, 32]} />
        <meshBasicMaterial color={SIDE_COLOR[piece.color]} transparent opacity={0.85} />
      </mesh>
      <group ref={inner} rotation-y={home} scale={SCALE[piece.kind]}>
        <primitive object={model} />
      </group>
    </group>
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
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[8.5, 0.2, 8.5]} />
        <meshStandardMaterial color="#0c120e" emissive="#00ff66" emissiveIntensity={0.03} />
      </mesh>
      {squares.map(({ square, x, z, dark }) => {
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const color = selected === square ? "#ffe066" : isLast ? (dark ? "#4d8f69" : "#9fd9b4") : dark ? "#22352c" : "#aebfae";
        return (
          <mesh
            key={square}
            position={[x, -0.05, z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onPick(square);
            }}
          >
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        );
      })}
      {targets.map((square) => {
        const [x, z] = xz(square);
        return (
          <mesh key={square} position={[x, 0.02, z]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.17, 24]} />
            <meshBasicMaterial color="#ffe066" transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ money

/** Coins arc from a captured piece to the capturer's vault, with the amount floating above. */
function CoinBurst({ from, to, start, label }: { from: [number, number]; to: [number, number]; start: number; label?: string }) {
  const COUNT = 14;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [labelVisible, setLabelVisible] = useState(false);
  const seeds = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ delay: i * 0.045, lift: 1.6 + Math.random() * 1.4, side: (Math.random() - 0.5) * 1.2, spin: Math.random() * 6 })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const t = now() - start;
    if (t >= 0 && t < 2.2 !== labelVisible) setLabelVisible(t >= 0 && t < 2.2);
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
        <meshStandardMaterial color="#ffd23f" emissive="#ffb300" emissiveIntensity={0.9} metalness={0.4} roughness={0.3} />
      </instancedMesh>
      {label && labelVisible && (
        <Html position={[from[0], 1.5, from[1]]} center style={{ pointerEvents: "none" }}>
          <div className="arena-capture-label">{label}</div>
        </Html>
      )}
    </>
  );
}

function Vault({ color }: { color: Color }) {
  const [x, z] = BANK[color];
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.25}>
        <boxGeometry args={[0.8, 0.5, 0.8]} />
        <meshStandardMaterial color="#161c18" emissive={SIDE_COLOR[color]} emissiveIntensity={0.35} />
      </mesh>
      <mesh position-y={0.51} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.2, 0.36, 32]} />
        <meshBasicMaterial color={SIDE_COLOR[color]} />
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
      const radius = 11.5 + random() * 4;
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
  const colors = useMemo(() => {
    const up = new THREE.Color("#00c853");
    const down = new THREE.Color("#e53950");
    return candles.map((c) => (c.up ? up : down));
  }, [candles]);

  useEffect(() => {
    colors.forEach((color, i) => {
      bodies.current?.setColorAt(i, color);
      wicks.current?.setColorAt(i, color);
    });
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    if (wicks.current?.instanceColor) wicks.current.instanceColor.needsUpdate = true;
  }, [colors]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    candles.forEach((c, i) => {
      const pulse = 1 + Math.sin(t * 0.8 + c.phase) * 0.08;
      const height = c.height * pulse;
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(c.x, c.low + height / 2, c.z);
      dummy.scale.set(0.8, height, 0.8);
      dummy.updateMatrix();
      bodies.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(c.x, c.low + height / 2, c.z);
      dummy.scale.set(0.09, height + c.wick, 0.09);
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
}

function Scene({ history, movable, legalTargets, onMove, captureLabel, askPromotion }: ArenaProps & { askPromotion: (from: Square, to: Square) => void }) {
  const { pieces, last } = useMemo(() => trackPieces(history), [history]);

  // Animate only when exactly one new move arrives; anything else (first load, undo) snaps.
  const seen = useRef(history.length);
  const animation = useRef<Animation>({ event: null, start: 0 });
  if (history.length !== seen.current) {
    animation.current = history.length === seen.current + 1 && last ? { event: last, start: now() } : { event: null, start: 0 };
    seen.current = history.length;
  }
  const { event, start } = animation.current;

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
    setSelected(own ? square : null);
  };

  const lastMove = history.length ? history[history.length - 1] : null;
  const victim = event?.victimId ? pieces.find((p) => p.id === event.victimId) : null;
  const capturer: Color | null = victim ? (victim.color === "w" ? "b" : "w") : null;

  return (
    <>
      <color attach="background" args={["#070a08"]} />
      <fog attach="fog" args={["#070a08", 22, 52]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 10, 6]} intensity={2.2} />
      <directionalLight position={[-6, 6, -8]} intensity={0.7} color="#9fd8ff" />

      <mesh rotation-x={-Math.PI / 2} position-y={-0.27}>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#0a0f0c" roughness={1} />
      </mesh>
      <Skyline />
      <Vault color="w" />
      <Vault color="b" />

      <Board selected={selected} targets={targets.map((t) => t.to)} lastMove={lastMove} onPick={pick} />
      {pieces.map((piece) => (
        <Piece key={`${piece.id}-${piece.kind}`} piece={piece} animation={animation.current} onPick={pick} />
      ))}
      {event && victim && capturer && event.victimSquare && (
        <CoinBurst
          key={event.ply}
          from={xz(event.victimSquare)}
          to={BANK[capturer]}
          start={start + timeline(event).dieAt + 0.25}
          label={event.victimKind && captureLabel ? captureLabel(event.victimKind) : undefined}
        />
      )}
    </>
  );
}

export default function Arena3D(props: ArenaProps) {
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  // Phones get a closer, steeper view: bigger characters and less overlap between ranks when tapping.
  const [compact] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const sign = props.orientation === "w" ? 1 : -1;
  const camera: [number, number, number] = compact ? [0, 11.2, 8.4 * sign] : [0, 7, 13.2 * sign];
  // Drop the render resolution if the device can't hold a smooth frame rate.
  const [dpr, setDpr] = useState(compact ? 1.5 : 1.75);

  return (
    <div className="relative w-full aspect-square overflow-hidden rounded-lg border-4 border-retroGreen">
      <Canvas key={props.orientation} camera={{ position: camera, fov: 42 }} dpr={dpr}>
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <Suspense
          fallback={
            <Html center>
              <div className="arena-loading">Mustering the armies...</div>
            </Html>
          }
        >
          <Scene {...props} askPromotion={(from, to) => setPromotion({ from, to })} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={7}
          maxDistance={20}
          minPolarAngle={0.25}
          maxPolarAngle={1.35}
          target={[0, 0.3, 0]}
        />
      </Canvas>
      {promotion && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="retro-panel flex flex-col items-center gap-3">
            <span>Promote to</span>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as const).map((kind) => (
                <button
                  key={kind}
                  className="retro-button-sm capitalize"
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

for (const color of ["w", "b"] as const) {
  for (const kind of Object.keys(KIND) as PieceSymbol[]) useGLTF.preload(modelUrl(color, kind));
}
