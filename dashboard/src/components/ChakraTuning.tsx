'use client';
import useSWR from 'swr';
import { CHAKRAS } from '@/lib/achievements';
import { Waveform } from './Waveform';
import { SectionShell } from './SectionShell';

// ── Types ──────────────────────────────────────────────────────────────

type ChakraApiResponse = {
  counts: Record<string, number>;
  durationSec: Record<string, number>;
  totalTracks: number;
  totalListenedSec: number;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

// ── Main Component ─────────────────────────────────────────────────────

export function ChakraTuning() {
  const { data } = useSWR<ChakraApiResponse>('/api/chakras', fetcher, {
    refreshInterval: 8000,
  });

  const counts = data?.counts ?? {};
  const totalTracks = data?.totalTracks ?? 0;
  const totalListenedSec = data?.totalListenedSec ?? 0;

  return (
    <SectionShell
      title="CHAKRA TUNING"
      subtitle="SOLFEGGIO COVERAGE"
      meta={
        <>
          <strong style={{ color: '#fff' }}>{totalTracks}</strong> TRACKS
          &nbsp;·&nbsp;
          {fmtTime(totalListenedSec)} LISTENED
        </>
      }
    >
      {/* 7-cell grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 12,
          padding: 20,
        }}
      >
        {CHAKRAS.map((c) => {
          const v = counts[c.id] ?? 0;
          const empty = v === 0;
          const status = empty
            ? 'sealed'
            : v >= 5
              ? 'flowing'
              : v >= 2
                ? 'open'
                : 'stirring';

          return (
            <div
              key={c.id}
              style={{
                borderRadius: 4,
                padding: '14px 12px',
                position: 'relative',
                overflow: 'hidden',
                border: empty
                  ? '1px solid rgba(239,68,68,0.35)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: empty
                  ? 'linear-gradient(180deg, rgba(239,68,68,0.04), #111)'
                  : '#111',
              }}
            >
              {/* DA'ATH badge for empty chakras */}
              {empty && (
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 10,
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 8,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase' as const,
                    padding: '2px 6px',
                    borderRadius: 2,
                    color: '#ef4444',
                    background: 'rgba(239,68,68,0.1)',
                  }}
                >
                  DA&apos;ATH
                </span>
              )}

              {/* Chakra dot + name */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase' as const,
                  color: '#6a6a6a',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: c.color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                {c.name}
              </div>

              {/* Hz */}
              <div
                style={{
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                  fontSize: 10,
                  marginTop: 2,
                  color: '#6a6a6a',
                }}
              >
                {c.hz} Hz
              </div>

              {/* Track count */}
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  lineHeight: 1,
                  marginTop: 8,
                  color: empty ? '#ef4444' : c.color,
                }}
              >
                {v}
                <span
                  style={{
                    fontFamily: 'Geist Mono, ui-monospace, monospace',
                    fontSize: 11,
                    marginLeft: 4,
                    color: '#6a6a6a',
                  }}
                >
                  tracks
                </span>
              </div>

              {/* Status text */}
              <div
                style={{
                  fontFamily: 'Geist Mono, ui-monospace, monospace',
                  fontSize: 9,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase' as const,
                  marginTop: 6,
                  color: '#6a6a6a',
                }}
              >
                {status}
              </div>

              {/* Mini waveform */}
              <div style={{ marginTop: 8 }}>
                <Waveform
                  variant="pulse"
                  height={18}
                  color={empty ? 'rgba(239,68,68,0.4)' : c.color}
                  seed={c.id}
                  samples={40}
                  animate={!empty}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
