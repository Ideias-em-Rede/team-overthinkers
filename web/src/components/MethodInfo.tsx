import "./MethodInfo.css";

interface Props {
  label?: string;
  descricao: string;
  code?: string;
  codeLabel?: string;
  origem?: string;
  parametros?: Record<string, string | number>;
}

export default function MethodInfo({
  label = "ver método completo",
  descricao,
  code,
  codeLabel = "prompt",
  origem,
  parametros,
}: Props) {
  return (
    <details className="method-info">
      <summary className="method-info__trigger">ⓘ {label}</summary>
      <div className="method-info__content">
        <p className="method-info__desc">{descricao}</p>
        {parametros && (
          <div className="method-info__params">
            {Object.entries(parametros).map(([k, v]) => (
              <span key={k}>
                <code>{k}</code>={String(v)}
              </span>
            ))}
          </div>
        )}
        {code && (
          <>
            <div className="method-info__code-label">{codeLabel}</div>
            <pre className="method-info__code">{code}</pre>
          </>
        )}
        {origem && (
          <div className="method-info__origem">
            fonte: <code>{origem}</code>
          </div>
        )}
      </div>
    </details>
  );
}
