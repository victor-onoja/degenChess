// Builds the two armies for the 3D board from Kay Lousberg's CC0 KayKit packs:
// Adventurers 2.0 (EXTRA), Skeletons 1.1 (EXTRA) and Character Animations 1.1, unzipped in the
// project root (gitignored; the app ships only what this writes to public/armies).
//
// Every character uses one of two 23-bone skeletons (medium or large), so animations are stored once
// per skeleton (rig-medium.glb, rig-large.glb) and each piece file carries only its meshes, skin and
// the weapons this script puts in its hands.
//
//   node tools/armies/build.mjs
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { dedup, mergeDocuments, prune, quantize, resample, unpartition } from "@gltf-transform/functions";

const HEROES = "KayKit_Adventurers_2.0_EXTRA";
const UNDEAD = "KayKit_Skeletons_1.1_EXTRA";
const MOTION = "KayKit_Character_Animations_1.1/Animations/gltf";
for (const dir of [HEROES, UNDEAD, MOTION]) if (!existsSync(dir)) throw new Error(`missing ${dir}: unzip the KayKit packs in the project root`);

const io = new NodeIO();

/** Who plays each piece: the character file, parts to leave off, and what goes in each hand. */
const CAST = {
  heroes: {
    dir: `${HEROES}/Characters/gltf`,
    props: `${HEROES}/Assets/gltf`,
    pieces: {
      p: ["Rogue_Hooded", [], { r: "dagger" }],
      p2: ["Ranger", [], { l: "bow_withString" }],
      p3: ["Engineer", [], { r: "engineer_Wrench" }],
      n: ["Knight", [], { r: "sword_1handed", l: "shield_badge_color" }],
      b: ["Mage", [], { r: "staff" }],
      r: ["Barbarian_Large", [], { r: "axe_2handed_Large" }],
      q: ["Druid", [], { r: "druid_staff" }],
      k: ["Knight", ["Knight_Helmet", "Knight_HelmetVisor"], { r: "sword_2handed_color" }],
    },
  },
  undead: {
    dir: `${UNDEAD}/characters/gltf`,
    props: `${UNDEAD}/assets/gltf`,
    pieces: {
      p: ["Skeleton_Minion", [], { r: "Skeleton_Blade" }],
      p2: ["Skeleton_Minion", ["Skeleton_Minion_Cloak"], { r: "Skeleton_Axe", l: "Skeleton_Shield_Small_A" }],
      n: ["Skeleton_Warrior", [], { r: "Skeleton_Mace", l: "Skeleton_Shield_Small_B" }],
      b: ["Skeleton_Mage", [], { r: "Skeleton_Staff" }],
      r: ["Skeleton_Golem", [], { r: "Skeleton_Golem_Axe_Large" }],
      q: ["Skeleton_Rogue", [], { r: "Skeleton_Scythe" }],
      k: ["Necromancer", [], { r: "Skeleton_Staff" }],
    },
  },
};

/** The animations each skeleton needs (see src/components/arena/armies.tsx for who uses which). */
const CLIPS = {
  medium: {
    General: ["Idle_A", "Idle_B", "Hit_A", "Death_A"],
    MovementBasic: ["Walking_A", "Jump_Full_Short"],
    CombatMelee: ["Melee_1H_Attack_Stab", "Melee_1H_Attack_Chop", "Melee_1H_Attack_Slice_Diagonal", "Melee_2H_Attack_Slice", "Melee_2H_Attack_Spin"],
    CombatRanged: ["Ranged_Bow_Release", "Ranged_Magic_Shoot", "Ranged_Magic_Summon"],
    Special: ["Skeletons_Awaken_Floor", "Skeletons_Idle", "Skeletons_Walking", "Skeletons_Taunt"],
  },
  large: {
    General: ["Idle_A", "Idle_B", "Hit_A", "Death_A"],
    MovementBasic: ["Walking_A"],
    CombatMelee: ["Melee_2H_Attack", "Melee_2H_Slam"],
  },
};

/** Removes an animation with its channels and samplers, so prune() can drop the keyframe data. */
function drop(animation) {
  for (const c of animation.listChannels()) c.dispose();
  for (const s of animation.listSamplers()) s.dispose();
  animation.dispose();
}

/** Puts a weapon or shield into a hand, posed the way the packs pose their own props. */
async function attach(doc, file, hand) {
  const source = await io.read(file);
  const map = mergeDocuments(doc, source);
  const node = map.get(source.getRoot().listScenes()[0].listChildren()[0]);
  const slot = doc.getRoot().listNodes().find((n) => n.getName() === `handslot.${hand}`);
  for (const scene of doc.getRoot().listScenes()) scene.removeChild(node);
  slot.addChild(node);
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]);
  for (const scene of doc.getRoot().listScenes().slice(1)) scene.dispose();
}

for (const f of readdirSync("public/armies")) unlinkSync(`public/armies/${f}`);

for (const [army, { dir, props, pieces }] of Object.entries(CAST)) {
  for (const [piece, [file, leaveOff, hands]] of Object.entries(pieces)) {
    const doc = await io.read(`${dir}/${file}.glb`);
    for (const a of doc.getRoot().listAnimations()) drop(a);
    for (const n of doc.getRoot().listNodes()) if (n.getMesh() && leaveOff.includes(n.getName())) n.dispose();
    for (const [hand, prop] of Object.entries(hands)) await attach(doc, `${props}/${prop}.gltf`, hand);
    await doc.transform(prune(), dedup(), unpartition());
    const out = `public/armies/${army}-${piece}.glb`;
    await io.write(out, doc);
    const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
    console.log(`${out}: ${file}, ${tris} triangles`);
  }
}

// One animation file per skeleton: the bones and the clips above, gathered from the motion packs.
for (const [size, files] of Object.entries(CLIPS)) {
  const Size = size[0].toUpperCase() + size.slice(1);
  let rig = null;
  let bones = null;
  for (const [part, keep] of Object.entries(files)) {
    const doc = await io.read(`${MOTION}/Rig_${Size}/Rig_${Size}_${part}.glb`);
    for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) drop(a);
    if (!rig) {
      rig = doc;
      // The bones every clip must drive: the first file's (each merged file brings its own copy).
      bones = new Map(rig.getRoot().listNodes().map((n) => [n.getName(), n]));
      continue;
    }
    // Retarget this file's clips onto the first file's bones (same names, same skeleton).
    const map = mergeDocuments(rig, doc);
    for (const a of doc.getRoot().listAnimations()) {
      const copy = map.get(a);
      for (const channel of copy.listChannels()) {
        const target = bones.get(channel.getTargetNode()?.getName());
        if (target) channel.setTargetNode(target);
        else channel.dispose();
      }
    }
    for (const scene of rig.getRoot().listScenes().slice(1)) scene.dispose();
  }
  // Drop the merged files' skeleton copies, and any mesh: only the first file's bones remain.
  const keepNodes = new Set(bones.values());
  for (const n of rig.getRoot().listNodes()) if (!keepNodes.has(n) || n.getMesh()) n.dispose();
  for (const s of rig.getRoot().listSkins()) s.dispose();
  await rig.transform(resample({ tolerance: 0.0005 }), prune(), dedup(), quantize(), unpartition());
  await io.write(`public/armies/rig-${size}.glb`, rig);
  console.log(`public/armies/rig-${size}.glb:`, rig.getRoot().listAnimations().map((a) => a.getName()).join(", "));
}
