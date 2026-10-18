import { state, person, category, isOwner, mutate, loadEvents, addComment, subscribe } from './store.js';
import { S, PRIO, STATUS } from './strings.js';
import { listPhotos, addPhoto, removePhoto, viewPhoto } from './photos.js';
import { repeatField, bindRepeat, repeatLabel } from './repeat.js';
import { esc, sheet, toast, buzz, inlineConfirm, fmtDay, fmtWhen } from './ui.js';

const nameOf = id => person(id)?.name ?? S.someone;
const valName = (kind, v) => (v == null ? S.none : kind === 'status' ? STATUS[v] ?? v : kind === 'priority' ? PRIO[v] ?? v : kind === 'due' ? fmtDay(v) : nameOf(v));

function eventLine(e) {
  const a = e.author_id === state.me?.id ? S.you : nameOf(e.author_id);
  switch (e.kind) {
    case 'status': return S.evStatus(a, valName('status', e.from_val), valName('status', e.to_val));
    case 'assign': return S.evAssign(a, nameOf(e.from_val), nameOf(e.to_val));
    case 'due': return S.evDue(a, valName('due', e.from_val), valName('due', e.to_val));
    case 'priority': return S.evPrio(a, valName('priority', e.from_val), valName('priority', e.to_val));
    case 'deleted': return S.evDeleted(a);
    case 'restored': return S.evRestored(a);
    default: return null;
  }
}
const historyHtml = evs => evs.map(e => e.kind === 'comment'
  ? `<li><b>${esc(e.author_id === state.me?.id ? S.you : nameOf(e.author_id))}</b><span class="cmt">${esc(e.body)}</span><small>${fmtWhen(e.created_at)}</small></li>`
  : `<li><span>${esc(eventLine(e))}</span><small>${fmtWhen(e.created_at)}</small></li>`).join('');

