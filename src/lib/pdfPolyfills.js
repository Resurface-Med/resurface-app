/*
 * What pdf.js 6 uses without checking, for browsers that lack it
 * (2026-11-13). Safari cannot loop over a ReadableStream with `for await`,
 * and pdf.js reads every page's text that way — so on any Mac or iPhone
 * every PDF failed with "undefined is not a function (near '...i of e...')".
 * Loaded on the page and, through pdfWorker.js, in the worker, which has
 * globals of its own.
 */

if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const values = function values({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const r = await reader.read();
          if (r.done) reader.releaseLock();
          return r;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value) {
        if (!preventCancel) {
          const cancelled = reader.cancel(value);
          reader.releaseLock();
          await cancelled;
        } else {
          reader.releaseLock();
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  if (!ReadableStream.prototype.values) ReadableStream.prototype.values = values;
  ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
}

/* pdf.js extends Iterator.prototype the moment it loads, and older Safari
   has no Iterator global at all, so the import itself threw. The prototype
   every built-in iterator shares is the one it means. */
if (typeof globalThis.Iterator === "undefined") {
  const proto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  const Iterator = function Iterator() {};
  Iterator.prototype = proto;
  globalThis.Iterator = Iterator;
}

/* Safari before 18.2 and Chrome before 128. */
if (typeof Promise.try !== "function") {
  Promise.try = function (fn, ...args) {
    return new this(resolve => resolve(fn(...args)));
  };
}

/* Safari before 17.4 and Chrome before 119. */
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new this((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
