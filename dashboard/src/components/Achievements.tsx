'use client';
import useSWR from 'swr';
import {
  GRADES,
  computeGrades,
  TREE,
  TREE_PATHS,
  TREE_LABELS,
  SIGILS,
  type AchievementSummary,
} from '@/lib/achievements';

// ── Types ──────────────────────────────────────────────────────────────

type ApiResponse = {
  summary: AchievementSummary & {
    published: number;
    chakraCounts: Record<string, number>;
  };
  agents: { key: string; hasShipped: boolean }[];
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ── SigilIcon (inline SVG glyphs) ─────────────────────────────────────

function SigilIcon({ k, color }: { k: string; color: string }) {
  const props = {
    width: 20,
    height: 20,
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.5,
  };
  switch (k) {
    case 'hermes':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
        </svg>
      );
    case 'michael':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" />
        </svg>
      );
    case 'raziel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="9" cy="12" r="6" />
          <circle cx="15" cy="12" r="6" />
        </svg>
      );
    case 'jophiel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,12 12,22 2,12" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'zadkiel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M5 4h14v16H5z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case 'uriel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <path d="M3 8l9 5 9-5" />
        </svg>
      );
    case 'raphael':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <polyline points="9,12 11,14 15,10" />
        </svg>
      );
    case 'gabriel':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,9 18,21 6,21 2,9" />
          <path d="M2 9l10 5 10-5" />
        </svg>
      );
    case 'sandalphon':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
          <polygon points="12,7 17,10 17,14 12,17 7,14 7,10" />
        </svg>
      );
    case 'metatron':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <circle cx="6" cy="9" r="2" />
          <circle cx="18" cy="9" r="2" />
          <circle cx="6" cy="15" r="2" />
          <circle cx="18" cy="15" r="2" />
        </svg>
      );
    case 'solve':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 12c4-9 14-9 18 0M3 12c4 9 14 9 18 0" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    default:
      return null;
  }
}

// ── Main Component ─────────────────────────────────────────────────────

