/* The stops on the Practice "How many" slider (2026-11-21).
   With a pool of thousands, a 1…max track moved in jumps of dozens per
   pixel, so you could not land on 20. The track now walks a list of round
   numbers instead: every number to 20, then 25, 30 … 50, 60 … 100, 125 …
   200, 250 … 500, then hundreds, ending on the pool size ("All"). */
export function countStops(max) {
  const top = Math.max(1, Math.floor(max));
  const out = [];
  const add = n => { if (n < top && out[out.length - 1] !== n) out.push(n); };
  for (let n = 1; n <= 20; n++) add(n);
  for (let n = 25; n <= 50; n += 5) add(n);
  for (let n = 60; n <= 100; n += 10) add(n);
  for (let n = 125; n <= 200; n += 25) add(n);
  for (let n = 250; n <= 500; n += 50) add(n);
  for (let n = 600; n < top; n += 100) add(n);
  out.push(top);
  return out;
}

/* The stop nearest a count, so a typed 37 puts the thumb by 35 or 40. */
export function nearestStop(stops, value) {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
}
