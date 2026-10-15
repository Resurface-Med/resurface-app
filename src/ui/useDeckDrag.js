import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { visibleRows, projectGap, homeGap, sameSpot } from "../lib/deckOrder";

/*
 * Dragging decks to reorder and re-nest them.
 *
 * Pointer events, not HTML5 drag: four attempts on the native API died on a
 * dragover that refused the drop in silence. Here the whole thing is three
 * window listeners and one animation frame loop reading a session ref, and
 * every decision about where a deck lands is a pure function in
 * lib/deckOrder.js with tests.
 *
 *   pointerdown ── mouse: moves 5px ───┐
 *              └─ touch: holds 380ms ──┴─▶ dragging ──▶ dropping ──▶ idle
 *                 (moving first is a scroll, and lets it)  │
 *                                     Esc, cancel, blur ───┘ (back home)
 *
 * While dragging, the row lifts into a ghost that follows the pointer, a gap
 * the row's height opens where it would land, and every other row slides to
 * make room (FLIP, below). Open decks other than the dragged one's ancestors
 * fold away so far targets come closer; holding over a closed deck opens it;
 * the list scrolls when the pointer nears an edge.
 *
 * The dragged row is hidden, never unmounted: on touch, the finger's events
 * keep going to the element the touch began on, and one removed from the
 * document takes them with it.
 */

const LONG_PRESS = 380;
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 5;
const HOVER_OPEN = 650;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function scrollParent(el) {
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return document.scrollingElement || document.documentElement;
}

function translateY(el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return [0, 0];
  const m = new DOMMatrixReadOnly(t);
  return [m.m41, m.m42];
}

/**
 * FLIP for the rows: call snapshot() before a change, and after the render
 * every row that moved slides from where it was to where it is.
 *
 * Also keeps `layout` — each row's resting box relative to the container,
 * transforms taken out — which is what the drag hit-tests against, so a row
 * mid-slide is aimed at where it is going rather than where it is passing.
 */
export function useFlip(containerRef) {
  const snap = useRef(null);
  const layout = useRef([]);

  function snapshot(opts = {}) {
    const c = containerRef.current;
    if (!c) return;
    const at = new Map();
    for (const el of c.querySelectorAll("[data-flip-id]")) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) at.set(el.dataset.flipId, { top: r.top, left: r.left });
    }
    const scroller = scrollParent(c);
    snap.current = { at, scroller, scroll: scroller.scrollTop, ...opts };
  }

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const s = snap.current;
    snap.current = null;
    /* Scroll that happened between the snapshot and now has already been
       painted, so it is not motion to animate. Read before beforeMeasure,
       whose own scroll happens inside this frame and has not been. */
    const scrolled = s ? s.scroller.scrollTop - s.scroll : 0;
    s?.beforeMeasure?.();
    const cr = c.getBoundingClientRect();
    const list = [];
    const moves = [];
    for (const el of c.querySelectorAll("[data-flip-id]")) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      const [tx, ty] = translateY(el);
      const top = r.top - ty, left = r.left - tx;
      list.push({ id: el.dataset.flipId, top: top - cr.top, bottom: top - cr.top + r.height, left, el });
      if (s) moves.push({ el, id: el.dataset.flipId, top, left, visTop: r.top, visLeft: r.left });
    }
    layout.current = list;
    if (!s || reducedMotion()) return;
    for (const m of moves) {
      const was = s.at.get(m.id);
      for (const a of m.el.getAnimations?.() ?? []) if (a.id === "flip" || a.id === "flip-in") a.cancel();
      if (!was) {
        if (s.fadeNew !== false) {
          const a = m.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
          a.id = "flip-in";
        }
        continue;
      }
      const dx = was.left - m.left, dy = was.top - scrolled - m.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const a = m.el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 220, easing: EASE },
      );
      a.id = "flip";
    }
  });

  return { snapshot, layout };
}

/* ── The ghost ─────────────────────────────────────────────────────── */

/* A copy of the row with its computed styles inlined, so it looks the same
   outside the tree — the row's look depends on ancestors (.setup-col, the
   phone media rules) that the ghost, living in <body>, does not have. */
