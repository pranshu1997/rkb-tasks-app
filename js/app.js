import { sb, state, isOwner, paintCached, boot, bindUser, pull, flush, watch, queue, clearLocal, isOffline } from './store.js';
import { mountList, clearKeep } from './tasks.js';
import { mountSettings } from './settings.js';
import { mountTeam } from './team.js';
import { S, LANG } from './strings.js';
import { esc, buzz } from './ui.js';

const root = document.getElementById('app');
const net = document.getElementById('net');

const svg = d => `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON = {
  today: svg('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'),
  team: svg('M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3 3 0 0 1 0 5.6'),
  all: svg('M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2'),
  done: svg('M5 12.5l4.5 4.5L19 7.5'),
  settings: svg('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
};

function banner() {
  const n = queue.size();
  const off = !navigator.onLine;
  net.hidden = !off && !n;
  net.textContent = off ? S.offline + (n ? ` ${n} waiting.` : '') : S.waiting(n);
}
addEventListener('online', banner); addEventListener('offline', banner); addEventListener('rkb:queue', banner);

let renders = {};
function showTab(name) {
  if (!root.querySelector(`[data-view=${name}]`)) name = 'today';
  clearKeep();
  root.querySelectorAll('[data-view]').forEach(v => (v.hidden = v.dataset.view !== name));
  root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  history.replaceState(null, '', name === 'today' ? location.pathname : `#${name}`);
  renders[name]?.();
  scrollTo(0, 0);
}
addEventListener('rkb:tab', e => showTab(e.detail));

function shell(email) {
  const own = isOwner();
  root.innerHTML = `<div data-view="today"></div><div data-view="all" hidden></div><div data-view="done" hidden></div>${own ? '<div data-view="team" hidden></div>' : ''}<div data-view="settings" hidden></div>
    <nav class="tabs">
      <button data-tab="today">${ICON.today}<span>${S.tabToday}</span></button>
      <button data-tab="all">${ICON.all}<span>${S.tabAll}</span></button>
      <button data-tab="done">${ICON.done}<span>${S.tabDone}</span></button>
      ${own ? `<button data-tab="team">${ICON.team}<span>${S.tabTeam}</span></button>` : ''}
      <button data-tab="settings">${ICON.settings}<span>${S.tabSettings}</span></button></nav>`;
  const v = n => root.querySelector(`[data-view=${n}]`);
  renders = {
    ...(own ? { team: mountTeam(v('team')) } : {}),
    today: mountList(v('today'), 'today'), all: mountList(v('all'), 'all'), done: mountList(v('done'), 'done'),
    settings: mountSettings(v('settings'), { email, signOut }),
  };
  root.querySelector('nav').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
  showTab(location.hash.slice(1) || 'today');
}

async function signOut() {
  const n = queue.size();
  if (n && !document.querySelector('#signout-ask')) {
    const b = root.querySelector('[data-signout]');
    b.insertAdjacentHTML('afterend', `<div id="signout-ask" class="static"><p>${S.signOutWaiting(n)}</p></div>`);
    b.textContent = S.signOutAnyway;
    return;
  }
  buzz();
  // Stop this phone's pushes for this login first (best effort; never blocks sign-out).
  await Promise.race([import('./push.js').then(m => m.disablePush()).catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  await sb.auth.signOut();
  clearLocal();
  start();
}

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return login();
  const uid = session.user.id, email = session.user.email;
  bindUser(uid);
  if (paintCached() && (state.me = state.people.find(p => p.user_id === uid) ?? null)) {
    shell(email);
    pull().then(() => { state.me = state.people.find(p => p.user_id === uid) ?? state.me; renders[location.hash.slice(1) || 'today']?.(); }).catch(() => {});
  } else {
    root.innerHTML = `<p class="center muted">${S.loading}</p>`;
    try { await boot(uid); } catch (e) { return fail(e, email); }
    if (!state.me) return noAccess(email);
    shell(email);
  }
  banner(); flush(); watch();
}

const fail = (e, email) => {
  root.innerHTML = `<div class="group"><div class="static"><p>${isOffline(e) ? S.noNet : esc(e.message)}</p><button class="link" onclick="location.reload()">${S.refresh}</button></div></div>`;
};
const noAccess = email => {
  root.innerHTML = `<div class="large-title"><h1>${S.noAccess}</h1></div><div class="group"><div class="static"><p>${esc(S.noAccessBody(email))}</p><p class="muted">${S.noAccessHint}</p></div>
    <button class="row action" data-signout>${S.signOut}</button></div>`;
  root.querySelector('[data-signout]').onclick = signOut;
};

function login() {
  let remembered = '';
  try { remembered = localStorage.getItem('login-email') ?? ''; } catch {}
  root.innerHTML = `<form class="login"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>${S.appName}</h1><p class="muted">${S.signInHint}</p>
    <label>${S.email}<input name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${esc(remembered)}"></label>
    <label>${S.password}<span class="pw"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="link" data-show>${S.show}</button></span></label>
    <button class="save">${S.signIn}</button><p class="login-error" role="alert"></p></form>`;
  const form = root.querySelector('form'), err = form.querySelector('.login-error');
  (remembered ? form.password : form.email).focus();
  form.querySelector('[data-show]').onclick = e => {
    const shown = form.password.type === 'text';
    form.password.type = shown ? 'password' : 'text';
    e.target.textContent = shown ? S.show : S.hide;
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase(), btn = form.querySelector('.save');
    btn.disabled = true; btn.textContent = S.signingIn; err.textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email, password: form.password.value });
    btn.disabled = false; btn.textContent = S.signIn;
    if (error) { err.textContent = error.message === 'Invalid login credentials' ? S.badLogin : isOffline(error) ? S.noNet : error.message; return; }
    try { localStorage.setItem('login-email', email); } catch {}
    start();
  };
}

document.title = S.appName;
document.documentElement.lang = LANG;
if ('serviceWorker' in navigator) {
  // A new deploy's worker takes over in the background; reload once so the open page runs it too.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
start();
