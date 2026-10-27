import { useMemo } from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDateTime } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { AXIS_TICK, COLORS, mwTick, timeTicks, toSeries } from './chartUtils.js';

export default function ForecastActualChart({ rows, height = 340, brush = false }) {
  const data = useMemo(() => toSeries(rows), [rows]);
  const { ticks, formatter } = useMemo(() => timeTicks(rows), [rows]);

  return (
    <div style={{ height }} aria-label="Forecast versus actual wind generation chart" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={ticks}
            tickFormatter={formatter}
            tick={AXIS_TICK}
            stroke={COLORS.axis}
            tickLine={false}
          />
          <YAxis
            tickFormatter={mwTick}
            tick={AXIS_TICK}
            stroke={COLORS.axis}
            tickLine={false}
            axisLine={false}
            width={48}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.ink, fontSize: 11, offset: 8 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1 }} />
          <Legend verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            name="Actual generation (half-hourly)"
            type="monotone"
            dataKey="actual"
            stroke={COLORS.actual}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
          <Line
            name="Forecast (latest before cutoff, hourly)"
            type="monotone"
            dataKey="forecastLine"
            stroke={COLORS.forecast}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
          {brush && data.length > 96 && (
            <Brush dataKey="t" height={26} stroke={COLORS.forecast} tickFormatter={formatShortDateTime} travellerWidth={8} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
