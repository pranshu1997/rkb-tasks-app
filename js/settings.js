import { state, isOwner, subscribe, getSettings, setReminderTime, addCategory, patchCategory, addPerson, patchPerson, reassignOpen, person, live } from './store.js';
import { isOpen } from './sort.js';
import { S, LANG, setLang } from './strings.js';
import { pushState, enablePush, disablePush } from './push.js';
import { APP_VERSION } from './config.js';
import { esc, sheet, toast, inlineConfirm, buzz } from './ui.js';

const rowBtn = (attrs, label, right = '', cls = 'row') => `<button class="${cls}" ${attrs}><span class="grow">${label}</span>${right}</button>`;
const chev = '<span class="chev">›</span>';

function categorySheet(id) {
  const c = id && state.cats.find(x => x.id === id);
  const d = sheet(c ? S.rename : S.addCategory, `<form class="stack"><label>${S.categoryName}<input name="name" maxlength="40" required value="${esc(c?.name)}"></label>
    <button class="save">${S.save}</button></form>${c ? `<button type="button" class="link danger" data-arch>${S.archive}</button>` : ''}`);
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    d.close();
    try { await (c ? patchCategory(id, { name }) : addCategory(name)); toast(S.saved); } catch (err) { toast(/duplicate|23505/.test(err.message + err.code) ? S.catExists : S.changeFailed, 'bad'); }
  };
  const a = d.querySelector('[data-arch]');
  if (a) a.onclick = () => inlineConfirm(a, `${S.archive}?`, S.archive, async () => {
    d.close();
    try { await patchCategory(id, { archived_at: new Date().toISOString() }); toast(S.archived); } catch {}
  });
}

function employeeSheet(id) {
  const p = id && person(id);
  const d = sheet(p ? S.editEmployee : S.newEmployee, `<form class="stack">
    <label>${S.fName}<input name="name" maxlength="80" required value="${esc(p?.name)}"></label>
    <label>${S.fPhone}<input name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(p?.phone)}"></label>
    <label>${S.fJob}<input name="job" maxlength="40" value="${esc(p?.job)}"></label>
    <button class="save">${S.save}</button></form>
    ${p ? `<div class="stack" data-active>${p.active ? `<button type="button" class="link danger" data-off>${S.setInactive}</button>` : `<button type="button" class="ghost" data-on>${S.reactivate}</button>`}</div>` : ''}
    <p class="muted foot">${S.loginNote}</p>`);
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const f = { name: v.name.trim(), phone: v.phone.trim() || null, job: v.job.trim() || null };
    try { await (p ? patchPerson(id, f) : addPerson(f)); d.close(); toast(S.saved); } catch (err) { if (err.message !== 'offline') toast(S.changeFailed, 'bad'); }
  };
  d.querySelector('[data-on]')?.addEventListener('click', async () => { try { await patchPerson(id, { active: true }); d.close(); toast(S.saved); } catch {} });
  const off = d.querySelector('[data-off]');
  if (off) off.onclick = () => inlineConfirm(off, `${S.setInactive}?`, S.setInactive, async () => {
    try { await patchPerson(id, { active: false }); d.close(); toast(S.saved); }
    catch (err) { if (/reassign/i.test(err.message)) moveTasks(d, id); else if (err.message !== 'offline') toast(S.changeFailed, 'bad'); }
  });
}

