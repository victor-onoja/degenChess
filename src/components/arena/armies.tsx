import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { Color, PieceSymbol } from "chess.js";
import { STANDARD_PIECES } from "../../lib/standardPieces";
import type { PieceParts } from "./pieces3d";

// The armies: chess played by little rigged characters, Heroes (White) against the Undead (Black),
// from Kay Lousberg's CC0 KayKit packs, built by tools/armies/build.mjs. Each carries its share of the
// stake as a gold gem over its head, and stands on a disc showing which chess piece it is. All the
// characters share one rig, so one animation file drives both armies.

export type Action = "Idle" | "Walking_A" | "1H_Melee_Attack_Chop" | "Hit_A" | "Death_A" | "Cheer";
const ARMY: Record<Color, string> = { w: "heroes", b: "undead" };
const RIG_URL = "/armies/rig.glb";
const url = (color: Color, kind: PieceSymbol) => `/armies/${ARMY[color]}-${kind}.glb`;
const KINDS: PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];

/** How tall each character stands, in board squares: rank reads as size. */
const HEIGHT: Record<PieceSymbol, number> = { p: 0.82, n: 1.0, b: 1.08, r: 1.04, q: 1.14, k: 1.24 };
const GEM_RADIUS: Record<PieceSymbol, number> = { p: 0.05, n: 0.07, b: 0.07, r: 0.08, q: 0.095, k: 0.05 };
/** Height of a character's gem, where a captured stake leaves from and arrives. */
export const gemY = (kind: PieceSymbol) => HEIGHT[kind] + 0.16;

const GEM = new THREE.OctahedronGeometry(1, 0);
const GOLD = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc233").multiplyScalar(2.4), toneMapped: false });
const PALE = new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe4ff").multiplyScalar(1.6), toneMapped: false });
const ONCE: Action[] = ["1H_Melee_Attack_Chop", "Hit_A", "Death_A"];

export interface FigureParts extends PieceParts {
  /** Switch to an animation; repeated calls with the same name do nothing. */
  act: (action: Action) => void;
}

export const Figure = forwardRef<FigureParts, { color: Color; kind: PieceSymbol }>(function Figure({ color, kind }, ref) {
  const { scene } = useGLTF(url(color, kind));
  const { animations } = useGLTF(RIG_URL);
  const root = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Mesh>(null);
  const current = useRef<Action | null>(null);

  // Every piece needs its own skeleton, so clone the scene with its bones.
  const { model, scale } = useMemo(() => {
    const model = SkeletonUtils.clone(scene) as THREE.Group;
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds are the bind pose; don't let a raised arm vanish
      }
    });
    const height = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y || 1;
    return { model, scale: HEIGHT[kind] / height };
  }, [scene, kind]);

  const { actions } = useAnimations(animations, root);
  const act = (action: Action) => {
    if (current.current === action) return;
    const next = actions[action];
    if (!next) return;
    const previous = current.current ? actions[current.current] : null;
    next.reset();
    next.setLoop(ONCE.includes(action) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.fadeIn(0.18).play();
    previous?.fadeOut(0.18);
    current.current = action;
  };
  useEffect(() => {
    const idle = actions.Idle;
    if (!idle) return;
    idle.play();
    idle.time = Math.random() * idle.getClip().duration; // eight pawns should not breathe in step
    current.current = "Idle";
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

useGLTF.preload(RIG_URL);
export function preloadArmies() {
  for (const color of ["w", "b"] as Color[]) for (const kind of KINDS) useGLTF.preload(url(color, kind));
}
