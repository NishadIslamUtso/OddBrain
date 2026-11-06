'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BreakdownRow } from '@/lib/types';

/**
 * Similarity per parameter, 0 to 100 percent.
 *
 * A bar at zero is real information, not a missing value: it means the site is
 * at least one tolerance band away from the target on that axis. Radiation and
 * pressure sit at zero for every Earth site, and the app says so.
 */
export default function SimilarityChart({ rows }: { rows: BreakdownRow[] }) {
  const data = rows.map((r) => ({
    label: r.label,
    pct: Math.round(r.similarity * 1000) / 10,
    zero: r.similarity === 0,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" fontSize={11} />
          <YAxis type="category" dataKey="label" width={128} fontSize={11} interval={0} />
          <Tooltip
            formatter={(value) => [`${value}%`, 'Similarity']}
            labelStyle={{ color: '#0f172a' }}
            contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
          />
          <ReferenceLine x={100} stroke="#94a3b8" />
          <Bar dataKey="pct" radius={[0, 2, 2, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.zero ? '#cbd5e1' : '#2563eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
