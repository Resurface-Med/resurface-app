/**
 * A question's data exhibit (lib/exhibits): the results table an exam puts
 * between the stem and the options. A lab sheet — the test, the result, the
 * normal range — with hairlines, the app's type, and numbers lined up.
 * No high/low marks: spotting what is abnormal is part of the question.
 */
export default function QuestionExhibit({ exhibit }) {
  if (!exhibit) return null;
  if (exhibit.kind === "table") {
    const [head, ...rest] = [exhibit.columns ?? [], ...(exhibit.rows ?? [])];
    return (
      <figure className="qx">
        {exhibit.title && <figcaption className="qx__title">{exhibit.title}</figcaption>}
        <table className="qx__table is-grid">
          <thead><tr>{head.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rest.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
        {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
      </figure>
    );
  }
  const hasRange = (exhibit.rows ?? []).some(r => r.range);
  return (
    <figure className="qx">
      {exhibit.title && <figcaption className="qx__title">{exhibit.title}</figcaption>}
      <table className="qx__table">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col" className="is-num">Result</th>
            {hasRange && <th scope="col" className="is-num">Normal range</th>}
          </tr>
        </thead>
        <tbody>
          {(exhibit.rows ?? []).map((r, i) => (
            <tr key={i}>
              <th scope="row">{r.name}</th>
              <td className="is-num is-value">{r.value}{r.unit ? <span className="qx__unit"> {r.unit}</span> : null}</td>
              {hasRange && <td className="is-num is-range">{r.range || "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
    </figure>
  );
}
