'use client';
import useSWR from 'swr';
import { Waveform } from './Waveform';
import { SectionShell } from './SectionShell';

// ── Types ──────────────────────────────────────────────────────────────

type BrainwaveBand = {
  symbol: string;
  name: string;
  range: string;
  pct: number;
  color: string;
  variant: 'theta' | 'alpha' | 'beta' | 'delta';
};

type NowPlaying = {
  title: string;
  chakra: string;
  hz: number;
  progressSec: number;
  totalSec: number;
  waveformPeaks?: number[];
} | null;

type TopGenre = {
  label: string;
  durationSec: number;
  pct: number;
};

type SongMetricsResponse = {
  deepFocusPct: number;
  listenedHours: number;
  nowPlaying: NowPlaying;
  brainwaves: {
    theta: number;
    alpha: number;
    beta: number;
    delta: number;
  };
  topGenres: TopGenre[];
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function fmtProgress(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

// ── Brainwave card ────────────────────────────────────────────────────

function BrainwaveCard({ band }: { band: BrainwaveBand }) {
  return (
    <div
      style={{
        borderRadius: 4,
        padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#111',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 18,
            fontWeight: 500,
            color: band.color,
          }}
        >
          {band.symbol}
        </span>
        <span
          style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            color: '#6a6a6a',
          }}
        >
          {band.name}
        </span>
      </div>

      <div
        style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 9,
          color: '#404040',
          letterSpacing: '0.1em',
          marginBottom: 8,
        }}
      >
        {band.range}
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: band.color,
          marginBottom: 4,
        }}
      >
        {band.pct}
        <span
          style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 12,
            color: '#6a6a6a',
            marginLeft: 2,
          }}
        >
          %
        </span>
      </div>

      <div
        style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 9,
          letterSpacing: '0.15em',
          textTransform: 'uppercase' as const,
          color: '#6a6a6a',
          marginBottom: 8,
        }}
      >
        of sessions
      </div>

      <Waveform
        variant="pulse"
        height={22}
        color={band.color}
        seed={band.name}
        samples={48}
        animate={band.pct > 0}
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function SongMetrics() {
  const { data } = useSWR<SongMetricsResponse>(
    '/api/songs/metrics',
    fetcher,
    { refreshInterval: 5000 },
  );

  const deepFocusPct = data?.deepFocusPct ?? 0;
  const listenedHours = data?.listenedHours ?? 0;
  const nowPlaying = data?.nowPlaying ?? null;
  const bw = data?.brainwaves ?? { theta: 0, alpha: 0, beta: 0, delta: 0 };
  const topGenres = data?.topGenres ?? [];

  const bands: BrainwaveBand[] = [
    { symbol: 'θ', name: 'Theta',  range: '4–8 Hz',  pct: bw.theta, color: '#c084fc', variant: 'theta' },
    { symbol: 'α', name: 'Alpha',  range: '8–14 Hz', pct: bw.alpha, color: '#22d3ee', variant: 'alpha' },
    { symbol: 'β', name: 'Beta',   range: '14–30 Hz',pct: bw.beta,  color: '#ef4444', variant: 'beta'  },
    { symbol: 'Δ', name: 'Delta',  range: '0.5–4 Hz',pct: bw.delta, color: '#3b82f6', variant: 'delta' },
  ];

  const maxGenreDuration = topGenres.length
    ? Math.max(...topGenres.map((g) => g.durationSec))
    : 1;

  return (
    <SectionShell
      title="HARMONIC TELEMETRY"
      subtitle="BRAINWAVE TUNING"
      barColor="#c084fc"
    >
      <div style={{ padding: 20 }}>

        {/* ── 1. Top stat row ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 32,
            marginBottom: 20,
            paddingBottom: 20,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase' as const,
                color: '#6a6a6a',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 3,
                  height: 11,
                  background: '#10b981',
                  borderRadius: 1,
                  display: 'inline-block',
                }}
              />
              DEEP FOCUS SESSIONS
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: '#10b981',
              }}
            >
              {deepFocusPct}
              <span
                style={{
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                  fontSize: 16,
                  color: '#6a6a6a',
                  marginLeft: 2,
                }}
              >
                %
              </span>
            </div>
          </div>

          <div>
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase' as const,
                color: '#6a6a6a',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 3,
                  height: 11,
                  background: '#c084fc',
                  borderRadius: 1,
                  display: 'inline-block',
                }}
              />
              LISTENED
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: '#c084fc',
              }}
            >
              {fmtHours(listenedHours)}
            </div>
          </div>
        </div>

        {/* ── 2. Now-playing card ── */}
        {nowPlaying && (
          <div
            style={{
              borderRadius: 4,
              border: '1px solid rgba(192,132,252,0.25)',
              background: 'linear-gradient(180deg, rgba(192,132,252,0.04), #111)',
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 9,
                letterSpacing: '0.2em',
                textTransform: 'uppercase' as const,
                color: '#c084fc',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#c084fc',
                  display: 'inline-block',
                  boxShadow: '0 0 6px #c084fc',
                }}
              />
              NOW PLAYING
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: 15,
                fontWeight: 500,
                color: '#fff',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}
            >
              {nowPlaying.title}
            </div>
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 10,
                color: '#6a6a6a',
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                marginBottom: 10,
              }}
            >
              {nowPlaying.chakra} · {nowPlaying.hz} Hz
            </div>
            <div style={{ marginBottom: 6 }}>
              <Waveform
                variant="bars"
                height={36}
                color="#c084fc"
                colorAccent="#6366f1"
                progress={nowPlaying.totalSec > 0
                  ? nowPlaying.progressSec / nowPlaying.totalSec
                  : 0}
                peaks={nowPlaying.waveformPeaks}
                seed={nowPlaying.title}
                animate
              />
            </div>
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 10,
                color: '#6a6a6a',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{fmtProgress(nowPlaying.progressSec)}</span>
              <span>{fmtProgress(nowPlaying.totalSec)}</span>
            </div>
          </div>
        )}

        {/* ── 3. Brainwave bands 2x2 grid ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {bands.map((b) => (
            <BrainwaveCard key={b.variant} band={b} />
          ))}
        </div>

        {/* ── 4. Top genres list ── */}
        {topGenres.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: 'Geist Mono, ui-monospace, monospace',
                fontSize: 10,
                letterSpacing: '0.15em',
                textTransform: 'uppercase' as const,
                color: '#6a6a6a',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 3,
                  height: 11,
                  background: '#a3a3a3',
                  borderRadius: 1,
                  display: 'inline-block',
                }}
              />
              MODES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topGenres.slice(0, 5).map((g, i) => {
                const barPct = maxGenreDuration > 0
                  ? (g.durationSec / maxGenreDuration) * 100
                  : 0;
                return (
                  <div key={i}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Geist Mono, ui-monospace, monospace',
                          fontSize: 10,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase' as const,
                          color: '#a3a3a3',
                        }}
                      >
                        {g.label}
                      </span>
                      <span
                        style={{
                          fontFamily: 'Geist Mono, ui-monospace, monospace',
                          fontSize: 9,
                          color: '#6a6a6a',
                        }}
                      >
                        {fmtHours(g.durationSec / 3600)}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        background: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${barPct}%`,
                          background:
                            'linear-gradient(90deg, #c084fc, #a855f7)',
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!data && (
          <div
            style={{
              fontFamily: 'Geist Mono, ui-monospace, monospace',
              fontSize: 11,
              color: '#6a6a6a',
              letterSpacing: '0.1em',
              textAlign: 'center' as const,
              padding: '24px 0',
            }}
          >
            loading metrics…
          </div>
        )}
      </div>
    </SectionShell>
  );
}
