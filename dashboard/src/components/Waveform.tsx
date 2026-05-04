"use client";
import { useId, useMemo } from "react";

type Variant = "bars" | "line" | "mirror" | "pulse";

type Props = {
  peaks?: number[];
  color?: string;
  colorAccent?: string;
  variant?: Variant;
  height?: number;
  progress?: number;
  animate?: boolean;
  seed?: string | number;
  samples?: number;
  className?: string;
};

export function Waveform({
  peaks,
  color = "#c084fc",
  colorAccent,
  variant = "bars",
  height = 48,
  progress,
  animate = false,
  seed = "wave",
  samples = 120,
  className,
}: Props) {
  const gradId = useId().replace(/:/g, "");
  const data = useMemo(() => peaks ?? generateMockPeaks(String(seed), samples), [peaks, seed, samples]);

  const width = 1000;
  const mid = height / 2;
  const playedSamples = progress != null ? Math.floor(data.length * progress) : data.length;

  if (variant === "line") {
    const path = data
      .map((p, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = mid - p * mid * 0.9;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${width} ${mid} L 0 ${mid} Z`} fill={`url(#${gradId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  if (variant === "pulse") {
    const path = data
      .map((p, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = mid + Math.sin((i / data.length) * Math.PI * 6) * (p * mid * 0.6);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height }}>
        <path d={path} fill="none" stroke={color} strokeWidth="1.4" opacity="0.9">
          {animate && <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2.4s" repeatCount="indefinite" />}
        </path>
      </svg>
    );
  }

  const barWidth = width / data.length;
  const isMirror = variant === "mirror" || variant === "bars";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={colorAccent ?? color} stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {data.map((p, i) => {
        const h = Math.max(1, p * height * 0.95);
        const x = i * barWidth;
        const y = isMirror ? mid - h / 2 : height - h;
        const isPlayed = i < playedSamples;
        return (
          <rect
            key={i}
            x={x + barWidth * 0.15}
            y={y}
            width={barWidth * 0.7}
            height={h}
            fill={isPlayed ? `url(#${gradId})` : color}
            opacity={isPlayed ? 1 : 0.25}
            rx={Math.min(0.6, barWidth * 0.3)}
          >
            {animate && (
              <animate
                attributeName="height"
                values={`${h};${h * 0.85};${h}`}
                dur={`${1.5 + (i % 7) * 0.1}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        );
      })}
    </svg>
  );
}

export function generateMockPeaks(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967295);
  };
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    const env = Math.sin((i / n) * Math.PI) * 0.7 + 0.3;
    const noise = rand() * 0.6 + 0.2;
    const detail = Math.sin(i * 0.4) * 0.15 + Math.sin(i * 1.3) * 0.1;
    peaks.push(Math.max(0.05, Math.min(1, env * noise + detail)));
  }
  return peaks;
}
