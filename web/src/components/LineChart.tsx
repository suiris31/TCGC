import { useState } from 'react';
import { formatDate, formatEur } from '../api';

interface Point { date: string; value: number }

// Petit graphique SVG sans dépendance : courbe + survol/toucher pour lire une valeur
export function LineChart({ points, height = 140 }: { points: Point[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="muted small">L'historique se construit jour après jour, à chaque mise à jour des prix.</p>;
  }
  const width = 320;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max || 1;
  const x = (i: number) => pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - min) / span) * (height - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;
  const active = hover ?? points.length - 1;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((rel - pad.left) / (width - pad.left - pad.right)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div className="chart">
      <div className="chart-readout">
        <strong>{formatEur(points[active].value)}</strong>
        <span className="muted">{formatDate(points[active].date)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onPointerMove={onMove}
        onPointerLeave={() => setHover(null)} role="img" aria-label="Évolution de la valeur">
        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
        <line x1={x(active)} x2={x(active)} y1={pad.top} y2={height - pad.bottom} className="chart-cursor" vectorEffect="non-scaling-stroke" />
        <circle cx={x(active)} cy={y(points[active].value)} r="3.5" className="chart-dot" />
      </svg>
      <div className="chart-axis muted small">
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
