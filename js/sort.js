// Pure helpers for ordering and filtering tasks. No DOM, so node tests cover them.
const pad = n => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
export const daysBetween = (a, b) => {
  const t = s => Date.UTC(...s.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((t(b) - t(a)) / 864e5);
};
export const isOpen = t => t.status !== 'done' && !t.deleted_at;

// 0 overdue, 1 due today, 2 everything else
export const bucket = (t, today) => (!t.due_date ? 2 : t.due_date < today ? 0 : t.due_date === today ? 1 : 2);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Overdue first (oldest due first), then due today, then priority (High first), then oldest created.
export const compareTasks = today => (a, b) => {
  const ba = bucket(a, today), bb = bucket(b, today);
  if (ba !== bb) return ba - bb;
  if (ba === 0 && a.due_date !== b.due_date) return cmp(a.due_date, b.due_date);
  return a.priority - b.priority || cmp(a.created_at, b.created_at);
};

// Today = open and (overdue or due today or High priority). `extra` = ids just added or ticked, kept visible this session.
export function todayList(tasks, today, extra = new Set()) {
  return tasks
    .filter(t => !t.deleted_at && (extra.has(t.id) || (isOpen(t) && ((t.due_date && t.due_date <= today) || t.priority === 1))))
    .sort(compareTasks(today));
}
