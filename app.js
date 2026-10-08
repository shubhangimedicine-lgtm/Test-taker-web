(function () {
  'use strict';

  var Q = window.QUESTIONS;
  var BLOCK_SIZE = 20;
  var SEC_PER_Q = 75;
  var STORE = 'ttw-nbme-v1';

  var blocks = [];
  for (var i = 0; i < Q.length; i += BLOCK_SIZE) blocks.push(Q.slice(i, i + BLOCK_SIZE));

  var $app = document.getElementById('app');
  var $timer = document.getElementById('timer');
  var tick = null;

  // ---------- state ----------
  function fresh() { return { mode: 'pooled', blocks: {}, finished: false }; }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE)); if (s && s.blocks) return s; } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }
  var S = load();
  var view = { block: null, idx: 0 };

  function bs(b) {
    if (!S.blocks[b]) S.blocks[b] = { status: 'idle', answers: {}, flags: {} };
    return S.blocks[b];
  }

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function L(n) { return String.fromCharCode(65 + n); }
  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function clear() { while ($app.firstChild) $app.removeChild($app.firstChild); }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } $timer.classList.add('hidden'); }
  function blockScore(b) {
    var st = bs(b), c = 0;
    blocks[b].forEach(function (q) { if (st.answers[q.id] === q.a) c++; });
    return c;
  }

  // ---------- home ----------
  function home() {
    stopTick();
    view.block = null;
    clear();
    var doneCount = 0;
    blocks.forEach(function (_, b) { if (bs(b).status === 'done') doneCount++; });

    var intro = el('div', { class: 'card' }, [
      el('h1', { text: 'Timed question blocks' }),
      el('p', { class: 'mute', text: Q.length + ' questions in ' + blocks.length + ' blocks of up to ' + BLOCK_SIZE + '. Each question gets ' + SEC_PER_Q + ' seconds. The answer key and your % score appear only after you finish.' })
    ]);

    var modeBox = el('div', {}, [
      el('h2', { text: 'Timing mode' }),
      modeOpt('pooled', 'Block timer (recommended)', 'Each block has one countdown of ' + SEC_PER_Q + ' s × number of questions (' + (BLOCK_SIZE * SEC_PER_Q / 60) + ' min for ' + BLOCK_SIZE + ' questions). Move between questions freely and flag any to revisit.'),
      modeOpt('strict', 'Strict ' + SEC_PER_Q + ' s per question', 'Every question has its own ' + SEC_PER_Q + ' s clock and auto-advances when it runs out. No going back.')
    ]);
    intro.appendChild(modeBox);
    $app.appendChild(intro);

    var grid = el('div', { class: 'grid' });
    blocks.forEach(function (bq, b) {
      var st = bs(b);
      var label = st.status === 'done' ? 'Completed' : st.status === 'active' ? 'In progress' : 'Not started';
      var btn = el('button', {
        text: st.status === 'active' ? 'Resume' : st.status === 'done' ? 'Done' : 'Start',
        onclick: function () { startBlock(b); }
      });
      if (st.status === 'done') btn.disabled = true;
      grid.appendChild(el('div', { class: 'block' }, [
        el('b', { text: 'Block ' + (b + 1) }),
        el('span', { class: 'mute', text: 'Questions ' + bq[0].id + '–' + bq[bq.length - 1].id + ' · ' + fmt(bq.length * SEC_PER_Q * 1000) }),
        el('span', { class: 'badge' + (st.status === 'done' ? ' done' : ''), text: label }),
        btn
      ]));
    });
    $app.appendChild(grid);

    var foot = el('div', { class: 'card row sp', style: 'margin-top:16px' }, [
      el('span', { class: 'mute', text: doneCount + ' of ' + blocks.length + ' blocks completed' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'ghost', text: 'Reset all', onclick: function () { if (confirm('Erase all progress and answers?')) { S = fresh(); save(); home(); } } }),
        el('button', {
          text: doneCount === blocks.length ? 'See score & answer key' : 'End test & see score',
          onclick: function () {
            if (doneCount < blocks.length && !confirm('Not all blocks are finished. Unanswered / unattempted questions will count as incorrect. Continue?')) return;
            finishAll();
          }
        })
      ])
    ]);
    $app.appendChild(foot);
  }

  function modeOpt(val, title, desc) {
    var anyStarted = Object.keys(S.blocks).some(function (k) { return S.blocks[k].status !== 'idle'; });
    var inp = el('input', { type: 'radio', name: 'mode', value: val });
    if (S.mode === val) inp.checked = true;
    if (anyStarted) inp.disabled = true;
    inp.addEventListener('change', function () { S.mode = val; save(); });
    return el('label', { class: 'mode' }, [inp, el('span', {}, [el('b', { text: title }), el('br'), el('span', { class: 'mute', text: desc })])]);
  }

  // ---------- block run ----------
  function startBlock(b) {
    var st = bs(b);
    var now = Date.now();
    if (st.status === 'idle') {
      st.status = 'active';
      st.mode = S.mode;
      st.idx = 0;
      if (st.mode === 'pooled') st.endAt = now + blocks[b].length * SEC_PER_Q * 1000;
      else st.qEndAt = now + SEC_PER_Q * 1000;
      save();
    }
    view.block = b;
    if (st.mode === 'strict') syncStrict(b); else view.idx = view.idx || 0;
    if (st.mode === 'strict') view.idx = st.idx;
    else view.idx = 0;
    if (checkExpired(b)) return;
    render();
    stopTick();
    tick = setInterval(onTick, 250);
    onTick();
  }

  function syncStrict(b) {
    var st = bs(b), n = blocks[b].length, now = Date.now();
    while (st.qEndAt <= now && st.idx < n) {
      st.idx++;
      st.qEndAt += SEC_PER_Q * 1000;
    }
    save();
  }

  function checkExpired(b) {
    var st = bs(b), n = blocks[b].length, now = Date.now();
    if (st.mode === 'pooled' && now >= st.endAt) { endBlock(b, true); return true; }
    if (st.mode === 'strict') {
      syncStrict(b);
      if (st.idx >= n) { endBlock(b, true); return true; }
    }
    return false;
  }

  function onTick() {
    var b = view.block;
    if (b === null) return;
    var st = bs(b), now = Date.now();
    $timer.classList.remove('hidden');
    if (st.mode === 'pooled') {
      var rem = st.endAt - now;
      $timer.textContent = fmt(rem);
      $timer.classList.toggle('low', rem < 60000);
      if (rem <= 0) endBlock(b, true);
    } else {
      var before = st.idx;
      var remq = st.qEndAt - now;
      $timer.textContent = fmt(remq);
      $timer.classList.toggle('low', remq < 10000);
      if (remq <= 0) {
        syncStrict(b);
        if (st.idx >= blocks[b].length) { endBlock(b, true); return; }
        view.idx = st.idx;
        if (st.idx !== before) render();
      }
    }
  }

  function render() {
    var b = view.block, st = bs(b), bq = blocks[b], q = bq[view.idx];
    clear();
    var strict = st.mode === 'strict';

    var card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'qhead' }, [
      el('span', { text: 'Block ' + (b + 1) + ' · Question ' + (view.idx + 1) + ' of ' + bq.length }),
      el('span', { text: st.flags[q.id] ? '⚑ flagged' : '' })
    ]));
    if (q.img) card.appendChild(el('img', { class: 'qimg', src: q.img, alt: 'Figure for question ' + (view.idx + 1) }));
    card.appendChild(el('p', { class: 'qtext', text: q.q }));

    function pick(n) {
      if (st.answers[q.id] === n) delete st.answers[q.id]; else st.answers[q.id] = n;
      save();
      render();
    }

    if (q.cols) {
      var t = el('table', { class: 't' });
      var hr = el('tr', {}, [el('th', { text: '' })]);
      q.cols.forEach(function (c) { hr.appendChild(el('th', { text: c })); });
      t.appendChild(hr);
      q.o.forEach(function (row, n) {
        var tr = el('tr', { class: 'opt-r' + (st.answers[q.id] === n ? ' sel' : ''), onclick: function () { pick(n); } }, [el('td', { text: L(n) + ')' })]);
        row.forEach(function (c) { tr.appendChild(el('td', { text: c })); });
        t.appendChild(tr);
      });
      card.appendChild(t);
    } else {
      q.o.forEach(function (txt, n) {
        var inp = el('input', { type: 'radio', name: 'q' });
        if (st.answers[q.id] === n) inp.checked = true;
        card.appendChild(el('label', { class: 'opt' + (st.answers[q.id] === n ? ' sel' : ''), onclick: function (e) { e.preventDefault(); pick(n); } }, [
          inp, el('span', { class: 'l', text: L(n) + ')' }), el('span', { text: txt })
        ]));
      });
    }
    $app.appendChild(card);

    var last = view.idx === bq.length - 1;
    var ctl = el('div', { class: 'row sp' });
    var left = el('div', { class: 'row' });
    if (!strict) {
      var prev = el('button', { class: 'ghost', text: '← Previous', onclick: function () { view.idx--; render(); } });
      if (view.idx === 0) prev.disabled = true;
      left.appendChild(prev);
      left.appendChild(el('button', { class: 'ghost', text: st.flags[q.id] ? 'Unflag' : 'Flag', onclick: function () { if (st.flags[q.id]) delete st.flags[q.id]; else st.flags[q.id] = 1; save(); render(); } }));
    }
    var right = el('div', { class: 'row' });
    if (strict) {
      right.appendChild(el('button', { text: last ? 'Finish block' : 'Next →', onclick: function () {
        if (last) { if (confirm('Finish this block?')) endBlock(b, false); return; }
        st.idx++; st.qEndAt = Date.now() + SEC_PER_Q * 1000; view.idx = st.idx; save(); render(); onTick();
      } }));
    } else {
      if (!last) right.appendChild(el('button', { text: 'Next →', onclick: function () { view.idx++; render(); } }));
      right.appendChild(el('button', { class: last ? '' : 'ghost', text: 'Finish block', onclick: function () {
        var un = bq.filter(function (x) { return st.answers[x.id] === undefined; }).length;
        if (confirm(un ? un + ' question(s) unanswered. Finish block anyway?' : 'Finish this block?')) endBlock(b, false);
      } }));
    }
    ctl.appendChild(left); ctl.appendChild(right);
    $app.appendChild(ctl);

    if (!strict) {
      var nav = el('div', { class: 'nav' });
      bq.forEach(function (x, n) {
        var c = [];
        if (st.answers[x.id] !== undefined) c.push('ans');
        if (n === view.idx) c.push('cur');
        if (st.flags[x.id]) c.push('flag');
        nav.appendChild(el('button', { class: c.join(' '), text: String(n + 1), onclick: function () { view.idx = n; render(); } }));
      });
      $app.appendChild(nav);
    }
  }

  function endBlock(b, timedOut) {
    var st = bs(b);
    st.status = 'done';
    st.timedOut = !!timedOut;
    save();
    stopTick();
    view.block = null;
    clear();
    var bq = blocks[b];
    var answered = bq.filter(function (q) { return st.answers[q.id] !== undefined; }).length;
    var allDone = blocks.every(function (_, i) { return bs(i).status === 'done'; });
    $app.appendChild(el('div', { class: 'card' }, [
      el('h1', { text: 'Block ' + (b + 1) + ' complete' }),
      el('p', { text: (timedOut ? 'Time is up. ' : '') + 'You answered ' + answered + ' of ' + bq.length + ' questions.' }),
      el('p', { class: 'mute', text: 'Answers are revealed at the end of the whole test.' }),
      el('div', { class: 'row' }, [
        el('button', { text: allDone ? 'See score & answer key' : 'Back to blocks', onclick: function () { allDone ? finishAll() : home(); } })
      ])
    ]));
  }

  // ---------- results ----------
  function finishAll() {
    stopTick();
    S.finished = true;
    save();
    results();
  }

  function results() {
    clear();
    var total = Q.length, correct = 0, answered = 0;
    Q.forEach(function (q) {
      var b = Math.floor((q.id - 1) / BLOCK_SIZE);
      var a = bs(b).answers[q.id];
      if (a !== undefined) answered++;
      if (a === q.a) correct++;
    });
    var pct = Math.round((correct / total) * 1000) / 10;

    var sum = el('div', { class: 'card' }, [
      el('h1', { text: 'Your score' }),
      el('div', { class: 'score', text: pct + '%' }),
      el('p', { class: 'mute', text: correct + ' correct out of ' + total + ' · ' + answered + ' answered · ' + (total - answered) + ' unanswered (counted incorrect)' })
    ]);
    var bsum = el('div', { class: 'bsum' });
    blocks.forEach(function (bq, b) {
      var c = blockScore(b);
      bsum.appendChild(el('div', {}, [el('b', { text: 'Block ' + (b + 1) }), el('br'), el('span', { text: c + '/' + bq.length + ' · ' + Math.round(c / bq.length * 100) + '%' })]));
    });
    sum.appendChild(bsum);
    sum.appendChild(el('div', { class: 'row', style: 'margin-top:14px' }, [
      el('button', { class: 'ghost', text: 'Back to blocks', onclick: home }),
      el('button', { class: 'ghost', text: 'Retake everything', onclick: function () { if (confirm('Erase all answers and start over?')) { S = fresh(); save(); home(); } } })
    ]));
    $app.appendChild(sum);

    var key = el('div', { class: 'card' }, [el('h2', { text: 'Answer key' })]);
    var t = el('table', { class: 'key' });
    t.appendChild(el('tr', {}, [el('th', { text: 'Q' }), el('th', { text: 'Block' }), el('th', { text: 'Your answer' }), el('th', { text: 'Correct' }), el('th', { text: '' })]));
    Q.forEach(function (q) {
      var b = Math.floor((q.id - 1) / BLOCK_SIZE);
      var a = bs(b).answers[q.id];
      var ok = a === q.a;
      t.appendChild(el('tr', {}, [
        el('td', { text: String(q.id) }),
        el('td', { text: String(b + 1) }),
        el('td', { class: a === undefined ? 'u' : ok ? 'c' : 'w', text: a === undefined ? '—' : L(a) }),
        el('td', { text: L(q.a) }),
        el('td', { class: ok ? 'c' : a === undefined ? 'u' : 'w', text: ok ? '✓' : a === undefined ? 'unanswered' : '✗' })
      ]));
    });
    key.appendChild(t);
    $app.appendChild(key);
    window.scrollTo(0, 0);
  }

  // ---------- boot ----------
  if (S.finished) results();
  else {
    var active = null;
    blocks.forEach(function (_, b) { if (bs(b).status === 'active') active = b; });
    if (active !== null) startBlock(active); else home();
  }
})();
