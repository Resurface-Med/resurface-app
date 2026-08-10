import { useState, useEffect, useRef } from "react";

function playTone() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 660;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.start(t);
    osc.stop(t + 0.9);
  } catch {}
}

export const POMODORO_MODES = {
  work:       { label: "Focus",       duration: 25 * 60, color: "#3562F5", glow: "rgba(53,98,245,0.28)"  },
  shortBreak: { label: "Short Break", duration:  5 * 60, color: "#3ecf8e", glow: "rgba(62,207,142,0.3)"  },
  longBreak:  { label: "Long Break",  duration: 15 * 60, color: "#f6c54d", glow: "rgba(246,197,77,0.3)"  },
};


export function usePomodoro() {
  const [mode, setMode]         = useState("work");
  const [timeLeft, setTimeLeft] = useState(POMODORO_MODES.work.duration);
  const [running, setRunning]   = useState(false);
  const [count, setCount]       = useState(0);
  const [flash, setFlash]       = useState(false);
  const [toast, setToast]       = useState(null);

  const modeRef  = useRef("work");
  const countRef = useRef(0);
  modeRef.current  = mode;
  countRef.current = count;

  const startedAtRef = useRef(null);
  const startLeftRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    startedAtRef.current = Date.now();
    startLeftRef.current = timeLeft;

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const next    = Math.max(0, startLeftRef.current - elapsed);
      setTimeLeft(next);
      if (next === 0) {
        clearInterval(id);
        setRunning(false);
        doAdvance();
      }
    }, 500);

    return () => clearInterval(id);
  }, [running]); // eslint-disable-line

  function doAdvance() {
    playTone();
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);

    const m = modeRef.current;
    let nextMode;

    if (m === "work") {
      const nc = countRef.current + 1;
      setCount(nc);
      countRef.current = nc;
      nextMode = nc % 4 === 0 ? "longBreak" : "shortBreak";
      setToast({
        icon: nextMode === "longBreak" ? "🏆" : "🎉",
        title: nextMode === "longBreak" ? `${nc} sessions done!` : "Focus complete!",
        sub: nextMode === "longBreak"
          ? "Take a well-earned 15-minute break."
          : "Time for a 5-minute break.",
        actionLabel: nextMode === "longBreak" ? "Start long break" : "Start break",
        color: POMODORO_MODES[nextMode].color,
      });
    } else {
      nextMode = "work";
      setToast({
        icon: "💪",
        title: "Break's over!",
        sub: "Ready to focus again?",
        actionLabel: "Start focus",
        color: POMODORO_MODES.work.color,
      });
    }

    setMode(nextMode);
    modeRef.current = nextMode;
    setTimeLeft(POMODORO_MODES[nextMode].duration);
  }

  function toggle() {
    if (timeLeft === 0) return;
    setRunning(r => !r);
    // Request notification permission lazily without blocking the click
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setTimeout(() => Notification.requestPermission(), 100);
    }
  }

  function reset()  { setRunning(false); setTimeLeft(POMODORO_MODES[mode].duration); }
  function skip()   { setRunning(false); doAdvance(); }

  function switchMode(m) {
    setRunning(false);
    setMode(m);
    modeRef.current = m;
    setTimeLeft(POMODORO_MODES[m].duration);
    setToast(null);
  }

  function dismissToast()   { setToast(null); }
  function startFromToast() { setToast(null); setRunning(true); }

  return { mode, timeLeft, running, count, flash, toast, toggle, reset, skip, switchMode, dismissToast, startFromToast };
}
