import { useMemo } from "react";
import * as THREE from "three";
import type { Color, PieceSymbol } from "chess.js";

// Chess pieces built in code. Classic silhouettes (readable at a glance, like a real set) turned on
// a lathe; the Bulls vs Bears identity lives in the materials and in the knights, which are a bull's
// head and a bear's head. No model files: the whole set is a few thousand triangles.

type Profile = [radius: number, height: number][];

/** Shared foot: a wide base with a bevel, narrowing into the stem. */
const FOOT: Profile = [
  [0, 0],
  [0.36, 0],
  [0.38, 0.03],
  [0.38, 0.09],
  [0.33, 0.12],
  [0.3, 0.17],
  [0.24, 0.2],
];

/** Points along a sphere of radius `r` centred at height `cy`, from its lower edge up to the top. */
function ball(r: number, cy: number, fromAngle = -0.9, steps = 8): Profile {
  const points: Profile = [];
  for (let i = 0; i <= steps; i++) {
    const a = fromAngle + ((Math.PI / 2 - fromAngle) * i) / steps;
    points.push([Math.max(Math.cos(a) * r, 0), cy + Math.sin(a) * r]);
  }
  return points;
}

const PROFILES: Record<Exclude<PieceSymbol, "n">, Profile> = {
  p: [...FOOT, [0.15, 0.3], [0.11, 0.44], [0.2, 0.48], [0.2, 0.52], [0.1, 0.55], ...ball(0.165, 0.69)],
  r: [
    ...FOOT,
    [0.21, 0.28],
    [0.19, 0.62],
    [0.27, 0.68],
    [0.28, 0.88],
    [0.2, 0.88], // hollow top: the lip reads as battlements
    [0.2, 0.78],
    [0, 0.78],
  ],
  b: [
    ...FOOT,
    [0.17, 0.3],
    [0.11, 0.6],
    [0.21, 0.65],
    [0.21, 0.69],
    [0.12, 0.72],
    [0.17, 0.82],
    [0.16, 0.92],
    [0.1, 1.03],
    [0.035, 1.1],
    ...ball(0.055, 1.14, -0.6, 5),
  ],
  q: [
    ...FOOT,
    [0.18, 0.32],
    [0.115, 0.78],
    [0.23, 0.83],
    [0.23, 0.87],
    [0.13, 0.9],
    [0.17, 1.02],
    [0.26, 1.16], // crown flare
    [0.2, 1.15],
    [0.16, 1.19],
    [0.08, 1.24],
    ...ball(0.07, 1.29, -0.6, 5),
  ],
  k: [
    ...FOOT,
    [0.19, 0.34],
    [0.125, 0.86],
    [0.24, 0.91],
    [0.24, 0.95],
    [0.14, 0.98],
    [0.18, 1.1],
    [0.27, 1.26],
    [0.27, 1.3],
    [0.2, 1.3],
    [0.1, 1.36],
    [0, 1.37],
  ],
};

/** Total height of each piece, for effects that need to know where its top is. */
export const PIECE_HEIGHT: Record<PieceSymbol, number> = { p: 0.86, r: 0.88, n: 1.0, b: 1.2, q: 1.36, k: 1.62 };

const lathe = (profile: Profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 40);

// Geometry is shared by every piece of a kind.
const GEOMETRY = {
  p: lathe(PROFILES.p),
  r: lathe(PROFILES.r),
  b: lathe(PROFILES.b),
  q: lathe(PROFILES.q),
  k: lathe(PROFILES.k),
  knightBase: lathe([...FOOT, [0.2, 0.28], [0.17, 0.46], [0.22, 0.5], [0.22, 0.54], [0, 0.56]]),
  band: new THREE.TorusGeometry(0.335, 0.028, 12, 48),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  horn: new THREE.ConeGeometry(0.055, 0.3, 16),
};

/** Light side: warm ivory with gold. Dark side: gunmetal with crimson. Readable like any chess set. */
function useMaterials(color: Color) {
  return useMemo(() => {
    const bull = color === "w";
    return {
      body: new THREE.MeshStandardMaterial({
        color: bull ? "#e9d8ae" : "#2a2f3a",
        metalness: bull ? 0.15 : 0.75,
        roughness: bull ? 0.4 : 0.34,
      }),
      accent: new THREE.MeshStandardMaterial({
        color: bull ? "#ffc933" : "#ff3355",
        metalness: 0.9,
        roughness: 0.22,
        emissive: bull ? "#7a5200" : "#7a0018",
        emissiveIntensity: 0.6,
      }),
      dark: new THREE.MeshStandardMaterial({ color: bull ? "#3b2a12" : "#0d0f14", roughness: 0.6 }),
    };
  }, [color]);
}

