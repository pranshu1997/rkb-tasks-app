// Next due date of a repeating task. Mirrors public.next_due() in the database (same test table in tests/recur.test.mjs).
// `anchor` = the day of month the task started on, so 31 Jan -> 28 Feb -> 31 Mar.
export const RULES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function nextDue(rule, due, anchor) {
  const [y, m, d] = due.split('-').map(Number);
  if (rule === 'weekly') return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const first = new Date(Date.UTC(y, m - 1 + MONTHS[rule], 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(anchor ?? d, last));
}
