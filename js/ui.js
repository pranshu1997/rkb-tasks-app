import { S, LANG } from './strings.js';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

let timer;
// action = { label, fn }: a text button inside the toast (used for Undo).
export function toast(msg, kind = 'ok', action) {
  const el = document.getElementById('toast');
  el.replaceChildren(msg);
  if (action) {
    const b = Object.assign(document.createElement('button'), { className: 'toast-act', textContent: action.label });
    b.onclick = () => { el.className = ''; action.fn(); };
    el.append(b);
  }
  el.className = `show ${kind}`;
  clearTimeout(timer);
  timer = setTimeout(() => (el.className = ''), action ? 6000 : 2500);
}

// iOS Safari has no navigator.vibrate; clicking a hidden switch input (iOS 18+) plays the system tap haptic.
export function buzz(ms = 10) {
  try {
    if (navigator.vibrate) return navigator.vibrate(ms);
    let w = document.getElementById('hapt');
    if (!w) {
      w = Object.assign(document.createElement('label'), { id: 'hapt', innerHTML: '<input type="checkbox" switch>' });
      w.style.display = 'none';
      document.body.append(w);
    }
    w.click();
  } catch {}
}

// One bottom sheet at a time. `html` fills it; returns the dialog. Closing removes it.
export function sheet(title, html, { onClose } = {}) {
  document.querySelectorAll('dialog.sheet').forEach(d => d.remove());
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = `<div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="link" data-close>${S.close}</button></div>${html}`;
  d.addEventListener('click', e => e.target.closest('[data-close]') && d.close());
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  document.body.append(d);
  d.showModal();
  return d;
}

const dateFmt = new Intl.DateTimeFormat(LANG === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
export const fmtDay = day => dateFmt.format(new Date(`${day}T00:00:00`));
export const fmtWhen = iso => {
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${d.toLocaleTimeString(LANG === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

// Two-step confirm in place of window.confirm: the button becomes "Question? Cancel / Yes".
export function inlineConfirm(btn, question, yes, fn) {
  const box = document.createElement('div');
  box.className = 'confirm';
  box.innerHTML = `<p>${esc(question)}</p><div class="btns"><button type="button" class="ghost" data-no>${S.cancel}</button><button type="button" class="bad" data-yes>${esc(yes)}</button></div>`;
  btn.hidden = true;
  btn.after(box);
  box.querySelector('[data-no]').onclick = () => { box.remove(); btn.hidden = false; };
  box.querySelector('[data-yes]').onclick = () => fn();
}

// Phone photos are 3-10 MB; resize to a JPEG (longest side 1280) before upload.
export async function shrink(file, max = 1280) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}
