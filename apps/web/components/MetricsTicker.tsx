'use client';

const METRICS = [
  { label: 'Active workers', value: '12,847', accent: 'violet' as const },
  { label: 'Loans originated', value: '$2.4M', accent: 'cyan' as const },
  { label: 'Avg. APY', value: '8.2%', accent: null },
  { label: 'Work proofs', value: '48.2K', accent: null },
  { label: 'Default rate', value: '0.4%', accent: 'emerald' as const },
  { label: 'Chain', value: 'Base', accent: 'cyan' as const },
];

export function MetricsTicker() {
  return (
    <div className="synapse-ticker-wrap">
      <div className="synapse-ticker" aria-hidden>
        <div className="synapse-ticker-track">
          {METRICS.map((m, i) => (
            <div key={i} className="synapse-ticker-item">
              <span className="synapse-label synapse-ticker-label">{m.label}</span>
              <span
                className="synapse-ticker-value"
                data-accent={m.accent || undefined}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
        <div className="synapse-ticker-track" aria-hidden>
          {METRICS.map((m, i) => (
            <div key={`dup-${i}`} className="synapse-ticker-item">
              <span className="synapse-label synapse-ticker-label">{m.label}</span>
              <span
                className="synapse-ticker-value"
                data-accent={m.accent || undefined}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
