import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

export const PIECES = ["king", "queen", "rook", "bishop", "knight", "pawn"] as const;
export const CLIPS = ["idle", "walk", "attack", "death"] as const;
export type Clip = (typeof CLIPS)[number];

function Figure({ url, x, clip, replay, label }: { url: string; x: number; clip: Clip; replay: number; label: string }) {
  const { scene, animations } = useGLTF(url);
  const model = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.metalness = Math.min(material.metalness, 0.15);
      material.roughness = Math.max(material.roughness, 0.6);
    });
    return clone;
  }, [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(animations, group);

  useEffect(() => {
    const action = actions[clip];
    if (!action) return;
    const once = clip === "attack" || clip === "death";
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.fadeIn(0.15).play();
    return () => {
      action.fadeOut(0.15);
    };
  }, [actions, clip, replay]);

  const missing = CLIPS.filter((c) => !names.includes(c));
  return (
    <group position={[x, 0, 0]}>
      <group ref={group}>
        <primitive object={model} />
      </group>
      <Html position={[0, -0.25, 0]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div style={{ textAlign: "center", fontSize: 13 }}>
          <b>{label}</b>
          {missing.length > 0 && <div style={{ color: "#ff6b84" }}>missing: {missing.join(", ")}</div>}
        </div>
      </Html>
    </group>
  );
}

/** One army's six characters side by side, all playing the chosen clip. */
export default function ModelViewer({ army, clip, replay }: { army: string; clip: Clip; replay: number }) {
  return (
    <Canvas camera={{ position: [0, 1.6, 8.5], fov: 40 }} dpr={[1, 1.75]}>
      <color attach="background" args={["#0b100d"]} />
      <hemisphereLight args={["#ffffff", "#223322", 1.4]} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <gridHelper args={[20, 20, "#1f7a48", "#16261d"]} />
      <Suspense
        fallback={
          <Html center>
            <div className="arena-loading">Loading models...</div>
          </Html>
        }
      >
        {PIECES.map((piece, i) => (
          <Figure
            key={`${army}-${piece}`}
            url={`/models/${army}-${piece}.glb`}
            x={(i - 2.5) * 2.1}
            clip={clip}
            replay={replay}
            label={piece}
          />
        ))}
      </Suspense>
      <OrbitControls target={[0, 0.9, 0]} enablePan />
    </Canvas>
  );
}
