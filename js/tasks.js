import { state, live, person, category, isOwner, mutate, addTask, subscribe, pull, flush, rpc } from './store.js';
import { todayList, compareTasks, ymd, daysBetween, isOpen } from './sort.js';
import { S, PRIO, STATUS } from './strings.js';
import { esc, toast, buzz, sheet, fmtDay } from './ui.js';
import { openTask } from './detail.js';
import { repeatField, bindRepeat } from './repeat.js';
import { speechSupported, listen } from './voice.js';

// Ids added or ticked this session stay on screen (struck or highlighted) until Refresh or a tab change.
const keep = new Set();
let highlight = null;
export const clearKeep = () => keep.clear();

const dueInfo = (t, today) => {
  if (!t.due_date) return null;
  const n = daysBetween(today, t.due_date);
  if (n < 0) return { text: S.overdue(-n), cls: 'bad' };
  if (n === 0) return { text: S.dueToday, cls: 'warn' };
  return { text: n === 1 ? S.dueTomorrow : S.due(fmtDay(t.due_date)) };
};

export function rowHtml(t, today) {
  const done = t.status === 'done';
  const parts = [];
  if (t.client) parts.push(esc(t.client));
  const cat = category(t.category_id);
  if (cat) parts.push(esc(cat.name));
  if (done) parts.push(S.finished(fmtDay((t.done_at ?? t.updated_at).slice(0, 10))));
  else { const d = dueInfo(t, today); if (d) parts.push(`<span class="due ${d.cls ?? ''}">${d.text}</span>`); }
  const who = person(t.assignee_id);
  if (isOwner() && who && who.role !== 'owner') parts.push(esc(who.name));
  const st = t.status === 'doing' ? S.doing : t.status === 'waiting' ? S.waitingOn(esc(t.waiting_on || '')).replace(/: $/, '') : '';
  return `<div class="trow${done ? ' isdone' : ''}" data-id="${t.id}">
    <button class="tick" data-tick aria-label="${done ? S.tickUndo : S.tickDone}"><span class="circ"></span></button>
    <button class="tmain" data-open><span class="ttl"><i class="dot p${t.priority}" title="${PRIO[t.priority]}"></i><span>${esc(t.title)}</span></span>
      ${parts.length ? `<span class="sub">${parts.join(' · ')}</span>` : ''}${st ? `<span class="st">${st}</span>` : ''}</button></div>`;
}
export const listHtml = (tasks, today) => (tasks.length ? `<div class="group">${tasks.map(t => rowHtml(t, today)).join('')}</div>` : '');

const firstRun = () => (isOwner() && !state.cats.length
  ? `<div class="group hint-card"><div class="static"><b>${S.firstRunTitle}</b><span class="muted">${S.firstRunBody}</span>
     <button class="link" data-goto="settings">${S.firstRunGo}</button></div></div>` : '');

function quickAdd() {
  return `<form class="qa" autocomplete="off"><input name="title" maxlength="200" enterkeyhint="done" placeholder="${S.quickAddHint}" aria-label="${S.quickAdd}">
    ${speechSupported() ? `<button type="button" class="ghost mic" data-mic aria-label="${S.mic}"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>` : ''}
    <button type="button" class="ghost" data-more>${S.more}</button></form>`;
}

