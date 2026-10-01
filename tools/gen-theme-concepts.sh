#!/usr/bin/env bash
# Generates concept images for the "Apes vs Bots" theme into art/<army>/<piece>/concept.jpg.
# Every prompt shares one style block so the set reads as a family and suits image-to-3D + Mixamo rigging.
set -uo pipefail
cd "$(dirname "$0")/.."
STYLE="Stylized 3D game character render, collectible vinyl figurine style, chunky proportions, standing upright facing the camera in a symmetrical A-pose, arms straight and held out to the sides 45 degrees away from the torso in the same plane as the body, normal sized hands hanging open with palms facing the thighs and five thick clearly separated fingers, legs slightly apart, full body from head to feet in frame, front view, centered, plain white studio background, soft even lighting, no weapons, no held objects, no cape, no long robe, single character"
gen() { # army piece description
  local out="art/$1/$2/concept.jpg"
  [ -f "$out" ] && [ "${FORCE:-}" != "1" ] && { echo "keep $out"; return; }
  mkdir -p "art/$1/$2"
  tools/gen-image.sh "$3. $STYLE" "$out" 8 2>&1 | grep -E "Saved|rror" | cut -c1-60
}
APE="orange and gold colour scheme"
BOT="glossy white and chrome robot with glowing cyan accents, cyan and white colour scheme"
gen apes king   "A mighty silverback gorilla king wearing a small gold crown, heavy gold chain and an orange royal vest, broad chest, $APE"
gen apes queen  "An elegant female orangutan queen wearing a gold tiara and a fitted orange and gold armoured tunic with short sleeves, $APE"
gen apes rook   "An enormous heavily armoured gorilla guardian in thick riveted bronze and orange plate armour like a walking vault, very wide and stocky, $APE"
gen apes bishop "A wise old orangutan shaman with a long beard, wearing a short fitted orange tunic with gold trim and a bead necklace, $APE"
gen apes knight "An athletic chimpanzee warrior in light orange leather armour with gold shoulder pads and a headband, fierce grin, $APE"
gen apes pawn   "A young chimpanzee trader wearing an orange hoodie and a gold chain, cheeky smile, $APE"
gen bots king   "A commanding humanoid robot king with a crown-shaped antenna array on its head and a glowing cyan core in its chest, tall and broad, $BOT"
gen bots queen  "A sleek slender humanoid android queen with a smooth tiara-shaped head crest and glowing cyan lines along its body, $BOT"
gen bots rook   "An enormous heavy humanoid mech with thick blocky armour plates and huge shoulders like a walking server tower, very wide and stocky, $BOT"
gen bots bishop "A slim humanoid oracle robot with a tall pointed sensor head and a single large glowing cyan eye, $BOT"
gen bots knight "An agile humanoid sprinter robot with a streamlined visor helmet and lightweight armour, athletic build, $BOT"
gen bots pawn   "A small friendly humanoid utility robot with a round head and big round cyan eyes, short and compact, $BOT"
