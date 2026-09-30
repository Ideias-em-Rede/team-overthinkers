import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ColumnBarDatum {
  k: string;
  v: number;
  color: string;
}

interface Props {
  titulo: string;
  subtitle?: string;
  data: ColumnBarDatum[];
  valueLabel?: string;
  height?: number;
  angleAt?: number;
}

export default function ColumnBar({
  titulo,
  subtitle,
  data,
  valueLabel = "participantes",
  height = 220,
  angleAt = 5,
}: Props) {
  const total = data.reduce((a, d) => a + d.v, 0);
  if (!data.length) {
    return (
      <div className="dist">
        <div className="dist__head">
          <h3 className="dist__title">{titulo}</h3>
        </div>
        <p className="muted">Sem dados.</p>
      </div>
    );
  }
  const angled = data.length > angleAt;
  return (
    <div className="dist">
      <div className="dist__head">
        <h3 className="dist__title">{titulo}</h3>
        <span className="muted">
          {subtitle ?? `${total.toLocaleString("pt-BR")} ${valueLabel} · ${data.length} categorias`}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis
            dataKey="k"
            stroke="#6b7a8f"
            fontSize={12}
            tickLine={false}
            interval={0}
            angle={angled ? -30 : 0}
            textAnchor={angled ? "end" : "middle"}
            height={angled ? 80 : 24}
          />
          <YAxis
            stroke="#6b7a8f"
            fontSize={12}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,119,182,0.06)" }}
            contentStyle={{
              border: "1px solid #e1e5ec",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [String(v), valueLabel]}
          />
          <Bar dataKey="v" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.k} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
