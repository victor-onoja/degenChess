import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { Color, PieceSymbol } from "chess.js";
import { STANDARD_PIECES } from "../../lib/standardPieces";
import type { PieceParts } from "./pieces3d";

// The armies: chess played by little rigged characters, Heroes (White) against the Undead (Black),
// from Kay Lousberg's CC0 KayKit packs (Adventurers 2.0, Skeletons 1.1, Character Animations 1.1),
// built by tools/armies/build.mjs. Each piece type is its own character, carries its share of the
// stake as a gold gem over its head, and stands on a disc showing which chess piece it is. Characters
// use one of two skeletons (medium, or large for the rooks), with one animation file each.

/** What the board asks a character to do; each character plays it its own way (see CLIPS). */
export type Action = "Idle" | "Walking_A" | "Running_A" | "Block" | "BlockHit" | "Hit_A" | "Death_A" | "Cheer" | "Attack" | "Taunt";
type Size = "medium" | "large";
const ARMY: Record<Color, string> = { w: "heroes", b: "undead" };
const KINDS: PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];
/** How many looks each piece type has: the Heroes' pawns are a rogue, a ranger or an engineer. */
const VARIANTS: Record<Color, Partial<Record<PieceSymbol, number>>> = { w: { p: 3 }, b: { p: 2 } };
const sizeOf = (kind: PieceSymbol): Size => (kind === "r" ? "large" : "medium");
const rigUrl = (size: Size) => `/armies/rig-${size}.glb`;
const url = (color: Color, kind: PieceSymbol, variant = 0) => `/armies/${ARMY[color]}-${kind}${variant ? variant + 1 : ""}.glb`;

/** Each character strikes in its own way: daggers stab, bows loose, staffs cast, the scythe spins. */
const ATTACK: Record<Color, Record<PieceSymbol, string[]>> = {
  w: {
    p: ["Melee_1H_Attack_Stab", "Ranged_Bow_Release", "Melee_1H_Attack_Chop"],
    n: ["Melee_1H_Attack_Slice_Diagonal"],
    b: ["Ranged_Magic_Shoot"],
    r: ["Melee_2H_Attack"],
    q: ["Ranged_Magic_Summon"],
    k: ["Melee_2H_Attack_Slice"],
  },
  b: {
    p: ["Melee_1H_Attack_Chop"],
    n: ["Melee_1H_Attack_Slice_Diagonal"],
    b: ["Ranged_Magic_Shoot"],
    r: ["Melee_2H_Slam"],
    q: ["Melee_2H_Attack_Spin"],
    k: ["Ranged_Magic_Summon"],
  },
};
/** The clip behind each action, by army and skeleton. */
function clipFor(action: Action, color: Color, kind: PieceSymbol, variant: number): string {
  const large = sizeOf(kind) === "large";
  const undead = color === "b" && !large;
  switch (action) {
    case "Idle":
      return undead ? "Skeletons_Idle" : "Idle_A";
    case "Walking_A":
      return undead ? "Skeletons_Walking" : "Walking_A";
    case "Attack": {
      const options = ATTACK[color][kind];
      return options[variant % options.length];
    }
    case "Taunt":
      return undead ? "Skeletons_Taunt" : large ? "Idle_B" : "Jump_Full_Short";
    case "Cheer":
      return large ? "Idle_B" : "Jump_Full_Short";
    case "Block":
      return "Melee_Block";
    case "BlockHit":
      return "Melee_Block_Hit";
    default:
      return action;
  }
}
const LOOPED = ["Idle_A", "Idle_B", "Skeletons_Idle", "Walking_A", "Skeletons_Walking", "Running_A"];

/** How tall each character stands, in board squares: rank reads as size, and rooks are the big ones. */
const HEIGHT: Record<PieceSymbol, number> = { p: 0.82, n: 1.0, b: 1.08, r: 1.2, q: 1.14, k: 1.24 };
const GEM_RADIUS: Record<PieceSymbol, number> = { p: 0.05, n: 0.07, b: 0.07, r: 0.08, q: 0.095, k: 0.05 };
/** Height of a character's gem, where a captured stake leaves from and arrives. */
export const gemY = (kind: PieceSymbol) => HEIGHT[kind] + 0.16;

const GEM = new THREE.OctahedronGeometry(1, 0);
const GOLD = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc233").multiplyScalar(2.4), toneMapped: false });
const PALE = new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe4ff").multiplyScalar(1.6), toneMapped: false });

export interface FigureParts extends PieceParts {
  /** Switch to an animation; repeated calls with the same name do nothing. */
  act: (action: Action) => void;
}

