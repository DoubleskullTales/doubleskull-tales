// Doubleskull Tales prediction game widget.
// Usage in any article: <div class="tippspiel" data-poll="paradice-s5-final"></div>
// Set API to your Cloudflare Worker address (no trailing slash):
const TIPPSPIEL_API = 'https://tippspiel.spring-violet-cdfb.workers.dev';

(function () {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const fmtClose = (iso) =>
    new Date(iso).toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna',
    });

  async function load(box) {
    const id = box.dataset.poll;
    box.textContent = '';
    box.append(el('p', 'tp-msg', 'Loading the prediction game...'));
    let poll, stats;
    try {
      poll = await (await fetch(`/polls/${id}.json`, { cache: 'no-cache' })).json();
      const r = await fetch(`${TIPPSPIEL_API}/polls/${id}`);
      stats = await r.json();
      if (!r.ok) throw new Error(stats.error);
    } catch (e) {
      box.textContent = '';
      box.append(el('p', 'tp-msg', 'The prediction game is not available right now. Please try again later.'));
      return;
    }
    render(box, poll, stats, null);
  }

  function bar(count, total, color) {
    const wrap = el('span', 'tp-bar');
    const fill = el('span', 'tp-fill');
    fill.style.width = pct(count, total) + '%';
    if (color) fill.style.background = color;
    wrap.append(fill);
    return wrap;
  }

  function render(box, poll, stats, flash) {
    box.textContent = '';
    const closed = stats.closed;
    const result = poll.result || null;

    const head = el('div', 'tp-head');
    head.append(el('div', 'tp-kicker', 'Prediction game'));
    head.append(el('h3', 'tp-title', poll.title));
    head.append(el('p', 'tp-sub', closed
      ? (result ? 'Final whistle. Here is who called it.' : 'Voting is closed. Here is who called what.')
      : `Make your call before kick-off: ${fmtClose(poll.closes)}. One call per coach.`));
    box.append(head);

    if (flash) box.append(el('p', 'tp-flash ' + flash.type, flash.text));

    const form = el('form', 'tp-form');
    poll.questions.forEach((q) => {
      const fs = el('fieldset', 'tp-q');
      fs.append(el('legend', null, q.text));
      if (q.hint) fs.append(el('p', 'tp-hint', q.hint));
      q.options.forEach((o) => {
        const count = stats.counts[q.id] ? stats.counts[q.id][o.id] || 0 : 0;
        const lab = el('label', 'tp-opt');
        if (result && result[q.id] === o.id) lab.classList.add('tp-correct');
        const inp = document.createElement('input');
        inp.type = 'radio'; inp.name = q.id; inp.value = o.id; inp.required = true;
        if (closed) inp.disabled = true;
        const txt = el('span', 'tp-label', o.label);
        const num = el('span', 'tp-pct', `${pct(count, stats.total)}%`);
        lab.append(inp, txt, num, bar(count, stats.total, o.color));
        fs.append(lab);
      });
      form.append(fs);
    });

    if (!closed) {
      const row = el('div', 'tp-submit');
      const name = document.createElement('input');
      name.type = 'text'; name.name = 'name'; name.placeholder = 'Your coach name';
      name.maxLength = 30; name.required = true; name.autocomplete = 'nickname';
      const hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.className = 'tp-hp';
      hp.setAttribute('aria-hidden', 'true');
      const btn = el('button', 'btn', 'Lock it in');
      btn.type = 'submit';
      row.append(name, hp, btn);
      form.append(row);
      form.append(el('p', 'tp-fine',
        `${stats.total} ${stats.total === 1 ? 'call' : 'calls'} so far. ${poll.note || ''} Your coach name and your picks will be shown here after kick-off. See the privacy policy.`));

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const answers = {};
        poll.questions.forEach((q) => { answers[q.id] = fd.get(q.id); });
        btn.disabled = true; btn.textContent = 'Sending...';
        try {
          const r = await fetch(`${TIPPSPIEL_API}/polls/${poll.id}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fd.get('name'), website: fd.get('website'), answers }),
          });
          const data = await r.json();
          if (!r.ok) {
            btn.disabled = false; btn.textContent = 'Lock it in';
            let f = box.querySelector('.tp-flash');
            if (!f) { f = el('p'); head.after(f); }
            f.className = 'tp-flash error'; f.textContent = data.error || 'Something went wrong.';
            return;
          }
          render(box, poll, data, { type: 'ok', text: `Call locked in, Coach ${data.name}. Good luck!` });
        } catch {
          btn.disabled = false; btn.textContent = 'Lock it in';
        }
      });
    } else {
      form.append(el('p', 'tp-fine', `${stats.total} ${stats.total === 1 ? 'call' : 'calls'} in total. ${poll.note || ''}`));
    }
    box.append(form);

    if (closed && stats.votes && stats.votes.length) {
      const label = (q, id) => (q.options.find((o) => o.id === id) || {}).label || '?';
      const list = stats.votes.map((v) => ({
        ...v,
        score: result ? poll.questions.filter((q) => result[q.id] && result[q.id] === v.answers[q.id]).length : null,
      }));
      if (result) list.sort((a, b) => b.score - a.score);
      const wrap = el('div', 'tp-table-wrap');
      const t = el('table', 'tp-table');
      const hr = el('tr');
      hr.append(el('th', null, 'Coach'));
      poll.questions.forEach((q) => hr.append(el('th', null, q.id === 'winner' ? 'Winner' : q.id.toUpperCase())));
      if (result) hr.append(el('th', null, 'Right'));
      t.append(hr);
      list.forEach((v) => {
        const tr = el('tr');
        tr.append(el('td', 'tp-name', v.name));
        poll.questions.forEach((q) => {
          const td = el('td', null, label(q, v.answers[q.id]));
          if (result && result[q.id]) td.classList.add(result[q.id] === v.answers[q.id] ? 'tp-hit' : 'tp-miss');
          tr.append(td);
        });
        if (result) tr.append(el('td', 'tp-score', `${v.score}/${poll.questions.length}`));
        t.append(tr);
      });
      wrap.append(t);
      box.append(wrap);
    }
  }

  document.querySelectorAll('.tippspiel[data-poll]').forEach(load);
})();
