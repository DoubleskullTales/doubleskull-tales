/* The Pass Desk: range check plus the odds of a pass being caught, with re-rolls spent in the best order.
   Ranges per row (squares up/down from the thrower, 0-13): furthest square across for each band. */
(function () {
  var QMAX = [3, 3, 2, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
  var SMAX = [6, 6, 6, 6, 5, 4, 3, -1, -1, -1, -1, -1, -1, -1];
  var LMAX = [10, 10, 10, 9, 9, 8, 8, 7, 6, 4, 2, -1, -1, -1];
  var BMAX = [13, 13, 13, 12, 12, 11, 11, 10, 10, 9, 8, 6, 4, 2];
  var BANDS = {
    q: { name: 'Quick Pass', mod: 0 }, s: { name: 'Short Pass', mod: -1 },
    l: { name: 'Long Pass', mod: -2 }, b: { name: 'Long Bomb', mod: -3 }
  };
  function range(dx, dy) {
    var x = Math.abs(dx), y = Math.abs(dy);
    if (x < y) { var t = x; x = y; y = t; } // the chart is symmetric
    if (x > 13 || y > 13) return null;
    if (x === 0 && y === 0) return 't';
    if (x <= QMAX[y]) return 'q'; if (x <= SMAX[y]) return 's'; if (x <= LMAX[y]) return 'l'; if (x <= BMAX[y]) return 'b';
    return null;
  }

  // single D6 test: success on natural 6 or (not a 1 and roll + mod >= target)
  function test(target, mod) { var p = 0; for (var f = 2; f <= 6; f++) if (f === 6 || f + mod >= target) p++; return p / 6; }
  function need(target, mod) { var n = target - mod; return n <= 2 ? 2 : n >= 6 ? 6 : n; }

  var CATS = ['caught', 'dropped', 'intercepted', 'inaccurate', 'stumble', 'fumble'];
  var U = { caught: 1, stumble: 0.002, inaccurate: 0.001, dropped: 0, intercepted: 0, fumble: 0 };

  function calc(o) {
    var t = o.thrower || {}, c = o.catcher || {}, x = o.interceptor || {}, w = o.weather || '';
    var band = o.band, B = BANDS[band];
    if (!B) return null;
    if (w === 'blizzard' && (band === 'l' || band === 'b')) return { blocked: 'blizzard', band: band };

    var passMod = B.mod - (t.nos ? 0 : (t.marked || 0)) + ((t.accurate && (band === 'q' || band === 's')) ? 1 : 0) + ((t.cannoneer && (band === 'l' || band === 'b')) ? 1 : 0) - (w === 'sunny' ? 1 : 0) - (t.dp || 0);
    var catchMod = -(c.nos ? 0 : (c.marked || 0)) + (c.diving ? 1 : 0) + (c.extraArms ? 1 : 0) - (w === 'rain' ? 1 : 0) - (c.dp || 0);
    var intOn = !!o.intercept && !t.cloudBurster;
    var intBase = -(x.marked || 0) + (x.vll ? 2 : 0) + (x.extraArms ? 1 : 0) - (x.stunty ? 1 : 0) - (w === 'rain' ? 1 : 0) - (x.dp || 0);
    var pIntAcc = intOn ? test(x.ag || 3, intBase - 3) : 0, pIntInacc = intOn ? test(x.ag || 3, intBase - 2) : 0;
    var pCatch = test(c.ag || 3, catchMod);
    var PA = t.pa || 4, lonerT = t.loner ? (7 - t.loner) / 6 : 1, lonerC = c.loner ? (7 - c.loner) / 6 : 1;

    function face(f) { // result of one pass die
      if (f === 6 || (f !== 1 && f + passMod >= PA)) return 'acc';
      if (f === 1 || f + passMod <= 1) return (f === 1 && t.safePass) ? 'stumble' : 'fumble';
      return 'inacc';
    }
    function one(k) { var r = {}; CATS.forEach(function (q) { r[q] = 0; }); r[k] = 1; return r; }
    function mix(list) { var r = {}; CATS.forEach(function (q) { r[q] = 0; }); list.forEach(function (i) { CATS.forEach(function (q) { r[q] += i.w * i.d[q]; }); }); return r; }
    function eu(d) { var s = 0; CATS.forEach(function (q) { s += d[q] * U[q]; }); return s; }
    function best(list) { var b = list[0], v = eu(b); for (var i = 1; i < list.length; i++) { var e = eu(list[i]); if (e > v + 1e-12) { b = list[i]; v = e; } } return b; }

    // catch with team re-roll still available or not
    function catchDist(tr) {
      var hit = function (rest) { return mix([{ w: pCatch, d: one('caught') }, { w: 1 - pCatch, d: rest }]); };
      var opts = [hit(one('dropped'))];
      if (c.catchSkill) opts.push(hit(hit(one('dropped'))));
      if (tr) opts.push(hit(mix([{ w: lonerC, d: hit(one('dropped')) }, { w: 1 - lonerC, d: one('dropped') }])));
      return { d: best(opts) };
    }
    function afterResult(r, tr) {
      if (r === 'acc') {
        var cd = catchDist(tr).d;
        return mix([{ w: pIntAcc, d: one('intercepted') }, { w: 1 - pIntAcc, d: cd }]);
      }
      if (r === 'inacc') return mix([{ w: pIntInacc, d: one('intercepted') }, { w: 1 - pIntInacc, d: one('inaccurate') }]);
      return one(r);
    }
    // a pass die already rolled: keep it, or re-roll with Pass skill, Pro or the team re-roll
    function passDie(f, s) {
      var r = face(f), opts = [afterResult(r, s.tr)];
      if (r !== 'acc') {
        var fresh = function (st, chance) {
          var parts = [];
          for (var g = 1; g <= 6; g++) parts.push({ w: chance / 6, d: afterResult(face(g), st.tr) });
          if (chance < 1) parts.push({ w: 1 - chance, d: afterResult(r, st.tr) });
          return mix(parts);
        };
        if (t.passSkill) opts.push(fresh(s, 1));
        if (s.pro) opts.push(fresh({ tr: s.tr }, 4 / 6));
        if (s.tr) opts.push(fresh({ tr: false }, lonerT));
      }
      return best(opts);
    }
    function run(s) { var parts = []; for (var f = 1; f <= 6; f++) parts.push({ w: 1 / 6, d: passDie(f, s) }); return mix(parts); }

    var res = run({ tr: !!o.teamRR, pro: !!t.pro });
    var raw = (function () { var p = []; for (var f = 1; f <= 6; f++) p.push({ w: 1 / 6, d: afterResult(face(f), false) }); return mix(p); })();
    var pAcc = 0, pFum = 0; for (var f = 1; f <= 6; f++) { var r = face(f); if (r === 'acc') pAcc++; else if (r !== 'inacc') pFum++; }
    var fumbleTo = 1; for (var g = 2; g <= 5; g++) if (face(g) === 'fumble' || face(g) === 'stumble') fumbleTo = g;
    return {
      band: band, dist: res, raw: raw, complete: res.caught, rawComplete: raw.caught,
      turnover: res.dropped + res.intercepted + res.fumble + res.inaccurate,
      passNeed: need(PA, passMod), passNat6: PA - passMod > 6, fumbleTo: fumbleTo, pAccurate: pAcc / 6, pFumble: pFum / 6,
      catchNeed: need(c.ag || 3, catchMod), catchNat6: (c.ag || 3) - catchMod > 6, pCatch: pCatch,
      intOn: intOn, intNeed: need(x.ag || 3, intBase - 3), pIntAcc: pIntAcc, pIntInacc: pIntInacc, passMod: passMod, catchMod: catchMod
    };
  }


  // Throw Team-mate: Quick or Short only. Outcomes for the thrown player.
  var TCATS = ['target', 'feet', 'feetFumble', 'fell', 'eaten'];
  var TU = { target: 1.02, feet: 1, feetFumble: 0.1, fell: 0, eaten: -0.2 };
  function calcTTM(o) {
    var t = o.tthrower || {}, p = o.thrown || {}, band = o.band;
    if (band !== 'q' && band !== 's') return { blocked: 'ttm', band: band };
    var mod = (band === 's' ? -1 : 0) - (t.marked || 0) - (t.dp || 0) + (t.strongArm ? 1 : 0) - (o.weather === 'sunny' ? 1 : 0);
    var PA = t.pa || 4, AG = p.ag || 3, lonerT = t.loner ? (7 - t.loner) / 6 : 1, lonerP = p.loner ? (7 - p.loner) / 6 : 1;
    var landBase = -(p.marked || 0);
    function one(k) { var r = {}; TCATS.forEach(function (q) { r[q] = 0; }); r[k] = 1; return r; }
    function mix(list) { var r = {}; TCATS.forEach(function (q) { r[q] = 0; }); list.forEach(function (i) { TCATS.forEach(function (q) { r[q] += i.w * i.d[q]; }); }); return r; }
    function eu(d) { var v = 0; TCATS.forEach(function (q) { v += d[q] * TU[q]; }); return v; }
    function best(list) { var b = list[0], v = eu(b); for (var i = 1; i < list.length; i++) { var e = eu(list[i]); if (e > v + 1e-12) { b = list[i]; v = e; } } return b; }
    function face(f) { if (f === 6 || (f !== 1 && f + mod >= PA)) return 'superb'; if (f === 1 || f + mod <= 1) return 'fumbled'; return 'subpar'; }
    // landing test, team re-roll may still be there
    function land(kind, tr) {
      var m = landBase + (kind === 'superb' ? 0 : -1), pl = test(AG, m);
      var okCat = kind === 'superb' ? (t.bullseye ? 'target' : 'feet') : kind === 'subpar' ? 'feet' : 'feetFumble';
      var once = function (rest) { return mix([{ w: pl, d: one(okCat) }, { w: 1 - pl, d: rest }]); };
      var opts = [once(one('fell'))];
      var swoops = p.swoop && kind !== 'fumbled' && !(kind === 'superb' && t.bullseye);
      if (swoops) opts.push(once(once(one('fell')))); // Swoop: skip the scatter, re-roll the landing
      if (tr) opts.push(once(mix([{ w: lonerP, d: once(one('fell')) }, { w: 1 - lonerP, d: one('fell') }])));
      return best(opts);
    }
    function throwDie(f, s) {
      var r = face(f), opts = [land(r, s.tr)];
      if (r !== 'superb') {
        var fresh = function (st, chance) {
          var parts = []; for (var g = 1; g <= 6; g++) parts.push({ w: chance / 6, d: land(face(g), st.tr) });
          if (chance < 1) parts.push({ w: 1 - chance, d: land(r, st.tr) });
          return mix(parts);
        };
        if (s.pro) opts.push(fresh({ tr: s.tr }, 4 / 6));
        if (s.tr) opts.push(fresh({ tr: false }, lonerT));
      }
      return best(opts);
    }
    function throwRoll(s) { var parts = []; for (var f = 1; f <= 6; f++) parts.push({ w: 1 / 6, d: throwDie(f, s) }); return mix(parts); }
    function squirm(s) { return mix([{ w: 1 / 6, d: one('eaten') }, { w: 5 / 6, d: land('fumbled', s.tr) }]); }
    function run(s) {
      if (!t.hungry) return throwRoll(s);
      var parts = [{ w: 5 / 6, d: throwRoll(s) }];
      var opts = [squirm(s)];
      if (s.pro) opts.push(mix([{ w: 4 / 6, d: mix([{ w: 5 / 6, d: throwRoll({ tr: s.tr, pro: false }) }, { w: 1 / 6, d: squirm({ tr: s.tr, pro: false }) }]) }, { w: 2 / 6, d: squirm({ tr: s.tr, pro: false }) }]));
      if (s.tr) opts.push(mix([{ w: lonerT, d: mix([{ w: 5 / 6, d: throwRoll({ tr: false, pro: s.pro }) }, { w: 1 / 6, d: squirm({ tr: false, pro: s.pro }) }]) }, { w: 1 - lonerT, d: squirm({ tr: false, pro: s.pro }) }]));
      parts.push({ w: 1 / 6, d: best(opts) });
      return mix(parts);
    }
    var res = run({ tr: !!o.teamRR, pro: !!t.pro }), raw = run({ tr: false, pro: false });
    var fumbleTo = 1; for (var g = 2; g <= 5; g++) if (face(g) === 'fumbled') fumbleTo = g;
    return {
      ttm: true, band: band, dist: res, raw: raw,
      complete: res.target + res.feet, rawComplete: raw.target + raw.feet,
      throwNeed: need(PA, mod), throwNat6: PA - mod > 6, fumbleTo: fumbleTo,
      landNeedSuperb: need(AG, landBase), landNeedSub: need(AG, landBase - 1)
    };
  }

  var VERDICTS = [
    [85, 'Routine.', 'The crowd has already started cheering the touchdown.'],
    [70, 'Good odds.', 'Your receiver is waving. That is a good sign.'],
    [55, 'Worth a go.', 'Have a cage ready for when it lands somewhere else.'],
    [40, 'Hold your breath.', 'Somewhere, a commentator is clearing his throat.'],
    [25, 'Hopeful.', 'The ball has its own plans for the afternoon.'],
    [10, 'Prayer, not a pass.', 'Bring a towel for the tears.'],
    [0, 'Just run it.', 'Seriously. Run it.']
  ];
  var TVERDICTS = [
    [80, 'Smooth landing.', 'He even waves to the crowd on the way down.'],
    [60, 'Decent flight.', 'Pack a spare helmet, just in case.'],
    [40, 'Turbulence expected.', 'The little guy has stopped smiling.'],
    [20, 'Brace for impact.', 'His mum is watching from the stands.'],
    [0, 'Cancel the flight.', 'Some players are better kept on the ground.']
  ];
  function verdictT(p) { for (var i = 0; i < TVERDICTS.length; i++) if (p >= TVERDICTS[i][0]) return TVERDICTS[i]; return TVERDICTS[TVERDICTS.length - 1]; }
  function verdict(p) { for (var i = 0; i < VERDICTS.length; i++) if (p >= VERDICTS[i][0]) return VERDICTS[i]; return VERDICTS[VERDICTS.length - 1]; }

  var K_SK = ['strongArm', 'bullseye', 'hungry', 'pro'];
  var T_SK = ['passSkill', 'accurate', 'cannoneer', 'nos', 'safePass', 'pro', 'cloudBurster'], C_SK = ['catchSkill', 'diving', 'extraArms', 'nos'], X_SK = ['vll', 'extraArms', 'stunty'];
  function bits(obj, list) { return list.map(function (k) { return obj[k] ? 1 : 0; }).join(''); }
  function flags(str, list) { var r = {}; list.forEach(function (k, i) { r[k] = (str || '')[i] === '1'; }); return r; }
  function encode(o) {
    var t = o.thrower, c = o.catcher, x = o.interceptor, k = o.tthrower, p = o.thrown;
    return 'm=' + (o.mode === 'ttm' ? 'ttm' : 'pass') + '&sq=' + o.dx + '-' + o.dy + '&t=' + (t.pa || 4) + '.' + (t.marked || 0) + '.' + bits(t, T_SK) + '.' + (t.loner || 0) + '.' + (t.dp || 0) +
      '&c=' + (c.ag || 3) + '.' + (c.marked || 0) + '.' + bits(c, C_SK) + '.' + (c.loner || 0) + '.' + (c.dp || 0) +
      '&i=' + (o.intercept ? 1 : 0) + '.' + (x.ag || 3) + '.' + (x.marked || 0) + '.' + bits(x, X_SK) + '.' + (x.dp || 0) +
      '&k=' + (k.pa || 3) + '.' + (k.marked || 0) + '.' + bits(k, K_SK) + '.' + (k.loner || 0) + '.' + (k.dp || 0) +
      '&p=' + (p.ag || 3) + '.' + (p.marked || 0) + '.' + (p.loner || 0) + '.' + (p.swoop ? 1 : 0) +
      '&rr=' + (o.teamRR ? 1 : 0) + '&w=' + (o.weather || 'nice');
  }
  function decode(h) {
    var q = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(q.sq || ''); if (!m) return null;
    var cl = function (v, lo, hi, d) { v = +v; return v >= lo && v <= hi ? v : d; };
    var tp = (q.t || '').split('.'), cp = (q.c || '').split('.'), ip = (q.i || '').split('.'), kp = (q.k || '').split('.'), pp = (q.p || '').split('.');
    var lon = function (v) { v = +v; return v >= 2 && v <= 6 ? v : 0; };
    var th = flags(tp[2], T_SK); th.pa = cl(tp[0], 1, 6, 4); th.marked = cl(tp[1], 0, 4, 0); th.loner = lon(tp[3]); th.dp = cl(tp[4], 0, 3, 0);
    var ca = flags(cp[2], C_SK); ca.ag = cl(cp[0], 1, 6, 3); ca.marked = cl(cp[1], 0, 4, 0); ca.loner = lon(cp[3]); ca.dp = cl(cp[4], 0, 3, 0);
    var ic = flags(ip[3], X_SK); ic.ag = cl(ip[1], 1, 6, 3); ic.marked = cl(ip[2], 0, 4, 0); ic.dp = cl(ip[4], 0, 3, 0);
    var kt = flags(kp[2], K_SK); kt.pa = cl(kp[0], 1, 6, 3); kt.marked = cl(kp[1], 0, 4, 0); kt.loner = lon(kp[3]); kt.dp = cl(kp[4], 0, 3, 0);
    var tn = { ag: cl(pp[0], 1, 6, 3), marked: cl(pp[1], 0, 4, 0), loner: lon(pp[2]), swoop: pp[3] === '1' };
    var w = ['nice', 'sunny', 'rain', 'blizzard'].indexOf(q.w) >= 0 ? q.w : 'nice';
    return { mode: q.m === 'ttm' ? 'ttm' : 'pass', dx: cl(m[1], 0, 13, 4), dy: cl(m[2], 0, 13, 2), thrower: th, catcher: ca, intercept: ip[0] === '1', interceptor: ic, tthrower: kt, thrown: tn, teamRR: q.rr !== '0', weather: w };
  }

  var api = { range: range, calc: calc, calcTTM: calcTTM, test: test, verdict: verdict, encode: encode, decode: decode, BANDS: BANDS };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window === 'undefined') return;
  window.PassDesk = api;

  function init() {
    if (!document.getElementById('pd-app')) return;
    var $ = function (id) { return document.getElementById(id); };
    var st = { mode: 'pass', dx: 5, dy: 2, thrower: { pa: 3, marked: 0 }, catcher: { ag: 3, marked: 0 }, intercept: false, interceptor: { ag: 3, marked: 0 },
      tthrower: { pa: 4, marked: 0 }, thrown: { ag: 3, marked: 0 }, teamRR: true, weather: 'nice' };
    var fh = decode(location.hash); if (fh) st = fh;
    var pct = function (v) { v *= 100; return (v >= 99.95 || v < 0.05 || Math.abs(v - Math.round(v)) < 0.05) ? Math.round(v) + '%' : v.toFixed(1) + '%'; };
    var LABELS = { caught: 'Caught', dropped: 'Dropped', intercepted: 'Intercepted', inaccurate: 'Inaccurate (scatters)', stumble: 'Safe Pass: keeps the ball', fumble: 'Fumbled' };
    var TLABELS = { target: 'Lands in the target square (Bullseye)', feet: 'Lands on his feet', feetFumble: 'Fumbled, but lands on his feet', fell: 'Falls over', eaten: 'Eaten' };

    var grid = $('pd-grid'), h = '';
    for (var y = 13; y >= 0; y--) {
      h += '<span class="pd-ax">' + y + '</span>';
      for (var x = 0; x <= 13; x++) {
        var r = range(x, y), cls = r ? 'pd-' + (r === 'l' ? 'lp' : r) : 'pd-n', lab = r === 't' ? 'T' : r ? r.toUpperCase() : '';
        h += r && r !== 't' ? '<button type="button" class="pd-c ' + cls + '" data-b="' + r + '" data-x="' + x + '" data-y="' + y + '" aria-label="' + x + ' across, ' + y + ' up: ' + BANDS[r].name + '">' + lab + '</button>' : '<span class="pd-c ' + cls + '">' + lab + '</span>';
      }
    }
    h += '<span class="pd-ax"></span>'; for (var xx = 0; xx <= 13; xx++) h += '<span class="pd-ax">' + xx + '</span>';
    grid.innerHTML = h;
    grid.addEventListener('click', function (e) { var b = e.target.closest('button.pd-c'); if (!b || b.disabled) return; st.dx = +b.dataset.x; st.dy = +b.dataset.y; sync(); });

    var syncers = [];
    function bindSel(id, obj, key, isStr) {
      var el = $(id); if (!el) return;
      el.addEventListener('change', function () { obj()[key] = isStr ? el.value : +el.value; sync(); });
      syncers.push(function () { el.value = String(obj()[key] || (isStr ? '' : 0)); });
    }
    function bindBox(id, obj, key) { var el = $(id); if (!el) return; el.addEventListener('change', function () { obj()[key] = el.checked; sync(); }); syncers.push(function () { el.checked = !!obj()[key]; }); }
    var T = function () { return st.thrower; }, C = function () { return st.catcher; }, X = function () { return st.interceptor; }, K = function () { return st.tthrower; }, Pn = function () { return st.thrown; }, S = function () { return st; };
    bindSel('pd-pa', T, 'pa'); bindSel('pd-tm', T, 'marked'); bindSel('pd-tl', T, 'loner'); bindSel('pd-tdp', T, 'dp');
    bindSel('pd-ag', C, 'ag'); bindSel('pd-cm', C, 'marked'); bindSel('pd-cl', C, 'loner'); bindSel('pd-cdp', C, 'dp');
    bindSel('pd-iag', X, 'ag'); bindSel('pd-im', X, 'marked'); bindSel('pd-idp', X, 'dp');
    bindSel('pd-kpa', K, 'pa'); bindSel('pd-km', K, 'marked'); bindSel('pd-kl', K, 'loner'); bindSel('pd-kdp', K, 'dp');
    bindSel('pd-pag', Pn, 'ag'); bindSel('pd-pm', Pn, 'marked'); bindSel('pd-pl', Pn, 'loner');
    bindSel('pd-w', S, 'weather', true);
    T_SK.forEach(function (k) { bindBox('pd-t-' + k, T, k); });
    C_SK.forEach(function (k) { bindBox('pd-c-' + k, C, k); });
    X_SK.forEach(function (k) { bindBox('pd-i-' + k, X, k); });
    K_SK.forEach(function (k) { bindBox('pd-k-' + k, K, k); });
    bindBox('pd-p-swoop', Pn, 'swoop'); bindBox('pd-int', S, 'intercept'); bindBox('pd-rr', S, 'teamRR');
    document.querySelectorAll('[data-mode-btn]').forEach(function (b) { b.addEventListener('click', function () { st.mode = b.dataset.modeBtn; sync(); }); });

    function sync() {
      syncers.forEach(function (f) { f(); });
      var ttm = st.mode === 'ttm';
      document.querySelectorAll('[data-mode-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.modeBtn === st.mode)); });
      document.querySelectorAll('[data-only]').forEach(function (el) { el.hidden = el.dataset.only !== st.mode; });
      $('pd-intbox').classList.toggle('pd-off', !st.intercept);
      document.querySelectorAll('button.pd-c').forEach(function (b) {
        var off = ttm && (b.dataset.b === 'l' || b.dataset.b === 'b');
        b.disabled = off; b.classList.toggle('pd-dim', off);
        b.classList.toggle('pd-sel', +b.dataset.x === st.dx && +b.dataset.y === st.dy);
      });
      update();
    }
    function empty(verdictText, sub) {
      $('pd-pct').textContent = '-'; $('pd-verdict').textContent = verdictText; $('pd-sub').textContent = sub || '';
      $('pd-rows').innerHTML = ''; $('pd-needs').innerHTML = ''; $('pd-facts').innerHTML = ''; $('pd-bar').style.width = '0';
    }
    function rowsHtml(dist, cats, labels) {
      var out = '';
      cats.forEach(function (k) {
        if (dist[k] < 0.00005) return;
        out += '<li class="pd-row pd-r-' + k + '"><span class="pd-rl">' + labels[k] + '</span><span class="pd-rb"><span style="width:' + (dist[k] * 100) + '%"></span></span><span class="pd-rv">' + pct(dist[k]) + '</span></li>';
      });
      return out;
    }
    function update() {
      var band = range(st.dx, st.dy), ttm = st.mode === 'ttm';
      $('pd-where').textContent = st.dx + ' across, ' + st.dy + ' up';
      var bandName = band && BANDS[band] ? (ttm ? BANDS[band].name.replace('Pass', 'Throw') : BANDS[band].name) : 'Out of range';
      var bmod = band && BANDS[band] ? BANDS[band].mod : 0;
      $('pd-band').textContent = band && BANDS[band] ? bandName + (bmod ? ' (' + bmod + ')' : ' (no modifier)') : bandName;
      $('pd-biglabel').textContent = ttm ? 'Lands on his feet' : 'Caught';
      try { history.replaceState(null, '', '#' + encode(st)); } catch (e) {}
      if (!band || !BANDS[band]) return empty('Pick a square.');
      if (ttm) {
        var r = calcTTM({ band: band, tthrower: st.tthrower, thrown: st.thrown, teamRR: st.teamRR, weather: st.weather });
        if (r.blocked) return empty('Too far to throw a team-mate.', 'Throw Team-mate only works at Quick or Short range.');
        $('pd-pct').textContent = pct(r.complete);
        var v = verdictT(r.complete * 100); $('pd-verdict').textContent = v[1]; $('pd-sub').textContent = v[2];
        $('pd-bar').style.width = (r.complete * 100) + '%';
        var nd = '';
        if (st.tthrower.hungry) nd += '<li><span>Always Hungry</span><strong>2+</strong><em>on a 1 he tries to eat him: another 1 and he does</em></li>';
        nd += '<li><span>Throw</span><strong>' + (r.throwNat6 ? 'natural 6' : r.throwNeed + '+') + '</strong><em>' + (r.fumbleTo > 1 ? 'fumbles on 1 to ' + r.fumbleTo : 'fumbles on a 1') + '</em></li>';
        nd += '<li><span>Landing</span><strong>' + r.landNeedSuperb + '+</strong><em>after a superb throw, ' + r.landNeedSub + '+ after a subpar or fumbled one</em></li>';
        $('pd-needs').innerHTML = nd;
        $('pd-rows').innerHTML = rowsHtml(r.dist, TCATS, TLABELS);
        var reT = st.teamRR || st.tthrower.pro;
        $('pd-facts').innerHTML = (reT ? 'Without any re-rolls: <strong>' + pct(r.rawComplete) + '</strong> lands on his feet. ' : '') + (st.thrown.swoop ? 'With Swoop he skips the scatter and drifts D6 squares in a D6 direction instead, with a re-roll on the landing.' : st.tthrower.bullseye ? '' : 'Even a superb throw scatters three squares from the target before he lands.');
        return;
      }
      var o = { band: band, thrower: st.thrower, catcher: st.catcher, intercept: st.intercept, interceptor: st.interceptor, teamRR: st.teamRR, weather: st.weather };
      var rp = calc(o);
      if (rp.blocked) return empty('Not in a Blizzard.', 'Only Quick and Short Passes are allowed in a Blizzard.');
      $('pd-pct').textContent = pct(rp.complete);
      var vp = verdict(rp.complete * 100); $('pd-verdict').textContent = vp[1]; $('pd-sub').textContent = vp[2];
      $('pd-bar').style.width = (rp.complete * 100) + '%';
      var needs = '<li><span>Pass</span><strong>' + (rp.passNat6 ? 'natural 6' : rp.passNeed + '+') + '</strong><em>' + (rp.fumbleTo > 1 ? 'fumbles on 1 to ' + rp.fumbleTo : 'fumbles on a 1') + (st.thrower.safePass ? ' (a natural 1 keeps the ball)' : '') + '</em></li>';
      if (rp.intOn) needs += '<li><span>Interception</span><strong>' + (rp.intNeed >= 6 ? '6' : rp.intNeed + '+') + '</strong><em>on an accurate pass, ' + pct(rp.pIntAcc) + ' chance</em></li>';
      else if (st.intercept && st.thrower.cloudBurster) needs += '<li><span>Interception</span><strong>none</strong><em>Cloud Burster</em></li>';
      needs += '<li><span>Catch</span><strong>' + (rp.catchNat6 ? 'natural 6' : rp.catchNeed + '+') + '</strong><em>' + pct(rp.pCatch) + ' per attempt</em></li>';
      $('pd-needs').innerHTML = needs;
      $('pd-rows').innerHTML = rowsHtml(rp.dist, CATS, LABELS);
      var re = st.teamRR || st.thrower.passSkill || st.thrower.pro || st.catcher.catchSkill;
      $('pd-facts').innerHTML = re ? 'Without any re-rolls: <strong>' + pct(rp.rawComplete) + '</strong> caught' : 'No re-rolls in play.';
    }
    $('pd-share').addEventListener('click', function () {
      var url = location.href, btn = this, done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy link to this throw'; }, 1800); };
      var show = function () { var f = $('pd-link'); f.hidden = false; f.value = url; f.focus(); f.select(); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, show); else show();
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