export const Figure = forwardRef<FigureParts, { color: Color; kind: PieceSymbol; rise?: boolean; variant?: number }>(function Figure(
  { color, kind, rise = false, variant: seed = 0 },
  ref
) {
  const variant = seed % (VARIANTS[color][kind] ?? 1);
  const { scene } = useGLTF(url(color, kind, variant));
  const { animations } = useGLTF(rigUrl(sizeOf(kind)));
  /** A one-off (rising from the ground) that the board's per-frame requests must not cut short. */
  const lockedUntil = useRef(0);
  const root = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Mesh>(null);
  const current = useRef<string | null>(null);

  // Every piece needs its own skeleton, so clone the scene with its bones. Height is measured on the
  // body alone: a raised staff or axe shouldn't make its bearer smaller.
  const { model, scale } = useMemo(() => {
    const model = SkeletonUtils.clone(scene) as THREE.Group;
    const body = new THREE.Box3();
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds are the bind pose; don't let a raised arm vanish
      }
    });
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) body.expandByObject(o);
    });
    const height = (body.isEmpty() ? new THREE.Box3().setFromObject(scene) : body).getSize(new THREE.Vector3()).y || 1;
    return { model, scale: HEIGHT[kind] / height };
  }, [scene, kind]);

  const { actions } = useAnimations(animations, root);
  const play = (clip: string) => {
    if (current.current === clip) return;
    const next = actions[clip];
    if (!next) return;
    const previous = current.current ? actions[current.current] : null;
    next.reset();
    next.setLoop(LOOPED.includes(clip) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.fadeIn(0.18).play();
    previous?.fadeOut(0.18);
    current.current = clip;
  };
  const act = (action: Action) => {
    if (performance.now() < lockedUntil.current && action !== "Death_A") return;
    play(clipFor(action, color, kind, variant));
  };
  useEffect(() => {
    // A new game: the Undead claw their way up out of the board; everyone else is already standing.
    const awaken = actions.Skeletons_Awaken_Floor;
    if (rise && color === "b" && awaken) {
      play("Skeletons_Awaken_Floor");
      awaken.time = Math.random() * 0.3;
      lockedUntil.current = performance.now() + awaken.getClip().duration * 1000 - 150;
      return;
    }
    const clip = clipFor("Idle", color, kind, variant);
    const idle = actions[clip];
    if (!idle) return;
    idle.play();
    idle.time = Math.random() * idle.getClip().duration; // eight pawns should not breathe in step
    current.current = clip;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  useImperativeHandle(ref, () => ({ core: gem.current, coreRadius: GEM_RADIUS[kind], act }));

  useFrame((_, delta) => {
    if (gem.current) gem.current.rotation.y += delta * 1.4;
  });

  return (
    <group>
      <group ref={root} scale={scale}>
        <primitive object={model} />
      </group>
      <mesh ref={gem} geometry={GEM} material={kind === "k" ? PALE : GOLD} position-y={gemY(kind)} scale={GEM_RADIUS[kind]} />
    </group>
  );
});

// ------------------------------------------------------------------ which piece is which

const glyphs = new Map<string, THREE.Texture>();
/** The flat chess piece on a disc of its side's tone, drawn once per piece type and side. */
function glyph(color: Color, kind: PieceSymbol) {
  const key = color + kind;
  const cached = glyphs.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const g = canvas.getContext("2d")!;
  g.fillStyle = color === "w" ? "rgba(10, 10, 20, 0.82)" : "rgba(241, 233, 214, 0.88)";
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${STANDARD_PIECES[color + kind.toUpperCase()]}</svg>`;
  const image = new Image();
  image.onload = () => {
    g.drawImage(image, 22, 20, 84, 84);
    texture.needsUpdate = true;
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  glyphs.set(key, texture);
  return texture;
}

const DISC = new THREE.CircleGeometry(0.3, 40);

/** A disc under a character showing its chess piece, turned so it always reads upright to the viewer. */
export function GlyphDisc({ color, kind }: { color: Color; kind: PieceSymbol }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: glyph(color, kind), transparent: true, depthWrite: false, toneMapped: false }),
    [color, kind]
  );
  const here = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(here);
    g.rotation.y = Math.atan2(camera.position.x - here.x, camera.position.z - here.z);
  });
  return (
    <group ref={group} position-y={0.014}>
      <mesh geometry={DISC} material={material} rotation-x={-Math.PI / 2} />
    </group>
  );
}

export function preloadArmies() {
  useGLTF.preload(rigUrl("medium"));
  useGLTF.preload(rigUrl("large"));
  for (const color of ["w", "b"] as Color[]) {
    for (const kind of KINDS) for (let v = 0; v < (VARIANTS[color][kind] ?? 1); v++) useGLTF.preload(url(color, kind, v));
  }
}
