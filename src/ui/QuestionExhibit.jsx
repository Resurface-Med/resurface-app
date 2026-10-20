/**
 * A question's data exhibit (lib/exhibits), between the stem and the options.
 *
 * A lab printout or a 2×2 is a table, as the paper sets it, with the normal
 * ranges beside the results. An investigations list is the other paper
 * shape: "Investigations:" and then lines of results, two on a line when
 * the paper puts them there. A question can carry both, in order.
 *
 * No marks while answering — spotting what is abnormal is part of the
 * question. Once answered, the results the explanation turns on (rows
 * marked `key`; for a table, `keyRows`) are picked out quietly: a blue
 * mark at the start of the row and the result in blue (2026-10-20; a
 * yellow highlighter fill was too loud).
 */
function ExhibitBlock({ exhibit, answered }) {
  if (!exhibit) return null;
  const show = answered ? " is-answered" : "";

  if (exhibit.kind === "table") {
    const [head, ...rest] = [exhibit.columns ?? [], ...(exhibit.rows ?? [])];
    const keys = new Set(exhibit.keyRows ?? []);
    return (
      <figure className={`qx${show}`}>
        {exhibit.title && <figcaption className="qx__title">{exhibit.title}</figcaption>}
        <table className="qx__table is-grid">
          <thead><tr>{head.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rest.map((r, i) => (
              <tr key={i} className={keys.has(i) ? "is-key" : undefined}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
        {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
      </figure>
    );
  }

  if (exhibit.kind === "lines") {
    return (
      <figure className={`qx qx--lines${show}`}>
        {exhibit.title && <figcaption className="qx__title">{exhibit.title}</figcaption>}
        <ul className="qx__lines">
          {(exhibit.rows ?? []).map((line, i) => (
            <li key={i} className="qx__line">
              {(Array.isArray(line) ? line : []).map((r, j) => (
                <span key={j} className={`qx__item${r.key ? " is-key" : ""}`}>
                  {r.name}{" "}
                  <span className="is-result">{r.value}{r.unit ? ` ${r.unit}` : ""}</span>
                  {r.range ? <span className="qx__range"> ({r.range})</span> : null}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
      </figure>
    );
  }

  const rows = exhibit.rows ?? [];
  const hasRange = rows.some(r => r.range);
  return (
    <figure className={`qx${show}`}>
      {exhibit.title && <figcaption className="qx__title">{exhibit.title}</figcaption>}
      <table className="qx__table">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Result</th>
            {hasRange && <th scope="col">Normal range</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.key ? "is-key" : undefined}>
              <th scope="row">{r.name}</th>
              <td className="is-num is-result">{r.value}{r.unit ? ` ${r.unit}` : ""}</td>
              {hasRange && <td className="is-num">{r.range || "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
    </figure>
  );
}

export default function QuestionExhibit({ exhibit, answered = false }) {
  if (!exhibit) return null;
  const parts = Array.isArray(exhibit) ? exhibit : [exhibit];
  if (parts.length === 1) return <ExhibitBlock exhibit={parts[0]} answered={answered} />;
  return (
    <div className="qx-set">
      {parts.map((part, i) => <ExhibitBlock key={i} exhibit={part} answered={answered} />)}
    </div>
  );
}
