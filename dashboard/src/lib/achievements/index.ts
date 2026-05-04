export type AchievementSummary = {
  totalSongs: number;
  published: number;
  chakrasCovered: number;
  minChakraCount: number;
  throatChakraSongs: number;
  agentsShipped: number;
  solveCoagula: number;
  timelineEvents: number;
};

export type Grade = {
  num: string;
  name: string;
  seph: string;
  trig: string;
  daath?: boolean;
  rule: (s: AchievementSummary) => boolean;
};

export const GRADES: Grade[] = [
  { num: "0=0",  name: "Neophyte",           seph: "\u2014",       trig: "first concept",       rule: s => s.totalSongs >= 1 },
  { num: "1=10", name: "Zelator",            seph: "Malkuth",   trig: "first publish",       rule: s => s.published >= 1 },
  { num: "2=9",  name: "Theoricus",          seph: "Yesod",     trig: "5 published",         rule: s => s.published >= 5 },
  { num: "3=8",  name: "Practicus",          seph: "Hod",       trig: "all 10 agents",       rule: s => s.agentsShipped >= 10 },
  { num: "4=7",  name: "Philosophus",        seph: "Netzach",   trig: "10 pub + 4 chakras",  rule: s => s.published >= 10 && s.chakrasCovered >= 4 },
  { num: "\u2014",    name: "Crossing the Abyss", seph: "Da'ath",    trig: "throat + 1 song",     rule: s => s.throatChakraSongs >= 1, daath: true },
  { num: "5=6",  name: "Adeptus Minor",      seph: "Tiphareth", trig: "all 7 chakras",       rule: s => s.chakrasCovered >= 7 },
  { num: "6=5",  name: "Adeptus Major",      seph: "Geburah",   trig: "rejected \u2192 reworked", rule: s => s.solveCoagula >= 1 },
  { num: "7=4",  name: "Adeptus Exemptus",   seph: "Chesed",    trig: "25 published",        rule: s => s.published >= 25 },
  { num: "8=3",  name: "Magister Templi",    seph: "Binah",     trig: "50 songs",            rule: s => s.published >= 50 },
  { num: "9=2",  name: "Magus",              seph: "Chokmah",   trig: "100 songs",           rule: s => s.published >= 100 },
  { num: "10=1", name: "Ipsissimus",         seph: "Kether",    trig: "every chakra \u2265 7",    rule: s => s.minChakraCount >= 7 },
];

export function computeGrades(s: AchievementSummary) {
  const unlocked = new Set<string>();
  let current: Grade = GRADES[0]!;
  for (const g of GRADES) {
    if (g.rule(s)) {
      unlocked.add(g.daath ? "daath" : g.num);
      current = g;
    }
  }
  return { unlocked, current };
}

export const TREE = [
  { id: "kether",    x: 100, y: 30,  r: 14, key: "10=1" },
  { id: "chokmah",   x: 155, y: 70,  r: 13, key: "9=2" },
  { id: "binah",     x: 45,  y: 70,  r: 13, key: "8=3" },
  { id: "daath",     x: 100, y: 115, r: 11, key: "daath" },
  { id: "chesed",    x: 155, y: 155, r: 13, key: "7=4" },
  { id: "geburah",   x: 45,  y: 155, r: 13, key: "6=5" },
  { id: "tiphareth", x: 100, y: 200, r: 14, key: "5=6" },
  { id: "netzach",   x: 155, y: 240, r: 13, key: "4=7" },
  { id: "hod",       x: 45,  y: 240, r: 13, key: "3=8" },
  { id: "yesod",     x: 100, y: 285, r: 13, key: "2=9" },
  { id: "malkuth",   x: 100, y: 330, r: 14, key: "1=10" },
] as const;

export const TREE_LABELS: Record<string, string> = {
  kether: "KETHER", chokmah: "CHOKMAH", binah: "BINAH", daath: "DA'ATH",
  chesed: "CHESED", geburah: "GEBURAH", tiphareth: "TIPHARETH",
  netzach: "NETZACH", hod: "HOD", yesod: "YESOD", malkuth: "MALKUTH",
};

export const TREE_PATHS: [string, string][] = [
  ["kether","chokmah"],["kether","binah"],["chokmah","binah"],
  ["chokmah","tiphareth"],["binah","tiphareth"],["kether","tiphareth"],
  ["chokmah","chesed"],["binah","geburah"],["chesed","geburah"],
  ["chesed","tiphareth"],["geburah","tiphareth"],
  ["chesed","netzach"],["geburah","hod"],["tiphareth","netzach"],["tiphareth","hod"],
  ["netzach","hod"],["netzach","yesod"],["hod","yesod"],["tiphareth","yesod"],
  ["netzach","malkuth"],["hod","malkuth"],["yesod","malkuth"],
];

export const SIGILS = [
  { key: "hermes",     name: "Hermes' Errand",         desc: "first message routed by orchestrator", tier: "COURIER" },
  { key: "michael",    name: "Michael's Dispatch",     desc: "first creative assignment dispatched", tier: "COMMANDER" },
  { key: "raziel",     name: "Raziel's Seed",          desc: "first audio generated \u00b7 prima materia", tier: "KEEPER" },
  { key: "jophiel",    name: "Jophiel's Mirror",       desc: "first cover art rendered",             tier: "ARTIST" },
  { key: "zadkiel",    name: "Zadkiel's Verse",        desc: "first lyric written",                  tier: "SCRIBE" },
  { key: "uriel",      name: "Uriel's Foundation",     desc: "first sound prompt established",       tier: "BUILDER" },
  { key: "raphael",    name: "Raphael's Blessing",     desc: "first approval \u00b7 peacock's tail",      tier: "HEALER" },
  { key: "gabriel",    name: "Gabriel's Annunciation", desc: "first release copy delivered",         tier: "HERALD" },
  { key: "sandalphon", name: "Sandalphon's Garland",   desc: "first publish \u00b7 the stone cast",       tier: "CROWN" },
  { key: "metatron",   name: "Metatron's Ledger",      desc: "1000 timeline events recorded",        tier: "SCRIBE" },
  { key: "solve",      name: "Solve et Coagula",       desc: "rejected song reworked to approval",   tier: "BONUS", bonus: true },
] as const;

export const CHAKRAS = [
  { id: "root",      name: "Root",      hz: 396, color: "#ef4444" },
  { id: "sacral",    name: "Sacral",    hz: 417, color: "#f97316" },
  { id: "solar",     name: "Solar",     hz: 528, color: "#eab308" },
  { id: "heart",     name: "Heart",     hz: 639, color: "#22c55e" },
  { id: "throat",    name: "Throat",    hz: 741, color: "#06b6d4" },
  { id: "third_eye", name: "Third Eye", hz: 852, color: "#6366f1" },
  { id: "crown",     name: "Crown",     hz: 963, color: "#a855f7" },
] as const;