function inlineStyles(from, to) {
  const cs = getComputedStyle(from);
  for (let i = 0; i < cs.length; i++) to.style.setProperty(cs[i], cs.getPropertyValue(cs[i]));
  to.removeAttribute("class");
  to.removeAttribute("id");
  to.style.animation = "none";
  to.style.transition = "none";
  for (let i = 0; i < from.children.length; i++) inlineStyles(from.children[i], to.children[i]);
}

function makeGhost(row, rect, grabX, grabY) {
  const ghost = document.createElement("div");
  ghost.className = "deck-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  const lift = document.createElement("div");
  lift.className = "deck-ghost__lift";
  lift.style.transformOrigin = `${grabX}px ${grabY}px`;
  /* How far it rises over a deck it would go into: enough that its bottom
     edge clears the pointer, and so the row the pointer is in. */
  lift.style.setProperty("--into-rise", `${Math.round(rect.height - grabY + rect.height * 0.55)}px`);
  const clone = row.cloneNode(true);
  inlineStyles(row, clone);
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.querySelectorAll("[data-deck-id],[data-flip-id]").forEach(n => { n.removeAttribute("data-deck-id"); n.removeAttribute("data-flip-id"); });
  clone.removeAttribute("data-deck-id");
  clone.removeAttribute("data-flip-id");
  lift.appendChild(clone);
  ghost.appendChild(lift);
  document.body.appendChild(ghost);
  requestAnimationFrame(() => lift.classList.add("is-up"));
  return ghost;
}

const placeGhost = (g, x, y) => { g.style.transform = `translate3d(${x}px, ${y}px, 0)`; };

function settleGhost(g, to, { sink = false } = {}) {
  const lift = g.firstChild;
  lift?.classList.remove("is-up");
  if (reducedMotion()) return Promise.resolve();
  const from = g.style.transform;
  const end = sink
    ? `translate3d(${to.x}px, ${to.y}px, 0) scale(0.6)`
    : `translate3d(${to.x}px, ${to.y}px, 0)`;
  const a = g.animate(
    sink ? [{ transform: from, opacity: 1 }, { transform: end, opacity: 0 }] : [{ transform: from }, { transform: end }],
    { duration: sink ? 200 : 210, easing: EASE, fill: "forwards" },
  );
  return Promise.race([a.finished.catch(() => {}), new Promise(r => setTimeout(r, 450))]);
}

/* ── Session ───────────────────────────────────────────────────────── */

/* The click a release produces, and only that one. A mouse's arrives in the
   same task as its pointerup, so the guard comes down at the next tick; a
   finger's can come a little later, so it gets longer — but a guard left up
   for long eats the next real tap. */
function swallowNextClick(touch = false) {
  const stop = e => { e.stopPropagation(); e.preventDefault(); window.removeEventListener("click", stop, true); };
  window.addEventListener("click", stop, true);
  setTimeout(() => window.removeEventListener("click", stop, true), touch ? 350 : 0);
}

function pathTo(forest, id) {
  const trail = [];
  (function find(nodes) {
    for (const n of nodes) {
      trail.push(n.id);
      if (n.id === id || find(n.children)) return true;
      trail.pop();
    }
    return false;
  })(forest);
  return trail;
}

