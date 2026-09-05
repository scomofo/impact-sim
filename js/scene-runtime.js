// Keep failures and background time in the optional renderer boundary.
export function createSceneLoop({ canvas, frame, onFailure,
  page = document, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  let stopped = false, pending = null, previous = null;
  function cancel() {
    if (pending !== null) cancelFrame(pending);
    pending = null;
    previous = null;
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    cancel();
    canvas.removeEventListener('webglcontextlost', contextLost);
    page.removeEventListener('visibilitychange', visibilityChanged);
  }
  function fail(error) {
    if (stopped) return;
    stop();
    onFailure(error);
  }
  function schedule() {
    if (!stopped && !page.hidden && pending === null) pending = requestFrame(tick);
  }
  function tick(now) {
    pending = null;
    if (stopped || page.hidden) { previous = null; return; }
    const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, 0.05));
    previous = now;
    try { frame(dt); } catch (error) { fail(error); return; }
    schedule();
  }
  function contextLost() { fail(new Error('WebGL context lost')); }
  function visibilityChanged() {
    cancel();
    schedule();
  }
  canvas.addEventListener('webglcontextlost', contextLost);
  page.addEventListener('visibilitychange', visibilityChanged);
  schedule();
  return { stop };
}
