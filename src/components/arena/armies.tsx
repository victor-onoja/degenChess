import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import type { PieceSymbol } from "chess.js";
import type { PieceParts } from "./pieces3d";

// Character armies: chess played by little rigged characters (Kay Lousberg's CC0 KayKit packs,
// built by tools/armies/build.mjs). Each piece is a character carrying its share of the stake as a
// gold gem floating over its head. All characters share one rig, so one animation file drives them.

export type Army = "heroes";
export const ARMIES: Army[] = ["heroes"];
export type Action = "Idle" | "Walking_A" | "1H_Melee_Attack_Chop" | "Hit_A" | "Death_A" | "Cheer";

const RIG_URL = "/armies/rig.glb";
const url = (army: Army, kind: PieceSymbol) => `/armies/${army}-${kind}.glb`;

/** How tall each character stands, in board squares: rank reads as size. */
const HEIGHT: Record<PieceSymbol, number> = { p: 0.82, n: 1.0, b: 1.08, r: 1.04, q: 1.14, k: 1.24 };
const GEM_RADIUS: Record<PieceSymbol, number> = { p: 0.05, n: 0.07, b: 0.07, r: 0.08, q: 0.095, k: 0.05 };

const GEM = new THREE.OctahedronGeometry(1, 0);
const GOLD = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc233").multiplyScalar(2.4), toneMapped: false });
const PALE = new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe4ff").multiplyScalar(1.6), toneMapped: false });

export interface FigureParts extends PieceParts {
  /** Switch to an animation; repeated calls with the same name do nothing. */
  act: (action: Action) => void;
}

export const Figure = forwardRef<FigureParts, { army: Army; kind: PieceSymbol }>(function Figure({ army, kind }, ref) {
  const { scene } = useGLTF(url(army, kind));
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
        o.frustumCulled = false; // skinned bounds are the bind pose; don't let them pop out
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
    if (action === "Death_A" || action === "1H_Melee_Attack_Chop" || action === "Hit_A" || action === "Cheer") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
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
      <mesh ref={gem} geometry={GEM} material={kind === "k" ? PALE : GOLD} position-y={HEIGHT[kind] + 0.16} scale={GEM_RADIUS[kind]} />
    </group>
  );
});

export function preloadArmy(army: Army) {
  useGLTF.preload(RIG_URL);
  for (const kind of ["p", "n", "b", "r", "q", "k"] as PieceSymbol[]) useGLTF.preload(url(army, kind));
}

/** The army chosen for a side, from `?army=` or the saved choice. Prototype: heroes play White. */
export function readArmy(): Army | null {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("army");
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("degenchess.army");
  } catch {}
  const choice = fromUrl ?? saved;
  return ARMIES.includes(choice as Army) ? (choice as Army) : null;
}
