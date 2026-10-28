// Motion that means something.
//
// The app rebuilds the page on every change, so an entrance animation on the
// page replays on every tap and keystroke — which reads as flicker. Motion here
// is tied to the SCREEN instead: a render that lands on a new question, step or
// page animates in, from the side the reporter is travelling toward; a render
// that only updates the current screen does not move at all.

/** Identifies the screen being shown, ignoring everything that changes on it. */
export function screenKey(state) {
 if (!state) return '';
 const g = state.guide;
 const f = state.flow;
 return [
  state.view, state.step, state.askDetail ? 'ask' : '',
  g ? `g${g.index}` : '',
  state.ai ? `a${state.ai.turns?.length || 0}${state.ai.current ? 'q' : ''}${state.ai.done ? 'd' : ''}${state.ai.fallback ? 'f' : ''}` : '',
  state.analysisReview && !state.analysisReview.complete ? `r${state.analysisReview.page}` : '',
  state.step === 1 ? `q${state.qIndex}` : '',
  f ? `${f.section}:${f.phase}:${f.row ?? ''}:${f.page ?? ''}` : '',
 ].join('|');
}

/** A number that grows as the reporter moves forward, to tell forward from back. */
export function screenOrder(state) {
 if (!state) return 0;
 const views = { welcome: 0, home: 1, reports: 1, success: 9 };
 const g = state.guide ? 1 + (state.guide.index || 0) : state.ai ? 1 + (state.ai.turns?.length || 0) : 0;
 const r = state.analysisReview && !state.analysisReview.complete ? 1 + (state.analysisReview.page || 0) : 0;
 const f = state.flow ? (state.flow.phase === 'gate' ? 0 : 1 + (state.flow.page ?? 0)) : 0;
 return (views[state.view] ?? 1) * 1e7 + (state.step || 0) * 1e6 + g * 1e4 + r * 1e3 + (state.qIndex || 0) * 50 + f;
}

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * Marks the freshly rendered screen for its entrance. Synchronous on purpose:
 * callers move focus right after rendering, and an asynchronous transition
 * would move it before the new screen exists.
 */
export function markEntrance(root, direction) {
 if (reduced() || !root) return;
 const content = root.querySelector('.content');
 if (!content) return;
 content.classList.add('screen-enter');
 content.dataset.nav = direction;
}

/** A light tap on the phones that support it. Never required, never loud. */
export function tick() {
 if (reduced()) return;
 try { navigator.vibrate?.(8); } catch {}
}
