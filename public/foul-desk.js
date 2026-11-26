/* The Foul Desk: kicking a man when he's down, and what the referee thinks about it.
   Exact maths over every armour and injury roll. No re-rolls apply to armour or injury. */
(function () {
  var P = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]; // ways to roll 2..12 on 2D6 (out of 36)
  var DBL = [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]; // ways that are doubles

  function injury(roll, d) {
    if (d.stunty) { if (roll >= 9) return 'cas'; if (roll >= 8) return 'ko'; if (roll >= 7) return d.thickSkull ? 'stun' : 'ko'; return 'stun'; }
    if (roll >= 10) return 'cas'; if (roll >= 9) return 'ko'; if (roll >= 8) return d.thickSkull ? 'stun' : 'ko'; return 'stun';
  }

  function calc(o) {
    var a = o.fouler || {}, d = o.target || {}, av = o.av || 9;
    var armourMod = d.ironHardSkin ? 0 : (a.assists || 0) - (d.assists || 0);
    var lone = !!a.loneFouler && !(a.assists || 0) && !(d.assists || 0);
    var r = { broken: 0, stun: 0, ko: 0, cas: 0, dead: 0, spotted: 0, sentOff: 0, stays: 0, regen: 0, loneUsed: 0 };
    // one armour roll with weight w; Lone Fouler may re-roll a failed one (only the final roll counts for the referee)
    function armour(w, canReroll) {
      for (var x = 2; x <= 12; x++) {
        for (var dx = 0; dx < 2; dx++) {
          var ways = dx ? DBL[x] : P[x] - DBL[x]; if (!ways) continue;
          var pa = w * ways / 36, total = x + armourMod, dp = !!a.dirtyPlayer, broke = total >= av;
          if (!broke && dp && !d.ironHardSkin && total + 1 >= av) { broke = true; dp = false; }
          var armourDouble = dx === 1;
          if (!broke) {
            if (canReroll) { r.loneUsed += pa; armour(pa, false); continue; }
            if (armourDouble && !a.sneakyGit) r.spotted += pa;
            continue;
          }
          r.broken += pa;
          for (var y = 2; y <= 12; y++) {
            for (var dy = 0; dy < 2; dy++) {
              var w2 = dy ? DBL[y] : P[y] - DBL[y]; if (!w2) continue;
              var pi = pa * w2 / 36, res = injury(Math.min(12, y + (dp ? 1 : 0)), d);
              if (res === 'cas') {
                var stick = d.regeneration ? 0.5 : 1; // Regeneration: 4+ sends him to the reserves instead
                r.cas += pi * stick; r.dead += pi * stick * (2 / 16);
                if (d.regeneration) r.regen += pi * 0.5;
              } else r[res] += pi;
              if (armourDouble || dy === 1) r.spotted += pi;
            }
          }
        }
      }
    }
    armour(1, lone);
    r.lone = lone;
    // spotted: Argue the Call first (6), then the Bribe (2+) if he's still going
    var keep = 0;
    if (o.argue) keep = 1 / 6;
    if (o.bribe) keep = keep + (1 - keep) * (5 / 6);
    r.bribeUsed = o.bribe ? r.spotted * (o.argue ? 5 / 6 : 1) : 0;
    r.sentOff = r.spotted * (1 - keep);
    r.stays = 1 - r.sentOff;
    r.bribeUsed = r.bribeUsed || 0;
    r.koPlus = r.ko + r.cas + r.regen;
    r.armourMod = armourMod;
    r.armourNeed = av - armourMod;
    return r;
  }

  var VERDICTS = [
    [45, 'Lights out, boots on.', 'The referee is suddenly very interested in the weather.'],
    [30, 'Good kicking.', 'His apothecary is already jogging over.'],
    [18, 'Worth a boot.', 'Somebody has to remind him who owns this pitch.'],
    [8, 'A friendly tap.', 'He might not even wake up from his nap.'],
    [0, 'Why bother?', 'Unless you just want to say hello with your foot.']
  ];
  function verdict(p) { for (var i = 0; i < VERDICTS.length; i++) if (p >= VERDICTS[i][0]) return VERDICTS[i]; return VERDICTS[VERDICTS.length - 1]; }

  var F_SK = ['dirtyPlayer', 'sneakyGit', 'loneFouler'], T_SK = ['thickSkull', 'stunty', 'regeneration', 'ironHardSkin'];
  function bits(obj, list) { return list.map(function (k) { return obj[k] ? 1 : 0; }).join(''); }
  function flags(str, list) { var r = {}; list.forEach(function (k, i) { r[k] = (str || '')[i] === '1'; }); return r; }
  function encode(o) {
    return 'f=' + (o.fouler.assists || 0) + '.' + bits(o.fouler, F_SK) + '&t=' + (o.av || 9) + '.' + (o.target.assists || 0) + '.' + bits(o.target, T_SK) + '&ref=' + (o.argue ? 1 : 0) + (o.bribe ? 1 : 0);
  }
  function decode(h) {
    var q = {}; h.replace(/^#/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
    if (!q.f || !q.t) return null;
    var cl = function (v, lo, hi, d) { v = +v; return v >= lo && v <= hi ? v : d; };
    var fp = q.f.split('.'), tp = q.t.split('.');
    var f = flags(fp[1], F_SK); f.assists = cl(fp[0], 0, 6, 0);
    var t = flags(tp[2], T_SK); t.assists = cl(tp[1], 0, 6, 0);
    return { fouler: f, target: t, av: cl(tp[0], 3, 12, 9), argue: (q.ref || '')[0] === '1', bribe: (q.ref || '')[1] === '1' };
  }

  var api = { calc: calc, verdict: verdict, encode: encode, decode: decode };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window === 'undefined') return;
  window.FoulDesk = api;

  function init() {
    if (!document.getElementById('fd-app')) return;
    var $ = function (id) { return document.getElementById(id); };
    var st = { fouler: { assists: 1 }, target: { assists: 0 }, av: 9, argue: true, bribe: false };
    var fh = decode(location.hash); if (fh) st = fh;
    var pct = function (v) { v *= 100; return (v >= 99.95 || v < 0.05 || Math.abs(v - Math.round(v)) < 0.05) ? Math.round(v) + '%' : v.toFixed(1) + '%'; };

    document.querySelectorAll('.fd-step').forEach(function (b) {
      b.addEventListener('click', function () { var obj = b.dataset.who === 'f' ? st.fouler : st.target; obj.assists = Math.max(0, Math.min(6, (obj.assists || 0) + (+b.dataset.d))); sync(); });
    });
    F_SK.forEach(function (k) { $('fd-f-' + k).addEventListener('change', function (e) { st.fouler[k] = e.target.checked; sync(); }); });
    T_SK.forEach(function (k) { $('fd-t-' + k).addEventListener('change', function (e) { st.target[k] = e.target.checked; sync(); }); });
    $('fd-av').addEventListener('change', function (e) { st.av = +e.target.value; sync(); });
    $('fd-argue').addEventListener('change', function (e) { st.argue = e.target.checked; sync(); });
    $('fd-bribe').addEventListener('change', function (e) { st.bribe = e.target.checked; sync(); });

    function sync() {
      $('fd-fa').textContent = st.fouler.assists || 0; $('fd-ta').textContent = st.target.assists || 0;
      F_SK.forEach(function (k) { $('fd-f-' + k).checked = !!st.fouler[k]; });
      T_SK.forEach(function (k) { $('fd-t-' + k).checked = !!st.target[k]; });
      $('fd-av').value = String(st.av); $('fd-argue').checked = st.argue; $('fd-bribe').checked = st.bribe;
      var r = calc(st);
      var need = r.armourNeed;
      $('fd-need').textContent = (need <= 2 ? '2' : need > 12 ? 'no chance' : need) + (need > 12 ? '' : '+') + ' on 2D6';
      $('fd-needsub').textContent = (st.target.ironHardSkin ? 'Iron Hard Skin: no modifiers on the armour roll' : (r.armourMod >= 0 ? '+' : '') + r.armourMod + ' from assists') + (st.fouler.dirtyPlayer && !st.target.ironHardSkin ? ', Dirty Player can add 1 more' : '') + (st.fouler.loneFouler ? (r.lone ? '. Lone Fouler: a failed armour roll gets a re-roll' : '. Lone Fouler only works with no assists on either side') : '');
      $('fd-ko').textContent = pct(r.koPlus);
      $('fd-off').textContent = pct(r.sentOff);
      var v = verdict(r.koPlus * 100); $('fd-verdict').textContent = v[1]; $('fd-sub').textContent = v[2];
      var rows = [
        ['Armour broken', r.broken, 'red'], ['Stunned (armour broken)', r.stun, ''], ['Knocked out', r.ko, ''], ['Casualty', r.cas, 'red'],
        ['Regeneration saves him', r.regen, ''], ['Dead (casualty roll 15-16)', r.dead, 'ink']
      ];
      $('fd-rows').innerHTML = rows.filter(function (x) { return x[1] >= 0.00005; }).map(function (x) {
        return '<li class="fd-row fd-' + (x[2] || 'n') + '"><span>' + x[0] + '</span><span class="fd-rb"><span style="width:' + (x[1] * 100) + '%"></span></span><span class="fd-rv">' + pct(x[1]) + '</span></li>';
      }).join('');
      $('fd-ref').innerHTML = 'The referee spots it (a natural double) <strong>' + pct(r.spotted) + '</strong> of the time. Every spot is a turnover. ' +
        (st.bribe || st.argue ? 'After ' + (st.argue ? 'arguing the call' : '') + (st.bribe && st.argue ? ' and then ' : '') + (st.bribe ? 'the Bribe' : '') + ', your fouler stays on the pitch <strong>' + pct(r.stays) + '</strong> of the time.' : '') +
        (st.bribe ? ' You spend the Bribe <strong>' + pct(r.bribeUsed) + '</strong> of the time.' : '');
      try { history.replaceState(null, '', '#' + encode(st)); } catch (e) {}
    }
    $('fd-share').addEventListener('click', function () {
      var url = location.href, btn = this, done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy link to this foul'; }, 1800); };
      var show = function () { var f = $('fd-link'); f.hidden = false; f.value = url; f.focus(); f.select(); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, show); else show();
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