export function openMore(initialTitle = '', afterAdd) {
  const cats = state.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const people = state.people.filter(p => p.active).map(p => `<option value="${p.id}"${p.role === 'owner' ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const d = sheet(S.newTask, `<form class="stack">
    <label>${S.fTitle}<input name="title" maxlength="200" required value="${esc(initialTitle)}"></label>
    <label>${S.fNotes}<textarea name="notes" rows="3" maxlength="4000"></textarea></label>
    <label>${S.fClient}<input name="client" maxlength="120"></label>
    <label>${S.fCategory}<select name="category_id"><option value="">${S.none}</option>${cats}</select></label>
    <div class="lbl">${S.fPriorityL}<div class="seg2" role="group">${[1, 2, 3].map(p => `<button type="button" data-prio="${p}" aria-pressed="${p === 2}">${PRIO[p]}</button>`).join('')}</div></div>
    <label>${S.fDue}<input type="date" name="due_date"></label>
    ${repeatField(null)}
    <label>${S.fAssignee2}<select name="assignee_id">${people}</select></label>
    <button class="save">${S.addTask}</button></form>`);
  let prio = 2;
  d.querySelector('.seg2').onclick = e => {
    const b = e.target.closest('[data-prio]'); if (!b) return;
    prio = +b.dataset.prio;
    d.querySelectorAll('[data-prio]').forEach(x => x.setAttribute('aria-pressed', x === b));
  };
  const f = d.querySelector('form');
  bindRepeat(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    d.close();
    await add({ title: v.title.trim(), notes: v.notes.trim() || null, client: v.client.trim() || null, category_id: v.category_id || null, priority: prio, due_date: v.due_date || null, repeat_rule: v.due_date && v.repeat_rule || null, assignee_id: v.assignee_id });
    afterAdd?.();
  };
}

async function add(input) {
  if (!input.title) return;
  const id = crypto.randomUUID();
  keep.add(id); highlight = id;
  buzz();
  try { await addTask({ id, ...input }); toast(S.added); } catch { keep.delete(id); }
}

// Tick or open a task row. Shared by every screen that lists rows. Returns true when it handled the click.
export function handleRowClick(e) {
  const row = e.target.closest('.trow');
  if (!row) return false;
  if (e.target.closest('[data-tick]')) {
    const t = state.tasks.find(x => x.id === row.dataset.id);
    const done = t.status !== 'done';
    row.classList.toggle('isdone', done); // paint first, then save behind
    buzz();
    keep.add(t.id);
    mutate(t.id, { status: done ? 'done' : 'todo' }).catch(() => {});
    return true;
  }
  if (e.target.closest('[data-open]')) { openTask(row.dataset.id); return true; }
  return false;
}

// One list screen. kind: today | all | done
export function mountList(el, kind) {
  const f = { prio: '', who: '', status: '' };
  let q = '', results = null, timer;
  const title = { today: S.today, all: S.allTasks, done: S.done }[kind];
  const owner_ = () => isOwner();
  el.innerHTML = `<div class="large-title"><h1>${title}</h1><button class="link" data-refresh>${S.refresh}</button></div>
    <div data-slot="bar"></div><div data-slot="hint"></div><div data-slot="body"></div>`;
  const bar = el.querySelector('[data-slot=bar]'), body = el.querySelector('[data-slot=body]'), hint = el.querySelector('[data-slot=hint]');

  function buildBar() {
    let h = '';
    if (kind !== 'done' && owner_()) h += quickAdd();
    if (kind === 'all') {
      const who = state.people.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      h += `<input type="search" class="search" placeholder="${S.search}" aria-label="${S.search}" enterkeyhint="search">
        <div class="chips"><select data-f="prio" aria-label="${S.fPriority}"><option value="">${S.fPriority}: ${S.fAll}</option>${[1, 2, 3].map(p => `<option value="${p}">${PRIO[p]}</option>`).join('')}</select>
        ${owner_() ? `<select data-f="who" aria-label="${S.fAssignee}"><option value="">${S.fAssignee}: ${S.fAll}</option>${who}</select>` : ''}
        <select data-f="status" aria-label="${S.fStatus}"><option value="">${S.fStatus}: ${S.fAll}</option>${['todo', 'doing', 'waiting'].map(s => `<option value="${s}">${STATUS[s]}</option>`).join('')}</select></div>`;
    }
    bar.innerHTML = h;
    bar.dataset.owner = owner_();
  }

  function items() {
    const today = ymd();
    const all = live();
    if (kind === 'today') return todayList(all, today, keep);
    if (kind === 'done') return all.filter(t => t.status === 'done' || keep.has(t.id)).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
    return all.filter(t => (isOpen(t) || keep.has(t.id)) && (!f.prio || t.priority === +f.prio) && (!f.who || t.assignee_id === f.who) && (!f.status || t.status === f.status)).sort(compareTasks(today));
  }

  function render() {
    if (el.hidden) return;
    if (bar.dataset.owner !== String(owner_())) buildBar();
    const today = ymd();
    let h = '';
    hint.textContent = '';
    if (results) {
      h = listHtml(results, today) || `<p class="empty">${S.noResults}</p>`;
    } else {
      const list = items();
      if (kind === 'all') {
        const groups = [...state.cats.map(c => [c.name, list.filter(t => t.category_id === c.id)]),
          [S.noCategory, list.filter(t => !category(t.category_id))]];
        h = groups.filter(([, g]) => g.length).map(([n, g]) => `<h2 class="sec">${esc(n)}</h2>${listHtml(g, today)}`).join('');
      } else if (kind === 'today' && owner_()) {
        const mine = list.filter(t => person(t.assignee_id)?.role === 'owner'), away = list.filter(t => !mine.includes(t));
        h = (mine.length ? `<h2 class="sec">${S.mine}</h2>${listHtml(mine, today)}` : '') + (away.length ? `<h2 class="sec">${S.delegated}</h2>${listHtml(away, today)}` : '');
      } else h = listHtml(list, today);
      if (!h) h = `<p class="empty">${kind === 'today' ? S.emptyToday : kind === 'done' ? S.emptyDone : owner_() ? S.emptyAll : S.emptyMine}</p>`;
      if (kind !== 'done') h = firstRun() + h;
      if (kind === 'all' && q.trim().length === 1) hint.textContent = S.searchMin;
    }
    body.innerHTML = h;
    if (highlight) {
      const r = body.querySelector(`[data-id="${highlight}"]`);
      if (r) { r.classList.add('hl'); r.scrollIntoView({ block: 'nearest' }); highlight = null; }
    }
  }
  buildBar();

  async function search() {
    const s = q.trim();
    results = null;
    if (s.length < 2) return render();
    try { results = await rpc('search_tasks', { q: s }); }
    catch {
      hint.textContent = S.searchOffline;
      const n = s.toLowerCase();
      results = live().filter(t => [t.title, t.client, t.notes].some(x => (x ?? '').toLowerCase().includes(n)));
    }
    if (q.trim() === s) render();
  }

  el.addEventListener('input', e => {
    if (e.target.matches('.search')) { q = e.target.value; clearTimeout(timer); timer = setTimeout(search, 300); }
  });
  el.addEventListener('change', e => { const k = e.target.dataset.f; if (k) { f[k] = e.target.value; render(); } });
  el.addEventListener('submit', e => {
    e.preventDefault();
    const input = e.target.title; const v = input.value.trim();
    if (!v) return;
    input.value = '';
    add({ title: v });
  });
  el.addEventListener('click', async e => {
    if (handleRowClick(e)) return;
    if (e.target.closest('[data-mic]')) {
      const b = e.target.closest('[data-mic]'), input = b.closest('form').title;
      if (b.classList.contains('on')) return;
      b.classList.add('on'); toast(S.micListening);
      listen(t => { input.value = t; input.focus(); }, () => b.classList.remove('on'), () => toast(S.micFailed, 'bad'));
    } else if (e.target.closest('[data-more]')) openMore(bar.querySelector('.qa input').value.trim(), () => (bar.querySelector('.qa input').value = ''));
    else if (e.target.closest('[data-goto]')) dispatchEvent(new CustomEvent('rkb:tab', { detail: e.target.closest('[data-goto]').dataset.goto }));
    else if (e.target.closest('[data-refresh]')) {
      const b = e.target.closest('[data-refresh]');
      b.textContent = S.refreshing; keep.clear();
      await flush();
      await pull().catch(() => {});
      b.textContent = S.refresh;
      if (q.trim().length > 1) search();
    }
  });
  subscribe(render);
  return render;
}
