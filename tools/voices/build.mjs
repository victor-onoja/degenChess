// Generates the armies' voice lines with Kokoro-82M (Apache-2.0, hexgrad/Kokoro-82M via
// onnx-community/Kokoro-82M-v1.0-ONNX) and writes public/voices/<army>-<moment>-<n>.mp3 plus an
// index the app reads. The Undead are pitched down further at playback.
//
//   npm i --no-save kokoro-js @breezystack/lamejs && node tools/voices/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { KokoroTTS } from "kokoro-js";
import { Mp3Encoder } from "@breezystack/lamejs";

const LINES = JSON.parse(readFileSync("tools/voices/lines.json", "utf8"));
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });

/** Float PCM to a mono 64 kbps MP3, trimming the silence Kokoro leaves at both ends. */
function mp3(samples, rate) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < 0.01) start++;
  while (end > start && Math.abs(samples[end - 1]) < 0.01) end--;
  const pcm = new Int16Array(end - start);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[start + i])) * 32767;
  const encoder = new Mp3Encoder(1, rate, 64);
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) chunks.push(encoder.encodeBuffer(pcm.subarray(i, i + 1152)));
  chunks.push(encoder.flush());
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

const index = {};
for (const [army, moments] of Object.entries(LINES)) {
  index[army] = {};
  for (const [moment, lines] of Object.entries(moments)) {
    index[army][moment] = [];
    for (const [i, [voice, text]] of lines.entries()) {
      const audio = await tts.generate(text, { voice, speed: army === "undead" ? 0.9 : 1.05 });
      const file = `${army}-${moment}-${i}.mp3`;
      writeFileSync(`public/voices/${file}`, mp3(audio.audio, audio.sampling_rate));
      index[army][moment].push({ file, text });
      console.log(file, JSON.stringify(text));
    }
  }
}
writeFileSync("src/lib/voiceLines.json", JSON.stringify(index, null, 2) + "\n");
