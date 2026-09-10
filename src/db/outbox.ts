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
 * Mark all pending outbox rows as synced (snapshot is on cloud).
 * Real mutation-log sync would POST payloads; MVP uses encrypted full snapshot.
 */
export async function markOutboxSynced(): Promise<number> {
  const db = await getDb();
  const pending = await listPendingOutbox();
  const tx = db.transaction('outbox', 'readwrite');
  for (const item of pending) {
    await tx.store.put({ ...item, status: 'synced' });
  }
  await tx.done;
  return pending.length;
}

/** @deprecated Use markOutboxSynced — kept for any lingering imports */
export const flushOutboxStub = markOutboxSynced;
