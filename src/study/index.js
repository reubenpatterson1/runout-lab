// @ts-check

/**
 * @param {HTMLElement} el
 * @param {Record<string,string>} _params
 * @returns {() => void}
 */
export function mount(el, _params) {
  el.innerHTML = `
<div class="hero">
  <h1 class="title" tabindex="-1">Study</h1>
  <p class="lede">Simulated drills and theory at a desk or on your phone.</p>
</div>
<div class="grid g3">
  <a class="panel navcard" href="legacy/index.html#plan"><h2 class="sub">Diagnosis</h2><p class="note">Your two leaks and the training plan: why the last two balls and the 8 stall out, and the safety play that lets opponents back in.</p><div class="pillrow"><span class="pill good">start here</span></div></a>
  <a class="panel navcard" href="legacy/index.html#position"><h2 class="sub">Position Lab</h2><p class="note">Drag a cut shot and watch the tangent line, the 30° natural angle, and where draw/stun/follow send the cue ball. This is the engine behind never getting out of line.</p><div class="pillrow"><span class="pill chalk">90° rule</span><span class="pill amber">30° rule</span></div></a>
  <a class="panel navcard" href="legacy/index.html#closer"><h2 class="sub">The Closer</h2><p class="note">End-of-rack layouts. Pick your shot order, get graded against a model runout, and learn key-ball selection and breaking problems early.</p><div class="pillrow"><span class="pill">key ball</span><span class="pill">work backward</span></div></a>
  <a class="panel navcard" href="legacy/index.html#safety"><h2 class="sub">Safety Studio</h2><p class="note">Drag the cue ball into a hook and get a live score on the three safety ingredients. Learn what a tight, low-risk safety actually looks like.</p><div class="pillrow"><span class="pill">hide</span><span class="pill">distance</span><span class="pill">rail</span></div></a>
  <a class="panel navcard" href="legacy/index.html#escape"><h2 class="sub">Escape Trainer</h2><p class="note">Kick out of hooks with the mirror system and see where the cue ball really goes.</p><div class="pillrow"><span class="pill chalk">mirror system</span></div></a>
  <a class="panel navcard" href="legacy/index.html#decide"><h2 class="sub">Run or Safe?</h2><p class="note">Decision reps. Read a layout, commit to attack or defend, then check the reasoning a strong player would use.</p><div class="pillrow"><span class="pill">decisions</span></div></a>
</div>`;
  return () => {};
}
