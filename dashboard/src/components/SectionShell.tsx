'use client';

export function SectionShell({
  title,
  subtitle,
  meta,
  barColor = '#a3a3a3',
  goldEdge,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  barColor?: string;
  goldEdge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 4,
        border: goldEdge
          ? '1px solid rgba(201,164,73,0.25)'
          : '1px solid rgba(255,255,255,0.08)',
        background: '#0a0a0a',
        marginBottom: 16,
      }}
    >
      {/* Header bar */}
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
          {/* Vertical bar */}
          <span
            style={{
              width: 3,
              height: 14,
              background: goldEdge ? '#c9a449' : barColor,
              borderRadius: 1,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <strong style={{ color: '#fff', fontWeight: 500 }}>{title}</strong>
          {subtitle && (
            <>
              <span style={{ color: '#404040' }}>·</span>
              <span>{subtitle}</span>
            </>
          )}
        </div>
        {meta && (
          <div
            style={{
              fontFamily: 'Geist Mono, ui-monospace, monospace',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color: '#6a6a6a',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {meta}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
