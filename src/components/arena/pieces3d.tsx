import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Color, PieceSymbol } from "chess.js";
import { ANATOMY, KNIGHT_BASE, PIECE_HEIGHT, PIECE_WEIGHT, PROFILES, ROBE, robeRadius, type Profile } from "../../lib/pieceShapes";

// The living chess set: small robed figures that keep the heads of their pieces. Readable silhouettes (the same profiles as the flat icons), turned in code,
// each with a pair of eyes and a core that holds its share of the stake. The arena animates the
// parts exposed through the ref: where the eyes look, when they blink, how the core beats.

export { PIECE_HEIGHT };

const lathe = (profile: Profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48);

const GEOMETRY = {
  p: lathe(PROFILES.p),
  r: lathe(PROFILES.r),
  b: lathe(PROFILES.b),
  q: lathe(PROFILES.q),
  k: lathe(PROFILES.k),
  knightBase: lathe(KNIGHT_BASE),
  sphere: new THREE.SphereGeometry(1, 28, 18),
  box: new THREE.BoxGeometry(1, 1, 1),
  ear: new THREE.ConeGeometry(0.045, 0.14, 12),
  ring: new THREE.TorusGeometry(1, 0.12, 10, 40),
};

/** Size of the value core: it scales with what the piece is worth. The king's is a pale light, not money. */
const CORE_RADIUS: Record<PieceSymbol, number> = { p: 0.045, n: 0.06, b: 0.06, r: 0.07, q: 0.085, k: 0.045 };

const GOLD = new THREE.Color("#ffc233");
const MATERIALS = {
  w: {
    body: new THREE.MeshStandardMaterial({ color: "#efe5cf", metalness: 0.05, roughness: 0.45 }),
    trim: new THREE.MeshStandardMaterial({ color: "#d9cdb0", metalness: 0.1, roughness: 0.5 }),
  },
  b: {
    body: new THREE.MeshStandardMaterial({ color: "#1a1a26", metalness: 0.35, roughness: 0.32 }),
    trim: new THREE.MeshStandardMaterial({ color: "#2a2a3a", metalness: 0.4, roughness: 0.35 }),
  },
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

function Eye({ x, color }: { x: number; color: Color }) {
  return <mesh geometry={GEOMETRY.sphere} material={MATERIALS.eye[color]} position={[x, 0, 0.012]} scale={[0.021, 0.032, 0.012]} />;
}

/** The knight's head: a horse, built from a few shapes, looking forward along +z. */
function HorseHead({ body, trim }: { body: THREE.Material; trim: THREE.Material }) {
  return (
    <group position={[0, 0.6, 0]}>
      {/* neck, leaning forward */}
      <mesh geometry={GEOMETRY.sphere} material={body} position={[0, 0.1, 0.02]} rotation-x={0.35} scale={[0.15, 0.24, 0.17]} castShadow />
      {/* skull */}
      <mesh geometry={GEOMETRY.sphere} material={body} position={[0, 0.26, 0.07]} scale={[0.15, 0.15, 0.17]} castShadow />
      {/* long muzzle */}
      <mesh geometry={GEOMETRY.sphere} material={body} position={[0, 0.2, 0.24]} rotation-x={0.5} scale={[0.1, 0.1, 0.17]} castShadow />
      {/* mane */}
      <mesh geometry={GEOMETRY.box} material={trim} position={[0, 0.22, -0.08]} rotation-x={-0.45} scale={[0.05, 0.3, 0.08]} castShadow />
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={GEOMETRY.ear} material={body} position={[side * 0.07, 0.43, 0.02]} rotation-z={side * -0.25} castShadow />
      ))}
    </group>
  );
}

/** One living chess piece standing on the origin, facing +z. */
export const ChessPiece = forwardRef<PieceParts, { kind: PieceSymbol; color: Color }>(function ChessPiece({ kind, color }, ref) {
  const eyes = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const { body, trim } = MATERIALS[color];
  const anatomy = ANATOMY[kind];
  useImperativeHandle(ref, () => ({ eyes: eyes.current, core: core.current, coreRadius: CORE_RADIUS[kind] }), [kind]);

  const notches = useMemo(() => [0, 1, 2, 3].map((i) => (i * Math.PI) / 2 + Math.PI / 4), []);

  return (
    <group>
      {kind === "n" ? (
        <>
          <mesh geometry={GEOMETRY.knightBase} material={body} castShadow receiveShadow />
          <HorseHead body={body} trim={trim} />
        </>
      ) : (
        <mesh geometry={GEOMETRY[kind]} material={body} castShadow receiveShadow />
      )}

      {kind === "r" &&
        notches.map((a) => (
          <mesh
            key={a}
            geometry={GEOMETRY.box}
            material={trim}
            position={[Math.cos(a) * 0.24, 0.85, Math.sin(a) * 0.24]}
            rotation-y={-a}
            scale={[0.1, 0.08, 0.12]}
          />
        ))}
      {kind === "q" &&
        Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return <mesh key={i} geometry={GEOMETRY.sphere} material={trim} position={[Math.cos(a) * 0.235, 1.19, Math.sin(a) * 0.235]} scale={0.04} />;
        })}
      {kind === "k" && (
        <>
          <mesh geometry={GEOMETRY.box} material={body} position-y={1.48} scale={[0.07, 0.24, 0.07]} castShadow />
          <mesh geometry={GEOMETRY.box} material={body} position-y={1.5} scale={[0.19, 0.07, 0.07]} castShadow />
        </>
      )}

      {/* the robe: sleeves hanging from the shoulders and a sash at the waist */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={GEOMETRY.sphere}
          material={body}
          position={[side * (robeRadius(kind, 0.8) + 0.015), ROBE[kind].h * 0.62, 0.02]}
          rotation-z={side * 0.2}
          scale={[0.065, ROBE[kind].h * 0.27, 0.085]}
          castShadow
        />
      ))}
      <mesh geometry={GEOMETRY.ring} material={trim} position-y={ROBE[kind].h * 0.66} rotation-x={Math.PI / 2} scale={robeRadius(kind, 0.66) + 0.004} />

      {/* the core: this piece's share of the stake, set into its chest */}
      <mesh
        ref={core}
        geometry={GEOMETRY.sphere}
        material={kind === "k" ? MATERIALS.kingCore : MATERIALS.core}
        position={[0, anatomy.coreY, anatomy.coreZ]}
        scale={CORE_RADIUS[kind]}
      />
      {PIECE_WEIGHT[kind] > 0 && (
        <mesh geometry={GEOMETRY.ring} material={trim} position={[0, anatomy.coreY, anatomy.coreZ - 0.012]} scale={CORE_RADIUS[kind] * 1.35} />
      )}

      <group ref={eyes} position={[0, anatomy.eyeY, anatomy.eyeZ]}>
        <Eye x={-anatomy.eyeX} color={color} />
        <Eye x={anatomy.eyeX} color={color} />
      </group>
    </group>
  );
});
