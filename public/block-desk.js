/* The Block Desk: what happens when you throw a block. Exact maths over every dice result,
   with re-rolls spent in the best order for your goal. UI wiring only runs if #bd-app exists. */
(function () {
  // faces: 0 attacker down, 1 both down, 2 push, 3 push, 4 stumble, 5 pow
  var CATS = ['def', 'both', 'prone', 'push', 'none', 'att'];
  var UTIL = {
    hit: { def: 1000, prone: 200, push: 100, none: 99, both: 50, att: 0 },
    safe: { def: 1001, prone: 1000.5, push: 1000.2, none: 1000.1, both: 1, att: 0 }
  };
  var DEF_RANK = { att: 0, none: 1, push: 2, prone: 3, both: 4, def: 5 }; // lower = better for the defender

  function diceFor(aSt, dSt) {
    if (aSt === dSt) return { n: 1, attPicks: true };
    if (aSt > dSt) return { n: aSt > 2 * dSt ? 3 : 2, attPicks: true };
    return { n: dSt > 2 * aSt ? 3 : 2, attPicks: false };
  }

  // armour + injury for a knocked-down defender. mb = Mighty Blow bonus (armour, or injury if armour breaks without it)
  function hurt(o) {
    var a = o.a || {}, d = o.d || {}, av = o.av || 9, mb = a.mightyBlow ? (o.mb || 1) : 0;
    var r = { broken: 0, ko: 0, cas: 0 }, P = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    function injury(roll) { // returns 'stun' | 'ko' | 'cas'
      if (d.stunty) { if (roll >= 9) return 'cas'; if (roll >= 8) return 'ko'; if (roll >= 7) return d.thickSkull ? 'stun' : 'ko'; return 'stun'; }
      if (roll >= 10) return 'cas'; if (roll >= 9) return 'ko'; if (roll >= 8) return d.thickSkull ? 'stun' : 'ko'; return 'stun';
    }
    for (var x = 2; x <= 12; x++) {
      var pa = P[x] / 36, broke = x >= av || (a.claw && x >= 8), left = mb;
      if (!broke && mb && x + mb >= av) { broke = true; left = 0; }
      if (!broke) continue;
      r.broken += pa;
      for (var y = 2; y <= 12; y++) {
        var res = injury(Math.min(12, y + left)), pi = P[y] / 36;
        if (res === 'ko') r.ko += pa * pi; else if (res === 'cas') r.cas += pa * pi;
      }
    }
    return r;
  }

  function calc(o) {
    var a = o.a || {}, d = o.d || {}, U = UTIL[o.goal === 'safe' ? 'safe' : 'hit'];
    var horns = !!(a.horns && o.blitz), jugg = !!(a.juggernaut && o.blitz), frenzy = !!a.frenzy;
    var dc = diceFor(o.aSt + (horns ? 1 : 0), o.dSt), n = dc.n;
    var lonerP = o.loner ? (7 - o.loner) / 6 : 1;
    var canBrawl = !!a.brawler && !o.blitz;

    // Both Down: attacker picks among what his skills allow, then the defender may Wrestle (not against Juggernaut on a Blitz)
    var bdBase = a.block ? (d.block ? 'none' : 'def') : (d.block ? 'att' : 'both');
    var bdOpts = [bdBase]; if (jugg) bdOpts.push('push'); if (a.wrestle) bdOpts.push('prone');
    var bd = bdOpts.reduce(function (b, c) { return U[c] > U[b] ? c : b; }, bdBase);
    if (d.wrestle && !jugg && DEF_RANK.prone < DEF_RANK[bd]) bd = 'prone';
    var face = ['att', bd, 'push', 'push', (d.dodge && !a.tackle) ? 'push' : 'def', 'def'];

    function one(c) { var r = {}; CATS.forEach(function (k) { r[k] = 0; }); r[c] = 1; return r; }
    function mix(list) { var r = {}; CATS.forEach(function (k) { r[k] = 0; }); list.forEach(function (x) { CATS.forEach(function (k) { r[k] += x.w * x.dist[k]; }); }); return r; }
    function eu(dist) { var s = 0; CATS.forEach(function (k) { s += dist[k] * U[k]; }); return s; }
    function dr(dist) { var s = 0; CATS.forEach(function (k) { s += dist[k] * DEF_RANK[k]; }); return s; }
    function allRolls(m) { var out = [[]]; for (var i = 0; i < m; i++) { var nx = []; out.forEach(function (r) { for (var f = 0; f < 6; f++) nx.push(r.concat(f)); }); out = nx; } return out; }
    var FRESH = allRolls(n), memo = {}, bmemo = {};

    // what a result leads to: with Frenzy a push on the first block means a second block with what's left
    function terminal(cat, s, stage) {
      if (stage === 1 && frenzy && cat === 'push') return block(2, s);
      return one(cat);
    }
    function pick(dice, s, stage) {
      var best = null, bv = 0;
      for (var i = 0; i < dice.length; i++) {
        var t = terminal(face[dice[i]], s, stage), v = dc.attPicks ? eu(t) : -dr(t);
        if (best === null || v > bv + 1e-9) { best = t; bv = v; }
      }
      return best;
    }
    function pool(dice, flags, s, stage) {
      var k = stage + ':' + dice.join('') + '|' + flags.join('') + '|' + (+s.tr) + (+s.pro) + (+s.brawl) + (+s.teamOK);
      if (memo[k]) return memo[k];
      var opts = [pick(dice, s, stage)];
      if (s.tr && s.teamOK) {
        var after = { tr: false, pro: s.pro, brawl: s.brawl, teamOK: false };
        var re = mix(FRESH.map(function (r) { return { w: 1 / FRESH.length, dist: pick(r, after, stage) }; }));
        opts.push(lonerP < 1 ? mix([{ w: lonerP, dist: re }, { w: 1 - lonerP, dist: pool(dice, flags, after, stage) }]) : re);
      }
      for (var i = 0; i < dice.length; i++) {
        if (flags[i]) continue;
        var nf = flags.slice(); nf[i] = 1;
        if (s.pro) {
          var ns = { tr: s.tr, pro: false, brawl: s.brawl, teamOK: false }, parts = [];
          for (var f = 0; f < 6; f++) { var nd = dice.slice(); nd[i] = f; parts.push({ w: (4 / 6) / 6, dist: pool(nd, nf, ns, stage) }); }
          parts.push({ w: 2 / 6, dist: pool(dice, nf, ns, stage) });
          opts.push(mix(parts));
        }
        if (s.brawl && dice[i] === 1) {
          var nb = { tr: s.tr, pro: s.pro, brawl: false, teamOK: false }, bp = [];
          for (var g = 0; g < 6; g++) { var nd2 = dice.slice(); nd2[i] = g; bp.push({ w: 1 / 6, dist: pool(nd2, nf, nb, stage) }); }
          opts.push(mix(bp));
        }
      }
      var best = opts[0], bv = eu(best);
      for (var j = 1; j < opts.length; j++) { var v = eu(opts[j]); if (v > bv + 1e-9) { best = opts[j]; bv = v; } }
      memo[k] = best; return best;
    }
    function block(stage, s) {
      var k = stage + '|' + (+s.tr) + (+s.pro) + (+s.brawl);
      if (bmemo[k]) return bmemo[k];
      var st = { tr: s.tr, pro: s.pro, brawl: s.brawl, teamOK: true }, zero = [];
      for (var z = 0; z < n; z++) zero.push(0);
      var r = mix(FRESH.map(function (roll) { return { w: 1 / FRESH.length, dist: pool(roll, zero, st, stage) }; }));
      bmemo[k] = r; return r;
    }

    var res = block(1, { tr: !!o.teamRR, pro: !!a.pro, brawl: canBrawl });
    memo = {}; bmemo = {};
    var raw = block(1, { tr: false, pro: false, brawl: false });
    var h = hurt(o), down = res.def + res.both, rawDown = raw.def + raw.both;
    return {
      dist: res, raw: raw, dice: dc, horns: horns, jugg: jugg, frenzy: frenzy,
      down: down, turnover: res.att + res.both, rawDown: rawDown, rawTurnover: raw.att + raw.both,
      armour: h, broken: down * h.broken, ko: down * (h.ko + h.cas), cas: down * h.cas, rawCas: rawDown * h.cas
    };
  }

  var VERDICTS = [
    [90, 'Lights out.', "He'll be counting stars before he hits the turf."],
    [75, 'Good hit.', 'The crowd is already on its feet.'],
    [55, 'Better than a coin flip.', 'Swing away, coach.'],
    [40, 'Fifty-fifty, give or take.', 'Make sure nothing important is standing behind you.'],
    [25, 'Optimistic.', "He's not scared. He's checking his nails."],
    [10, 'Bold.', 'His team-mates are placing bets on you.'],
    [0, 'Please reconsider.', 'Even the apothecary is shaking his head.']
  ];
  function verdict(p) { for (var i = 0; i < VERDICTS.length; i++) if (p >= VERDICTS[i][0]) return VERDICTS[i]; return VERDICTS[VERDICTS.length - 1]; }

  var A_SK = ['block', 'wrestle', 'tackle', 'brawler', 'pro', 'frenzy', 'juggernaut', 'horns', 'mightyBlow', 'claw'], D_SK = ['block', 'wrestle', 'dodge', 'thickSkull', 'stunty'];
  function encode(o) {
    var bits = function (obj, list) { return list.map(function (k) { return obj[k] ? 1 : 0; }).join(''); };
    return 'st=' + o.aSt + '-' + o.dSt + '&a=' + bits(o.a, A_SK) + '&d=' + bits(o.d, D_SK) + '&rr=' + (o.teamRR ? 1 : 0) + '&loner=' + (o.loner || 0) + '&blitz=' + (o.blitz ? 1 : 0) + '&goal=' + (o.goal === 'safe' ? 'safe' : 'hit') + '&av=' + (o.av || 9) + '&mb=' + (o.mb || 1);
  }
  function decode(h) {
    var q = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(q.st || ''); if (!m) return null;
    var clamp = function (x) { return Math.max(1, Math.min(12, +x)); };
    var flags = function (str, list) { var r = {}; list.forEach(function (k, i) { r[k] = (str || '')[i] === '1'; }); return r; };
    var l = +q.loner;
    return { aSt: clamp(m[1]), dSt: clamp(m[2]), a: flags(q.a, A_SK), d: flags(q.d, D_SK), teamRR: q.rr !== '0', loner: l >= 2 && l <= 6 ? l : 0, blitz: q.blitz === '1', goal: q.goal === 'safe' ? 'safe' : 'hit', av: (+q.av >= 3 && +q.av <= 12) ? +q.av : 9, mb: q.mb === '2' ? 2 : 1 };
  }

  var api = { calc: calc, hurt: hurt, diceFor: diceFor, verdict: verdict, encode: encode, decode: decode };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window === 'undefined') return;
  window.BlockDesk = api;

  function init() {
    if (!document.getElementById('bd-app')) return;
    var st = { aSt: 4, dSt: 3, a: { block: true }, d: {}, teamRR: true, loner: 0, blitz: false, goal: 'hit', av: 9, mb: 1 };
    var fh = decode(location.hash); if (fh) st = fh;
    var $ = function (id) { return document.getElementById(id); };
    var pct = function (x) { var v = x * 100; return (v >= 99.95 || v < 0.05 || Math.abs(v - Math.round(v)) < 0.05) ? Math.round(v) + '%' : v.toFixed(1) + '%'; };
    var LABELS = { def: 'He goes down', both: 'Both down', prone: 'Both placed prone (Wrestle)', push: 'Push only', none: 'Nothing happens', att: 'You go down' };

    function sync() {
      $('bd-ast').textContent = st.aSt; $('bd-dst').textContent = st.dSt;
      A_SK.forEach(function (k) { $('bd-a-' + k).checked = !!st.a[k]; });
      D_SK.forEach(function (k) { $('bd-d-' + k).checked = !!st.d[k]; });
      $('bd-av').value = String(st.av); $('bd-mb').value = String(st.mb); $('bd-mb').disabled = !st.a.mightyBlow;
      $('bd-rr').checked = st.teamRR; $('bd-loner').value = String(st.loner); $('bd-loner').disabled = !st.teamRR;
      document.querySelectorAll('[data-action]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.action === 'blitz') === st.blitz)); });
      document.querySelectorAll('[data-goal]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.goal === st.goal)); });
      var notes = [];
      if (st.blitz && st.a.brawler) notes.push('Brawler only works on a Block action, so it sits this Blitz out.');
      if (!st.blitz && st.a.horns) notes.push('Horns only count on a Blitz.');
      if (!st.blitz && st.a.juggernaut) notes.push('Juggernaut only counts on a Blitz.');
      $('bd-brawl-note').textContent = notes.join(' ');
      $('bd-brawl-note').hidden = !notes.length;
      update();
    }
    function update() {
      var r = calc(st), dc = r.dice;
      $('bd-dice').textContent = (dc.n === 1 ? '1 die' : dc.n + ' dice, ' + (dc.attPicks ? 'you pick' : 'he picks')) + (r.horns ? ' (Horns +1 ST)' : '');
      $('bd-down').textContent = pct(r.down);
      $('bd-turn').textContent = pct(r.turnover);
      var v = verdict(r.down * 100); $('bd-verdict').textContent = v[1]; $('bd-sub').textContent = v[2];
      var rows = '';
      ['def', 'both', 'prone', 'push', 'none', 'att'].forEach(function (k) {
        if (r.dist[k] < 0.00005 && r.raw[k] < 0.00005) return;
        rows += '<li class="bd-row bd-' + k + '"><span class="bd-rl">' + LABELS[k] + '</span><span class="bd-rb"><span style="width:' + (r.dist[k] * 100) + '%"></span></span><span class="bd-rv">' + pct(r.dist[k]) + '</span></li>';
      });
      $('bd-rows').innerHTML = rows;
      var re = (st.teamRR || st.a.pro || (st.a.brawler && !st.blitz));
      $('bd-facts').innerHTML = re ? 'Without any re-rolls: he goes down <strong>' + pct(r.rawDown) + '</strong>, you risk a turnover <strong>' + pct(r.rawTurnover) + '</strong>' : 'No re-rolls in play.';
      $('bd-broken').textContent = pct(r.broken);
      $('bd-ko').textContent = pct(r.ko);
      $('bd-cas').textContent = pct(r.cas);
      $('bd-hurtnote').textContent = 'If he goes down, armour breaks ' + pct(r.armour.broken) + ' of the time and he leaves as a casualty ' + pct(r.armour.cas) + ' of the time.' + (r.frenzy ? ' With Frenzy, a push means a second block, already included above.' : '');
      try { history.replaceState(null, '', '#' + encode(st)); } catch (e) {}
    }

    document.querySelectorAll('.bd-step').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.who === 'a' ? 'aSt' : 'dSt'; st[k] = Math.max(1, Math.min(12, st[k] + (+b.dataset.d))); sync();
      });
    });
    A_SK.forEach(function (k) { $('bd-a-' + k).addEventListener('change', function (e) { st.a[k] = e.target.checked; sync(); }); });
    D_SK.forEach(function (k) { $('bd-d-' + k).addEventListener('change', function (e) { st.d[k] = e.target.checked; sync(); }); });
    $('bd-av').addEventListener('change', function (e) { st.av = +e.target.value; sync(); });
    $('bd-mb').addEventListener('change', function (e) { st.mb = +e.target.value; sync(); });
    $('bd-rr').addEventListener('change', function (e) { st.teamRR = e.target.checked; sync(); });
    $('bd-loner').addEventListener('change', function (e) { st.loner = +e.target.value; sync(); });
    document.querySelectorAll('[data-action]').forEach(function (b) { b.addEventListener('click', function () { st.blitz = b.dataset.action === 'blitz'; sync(); }); });
    document.querySelectorAll('[data-goal]').forEach(function (b) { b.addEventListener('click', function () { st.goal = b.dataset.goal; sync(); }); });
    $('bd-share').addEventListener('click', function () {
      var url = location.href, btn = this, done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy link to this block'; }, 1800); };
      var show = function () { var f = $('bd-link'); f.hidden = false; f.value = url; f.focus(); f.select(); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, show); else show();
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
