/* The Odds Desk: chance that a chain of D6 rolls succeeds, using re-rolls in the best order.
   Pure maths in OddsDesk.calc, UI wiring below (only runs if the page has #od-app). */
(function () {
  var TYPES = {
    d: { name: 'Dodge', skill: 'Dodge', once: true, def: 3 },
    r: { name: 'Rush', skill: 'Sure Feet', once: true, def: 2 },
    p: { name: 'Pick-up', skill: 'Sure Hands', once: false, def: 3 },
    c: { name: 'Catch', skill: 'Catch', once: false, def: 3 },
    t: { name: 'Pass', skill: 'Pass', once: false, def: 3 },
    o: { name: 'Other roll', skill: null, once: false, def: 4 }
  };

  // steps: [{type, target, skill}], opts: {teamRR, loner (0 = none), pro}
  function calc(steps, opts) {
    var n = steps.length, memo = {};
    var lonerP = opts.loner ? (7 - opts.loner) / 6 : 1;
    function p(i) { var t = Math.min(6, Math.max(2, steps[i].target)); return (7 - t) / 6; }
    function key(i, s) { return i + '|' + (s.tr ? 1 : 0) + (s.pro ? 1 : 0) + (s.dg ? 1 : 0) + (s.sf ? 1 : 0); }
    function next(s, ch) {
      return { tr: s.tr && ch !== 'team', pro: s.pro && ch !== 'pro', dg: s.dg && !(ch === 'skill' && s.used === 'd'), sf: s.sf && !(ch === 'skill' && s.used === 'r') };
    }
    // options when the first roll of step i fails: [{ch, w}] where w = chance the re-roll source works
    function options(i, s) {
      var st = steps[i], ty = TYPES[st.type], out = [{ ch: 'none', w: 0 }];
      if (st.skill && ty.skill && (st.type === 'd' ? s.dg : st.type === 'r' ? s.sf : true)) out.push({ ch: 'skill', w: 1 });
      if (s.tr) out.push({ ch: 'team', w: lonerP });
      if (s.pro) out.push({ ch: 'pro', w: 4 / 6 });
      return out;
    }
    function best(i, s) {
      if (i >= n) return { v: 1 };
      var k = key(i, s); if (memo[k]) return memo[k];
      var pi = p(i), ok = best(i + 1, s).v, opts2 = options(i, s), top = { ch: 'none', v: 0 };
      for (var j = 0; j < opts2.length; j++) {
        var o = opts2[j]; if (o.ch === 'none') continue;
        var ns = next({ tr: s.tr, pro: s.pro, dg: s.dg, sf: s.sf, used: steps[i].type }, o.ch);
        var v = o.w * pi * best(i + 1, ns).v;
        if (v > top.v + 1e-12) top = { ch: o.ch, v: v, ns: ns };
      }
      var res = { v: pi * ok + (1 - pi) * top.v, ch: top.ch, ns: top.ns };
      memo[k] = res; return res;
    }
    var start = { tr: !!opts.teamRR, pro: !!opts.pro, dg: true, sf: true };
    var total = n ? best(0, start).v : 1;

    // forward pass: chance to get through each step, and how often each re-roll gets used
    var dist = [{ s: start, m: 1 }], perStep = [], use = { team: 0, pro: 0, skill: 0 };
    for (var i = 0; i < n; i++) {
      var pi = p(i), nd = {}, reach = 0;
      dist.forEach(function (d) {
        var b = best(i, d.s), add = function (s, m) { var k = key(i + 1, s); if (nd[k]) nd[k].m += m; else nd[k] = { s: s, m: m }; reach += m; };
        add(d.s, d.m * pi);
        if (b.ch !== 'none') {
          use[b.ch] += d.m * (1 - pi);
          var w = b.ch === 'team' ? lonerP : b.ch === 'pro' ? 4 / 6 : 1;
          add(b.ns, d.m * (1 - pi) * w * pi);
        }
      });
      perStep.push(reach);
      dist = Object.keys(nd).map(function (k) { return nd[k]; });
    }
    var raw = 1; for (var q = 0; q < n; q++) raw *= p(q);
    return { total: total, raw: raw, perStep: perStep, use: use };
  }

  var VERDICTS = [
    [97, 'Book it.', 'Even the referee has stopped watching.'],
    [90, 'Safe as houses.', 'Old World houses, mind. Some of them catch fire.'],
    [75, "Bookies won't take this bet.", 'Go for it. Probably.'],
    [60, 'Decent odds.', 'Have a plan B anyway. And a plan C.'],
    [45, 'A coin flip with spikes on.', 'Half the crowd is already reaching for the popcorn.'],
    [30, 'Brave.', 'Your opponent is trying very hard not to smile.'],
    [15, 'This is how legends are made.', 'Most legends end in the injury box.'],
    [5, 'Highlight reel only.', 'If it works, nobody will ever let you forget it.'],
    [0, 'Warm up the apothecary.', 'And maybe write a short speech for the dugout.']
  ];
  function verdict(pct) { for (var i = 0; i < VERDICTS.length; i++) if (pct >= VERDICTS[i][0]) return VERDICTS[i]; return VERDICTS[VERDICTS.length - 1]; }

  // share code: d3s.r2.p3 ; skill flag "s"
  function encode(steps, o) {
    return 's=' + steps.map(function (s) { return s.type + s.target + (s.skill ? 's' : ''); }).join('.') + '&rr=' + (o.teamRR ? 1 : 0) + '&pro=' + (o.pro ? 1 : 0) + '&loner=' + (o.loner || 0);
  }
  function decode(h) {
    var q = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) q[a[0]] = decodeURIComponent(a[1] || ''); });
    if (!q.s) return null;
    var steps = q.s.split('.').map(function (c) { var m = /^([drpcto])([2-6])(s?)$/.exec(c); return m ? { type: m[1], target: +m[2], skill: !!m[3] && !!TYPES[m[1]].skill } : null; }).filter(Boolean).slice(0, 12);
    if (!steps.length) return null;
    var l = +q.loner; return { steps: steps, opts: { teamRR: q.rr !== '0', pro: q.pro === '1', loner: l >= 2 && l <= 6 ? l : 0 } };
  }

  var api = { calc: calc, verdict: verdict, encode: encode, decode: decode, TYPES: TYPES };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window === 'undefined') return;
  window.OddsDesk = api;

  function init() {
    var app = document.getElementById('od-app'); if (!app) return;
    var list = document.getElementById('od-steps'), MAX = 12;
    var state = { steps: [{ type: 'd', target: 3, skill: false }, { type: 'r', target: 2, skill: false }, { type: 'p', target: 3, skill: false }], opts: { teamRR: true, pro: false, loner: 0 } };
    var fromHash = decode(location.hash); if (fromHash) state = fromHash;
    var pct = function (x) { var v = x * 100; return (v >= 99.95 || v < 0.05 || Math.abs(v - Math.round(v)) < 0.05) ? Math.round(v) + '%' : v.toFixed(1) + '%'; };

    function render() {
      list.innerHTML = '';
      state.steps.forEach(function (st, i) {
        var ty = TYPES[st.type], li = document.createElement('li'); li.className = 'od-step';
        var h = '<span class="od-num">' + (i + 1) + '</span><span class="od-name">' + ty.name + '</span><span class="od-targets" role="group" aria-label="' + ty.name + ' needs">';
        for (var t = 2; t <= 6; t++) h += '<button type="button" class="od-t" data-i="' + i + '" data-t="' + t + '" aria-pressed="' + (st.target === t) + '">' + t + '+</button>';
        h += '</span>';
        h += ty.skill ? '<label class="od-skill"><input type="checkbox" data-i="' + i + '" ' + (st.skill ? 'checked' : '') + '> ' + ty.skill + '</label>' : '<span class="od-skill od-noskill">No skill re-roll</span>';
        h += '<span class="od-reach" id="od-reach-' + i + '"></span><button type="button" class="od-del" data-del="' + i + '" aria-label="Remove step ' + (i + 1) + '">&times;</button>';
        li.innerHTML = h; list.appendChild(li);
      });
      document.querySelectorAll('.od-add').forEach(function (b) { b.disabled = state.steps.length >= MAX; });
      document.getElementById('od-rr').checked = state.opts.teamRR;
      document.getElementById('od-pro').checked = state.opts.pro;
      document.getElementById('od-loner').value = String(state.opts.loner);
      document.getElementById('od-loner').disabled = !state.opts.teamRR;
      update();
    }

    function update() {
      var r = calc(state.steps, state.opts), big = document.getElementById('od-pct');
      big.textContent = state.steps.length ? pct(r.total) : '-';
      var v = verdict(r.total * 100);
      document.getElementById('od-verdict').textContent = state.steps.length ? v[1] : 'Add a roll to get the odds.';
      document.getElementById('od-sub').textContent = state.steps.length ? v[2] : '';
      document.getElementById('od-bar').style.width = (r.total * 100) + '%';
      var bits = [];
      if (state.steps.length) {
        bits.push('Without any re-rolls: <strong>' + pct(r.raw) + '</strong>');
        if (state.opts.teamRR) bits.push('Team re-roll needed: <strong>' + pct(r.use.team) + '</strong> of the time');
        if (state.opts.pro) bits.push('Pro needed: <strong>' + pct(r.use.pro) + '</strong> of the time');
      }
      document.getElementById('od-facts').innerHTML = bits.join('<br>');
      r.perStep.forEach(function (x, i) { var el = document.getElementById('od-reach-' + i); if (el) el.textContent = pct(x); });
      var code = encode(state.steps, state.opts);
      try { history.replaceState(null, '', '#' + code); } catch (e) {}
    }

    list.addEventListener('click', function (e) {
      var t = e.target.closest('.od-t'), d = e.target.closest('.od-del');
      if (t) { state.steps[+t.dataset.i].target = +t.dataset.t; render(); }
      if (d) { state.steps.splice(+d.dataset.del, 1); render(); }
    });
    list.addEventListener('change', function (e) {
      if (e.target.matches('input[type=checkbox]')) { state.steps[+e.target.dataset.i].skill = e.target.checked; update(); }
    });
    document.querySelectorAll('.od-add').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.steps.length >= MAX) return;
        var ty = b.dataset.type; state.steps.push({ type: ty, target: TYPES[ty].def, skill: false }); render();
      });
    });
    document.getElementById('od-clear').addEventListener('click', function () { state.steps = []; render(); });
    document.querySelectorAll('.od-preset').forEach(function (b) {
      b.addEventListener('click', function () { var d = decode('#' + b.dataset.code); if (d) { state = d; render(); } });
    });
    document.getElementById('od-rr').addEventListener('change', function (e) { state.opts.teamRR = e.target.checked; render(); });
    document.getElementById('od-pro').addEventListener('change', function (e) { state.opts.pro = e.target.checked; update(); });
    document.getElementById('od-loner').addEventListener('change', function (e) { state.opts.loner = +e.target.value; update(); });
    document.getElementById('od-share').addEventListener('click', function () {
      var url = location.href, btn = this, done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy link to these odds'; }, 1800); };
      var show = function () { var f = document.getElementById('od-link'); f.hidden = false; f.value = url; f.focus(); f.select(); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, show); else show();
    });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
