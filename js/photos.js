// Photos on a task: private bucket, folder = task id, so storage RLS follows task visibility.
import { sb } from './store.js';
import { S } from './strings.js';
import { shrink, toast, buzz } from './ui.js';

const bucket = () => sb.storage.from('task-photos');

export async function listPhotos(taskId) {
  if (!navigator.onLine) return [];
  const { data } = await bucket().list(taskId, { sortBy: { column: 'created_at', order: 'asc' } });
  const files = (data ?? []).filter(f => f.name !== '.emptyFolderPlaceholder');
  const urls = await Promise.all(files.map(f => bucket().createSignedUrl(`${taskId}/${f.name}`, 3600)));
  return files.map((f, i) => ({ path: `${taskId}/${f.name}`, url: urls[i].data?.signedUrl }));
}

export async function addPhoto(taskId, file) {
  if (!navigator.onLine) { toast(S.photoNeedsNet, 'bad'); throw new Error('offline'); }
  const blob = await shrink(file);
  const { error } = await bucket().upload(`${taskId}/${crypto.randomUUID()}.jpg`, blob, { contentType: 'image/jpeg' });
  if (error) { toast(S.photoFailed, 'bad'); throw error; }
  buzz(); toast(S.photoAdded);
}

export const removePhoto = path => bucket().remove([path]);

// Full-screen viewer. `onDelete` (owner only) removes the photo.
export function viewPhoto(url, onDelete) {
  const d = document.createElement('dialog');
  d.className = 'pv';
  d.innerHTML = `<div class="pv-bar"><button type="button" class="link" data-x>${S.photoClose}</button>${onDelete ? `<button type="button" class="link danger" data-del>${S.photoRemove}</button>` : ''}</div><img src="${url}" alt="">`;
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-x]').onclick = () => d.close();
  d.querySelector('[data-del]')?.addEventListener('click', async () => { await onDelete(); d.close(); });
  document.body.append(d);
  d.showModal();
}
