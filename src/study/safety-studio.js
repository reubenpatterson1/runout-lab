// @ts-check
import { safetyMode } from '../ui/router.js';
import { createSearchClient } from '../search/client.js';
import { createSessionStore } from '../ui/session-store.js';
import { defaultAim, aimPreview, handlePoint, handleSide, hitsHandle, aimFromDrag, aimKey, nudge } from '../ui/aim.js';
import { createSpinPad } from '../ui/spin-pad.js';
import { createSpeedControl, SPEED_DEFAULT } from '../ui/speed.js';
import { createTableView, ballStyles } from '../ui/table-view.js';
import { play } from '../ui/player.js';
import { PICK_PX, pickBall, clampToPlay, moveBall } from '../ui/ball-drag.js';
import { newSession, addDeal, applyReroll, recordShot, advance, usedIds, average, summary } from './safety-session.js';
import { controlState, openAction } from './safety-state.js';
import {
  GATE_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT, SHOT_ERROR_TEXT, SCORING_TEXT, NEW_SESSION_CONFIRM, COPIED_TEXT, EXAMPLE_LINKS,
  verdict, verdictTone, sessionVerdict, breakdownRows, familyName, statusLine, contextLine, noAltText, hintLines, announceText,
  tableLabel, dealLink, scoreCell, searchingText, cap,
} from './safety-copy.js';
import { MISSING_DEAL_TEXT } from '../deal/bank.js';

/** @typedef {import('./safety-session.js').SafetySession} SafetySession */
/** @typedef {import('../types.js').Layout} Layout */
/** @typedef {import('../types.js').SafetyScore} SafetyScore */
/** @typedef {import('../types.js').Scored} Scored */

const NUDGES = [
  { text: '↺ 1°', label: 'Rotate aim back 1 degree', delta: -1 },
  { text: '↺ 0.1°', label: 'Rotate aim back 0.1 degree', delta: -0.1 },
  { text: '↻ 0.1°', label: 'Rotate aim forward 0.1 degree', delta: 0.1 },
  { text: '↻ 1°', label: 'Rotate aim forward 1 degree', delta: 1 },
];

/**
 * @param {HTMLElement} el
 * @param {Record<string,string>} params
 * @returns {() => void}
 */