// The database refuses to deactivate someone who still holds open tasks: offer to move them, then deactivate.
function moveTasks(d, id) {
  const p = person(id);
  const others = state.people.filter(x => x.active && x.id !== id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  const box = d.querySelector('[data-active]');
  box.innerHTML = `<div class="confirm"><p><b>${S.moveTitle}</b></p><p class="muted">${esc(S.moveBody(live().filter(t => t.assignee_id === id && isOpen(t)).length, p.name))}</p>
    <label>${S.moveTo}<select name="to">${others}</select></label><button type="button" class="save" data-move>${S.moveGo}</button></div>`;
  box.querySelector('[data-move]').onclick = async () => {
    try {
      const n = await reassignOpen(id, box.querySelector('[name=to]').value);
      await patchPerson(id, { active: false });
      d.close(); toast(S.moved(n)); buzz();
    } catch (err) { if (err.message !== 'offline') toast(S.changeFailed, 'bad'); }
  };
}

const PUSH_TEXT = { on: S.pushOn, off: S.pushOff, blocked: S.pushBlocked, unsupported: S.pushUnsupported, 'install-first': S.pushInstallFirst };

export function mountSettings(el, { email, signOut }) {
  let push = 'off', time = '09:00';
  async function load() {
    [push, time] = await Promise.all([pushState().catch(() => 'unsupported'), getSettings().then(r => r?.reminder_time ?? '09:00').catch(() => time)]);
    render();
  }
  function render() {
    if (el.hidden) return;
    const own = isOwner();
    const reminders = `<h2 class="sec">${S.reminders}</h2><div class="group"><div class="static">${PUSH_TEXT[push]}</div>
      ${push === 'on' ? rowBtn('data-push="off"', S.pushDisable, '', 'row action') : push === 'off' ? rowBtn('data-push="on"', S.pushEnable, '', 'row action') : ''}
      ${own ? `<div class="static"><label>${S.morningAt}<input type="time" name="reminder_time" value="${time}"></label></div>` : `<div class="static muted">${S.morningNote(time)}</div>`}</div>
      ${own ? `<p class="foot muted">${S.morningNote(time)}</p>` : ''}`;
    const cats = state.cats.map(c => rowBtn(`data-cat="${c.id}"`, esc(c.name), chev)).join('');
    const people = state.people.filter(p => p.role === 'member').map(p =>
      rowBtn(`data-emp="${p.id}"`, `${esc(p.name)}${p.job ? ` <span class="muted">· ${esc(p.job)}</span>` : ''}${p.active ? '' : ` <span class="muted">· ${S.inactive}</span>`}`, chev)).join('');
    el.innerHTML = `<div class="large-title"><h1>${S.tabSettings}</h1></div>
      ${own ? `<h2 class="sec">${S.categories}</h2><div class="group">${cats}${rowBtn('data-cat="new"', '+ ' + S.addCategory, '', 'row add')}</div>
      <h2 class="sec">${S.employees}</h2><div class="group">${people}${rowBtn('data-emp="new"', '+ ' + S.addEmployee, '', 'row add')}</div>
      <p class="foot muted">${S.loginNote}</p>` : ''}
      <h2 class="sec">${S.language}</h2><div class="group"><div class="static"><div class="seg2" data-lang>${[['en', S.langEn], ['hi', S.langHi]].map(([k, v]) => `<button type="button" data-l="${k}" aria-pressed="${LANG === k}" lang="${k}">${v}</button>`).join('')}</div></div></div>
      ${reminders}
      <h2 class="sec">${S.account}</h2><div class="group"><div class="static">${esc(state.me?.name ?? '')}<span class="muted">${esc(email)}</span></div>
      ${rowBtn('data-signout', S.signOut, '', 'row action')}</div>
      <p class="foot muted">${S.version(APP_VERSION)}</p>`;
  }
  el.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]'), m = e.target.closest('[data-emp]');
    if (c) categorySheet(c.dataset.cat === 'new' ? null : c.dataset.cat);
    else if (m) employeeSheet(m.dataset.emp === 'new' ? null : m.dataset.emp);
    else if (e.target.closest('[data-l]')) { const l = e.target.closest('[data-l]').dataset.l; if (l !== LANG) setLang(l); }
    else if (e.target.closest('[data-signout]')) signOut();
    else if (e.target.closest('[data-push]')) {
      const on = e.target.closest('[data-push]').dataset.push === 'on';
      (on ? enablePush() : disablePush()).then(load).catch(err => { toast(err.message, 'bad'); load(); });
    }
  });
  el.addEventListener('change', async e => {
    if (e.target.name !== 'reminder_time' || !e.target.value) return;
    try { await setReminderTime(e.target.value); time = e.target.value; toast(S.timeSaved); render(); } catch { toast(S.changeFailed, 'bad'); e.target.value = time; }
  });
  subscribe(render);
  return () => { render(); load(); };
}
