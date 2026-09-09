import { newId } from '../lib/id';
import type { OutboxEntity, OutboxItem, OutboxOp } from '../lib/types';
import { getDb } from './schema';

/** Enqueue a mutation for future sync. LWW-ready via clientTs. */
export async function enqueueOutbox(
  entity: OutboxEntity,
  entityId: string,
  op: OutboxOp,
  payload: unknown,
): Promise<OutboxItem> {
  const db = await getDb();
  const now = Date.now();
  const item: OutboxItem = {
    id: newId(),
    entity,
    entityId,
    op,
    payload,
    clientTs: now,
    createdAt: now,
    status: 'pending',
  };
  await db.put('outbox', item);
  return item;
}

export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('outbox', 'by-status', 'pending');
}

export async function listPendingOutbox(): Promise<OutboxItem[]> {
  const db = await getDb();
  return db.getAllFromIndex('outbox', 'by-status', 'pending');
}

/**
 * Stub: mark all pending as synced.
 * Real backend would POST payloads and use server clock / LWW.
 */
export async function flushOutboxStub(): Promise<number> {
  const db = await getDb();
  const pending = await listPendingOutbox();
  const tx = db.transaction('outbox', 'readwrite');
  for (const item of pending) {
    await tx.store.put({ ...item, status: 'synced' });
  }
  await tx.done;
  return pending.length;
}
