import { forwardRef, useImperativeHandle, useRef } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Color, PieceSymbol } from "chess.js";
import { ANATOMY, PIECE_HEIGHT } from "../../lib/pieceShapes";

// The living chess set. The bodies are a sculpted Staunton set (Poly Haven's CC0 "Chess Set" by
// Riley Queen, trimmed by tools/build-chess-set.py) in polished bone and obsidian. What makes them
// ours is set into them: a pair of eyes, and a gold core that holds the piece's share of the stake.
// The arena animates the parts exposed through the ref: where the eyes look, when they blink, how
// the core beats.

export { PIECE_HEIGHT };

const SET_URL = "/set/staunton.gltf";
const NORMAL_URL = "/set/staunton-normal.jpg";

/** Size of the value core: it scales with what the piece is worth. The king's is a pale light, not money. */
const CORE_RADIUS: Record<PieceSymbol, number> = { p: 0.036, n: 0.05, b: 0.05, r: 0.058, q: 0.07, k: 0.038 };

const GOLD = new THREE.Color("#ffc233");
const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const MATERIALS = {
  w: new THREE.MeshPhysicalMaterial({ color: "#e6dcc6", roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
  b: new THREE.MeshPhysicalMaterial({ color: "#16151d", roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 }),
  // Eyes are a pair of small ovals: dark on the bone side, softly lit on the obsidian side.
  eye: {
    w: new THREE.MeshBasicMaterial({ color: "#0b0a12" }),
    b: new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3d6").multiplyScalar(1.25), toneMapped: false }),
  },
  // Values above 1 are what the bloom pass turns into glow.
  core: new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(2.4), toneMapped: false }),
  kingCore: new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe4ff").multiplyScalar(1.6), toneMapped: false }),
};

export interface PieceParts {
  /** Rotate to aim the gaze; scale y to blink. */
  eyes: THREE.Group | null;
  /** Scale to make the core beat. */
  core: THREE.Object3D | null;
  coreRadius: number;
}

/** The six sculpted bodies, with the set's carved detail applied to both materials. */
function useChessSet(): Record<PieceSymbol, THREE.BufferGeometry> {
  const { nodes } = useGLTF(SET_URL);
  const normal = useTexture(NORMAL_URL);
  if (MATERIALS.w.normalMap !== normal) {
    normal.flipY = false;
    normal.needsUpdate = true;
    for (const material of [MATERIALS.w, MATERIALS.b]) {
      material.normalMap = normal;
      material.needsUpdate = true;
    }
  }
  const geometry = (kind: PieceSymbol) => (nodes[kind] as THREE.Mesh).geometry;
  return { p: geometry("p"), r: geometry("r"), n: geometry("n"), b: geometry("b"), q: geometry("q"), k: geometry("k") };
}
useGLTF.preload(SET_URL);
useTexture.preload(NORMAL_URL);

function Eye({ x, color }: { x: number; color: Color }) {
  return <mesh geometry={SPHERE} material={MATERIALS.eye[color]} position-x={x} scale={[0.02, 0.031, 0.012]} />;
}

/** One living chess piece standing on the origin, facing +z. */
export const ChessPiece = forwardRef<PieceParts, { kind: PieceSymbol; color: Color }>(function ChessPiece({ kind, color }, ref) {
  const eyes = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const set = useChessSet();
  const anatomy = ANATOMY[kind];
  useImperativeHandle(ref, () => ({ eyes: eyes.current, core: core.current, coreRadius: CORE_RADIUS[kind] }), [kind]);

  return (
    <group>
      <mesh geometry={set[kind]} material={MATERIALS[color]} castShadow receiveShadow />

      {/* the core: this piece's share of the stake, set into its body */}
      <mesh
        ref={core}
        geometry={SPHERE}
        material={kind === "k" ? MATERIALS.kingCore : MATERIALS.core}
        position={[0, anatomy.coreY, anatomy.coreZ]}
        scale={CORE_RADIUS[kind]}
      />

      <group ref={eyes} position={[0, anatomy.eyeY, anatomy.eyeZ]}>
        <Eye x={-anatomy.eyeX} color={color} />
        <Eye x={anatomy.eyeX} color={color} />
      </group>
    </group>
  );
});