function findIn(forest, id) {
  for (const n of forest) {
    if (n.id === id) return n;
    const hit = findIn(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * view, while a drag is on: { dragId, gap, intoId, gapH, open }.
 * `gap` is where the deck would land ({ parentId, beforeId, depth, g });
 * `intoId` is a closed deck it would go into instead; `open` replaces the
 * tree's own open set for the duration.
 */
export function useDeckDrag({ containerRef, flip, forest, open, setOpen, base, rootParentId, enabled, onMove, indentPx = 26 }) {
  const [view, setView] = useState(null);
  const S = useRef(null);
  const latest = useRef(null);
  latest.current = { forest, open, base, rootParentId, onMove, enabled, setOpen };

  /* A non-passive touchmove on the tree itself, present from before any
     touch begins, so that once a drag is on the page can be told not to
     scroll. Added late, or on document, browsers may treat it as passive. */
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const block = e => { const s = S.current; if (s && s.phase !== "pending" && e.cancelable) e.preventDefault(); };
    c.addEventListener("touchmove", block, { passive: false });
    return () => c.removeEventListener("touchmove", block);
  }, [containerRef]);

  /* Whatever happens, never leave a ghost or listeners behind. */
  useEffect(() => () => { if (S.current) teardown(S.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Work that needs the render it asked for to have landed. */
  const afterRender = useRef(null);
  useLayoutEffect(() => {
    const run = afterRender.current;
    afterRender.current = null;
    run?.();
  });

  function rectOf(id) {
    const c = containerRef.current;
    const hit = flip.layout.current.find(it => it.id === id);
    if (!c || !hit) return null;
    const cr = c.getBoundingClientRect();
    return { top: cr.top + hit.top, left: hit.left, height: hit.bottom - hit.top, el: hit.el };
  }

  function onRowPointerDown(e, id) {
    if (!latest.current.enabled || S.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(".topic-expand, .deck-menu, input")) return;
    const touch = e.pointerType !== "mouse";
    const s = {
      phase: "pending", id, pointerId: e.pointerId, touch,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      row: e.currentTarget, acc: 0,
    };
    S.current = s;
    if (touch) {
      s.row.classList.add("is-pressing");
      s.timer = setTimeout(() => begin(s), LONG_PRESS);
    }
    s.listeners = {
      pointermove: ev => onPointerMove(s, ev),
      pointerup: ev => { if (ev.pointerId === s.pointerId) onPointerUp(s); },
      pointercancel: ev => { if (ev.pointerId === s.pointerId) onCancel(s); },
      keydown: ev => { if (ev.key === "Escape" && s.phase === "dragging") { ev.preventDefault(); ev.stopPropagation(); onCancel(s, true); } },
      blur: () => onCancel(s),
      visibilitychange: () => { if (document.hidden) onCancel(s); },
      contextmenu: ev => { if (s.phase !== "idle") ev.preventDefault(); },
    };
    for (const [k, fn] of Object.entries(s.listeners)) {
      (k === "visibilitychange" ? document : window).addEventListener(k, fn, k === "keydown" || k === "contextmenu" ? true : undefined);
    }
  }

  function teardown(s) {
    clearTimeout(s.timer);
    clearTimeout(s.hoverTimer);
    cancelAnimationFrame(s.raf);
    s.row?.classList.remove("is-pressing");
    for (const [k, fn] of Object.entries(s.listeners ?? {})) {
      (k === "visibilitychange" ? document : window).removeEventListener(k, fn, k === "keydown" || k === "contextmenu" ? true : undefined);
    }
    try { containerRef.current?.releasePointerCapture?.(s.pointerId); } catch { /* already gone */ }
    s.ghost?.remove();
    document.documentElement.classList.remove("is-deck-dragging");
    s.phase = "idle";
    if (S.current === s) S.current = null;
  }

  function onPointerMove(s, e) {
    if (e.pointerId !== s.pointerId) return;
    s.x = e.clientX; s.y = e.clientY;
    if (s.phase === "pending") {
      const far = Math.hypot(s.x - s.x0, s.y - s.y0);
      if (s.touch) { if (far > TOUCH_SLOP) teardown(s); }      // a scroll, not a drag
      else if (far > MOUSE_SLOP) begin(s);
      return;
    }
    if (s.phase === "dragging") placeGhost(s.ghost, s.x - s.grabX, s.y - s.grabY);
  }

  function begin(s) {
    if (S.current !== s || s.phase !== "pending") return;
    const { forest: f, open: o, rootParentId: rp } = latest.current;
    const home = homeGap(f, o, s.id, rp);
    const c = containerRef.current;
    if (!home || !c || !s.row.isConnected) { teardown(s); return; }
    clearTimeout(s.timer);
    s.row.classList.remove("is-pressing");

    const r = s.row.getBoundingClientRect();
    s.phase = "dragging";
    s.grabX = s.x0 - r.left;
    s.grabY = s.y0 - r.top;
    s.home = home;
    s.gap = home;
    s.into = null;
    s.startDepth = home.depth;
    s.padLeft = parseFloat(getComputedStyle(s.row).paddingLeft) || 0;
    s.scroller = scrollParent(c);
    /* Fold everything but the way down to the dragged deck. */
    s.open = new Set(pathTo(f, s.id).slice(0, -1));

    s.ghost = makeGhost(s.row, r, s.grabX, s.grabY);
    placeGhost(s.ghost, s.x - s.grabX, s.y - s.grabY);
    try { c.setPointerCapture(s.pointerId); } catch { /* pointer already up */ }
    document.documentElement.classList.add("is-deck-dragging");
    if (s.touch) navigator.vibrate?.(8);

    /* Folding moves rows; keep the gap under the finger while it does. */
    const startTop = r.top;
    flip.snapshot({
      beforeMeasure: () => {
        const gap = c.querySelector('[data-flip-id="__gap"]');
        if (gap) s.scroller.scrollTop += gap.getBoundingClientRect().top - startTop;
      },
    });
    setView({ dragId: s.id, gap: home, intoId: null, gapH: r.height, open: s.open });

    /* Nothing follows the pointer until it moves again. Folding can leave a
       different row under a finger that has not moved — the page cannot
       always scroll far enough to keep the gap there — and a lift and
       release in place must put the deck back exactly where it was. */
    s.armX = s.x; s.armY = s.y; s.armed = false;
    const frame = t => {
      if (s.phase !== "dragging") return;
      const dt = s.lastT ? Math.min(48, t - s.lastT) : 16;
      s.lastT = t;
      if (!s.armed && Math.hypot(s.x - s.armX, s.y - s.armY) > 6) s.armed = true;
      if (s.armed) {
        autoScroll(s, dt);
        hitTest(s);
      }
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  }

  function edges(s) {
    const sc = s.scroller;
    const vh = window.innerHeight;
    if (sc === document.scrollingElement || sc === document.documentElement) {
      /* A sticky dock over the bottom of the page hides rows, so the edge is
         its top, not the window's. */
      const dock = document.querySelector(".setup-next-dock");
      const dt = dock ? dock.getBoundingClientRect().top : vh;
      return { top: 0, bottom: Math.min(vh, dt > vh * 0.5 ? dt : vh) };
    }
    const r = sc.getBoundingClientRect();
    return { top: Math.max(0, r.top), bottom: Math.min(vh, r.bottom) };
  }

  function autoScroll(s, dt) {
    const { top, bottom } = edges(s);
    const zone = Math.min(s.touch ? 96 : 72, (bottom - top) / 4);
    let t = 0;
    if (s.y < top + zone) t = -Math.min(1, (top + zone - s.y) / zone);
    else if (s.y > bottom - zone) t = Math.min(1, (s.y - (bottom - zone)) / zone);
    if (!t) { s.acc = 0; return; }
    /* Eases in, so hovering near the edge creeps and pushing into it races. */
    const speed = 80 + 1500 * t * t;                  // px a second
    s.acc += Math.sign(t) * speed * dt / 1000;
    const whole = Math.trunc(s.acc);
    if (whole) { s.scroller.scrollTop += whole; s.acc -= whole; }
  }

  function hitTest(s) {
    const c = containerRef.current;
    if (!c) return;
    const { forest: f, base: b, rootParentId: rp } = latest.current;
    if (!findIn(f, s.id)) { onCancel(s); return; }          // the deck went away
    const rows = visibleRows(f, s.open, { excludeId: s.id, rootParentId: rp });
    const want = s.startDepth + Math.round((s.x - s.x0) / indentPx);
    const y = s.y - c.getBoundingClientRect().top;
    const L = flip.layout.current;

    let next = null, into = null;
    const hit = L.find(it => it.bottom > y);
    if (!hit) next = projectGap(rows, rows.length, want, b, rp);
    else if (hit.id === "__gap") next = projectGap(rows, s.gap.g, want, b, rp);
    else {
      const i = rows.findIndex(r => r.id === hit.id);
      if (i < 0) return;
      const R = rows[i];
      const f_ = (y - hit.top) / Math.max(1, hit.bottom - hit.top);
      const showsKids = R.isOpen && rows[i + 1]?.parentId === R.id;
      if (showsKids) next = projectGap(rows, f_ < 0.5 ? i : i + 1, want, b, rp);
      else if (f_ < 0.3) next = projectGap(rows, i, want, b, rp);
      else if (f_ > 0.7) next = projectGap(rows, i + 1, want, b, rp);
      else into = R.id;
    }

    /* Over a deck it would go into, the ghost rises so that deck shows. */
    s.ghost?.classList.toggle("is-into", Boolean(into));
    if (into) {
      if (s.into !== into) {
        s.into = into;
        clearTimeout(s.hoverTimer);
        const node = findIn(f, into);
        if (node && node.children.some(k => k.id !== s.id) && !s.open.has(into)) {
          s.hoverTimer = setTimeout(() => {
            if (s.phase !== "dragging" || s.into !== into) return;
            s.open = new Set(s.open).add(into);
            flip.snapshot();
            setView(v => v && { ...v, open: s.open });
          }, HOVER_OPEN);
        }
        setView(v => v && { ...v, intoId: into });
      }
      return;
    }
    if (s.into) {
      s.into = null;
      clearTimeout(s.hoverTimer);
      setView(v => v && { ...v, intoId: null });
    }
    if (!sameSpot(next, s.gap) || next.depth !== s.gap.depth || next.g !== s.gap.g) {
      s.gap = next;
      flip.snapshot();
      setView(v => v && { ...v, gap: next });
    }
  }

  function onPointerUp(s) {
    if (s.phase === "pending") { teardown(s); return; }      // a click: let it through
    if (s.phase !== "dragging") return;
    swallowNextClick(s.touch);
    land(s, s.into ? { parentId: s.into, beforeId: null, into: true } : s.gap);
  }

  function onCancel(s, keyboard = false) {
    if (s.phase === "pending") { teardown(s); return; }
    if (s.phase !== "dragging") return;
    /* Esc with the button still down: the release still produces a click. */
    if (keyboard) window.addEventListener("pointerup", () => swallowNextClick(s.touch), { once: true, capture: true });
    s.into = null;
    s.gap = s.home;
    flip.snapshot();
    setView(v => v && { ...v, gap: s.home, intoId: null });
    s.phase = "dropping";
    cancelAnimationFrame(s.raf);
    afterRender.current = () => fly(s, s.home);
  }

  function land(s, target) {
    s.phase = "dropping";
    cancelAnimationFrame(s.raf);
    clearTimeout(s.hoverTimer);
    fly(s, target);
  }

  /* The ghost travels to where the deck lands, then the deck is put there. */
  function fly(s, target) {
    const to = target.into ? rectOf(target.parentId) : rectOf("__gap");
    let p;
    if (!to) p = Promise.resolve();
    else if (target.into) {
      p = settleGhost(s.ghost, { x: to.left + 24, y: to.top + to.height * 0.2 }, { sink: true });
    } else {
      const gapPad = parseFloat(getComputedStyle(to.el).paddingLeft) || s.padLeft;
      p = settleGhost(s.ghost, { x: to.left + (gapPad - s.padLeft), y: to.top });
    }
    p.then(() => finish(s, target));
  }

  function finish(s, target) {
    if (s.phase !== "dropping") return;
    const { forest: f, onMove: move, setOpen: so } = latest.current;
    const moved = target.into || !sameSpot(target, s.home);
    const c = containerRef.current;
    const anchorId = target.into ? target.parentId : s.id;
    const anchorTop = rectOf(target.into ? target.parentId : "__gap")?.top ?? null;

    /* Open everything that was open, plus the way to where it landed. */
    const reopened = new Set(latest.current.open);
    if (target.parentId) pathTo(f, target.parentId).forEach(id => reopened.add(id));

    flip.snapshot({
      fadeNew: true,
      beforeMeasure: () => {
        if (anchorTop == null || !c) return;
        const el = c.querySelector(`[data-flip-id="${CSS.escape(anchorId)}"]`);
        if (el) s.scroller.scrollTop += el.getBoundingClientRect().top - anchorTop;
      },
    });
    if (moved) move?.(s.id, target.parentId, target.beforeId);
    so(reopened);
    setView(null);
    teardown(s);
    if (target.into && c) {
      requestAnimationFrame(() => {
        const el = c.querySelector(`[data-flip-id="${CSS.escape(target.parentId)}"]`);
        if (!el) return;
        el.classList.remove("is-received");
        void el.offsetWidth;
        el.classList.add("is-received");
        setTimeout(() => el.classList.remove("is-received"), 700);
      });
    }
  }

  return { view, onRowPointerDown };
}
