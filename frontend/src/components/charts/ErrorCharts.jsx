import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCalendarDate, formatMWUnit } from '../../utils/format.js';
import ChartTooltip from './ChartTooltip.jsx';
import { AXIS_TICK, COLORS, mwTick, timeTicks, toEvaluationSeries } from './chartUtils.js';

const yAxisProps = {
  tickFormatter: mwTick,
  tick: AXIS_TICK,
  stroke: COLORS.axis,
  tickLine: false,
  axisLine: false,
  width: 48,
};

function useTimeAxis(rows) {
  return useMemo(() => {
    const evalRows = rows.filter((r) => r.status !== 'no_forecast_interval');
    return { data: toEvaluationSeries(rows), ...timeTicks(evalRows) };
  }, [rows]);
}

function xAxisProps(ticks, formatter) {
  return {
    dataKey: 't',
    type: 'number',
    scale: 'time',
    domain: ['dataMin', 'dataMax'],
    ticks,
    tickFormatter: formatter,
    tick: AXIS_TICK,
    stroke: COLORS.axis,
    tickLine: false,
  };
}

export function SignedErrorChart({ rows, height = 260 }) {
  const { data, ticks, formatter } = useTimeAxis(rows);
  return (
    <div style={{ height }} role="img" aria-label="Signed forecast error over time">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barCategoryGap={0}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis {...xAxisProps(ticks, formatter)} padding={{ left: 4, right: 4 }} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.15)' }} />
          <ReferenceLine y={0} stroke="#64748b" />
          <Bar dataKey="error" name="Signed error" isAnimationActive={false} minPointSize={0}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.error > 0 ? COLORS.over : COLORS.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AbsoluteErrorChart({ rows, mae, height = 240 }) {
  const { data, ticks, formatter } = useTimeAxis(rows);
  return (
    <div style={{ height }} role="img" aria-label="Absolute forecast error over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis {...xAxisProps(ticks, formatter)} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#94a3b8' }} />
          {mae != null && (
            <ReferenceLine
              y={mae}
              stroke="#0f1f38"
              strokeDasharray="4 4"
              label={{ value: `MAE ${formatMWUnit(mae)}`, position: 'insideTopRight', fill: '#0f1f38', fontSize: 11 }}
            />
          )}
          <Line
            dataKey="absError"
            name="Absolute error"
            stroke="#7c3aed"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimpleTooltip({ active, payload, title }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{title(p)}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="flex justify-between gap-6 text-slate-600">
          <span>{item.name}</span>
          <span className="num font-medium text-slate-900">{formatMWUnit(item.value, { signed: item.dataKey === 'bias' })}</span>
        </p>
      ))}
      <p className="mt-1 text-[11px] text-slate-500">{p.observations} matched intervals</p>
    </div>
  );
}

export function DailyErrorChart({ daily, height = 260 }) {
  const data = daily.filter((d) => d.observations > 0);
  return (
    <div style={{ height }} role="img" aria-label="Daily MAE and bias">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barGap={2}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="delivery_date"
            tickFormatter={(d) => d.slice(8)}
            tick={AXIS_TICK}
            stroke={COLORS.axis}
            tickLine={false}
          />
          <YAxis {...yAxisProps} />
          <ReferenceLine y={0} stroke="#64748b" />
          <Tooltip
            content={<SimpleTooltip title={(p) => formatCalendarDate(p.delivery_date)} />}
            cursor={{ fill: 'rgba(148,163,184,0.15)' }}
          />
          <Bar dataKey="mae" name="MAE" fill="#0f1f38" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="bias" name="Bias" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.delivery_date} fill={d.bias > 0 ? COLORS.over : COLORS.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourProfileChart({ profile, height = 240 }) {
  return (
    <div style={{ height }} role="img" aria-label="MAE by hour of day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={profile} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
            tick={AXIS_TICK}
            stroke={COLORS.axis}
            tickLine={false}
            interval={2}
          />
          <YAxis {...yAxisProps} />
          <Tooltip
            content={<SimpleTooltip title={(p) => `${String(p.hour).padStart(2, '0')}:00 UK`} />}
            cursor={{ fill: 'rgba(148,163,184,0.15)' }}
          />
          <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
