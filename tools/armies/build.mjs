// Builds the character armies for the 3D board from Kay Lousberg's CC0 KayKit packs
// (github.com/KayKit-Game-Assets: Character Pack Adventures 1.0 and Skeletons 1.0).
//
// Every character shares one 41-bone rig, so the animations are stored once (public/armies/rig.glb)
// and each piece file carries only its meshes and skin. That keeps an army to a few hundred KB.
//
//   node tools/armies/build.mjs <folder with the pack .glb files>
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, quantize, resample } from "@gltf-transform/functions";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: node tools/armies/build.mjs <folder with Knight.glb, Mage.glb, ...>");
const io = new NodeIO();
/** Removes an animation with its channels and samplers, so prune() can drop the keyframe data. */
function drop(animation) {
  for (const c of animation.listChannels()) c.dispose();
  for (const s of animation.listSamplers()) s.dispose();
  animation.dispose();
}
const ANIMATIONS = ["Idle", "Walking_A", "1H_Melee_Attack_Chop", "Hit_A", "Death_A", "Cheer"];

const body = (who) => [`${who}_ArmLeft`, `${who}_ArmRight`, `${who}_Body`, `${who}_LegLeft`, `${who}_LegRight`];
/** Which character plays each piece, and which of its parts and props it wears. */
const ARMIES = {
  heroes: {
    p: ["Rogue_Hooded", [...body("Rogue"), "Rogue_Head_Hooded", "Rogue_Cape", "Knife"]],
    n: ["Knight", [...body("Knight"), "Knight_Head", "Knight_Helmet", "Knight_Cape", "1H_Sword", "Badge_Shield"]],
    b: ["Mage", [...body("Mage"), "Mage_Head", "Mage_Hat", "Mage_Cape", "2H_Staff"]],
    r: ["Barbarian", [...body("Barbarian"), "Barbarian_Head", "Barbarian_Hat", "Barbarian_Cape", "2H_Axe"]],
    q: ["Rogue", [...body("Rogue"), "Rogue_Head", "Rogue_Cape", "2H_Crossbow"]],
    k: ["Knight", [...body("Knight"), "Knight_Head", "Knight_Cape", "2H_Sword"]],
  },
};

async function piece(file, keep, out) {
  const doc = await io.read(`${SRC}/${file}.glb`);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) drop(a);
  for (const n of root.listNodes()) if (n.getMesh() && !keep.includes(n.getName())) n.dispose();
  await doc.transform(prune(), dedup());
  await io.write(out, doc);
  const tris = root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + p.getIndices().getCount() / 3, 0), 0);
  console.log(`${out}: ${tris} triangles`);
}

for (const [army, pieces] of Object.entries(ARMIES)) {
  for (const [kind, [file, keep]] of Object.entries(pieces)) await piece(file, keep, `public/armies/${army}-${kind}.glb`);
}

// The shared rig: bones and the few animations the board uses, no meshes.
const rig = await io.read(`${SRC}/Knight.glb`);
for (const a of rig.getRoot().listAnimations()) if (!ANIMATIONS.includes(a.getName())) drop(a);
for (const n of rig.getRoot().listNodes()) if (n.getMesh()) n.dispose();
for (const s of rig.getRoot().listSkins()) s.dispose();
await rig.transform(resample({ tolerance: 0.0005 }), prune(), dedup(), quantize());
await io.write("public/armies/rig.glb", rig);
console.log("public/armies/rig.glb:", rig.getRoot().listAnimations().map((a) => a.getName()).join(", "));
