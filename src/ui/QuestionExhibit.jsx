import { usePref } from "../lib/prefs";

/**
 * A question's data exhibit (lib/exhibits): the results table an exam puts
 * between the stem and the options, plain, as the paper sets it.
 *
 * No high/low marks while answering — spotting what is abnormal is part of
 * the question. Once answered, the results the explanation turns on (rows
 * marked `key`; for a table, `keyRows`) are picked out, so the review
 * teaches which numbers to look at (2026-10-20).
 *
 * Exam mode (`hideRanges`, Profile › Preferences) leaves the normal-range
 * column out, as the UKMLA does; the ranges are a tap away in the lab
 * values panel, as the reference sheet is in the exam.
 */
export default function QuestionExhibit({ exhibit, answered = false, onOpenLabs = null }) {
  const hideRanges = usePref("hideRanges");
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
        {answered && keys.size > 0 && <p className="qx__keynote">Highlighted: the results this question turns on.</p>}
      </figure>
    );
  }

  const rows = exhibit.rows ?? [];
  const hasRange = !hideRanges && rows.some(r => r.range);
  const anyKey = rows.some(r => r.key);
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
              <td className="is-num">{r.value}{r.unit ? ` ${r.unit}` : ""}</td>
              {hasRange && <td className="is-num">{r.range || "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {exhibit.note && <p className="qx__note">{exhibit.note}</p>}
      {hideRanges && rows.some(r => r.range) && (
        <p className="qx__note">
          Normal ranges are in the{" "}
          {onOpenLabs
            ? <button type="button" className="gen-link" onClick={onOpenLabs}>lab values</button>
            : "lab values"}
          .
        </p>
      )}
      {answered && anyKey && <p className="qx__keynote">Highlighted: the results this question turns on.</p>}
    </figure>
  );
}