export function mount(el, params) {
  el.innerHTML = `
<div class="studio">
  <div class="area-status">
    <h1 class="screen-title" tabindex="-1">Safety Studio</h1>
    <p class="notice" role="status" hidden></p>
    <p class="status"></p>
  </div>
  <div class="area-table">
    <canvas class="felt" tabindex="0" role="img" hidden></canvas>
    <p class="table-msg"></p>
    <button type="button" class="btn" data-act="reload" hidden>Try again</button>
    <button type="button" class="btn" data-act="skip" hidden>Skip</button>
  </div>
  <div class="area-controls">
    <div class="aiming" hidden>
      <div class="nudges"></div>
      <div class="tip-speed"><div data-slot="spin"></div><div data-slot="speed"></div></div>
      <div class="shoot-row">
        <button type="button" class="btn active primary" data-act="shoot">Shoot</button>
        <button type="button" class="btn" data-act="secondary"></button>
      </div>
      <p class="noalt" hidden></p>
      <p class="links">Examples: <span data-slot="examples"></span></p>
      <p class="deal-link" hidden><span class="deal-id"></span> <button type="button" class="btn" data-act="copy">Copy link</button><span data-slot="linkbox"></span></p>
    </div>
    <div class="result" hidden>
      <div class="panel score-panel"></div>
      <div class="panel hint-panel" hidden></div>
      <div class="result-row">
        <button type="button" class="btn" data-act="retry">Retry</button>
        <button type="button" class="btn" data-act="hint">Show a good safety</button>
        <button type="button" class="btn" data-act="next"></button>
      </div>
      <div class="result-row"><button type="button" class="btn" data-act="try" hidden>Try this shot</button></div>
    </div>
    <div class="edit-row" hidden>
      <button type="button" class="btn" data-act="move">Move balls</button>
      <button type="button" class="btn active" data-act="done">Done</button>
      <button type="button" class="btn" data-act="restore">Restore layout</button>
    </div>
    <p class="sr-only" aria-live="polite"></p>
  </div>
</div>`;
  /** @param {string} sel @returns {any} */
  const q = (sel) => /** @type {any} */ (el.querySelector(sel));
  const studioEl = /** @type {HTMLElement} */ (q('.studio'));
  const noticeEl = /** @type {HTMLElement} */ (q('.notice'));
  const statusEl = /** @type {HTMLElement} */ (q('.status'));
  const canvas = /** @type {HTMLCanvasElement} */ (q('canvas.felt'));
  const msgEl = /** @type {HTMLElement} */ (q('.table-msg'));
  const reloadBtn = /** @type {HTMLButtonElement} */ (q('[data-act=reload]'));
  const skipBtn = /** @type {HTMLButtonElement} */ (q('[data-act=skip]'));
  const aimingEl = /** @type {HTMLElement} */ (q('.aiming'));
  const nudgesEl = /** @type {HTMLElement} */ (q('.nudges'));
  const shootBtn = /** @type {HTMLButtonElement} */ (q('[data-act=shoot]'));
  const secondaryBtn = /** @type {HTMLButtonElement} */ (q('[data-act=secondary]'));
  const noaltEl = /** @type {HTMLElement} */ (q('.noalt'));
  const dealLinkEl = /** @type {HTMLElement} */ (q('.deal-link'));
  const dealIdEl = /** @type {HTMLElement} */ (q('.deal-id'));
  const copyBtn = /** @type {HTMLButtonElement} */ (q('[data-act=copy]'));
  const linkboxEl = /** @type {HTMLElement} */ (q('[data-slot=linkbox]'));
  const resultEl = /** @type {HTMLElement} */ (q('.result'));
  const scorePanel = /** @type {HTMLElement} */ (q('.score-panel'));
  const hintPanel = /** @type {HTMLElement} */ (q('.hint-panel'));
  const retryBtn = /** @type {HTMLButtonElement} */ (q('[data-act=retry]'));
  const hintBtn = /** @type {HTMLButtonElement} */ (q('[data-act=hint]'));
  const nextBtn = /** @type {HTMLButtonElement} */ (q('[data-act=next]'));
  const tryBtn = /** @type {HTMLButtonElement} */ (q('[data-act=try]'));
  const editRowEl = /** @type {HTMLElement} */ (q('.edit-row'));
  const moveBtn = /** @type {HTMLButtonElement} */ (q('[data-act=move]'));
  const doneBtn = /** @type {HTMLButtonElement} */ (q('[data-act=done]'));
  const restoreBtn = /** @type {HTMLButtonElement} */ (q('[data-act=restore]'));
  const linksEl = /** @type {HTMLElement} */ (q('.links'));
  const liveEl = /** @type {HTMLElement} */ (q('.sr-only'));

  const examplesEl = /** @type {HTMLElement} */ (q('[data-slot=examples]'));
  EXAMPLE_LINKS.forEach((x, i) => {
    if (i) examplesEl.append(' · ');
    const a = document.createElement('a');
    a.setAttribute('href', '#/study/safety?example=' + x.slug);
    a.textContent = x.label;
    examplesEl.append(a);
  });

  let client = createSearchClient();
  const store = createSessionStore('study-safety', /** @type {SafetySession|null} */ (null));
  const view = createTableView(canvas);
  const aimRo = new ResizeObserver(() => { if (shown === 'ready' && working) { if (phase === 'aiming') drawAiming(); else if (phase === 'editing') drawEditing(); } });
  aimRo.observe(canvas);

  let gen = 0;
  /** @type {'session'|'deal'|'example'} */
  let screenMode = 'session';
  /** @type {SafetySession|null} */
  let session = null;
  /** @type {any} */
  let dealt = null;
  /** @type {Layout|null} */
  let working = null;
  let edited = false;
  /** @type {'aiming'|'result'|'editing'} */
  let phase = 'aiming';
  /** @type {null|'replay'|'search'|'load'} */
  let pending = null;
  /** @type {'loading'|'error'|'ready'|'summary'} */
  let shown = 'loading';
  let aim = 0;
  let spin = { x: 0, y: 0 };
  let speed = SPEED_DEFAULT;
  /** @type {SafetyScore|null} */
  let score = null;
  let counted = false;
  /** @type {Scored|null} */
  let hint = null;
  /** @type {string[]|null} */
  let hintText = null;
  /** @type {{skip: () => void, cancel: () => void}|null} */
  let player = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let labelTimer;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let copyTimer;
  /** @type {HTMLElement|null} */
  let summaryEl = null;
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let searchTimer;
  /** @type {HTMLElement|null} */
  let searchEl = null;
  let searchSecs = 0;
  /** @type {Scored|null} */
  let prevHint = null;
  /** @type {string[]|null} */
  let prevHintText = null;
  /** @type {{id: string, from: {x: number, y: number}, at: {x: number, y: number}}|null} */
  let editDrag = null;
  let dragging = false;
  let dragBack = false;
  /** @type {number|null} */
  let activePointer = null;

  const spinPad = createSpinPad(q('[data-slot=spin]'), { onChange: (s) => { spin = { x: s.x, y: s.y }; drawAiming(); } });
  const speedCtl = createSpeedControl(q('[data-slot=speed]'), { onChange: (v) => { speed = v; drawAiming(); } });

  /** @type {HTMLButtonElement[]} */
  const nudgeBtns = NUDGES.map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = n.text;
    b.setAttribute('aria-label', n.label);
    b.addEventListener('click', () => {
      if (!aimEnabled()) return;
      aim = nudge(aim, n.delta);
      aimChanged();
    });
    nudgesEl.append(b);
    return b;
  });

  /** @param {string} t */
  function setNotice(t) {
    noticeEl.textContent = t;
    noticeEl.hidden = t === '';
  }
  function stopSearchTimer() {
    clearInterval(searchTimer);
    searchTimer = undefined;
    searchEl = null;
  }
  function reviveIfDead() {
    if (!client.dead) return;
    client.terminate();
    client = createSearchClient();
  }
  function stopPlayer() {
    if (player) player.cancel();
    player = null;
  }
  function ctxNow() {
    const slot = session && screenMode === 'session' ? session.slots[session.slot] : null;
    return {
      mode: /** @type {'session'|'single'} */ (screenMode === 'session' ? 'session' : 'single'),
      phase,
      pending,
      scored: !!slot && slot.score !== null,
      noAlt: !!slot && slot.noAlt,
      last: !!session && session.slot === 9,
      edited,
      hintShot: hint !== null,
    };
  }
  function aimEnabled() {
    return shown === 'ready' && !!working && controlState(ctxNow()).aim === 'enabled';
  }
  /** @param {HTMLButtonElement} b @param {string} vis */
  function apply(b, vis) {
    b.hidden = vis === 'hidden';
    b.disabled = vis === 'disabled';
  }
  function cueBall() {
    return /** @type {import('../types.js').Ball} */ ((/** @type {Layout} */ (working)).balls.find((b) => b.id === (/** @type {Layout} */ (working)).cueId));
  }
  function handleNow() {
    const cue = cueBall();
    const k = view.pxPerIn;
    const back = dragging ? dragBack : handleSide(cue, aim, k);
    return handlePoint(cue, aim, k, back);
  }

  function drawAiming() {
    if (!working || shown !== 'ready' || phase !== 'aiming' || pending !== null || canvas.clientWidth === 0) return;
    const cue = cueBall();
    const pv = aimPreview(working, aim);
    view.draw({
      balls: working.balls,
      ...ballStyles(working.balls),
      aim: { from: cue, to: pv.end, ghost: pv.hitId ? pv.end : null },
      handle: handleNow(),
      highlight: working.rules.legalIds,
    });
  }
  /** @param {Layout} layout */
  function drawBalls(layout) {
    view.draw({ balls: layout.balls, ...ballStyles(layout.balls), highlight: layout.rules.legalIds });
  }
  function drawEditing() {
    if (!working || shown !== 'ready' || phase !== 'editing' || canvas.clientWidth === 0) return;
    if (!editDrag) { drawBalls(working); return; }
    const d = editDrag;
    drawBalls({ ...working, balls: working.balls.map((b) => (b.id === d.id ? { id: b.id, x: d.at.x, y: d.at.y } : b)) });
  }
  function aimChanged() {
    drawAiming();
    if (!working) return;
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => { if (working) canvas.setAttribute('aria-label', tableLabel(working, aim)); }, 250);
  }

  function renderScore() {
    scorePanel.replaceChildren();
    searchEl = null;
    if (pending === 'search') {
      const p = document.createElement('p');
      p.textContent = searchingText(searchSecs);
      searchEl = p;
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'btn';
      c.setAttribute('data-act', 'cancel');
      c.textContent = 'Cancel';
      scorePanel.append(p, c);
      return;
    }
    if (!score) {
      const p = document.createElement('p');
      p.textContent = SCORING_TEXT;
      scorePanel.append(p);
      return;
    }
    const h = document.createElement('p');
    h.className = 'verdict tone-' + verdictTone(score);
    h.textContent = score.gate ? GATE_TEXT[score.gate] : verdict(score.total);
    const t = document.createElement('p');
    t.className = 'total';
    t.textContent = `Score ${score.total}`;
    scorePanel.append(h, t);
    if (screenMode === 'session') {
      const c = document.createElement('p');
      c.className = 'context';
      c.textContent = contextLine(counted);
      scorePanel.append(c);
    }
    const rows = breakdownRows(score);
    if (rows.length) {
      const ul = document.createElement('ul');
      for (const r of rows) {
        const li = document.createElement('li');
        li.textContent = r;
        ul.append(li);
      }
      scorePanel.append(ul);
    }
  }
  function renderHint() {
    hintPanel.replaceChildren();
    hintPanel.hidden = hintText === null;
    if (!hintText) return;
    for (const line of hintText) {
      const p = document.createElement('p');
      p.textContent = line;
      hintPanel.append(p);
    }
  }

  function render() {
    const ready = shown === 'ready' && !!working;
    canvas.hidden = !ready;
    msgEl.hidden = ready;
    msgEl.textContent = shown === 'loading' ? LOADING_TEXT : shown === 'error' ? LOAD_ERROR_TEXT : '';
    reloadBtn.hidden = shown !== 'error';
    aimingEl.hidden = !ready || phase !== 'aiming';
    linksEl.hidden = pending !== null;
    resultEl.hidden = !ready || phase !== 'result';
    if (!ready) {
      statusEl.textContent = '';
      skipBtn.hidden = true;
      return;
    }
    const cs = controlState(ctxNow());
    const d = dealt;
    const x = screenMode === 'session'
      ? { mode: 'session', slot: /** @type {SafetySession} */ (session).slot, band: d.band, family: d.family, average: average(/** @type {SafetySession} */ (session)), edited }
      : screenMode === 'deal'
        ? { mode: 'deal', id: d.id, band: d.band, family: d.family, edited }
        : { mode: 'example', name: d.name, edited };
    statusEl.textContent = statusLine(x);
    apply(skipBtn, cs.skip);
    const aimOn = cs.aim === 'enabled';
    for (const b of nudgeBtns) b.disabled = !aimOn;
    spinPad.setDisabled(!aimOn);
    speedCtl.setDisabled(!aimOn);
    apply(shootBtn, cs.shoot);
    /** @type {'newLayout'|'next'|'startSession'|null} */
    const kind = cs.newLayout !== 'hidden' ? 'newLayout' : cs.next !== 'hidden' ? 'next' : cs.startSession !== 'hidden' ? 'startSession' : null;
    secondaryBtn.dataset.kind = kind ?? '';
    secondaryBtn.textContent = kind === 'newLayout' ? 'New layout' : kind === 'next' ? cs.nextLabel : 'Start a session';
    apply(secondaryBtn, kind ? cs[kind] : 'hidden');
    const slot = screenMode === 'session' && session ? session.slots[session.slot] : null;
    const noAlt = !!slot && slot.noAlt;
    noaltEl.hidden = !noAlt;
    noaltEl.textContent = noAlt && slot ? noAltText(slot.band) : '';
    dealLinkEl.hidden = d.id === undefined;
    dealIdEl.textContent = d.id === undefined ? '' : `Layout #${d.id}`;
    copyBtn.disabled = pending !== null;
    apply(retryBtn, cs.retry);
    apply(hintBtn, cs.hint);
    apply(nextBtn, cs.next);
    nextBtn.textContent = cs.nextLabel;
    apply(tryBtn, cs.tryShot);
    apply(moveBtn, cs.moveBalls);
    apply(doneBtn, cs.done);
    apply(restoreBtn, cs.restore);
    editRowEl.hidden = [cs.moveBalls, cs.done, cs.restore].every((v) => v === 'hidden');
    if (phase === 'result') renderScore();
    renderHint();
  }

  /** @param {any} entry the entry or example as received */
  function putOnScreen(entry) {
    dealt = {
      layout: entry.layout, best: entry.best ?? null, id: entry.id, family: entry.family, band: entry.band, name: entry.name,
    };
    working = structuredClone(dealt.layout);
    aim = defaultAim(working);
    spin = { x: 0, y: 0 };
    speed = SPEED_DEFAULT;
    spinPad.set(spin);
    speedCtl.set(speed);
    phase = 'aiming';
    pending = null;
    stopSearchTimer();
    edited = false;
    editDrag = null;
    score = null;
    counted = false;
    hint = null;
    hintText = null;
    shown = 'ready';
    linkboxEl.replaceChildren();
    clearTimeout(copyTimer);
    copyBtn.textContent = 'Copy link';
    canvas.setAttribute('aria-label', tableLabel(working, aim));
    render();
    drawAiming();
  }

  /** Request a layout. @param {() => Promise<any>} run @param {(r: any) => void} done */
  function fetchLayout(run, done) {
    const g = ++gen;
    stopPlayer();
    if (working && shown === 'ready') pending = 'load'; else shown = 'loading';
    render();
    run().then((r) => {
      if (g !== gen) return;
      done(r);
    }, (err) => {
      if (g !== gen || /** @type {Error} */ (err).message === 'terminated') return;
      pending = null;
      shown = 'error';
      working = null;
      reloadAction = () => {
        gen++;
        client.terminate();
        client = createSearchClient();
        fetchLayout(run, done);
      };
      render();
    });
  }
  /** @type {() => void} */
  let reloadAction = () => {};

  function dealCurrent() {
    const s = /** @type {SafetySession} */ (session);
    fetchLayout(
      () => client.deal(s.seed, s.slot, usedIds(s)).then((e) => { if (!e) throw new Error('no deal'); return e; }),
      (entry) => {
        session = addDeal(/** @type {SafetySession} */ (session), entry);
        store.save(session);
        putOnScreen(entry);
      },
    );
  }
  function newSessionFlow() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
    session = newSession(seed);
    store.save(session);
    working = null;
    dealCurrent();
  }
  function sessionOpen() {
    screenMode = 'session';
    const stored = store.load();
    const act = openAction(stored);
    if (act.kind === 'new') { newSessionFlow(); return; }
    session = /** @type {SafetySession} */ (stored);
    if (act.kind === 'summary') showSummary();
    else if (act.kind === 'deal') dealCurrent();
    else {
      fetchLayout(() => client.byId(act.id), (entry) => {
        if (!entry) {
          setNotice(MISSING_DEAL_TEXT);
          store.clear();
          newSessionFlow();
          return;
        }
        putOnScreen(entry);
      });
    }
  }
  function missingFallback() {
    setNotice(MISSING_DEAL_TEXT);
    history.replaceState(null, '', '#/study/safety');
    sessionOpen();
  }
  function open() {
    const m = safetyMode(params);
    if (m.mode === 'missing' || (m.mode === 'deal' && !Number.isSafeInteger(m.id))) { missingFallback(); return; }
    if (m.mode === 'deal') {
      screenMode = 'deal';
      const id = m.id;
      fetchLayout(() => client.byId(id), (entry) => { if (!entry) { missingFallback(); return; } putOnScreen(entry); });
    } else if (m.mode === 'example') {
      screenMode = 'example';
      const slug = m.slug;
      fetchLayout(() => client.example(slug), (entry) => { if (!entry) { missingFallback(); return; } putOnScreen(entry); });
    } else {
      sessionOpen();
    }
  }

  function showSummary() {
    shown = 'summary';
    studioEl.hidden = true;
    if (summaryEl) summaryEl.remove();
    const s = summary(/** @type {SafetySession} */ (session));
    const avg = /** @type {number} */ (s.average);
    const root = document.createElement('div');
    root.className = 'summary';
    const h1 = document.createElement('h1');
    h1.className = 'screen-title';
    h1.tabIndex = -1;
    h1.textContent = 'Safety Studio';
    const a = document.createElement('p');
    a.textContent = `Session average ${avg} · ${sessionVerdict(avg)}`;
    const g = document.createElement('p');
    g.textContent = `Good safeties: ${s.good}/10`;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const t of ['#', 'Family', 'Band', 'Your score', 'Best found']) {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = t;
      hr.append(th);
    }
    thead.append(hr);
    const tbody = document.createElement('tbody');
    for (const r of s.rows) {
      const tr = document.createElement('tr');
      const n = document.createElement('td');
      const link = document.createElement('a');
      link.setAttribute('href', '#/study/safety?deal=' + r.id);
      link.textContent = String(r.n);
      n.append(link);
      const cells = [familyName(r.family), cap(r.band), scoreCell(r), String(r.best)].map((t) => {
        const td = document.createElement('td');
        td.textContent = t;
        return td;
      });
      tr.append(n, ...cells);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn active';
    again.textContent = 'New session';
    again.addEventListener('click', () => {
      if (!window.confirm(NEW_SESSION_CONFIRM)) return;
      store.clear();
      root.remove();
      summaryEl = null;
      studioEl.hidden = false;
      shown = 'loading';
      working = null;
      newSessionFlow();
    });
    if (noticeEl.textContent === MISSING_DEAL_TEXT) {
      const n = document.createElement('p');
      n.className = 'notice';
      n.setAttribute('role', 'status');
      n.textContent = MISSING_DEAL_TEXT;
      root.append(n);
    }
    root.append(h1, a, g, table, again);
    summaryEl = root;
    el.append(root);
    h1.focus();
  }

  function shoot() {
    const g = ++gen;
    stopPlayer();
    setNotice('');
    hint = null;
    hintText = null;
    score = null;
    counted = false;
    pending = 'replay';
    render();
    const layout = /** @type {Layout} */ (working);
    const shot = { aimDeg: aim, speed, spin: { x: spin.x, y: spin.y } };
    let animDone = false;
    let scoreIn = false;
    const settle = () => {
      if (!animDone) return;
      phase = 'result';
      if (!scoreIn) { pending = 'load'; render(); return; }
      pending = null;
      render();
      liveEl.textContent = announceText(/** @type {SafetyScore} */ (score));
    };
    /** @param {unknown} err */
    const fail = (err) => {
      if (g !== gen || /** @type {Error} */ (err).message === 'terminated') return;
      gen++;
      reviveIfDead();
      stopPlayer();
      phase = 'aiming';
      pending = null;
      setNotice(SHOT_ERROR_TEXT);
      render();
      drawAiming();
    };
    client.simulate(layout, shot).then((sim) => {
      if (g !== gen) return;
      player = play(view, sim, { ...ballStyles(layout.balls), cueId: layout.cueId }, {
        onDone: () => { if (g !== gen) return; player = null; animDone = true; settle(); },
      });
    }, fail);
    client.score(layout, shot).then((sc) => {
      if (g !== gen) return;
      score = sc;
      const slot = session && screenMode === 'session' ? session.slots[session.slot] : null;
      if (session && screenMode === 'session' && !edited && slot && slot.score === null) {
        session = recordShot(session, sc);
        store.save(session);
        counted = true;
      } else {
        counted = false;
      }
      scoreIn = true;
      if (animDone) settle();
    }, fail);
  }

  function retry() {
    gen++;
    stopPlayer();
    phase = 'aiming';
    pending = null;
    render();
    drawAiming();
  }

  function suggestEdited() {
    const g = ++gen;
    stopPlayer();
    setNotice('');
    prevHint = hint;
    prevHintText = hintText;
    hint = null;
    hintText = null;
    pending = 'search';
    searchSecs = 0;
    stopSearchTimer();
    render();
    searchTimer = setInterval(() => {
      searchSecs++;
      if (searchEl) searchEl.textContent = searchingText(searchSecs);
    }, 1000);
    const layout = structuredClone(/** @type {Layout} */ (working));
    client.suggest(layout, null).then((res) => {
      if (g !== gen) return;
      stopSearchTimer();
      const best = /** @type {Scored|null} */ (res.best);
      if (!best) {
        pending = null;
        hintText = hintLines(null);
        render();
        return;
      }
      pending = 'replay';
      render();
      client.simulate(layout, best.shot).then((sim) => {
        if (g !== gen) return;
        player = play(view, sim, { ...ballStyles(layout.balls), cueId: layout.cueId }, {
          onDone: () => {
            if (g !== gen) return;
            player = null;
            pending = null;
            hint = best;
            hintText = hintLines(best);
            render();
          },
        });
      }, searchFail(g));
    }, searchFail(g));
  }
  /** @param {number} g */
  function searchFail(g) {
    return (/** @type {unknown} */ err) => {
      if (g !== gen || /** @type {Error} */ (err).message === 'terminated') return;
      stopSearchTimer();
      stopPlayer();
      reviveIfDead();
      pending = null;
      hint = prevHint;
      hintText = prevHintText;
      setNotice(SHOT_ERROR_TEXT);
      render();
    };
  }
  function cancelSearch() {
    gen++;
    stopSearchTimer();
    stopPlayer();
    client.terminate();
    client = createSearchClient();
    pending = null;
    hint = prevHint;
    hintText = prevHintText;
    render();
  }

  function enterEdit() {
    gen++;
    stopPlayer();
    setNotice('');
    phase = 'editing';
    render();
    drawEditing();
  }
  function leaveEdit() {
    editDrag = null;
    phase = 'aiming';
    render();
    drawAiming();
  }
  function restoreLayout() {
    gen++;
    stopPlayer();
    working = structuredClone(dealt.layout);
    edited = false;
    editDrag = null;
    hint = null;
    hintText = null;
    phase = 'aiming';
    pending = null;
    render();
    drawAiming();
  }

  function showHint() {
    if (edited) { suggestEdited(); return; }
    const best = dealt.best;
    if (!best) {
      hint = null;
      hintText = hintLines(null);
      render();
      return;
    }
    const g = ++gen;
    stopPlayer();
    hint = null;
    hintText = null;
    pending = 'replay';
    render();
    const layout = /** @type {Layout} */ (working);
    client.simulate(layout, best.shot).then((sim) => {
      if (g !== gen) return;
      player = play(view, sim, { ...ballStyles(layout.balls), cueId: layout.cueId }, {
        onDone: () => {
          if (g !== gen) return;
          player = null;
          pending = null;
          hint = best;
          hintText = hintLines(best);
          render();
        },
      });
    }, (err) => {
      if (g !== gen || /** @type {Error} */ (err).message === 'terminated') return;
      pending = null;
      setNotice(SHOT_ERROR_TEXT);
      render();
    });
  }

  function tryShot() {
    if (!hint) return;
    aim = hint.shot.aimDeg;
    speed = hint.shot.speed;
    spin = { x: hint.shot.spin.x, y: hint.shot.spin.y };
    spinPad.set(spin);
    speedCtl.set(speed);
    phase = 'aiming';
    render();
    aimChanged();
  }

  function reroll() {
    const s = /** @type {SafetySession} */ (session);
    const slot = s.slots[s.slot];
    const g = ++gen;
    stopPlayer();
    setNotice('');
    pending = 'load';
    render();
    client.reroll(s.seed, s.slot, slot.rerolls + 1, slot.id, usedIds(s)).then((res) => {
      if (g !== gen) return;
      session = applyReroll(/** @type {SafetySession} */ (session), res);
      store.save(session);
      if (res) putOnScreen(res);
      else { pending = null; render(); }
    }, (err) => {
      if (g !== gen || /** @type {Error} */ (err).message === 'terminated') return;
      pending = null;
      setNotice(LOAD_ERROR_TEXT);
      render();
    });
  }

  function next() {
    gen++;
    stopPlayer();
    setNotice('');
    session = advance(/** @type {SafetySession} */ (session));
    store.save(session);
    if (session.done) { showSummary(); return; }
    dealCurrent();
  }

  /** @param {string} link */
  function showLinkBox(link) {
    linkboxEl.replaceChildren();
    const input = document.createElement('input');
    input.readOnly = true;
    input.value = link;
    input.className = 'linkbox';
    input.setAttribute('aria-label', 'Layout link');
    linkboxEl.append(input);
    input.focus();
    input.select();
  }
  function copyLink() {
    if (dealt.id === undefined) return;
    const link = dealLink(location.href, dealt.id);
    if (!navigator.clipboard || !navigator.clipboard.writeText) { showLinkBox(link); return; }
    let p;
    try { p = navigator.clipboard.writeText(link); } catch { showLinkBox(link); return; }
    p.then(() => {
      copyBtn.textContent = COPIED_TEXT;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
    }, () => showLinkBox(link));
  }

  /** @param {string} act */
  function onAct(act) {
    if (act === 'shoot') shoot();
    else if (act === 'skip') { if (player) player.skip(); }
    else if (act === 'reload') reloadAction();
    else if (act === 'retry') retry();
    else if (act === 'hint') showHint();
    else if (act === 'try') tryShot();
    else if (act === 'copy') copyLink();
    else if (act === 'move') enterEdit();
    else if (act === 'done') leaveEdit();
    else if (act === 'restore') restoreLayout();
    else if (act === 'cancel') cancelSearch();
    else if (act === 'next') next();
    else if (act === 'secondary') {
      const kind = secondaryBtn.dataset.kind;
      if (kind === 'newLayout') reroll();
      else if (kind === 'next') next();
      else if (kind === 'startSession') location.hash = '#/study/safety';
    }
  }
  /** @param {Event} e */
  const onClick = (e) => {
    const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest('[data-act]'));
    if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
    onAct(/** @type {string} */ (b.dataset.act));
  };
  studioEl.addEventListener('click', onClick);

  /** @param {number} cx @param {number} cy */
  const hitAt = (cx, cy) => hitsHandle(handleNow(), view.toTable(cx, cy), view.pxPerIn);
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (e.button !== 0 || editDrag || dragging) return;
    if (phase === 'editing') {
      if (shown !== 'ready' || !working || pending !== null) return;
      const p = view.toTable(e.clientX, e.clientY);
      const id = pickBall(working.balls, p, PICK_PX / view.pxPerIn);
      if (id === null) return;
      const b = /** @type {import('../types.js').Ball} */ (working.balls.find((q) => q.id === id));
      editDrag = { id, from: { x: b.x, y: b.y }, at: clampToPlay(p) };
      activePointer = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
      drawEditing();
      return;
    }
    if (!aimEnabled() || !working || !hitAt(e.clientX, e.clientY)) return;
    dragging = true;
    activePointer = e.pointerId;
    dragBack = handleSide(cueBall(), aim, view.pxPerIn);
    canvas.setPointerCapture?.(e.pointerId);
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (e.pointerId !== activePointer) return;
    if (editDrag) {
      editDrag.at = clampToPlay(view.toTable(e.clientX, e.clientY));
      drawEditing();
      return;
    }
    if (!dragging || !working) return;
    aim = aimFromDrag(cueBall(), view.toTable(e.clientX, e.clientY), dragBack);
    aimChanged();
  };
  /** @param {PointerEvent} e */
  const onUp = (e) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    dragging = false;
    if (!editDrag || !working) return;
    const d = editDrag;
    editDrag = null;
    const next = e.type === 'pointerup' ? moveBall(working, d.id, view.toTable(e.clientX, e.clientY)) : null;
    if (next) {
      const nb = /** @type {import('../types.js').Ball} */ (next.balls.find((q) => q.id === d.id));
      if (nb.x !== d.from.x || nb.y !== d.from.y) {
        working = next;
        edited = true;
        hint = null;
        hintText = null;
        render();
      }
    }
    drawEditing();
  };
  /** @param {TouchEvent} e */
  const onTouch = (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (phase === 'editing') {
      if (shown === 'ready' && working && pending === null
        && pickBall(working.balls, view.toTable(t.clientX, t.clientY), PICK_PX / view.pxPerIn) !== null) e.preventDefault();
      return;
    }
    if (aimEnabled() && hitAt(t.clientX, t.clientY)) e.preventDefault();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (!aimEnabled()) return;
    const a = aimKey(aim, e.key, e.shiftKey);
    if (a === null) return;
    e.preventDefault();
    aim = a;
    aimChanged();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('touchstart', onTouch, { passive: false });
  canvas.addEventListener('keydown', onKey);

  render();
  open();

  return () => {
    gen++;
    stopPlayer();
    clearTimeout(labelTimer);
    clearTimeout(copyTimer);
    stopSearchTimer();
    studioEl.removeEventListener('click', onClick);
    client.terminate();
    spinPad.destroy();
    speedCtl.destroy();
    aimRo.disconnect();
    view.destroy();
  };
}