export function Achievements() {
  const { data } = useSWR<ApiResponse>('/api/achievements', fetcher, {
    refreshInterval: 8000,
  });

  const summary = data?.summary;
  const agents = data?.agents ?? [];

  // Build AchievementSummary for computeGrades
  const achieveSummary: AchievementSummary = {
    totalSongs: (summary?.published ?? 0) + 0,
    published: summary?.published ?? 0,
    chakrasCovered: summary?.chakrasCovered ?? 0,
    minChakraCount: summary?.minChakraCount ?? 0,
    throatChakraSongs: summary?.throatChakraSongs ?? 0,
    agentsShipped: summary?.agentsShipped ?? 0,
    solveCoagula: summary?.solveCoagula ?? 0,
    timelineEvents: summary?.timelineEvents ?? 0,
  };

  const { unlocked, current } = computeGrades(achieveSummary);

  // Determine which sigils are earned via agents list
  const earnedSigils = new Set<string>();
  for (const a of agents) {
    if (a.hasShipped) earnedSigils.add(a.key);
  }
  if (achieveSummary.solveCoagula >= 1) earnedSigils.add('solve');

  return (
    <div
      style={{
        borderRadius: 4,
        border: '1px solid rgba(201,164,73,0.25)',
        background: '#0a0a0a',
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            color: '#a3a3a3',
          }}
        >
          <span
            style={{
              width: 3,
              height: 14,
              background: '#c9a449',
              borderRadius: 1,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <strong style={{ color: '#fff', fontWeight: 500 }}>
            ASCENDING THE TREE
          </strong>
          <span style={{ color: '#404040' }}>·</span>
          <span>GOLDEN DAWN GRADES</span>
        </div>
        <div
          style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: '#6a6a6a',
          }}
        >
          <strong style={{ color: '#fff' }}>{unlocked.size}</strong> / 12 ATTAINED
        </div>
      </div>

      {/* 3-column grid: SVG | grades | sigils */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr 1fr',
          gap: 0,
          padding: '20px',
        }}
      >
        {/* ── Column 1: Tree of Life SVG ── */}
        <div style={{ paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <svg viewBox="0 0 200 360" style={{ width: '100%', height: 'auto' }}>
            {/* Paths */}
            {TREE_PATHS.map(([a, b], i) => {
              const A = TREE.find((x) => x.id === a)!;
              const B = TREE.find((x) => x.id === b)!;
              const lit = unlocked.has(A.key) && unlocked.has(B.key);
              return (
                <line
                  key={i}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke={lit ? '#c9a449' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={lit ? 1 : 0.8}
                  opacity={lit ? 0.6 : 1}
                  fill="none"
                />
              );
            })}
            {/* Nodes */}
            {TREE.map((s) => {
              const u = unlocked.has(s.key);
              const isCur =
                current.daath ? s.id === 'daath' : current.num === s.key;
              const isDaath = s.id === 'daath';
              const fill = isCur
                ? '#c9a449'
                : isDaath && u
                  ? '#ef4444'
                  : isDaath
                    ? 'rgba(239,68,68,0.08)'
                    : u
                      ? 'rgba(201,164,73,0.18)'
                      : '#111';
              const stroke = isCur
                ? '#e8c46a'
                : isDaath && u
                  ? '#f87171'
                  : isDaath
                    ? '#ef4444'
                    : u
                      ? '#c9a449'
                      : 'rgba(255,255,255,0.16)';
              return (
                <g key={s.id}>
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={s.r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isCur ? 2 : 1}
                    strokeDasharray={isDaath && !u ? '2 2' : undefined}
                    filter={
                      isCur
                        ? 'drop-shadow(0 0 8px #c9a449)'
                        : isDaath && u
                          ? 'drop-shadow(0 0 8px #ef4444)'
                          : undefined
                    }
                  />
                  <text
                    x={s.x}
                    y={s.y + s.r + 10}
                    fill={isCur || u ? '#fff' : '#6a6a6a'}
                    fontFamily="Geist Mono, monospace"
                    fontSize="7"
                    textAnchor="middle"
                    style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
                  >
                    {TREE_LABELS[s.id]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── Column 2: Grade ladder ── */}
        <div
          style={{
            paddingLeft: 20,
            paddingRight: 20,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            maxHeight: 480,
            overflowY: 'auto',
          }}
        >
          {GRADES.map((g) => {
            const k = g.daath ? 'daath' : g.num;
            const u = unlocked.has(k);
            const isCur = current.daath
              ? g.daath
              : current.num === g.num;
            return (
              <div
                key={g.num + g.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 100px',
                  gap: 12,
                  alignItems: 'center',
                  padding: g.daath ? '12px 8px' : '10px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  background: g.daath
                    ? u
                      ? 'linear-gradient(90deg, rgba(239,68,68,0.12), transparent)'
                      : 'linear-gradient(90deg, rgba(239,68,68,0.05), transparent)'
                    : undefined,
                  margin: g.daath ? '4px -8px' : undefined,
                  borderRadius: g.daath ? 2 : undefined,
                }}
              >
                {/* Grade number */}
                <div
                  style={{
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 11,
                    letterSpacing: '0.05em',
                    color: g.daath
                      ? '#ef4444'
                      : isCur
                        ? '#e8c46a'
                        : u
                          ? '#c9a449'
                          : '#6a6a6a',
                    fontWeight: isCur ? 500 : 400,
                  }}
                >
                  {g.num}
                </div>
                {/* Grade name + sephirah */}
                <div>
                  <div
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: 13,
                      fontWeight: 500,
                      color: g.daath
                        ? u
                          ? '#f87171'
                          : '#ef4444'
                        : u || isCur
                          ? '#fff'
                          : '#6a6a6a',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {g.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Geist Mono, ui-monospace, monospace',
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase' as const,
                      marginTop: 2,
                      color: g.daath ? '#ef4444' : u ? '#6a6a6a' : '#404040',
                    }}
                  >
                    {g.seph}
                  </div>
                </div>
                {/* Trigger / attained */}
                <div
                  style={{
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 9,
                    letterSpacing: '0.05em',
                    textAlign: 'right' as const,
                    lineHeight: 1.4,
                    color: g.daath
                      ? '#ef4444'
                      : isCur
                        ? '#e8c46a'
                        : u
                          ? '#6a6a6a'
                          : '#404040',
                  }}
                >
                  {u ? '✦ ATTAINED' : g.trig}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Column 3: Sigils panel ── */}
        <div style={{ paddingLeft: 20 }}>
          {SIGILS.map((sig) => {
            const earned = earnedSigils.has(sig.key);
            const isBonus = 'bonus' in sig && sig.bonus;
            return (
              <div
                key={sig.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {/* Icon box */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 4,
                    display: 'grid',
                    placeItems: 'center',
                    border: earned && isBonus
                      ? '1px solid #ef4444'
                      : earned
                        ? '1px solid #c9a449'
                        : '1px solid rgba(255,255,255,0.16)',
                    background: earned && isBonus
                      ? 'rgba(239,68,68,0.08)'
                      : earned
                        ? 'rgba(201,164,73,0.08)'
                        : '#111',
                    flexShrink: 0,
                  }}
                >
                  <SigilIcon
                    k={sig.key}
                    color={earned ? (isBonus ? '#f87171' : '#e8c46a') : '#6a6a6a'}
                  />
                </div>
                {/* Name + desc */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: 12,
                      fontWeight: 500,
                      color: earned ? '#fff' : '#6a6a6a',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap' as const,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {sig.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'EB Garamond, serif',
                      fontStyle: 'italic',
                      fontSize: 12,
                      color: '#6a6a6a',
                      marginTop: 1,
                      whiteSpace: 'nowrap' as const,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {sig.desc}
                  </div>
                </div>
                {/* Tier label */}
                <div
                  style={{
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase' as const,
                    color: earned && isBonus
                      ? '#ef4444'
                      : earned
                        ? '#c9a449'
                        : '#404040',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {sig.tier}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