/** The knight: a bull's head with horns for the Bulls, a bear's head with round ears for the Bears. */
function KnightHead({ color, body, accent, dark }: { color: Color } & ReturnType<typeof useMaterials>) {
  if (color === "w") {
    return (
      <group position={[0, 0.74, 0]} rotation-x={0.12}>
        <mesh geometry={GEOMETRY.sphere} material={body} scale={[0.2, 0.19, 0.2]} castShadow />
        {/* broad muzzle with a gold nose ring */}
        <mesh geometry={GEOMETRY.sphere} material={body} position={[0, -0.07, 0.17]} scale={[0.15, 0.11, 0.13]} castShadow />
        <mesh geometry={GEOMETRY.band} material={accent} position={[0, -0.13, 0.27]} scale={0.14} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={GEOMETRY.horn} material={accent} position={[side * 0.22, 0.18, 0]} rotation-z={side * -0.8} castShadow />
            <mesh geometry={GEOMETRY.sphere} material={dark} position={[side * 0.09, 0.05, 0.175]} scale={0.028} />
          </group>
        ))}
      </group>
    );
  }
  return (
    <group position={[0, 0.76, 0]}>
      <mesh geometry={GEOMETRY.sphere} material={body} scale={[0.24, 0.22, 0.23]} castShadow />
      {/* muzzle and nose */}
      <mesh geometry={GEOMETRY.sphere} material={body} position={[0, -0.05, 0.19]} scale={[0.12, 0.09, 0.1]} castShadow />
      <mesh geometry={GEOMETRY.sphere} material={accent} position={[0, -0.02, 0.285]} scale={0.03} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={GEOMETRY.sphere} material={body} position={[side * 0.17, 0.19, 0]} scale={[0.085, 0.085, 0.05]} castShadow />
          <mesh geometry={GEOMETRY.sphere} material={accent} position={[side * 0.17, 0.19, 0.03]} scale={[0.05, 0.05, 0.03]} />
          <mesh geometry={GEOMETRY.sphere} material={accent} position={[side * 0.09, 0.05, 0.205]} scale={0.026} />
        </group>
      ))}
    </group>
  );
}

/** One chess piece, standing on the origin and facing +z. */
export function ChessPiece({ kind, color }: { kind: PieceSymbol; color: Color }) {
  const materials = useMaterials(color);
  const { body, accent } = materials;

  return (
    <group>
      {kind === "n" ? (
        <>
          <mesh geometry={GEOMETRY.knightBase} material={body} castShadow />
          <KnightHead color={color} {...materials} />
        </>
      ) : (
        <mesh geometry={GEOMETRY[kind]} material={body} castShadow />
      )}
      {/* faction band around the foot */}
      <mesh geometry={GEOMETRY.band} material={accent} position-y={0.105} rotation-x={Math.PI / 2} />

      {kind === "r" &&
        [0, 1, 2, 3].map((i) => (
          // four notches cut the rim into battlements
          <mesh
            key={i}
            geometry={GEOMETRY.box}
            material={materials.dark}
            position={[Math.cos((i * Math.PI) / 2) * 0.24, 0.86, Math.sin((i * Math.PI) / 2) * 0.24]}
            rotation-y={-(i * Math.PI) / 2}
            scale={[0.12, 0.09, 0.11]}
          />
        ))}
      {kind === "b" && <mesh geometry={GEOMETRY.band} material={accent} position-y={0.67} rotation-x={Math.PI / 2} scale={0.62} />}
      {kind === "q" && (
        <>
          <mesh geometry={GEOMETRY.band} material={accent} position-y={0.85} rotation-x={Math.PI / 2} scale={0.68} />
          {Array.from({ length: 8 }, (_, i) => (
            <mesh
              key={i}
              geometry={GEOMETRY.sphere}
              material={accent}
              position={[Math.cos((i * Math.PI) / 4) * 0.25, 1.19, Math.sin((i * Math.PI) / 4) * 0.25]}
              scale={0.045}
            />
          ))}
        </>
      )}
      {kind === "k" && (
        <>
          <mesh geometry={GEOMETRY.band} material={accent} position-y={0.93} rotation-x={Math.PI / 2} scale={0.71} />
          <mesh geometry={GEOMETRY.band} material={accent} position-y={1.28} rotation-x={Math.PI / 2} scale={0.8} />
          {/* cross */}
          <mesh geometry={GEOMETRY.box} material={accent} position-y={1.49} scale={[0.07, 0.26, 0.07]} castShadow />
          <mesh geometry={GEOMETRY.box} material={accent} position-y={1.51} scale={[0.2, 0.07, 0.07]} castShadow />
        </>
      )}
    </group>
  );
}
