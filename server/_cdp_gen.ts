import { generateViaSuno } from "./src/services/suno-browser-agent.js";
(async () => {
  const prompt = "classic rock anthem, soaring twin electric guitar solos, driving drums, Hammond organ, gritty male vocals, 70s arena rock energy, raw analog warmth";
  console.log("CDP_PORT:", process.env.CDP_PORT, "| prompt:", prompt);
  const r = await generateViaSuno(prompt);
  console.log("RESULT:", JSON.stringify(r, null, 2));
})().catch((e) => { console.error("CDP GEN ERROR:", e?.message || e); process.exit(1); });
