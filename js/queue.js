// Offline write queue. Pure: storage, runner and network checks are injected, so node tests drive it.
// Ops carry client-made ids, so replaying one that already landed (Postgres 23505) counts as sent.
export const isDuplicate = e => e?.code === '23505' || /duplicate key/i.test(e?.message ?? '');

export function createQueue({ store, run, online, isOffline, onDrop = () => {}, onChange = () => {} }) {
  const list = () => store.get();
  const save = ops => { store.set(ops); onChange(ops.length); };
  let seq = Math.max(0, ...list().map(o => o.seq ?? 0));
  const enqueue = op => { save([...list(), { ...op, seq: ++seq }]); return 'queued'; };

  // Send now when online and nothing waits (keeps order); otherwise queue. Real errors throw to the caller.
  async function send(op) {
    if (online() && !list().length) {
      try {
        await run(op);
        return 'sent';
      } catch (e) {
        if (isDuplicate(e)) return 'sent';
        if (!isOffline(e)) throw e;
      }
    }
    return enqueue(op);
  }

  let flushing = false;
  async function flush() {
    if (!online() || flushing) return 0;
    flushing = true;
    let sent = 0;
    try {
      for (const op of list()) {
        try {
          await run(op);
          sent++;
        } catch (e) {
          if (isDuplicate(e)) sent++;
          else {
            if (isOffline(e) || /jwt|token|401|5\d\d/i.test(`${e.message} ${e.status ?? ''}`)) break; // retry later
            onDrop(op, e); // a refused row would block the queue forever: drop it and say so
          }
        }
        save(list().filter(o => o.seq !== op.seq));
      }
    } finally {
      flushing = false;
    }
    return sent;
  }
  return { send, flush, pending: list, size: () => list().length, clear: () => save([]) };
}

// Lay queued ops over server rows so an optimistic edit survives a refresh before the queue drains.
export function applyOps(rows, ops, table) {
  const out = rows.map(r => ({ ...r }));
  for (const op of ops) {
    if (op.table !== table) continue;
    if (op.kind === 'insert' && !out.some(r => r.id === op.row.id)) out.push({ ...op.row, pending: true });
    if (op.kind === 'patch') out.forEach(r => r.id === op.id && Object.assign(r, op.fields, { pending: true }));
  }
  return out;
}