export function openTask(id) {
  const t0 = state.tasks.find(t => t.id === id);
  if (!t0) return;
  const owner = isOwner();
  const get = () => state.tasks.find(t => t.id === id);
  // First open by the assignee records "seen" (the database keeps only the first).
  if (!owner && t0.assignee_id === state.me?.id && !t0.seen_at) mutate(id, { seen_at: new Date().toISOString() }).catch(() => {});

  const cats = state.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const people = state.people.filter(p => p.active || p.id === t0.assignee_id).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const fields = owner ? `
    <label>${S.fTitle}<input name="title" maxlength="200" value="${esc(t0.title)}"></label>
    <label>${S.fNotes}<textarea name="notes" rows="3" maxlength="4000">${esc(t0.notes)}</textarea></label>
    <label>${S.fClient}<input name="client" maxlength="120" value="${esc(t0.client)}"></label>
    <label>${S.fCategory}<select name="category_id"><option value="">${S.none}</option>${cats}</select></label>
    <div class="lbl">${S.fPriorityL}<div class="seg2" data-prio>${[1, 2, 3].map(p => `<button type="button" data-p="${p}" aria-pressed="${t0.priority === p}">${PRIO[p]}</button>`).join('')}</div></div>
    <label>${S.fDue}<input type="date" name="due_date" value="${t0.due_date ?? ''}"></label>
    ${repeatField(t0)}
    <label>${S.fAssignee2}<select name="assignee_id">${people}</select></label>`
    : `<div class="group"><div class="static"><b>${esc(t0.title)}</b></div>
       ${t0.notes ? `<div class="static muted">${esc(t0.notes)}</div>` : ''}
       <div class="static kv"><span>${S.fPriorityL}</span><span>${PRIO[t0.priority]}</span></div>
       ${t0.client ? `<div class="static kv"><span>${S.fClient}</span><span>${esc(t0.client)}</span></div>` : ''}
       ${t0.category_id ? `<div class="static kv"><span>${S.fCategory}</span><span>${esc(category(t0.category_id)?.name ?? '')}</span></div>` : ''}
       <div class="static kv"><span>${S.fDue}</span><span>${t0.due_date ? fmtDay(t0.due_date) : S.noDue}</span></div>
       ${t0.repeat_rule ? `<div class="static kv"><span>${S.repeats}</span><span>${repeatLabel(t0.repeat_rule)}</span></div>` : ''}</div>`;

  const d = sheet(S.details, `<div class="stack" data-fields>${fields}</div>
    <div class="stack"><div class="lbl">${S.fStatus}<div class="seg2 st4" data-status></div></div>
      ${owner && person(t0.assignee_id)?.role === 'member' ? `<p class="muted seen">${t0.seen_at ? S.seen(fmtWhen(t0.seen_at)) : S.notSeen}</p>` : ''}
      <div class="wait" hidden><label>${S.waitingOnLabel}<input name="waiting_on" maxlength="120" placeholder="${S.waitingOnHint}"></label><button type="button" class="save" data-wait>${S.save}</button></div></div>
    <div class="stack"><h3 class="sec">${S.photos}</h3><div class="thumbs"></div>
      <label class="btn ghost addphoto">${S.addPhoto}<input type="file" accept="image/*" hidden></label></div>
    <div class="stack"><h3 class="sec">${S.history}</h3><ul class="hist"></ul>
      <form class="cmt-form"><input name="body" maxlength="2000" placeholder="${S.comment}" aria-label="${S.comment}"><button class="ghost">${S.send}</button></form></div>
    ${owner ? `<div class="stack"><button type="button" class="link danger" data-del>${S.deleteTask}</button></div>` : ''}`);

  if (owner) {
    bindRepeat(d.querySelector('[data-fields]'), () => get()?.repeat_day ?? undefined);
    d.querySelector('[name=category_id]').value = t0.category_id ?? '';
    d.querySelector('[name=assignee_id]').value = t0.assignee_id;
  }
  const status = d.querySelector('[data-status]'), wait = d.querySelector('.wait'), hist = d.querySelector('.hist');
  let waiting = false;
  const paintStatus = () => {
    const t = get(); if (!t) return;
    status.innerHTML = Object.entries(STATUS).map(([k, v]) => `<button type="button" data-s="${k}" aria-pressed="${t.status === k}">${v}</button>`).join('');
    wait.hidden = !(waiting || t.status === 'waiting');
    if (t.status === 'waiting' && !waiting) wait.querySelector('input').value = t.waiting_on ?? '';
  };
  const paintHist = evs => { hist.innerHTML = historyHtml(evs ?? state.events[id] ?? []); };
  const thumbs = d.querySelector('.thumbs');
  const paintPhotos = () => listPhotos(id).then(ps => {
    thumbs.innerHTML = ps.map((p, i) => `<button type="button" class="thumb" data-i="${i}"><img src="${p.url}" alt=""></button>`).join('');
    thumbs.onclick = e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const p = ps[+b.dataset.i];
      viewPhoto(p.url, owner ? async () => { await removePhoto(p.path); paintPhotos(); } : null);
    };
  }).catch(() => {});
  paintPhotos();
  d.querySelector('.addphoto input').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { try { await addPhoto(id, f); paintPhotos(); } catch {} }
  };
  paintStatus(); paintHist();
  loadEvents(id).then(paintHist);
  const seen = d.querySelector('.seen');
  const unsub = subscribe(() => { paintStatus(); const t = get(); if (seen && t) seen.textContent = t.seen_at ? S.seen(fmtWhen(t.seen_at)) : S.notSeen; });
  const onEv = () => loadEvents(id).then(paintHist);
  addEventListener('rkb:events', onEv);
  d.addEventListener('close', () => removeEventListener('rkb:events', onEv));
  d.addEventListener('close', unsub);

  status.onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    buzz();
    if (b.dataset.s === 'waiting') { waiting = true; paintStatus(); wait.querySelector('input').focus(); return; }
    waiting = false;
    mutate(id, { status: b.dataset.s }).then(() => loadEvents(id).then(paintHist)).catch(() => {});
  };
  d.querySelector('[data-wait]').onclick = () => {
    const inp = wait.querySelector('input'); const w = inp.value.trim();
    if (!w) return inp.focus();
    waiting = false;
    mutate(id, { status: 'waiting', waiting_on: w }).then(() => loadEvents(id).then(paintHist)).catch(() => {});
  };
  d.querySelector('.cmt-form').onsubmit = async e => {
    e.preventDefault();
    const inp = e.target.body; const body = inp.value.trim(); if (!body) return;
    inp.value = '';
    const p = addComment(id, body);
    paintHist();
    p.catch(() => paintHist());
  };

  if (owner) {
    const save = (name, val) => async () => {
      if (!get()) return; // 'change' only fires on a real edit, so never skip on a stale local copy
      try { await mutate(id, { [name]: val }); toast(S.saved); loadEvents(id).then(paintHist); } catch {}
    };
    d.querySelector('[data-fields]').addEventListener('change', e => {
      const n = e.target.name; if (!n) return;
      let v = e.target.value.trim?.() ?? e.target.value;
      if (n === 'title' && !v) { e.target.value = get().title; return; }
      if (['notes', 'client', 'category_id', 'due_date', 'repeat_rule'].includes(n) && v === '') v = null;
      // Clearing the due date ends the repetition (the database needs a due date to count from).
      if (n === 'due_date' && v === null && get().repeat_rule) return mutate(id, { due_date: null, repeat_rule: null }).then(() => toast(S.saved)).catch(() => {});
      save(n, v)();
    });
    d.querySelector('[data-prio]').onclick = e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      d.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', x === b));
      save('priority', +b.dataset.p)();
    };
    const del = d.querySelector('[data-del]');
    del.onclick = () => inlineConfirm(del, S.deleteAsk, S.deleteYes, async () => {
      const copy = { ...get() };
      d.close();
      try {
        await mutate(id, { deleted_at: new Date().toISOString() });
        toast(S.deleted, 'ok', { label: S.undo, fn: () => {
          if (!state.tasks.some(x => x.id === id)) state.tasks.push({ ...copy });
          mutate(id, { deleted_at: null }).then(() => toast(S.restored)).catch(() => {});
        } });
      } catch {}
    });
  }
}
