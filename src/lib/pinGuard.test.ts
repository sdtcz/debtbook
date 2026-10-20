import { describe, expect, it } from 'vitest';
import { guardDelete, requestPin, shouldAskPinBeforeDelete, subscribePinRequests } from './pinGuard';

const withPin = { pinHash: 'h', pinSalt: 's' };

describe('shouldAskPinBeforeDelete', () => {
  it('only asks when the setting is on and a PIN is set', () => {
    expect(shouldAskPinBeforeDelete(null)).toBe(false);
    expect(shouldAskPinBeforeDelete({ pinBeforeDelete: true })).toBe(false);
    expect(shouldAskPinBeforeDelete({ ...withPin })).toBe(false);
    expect(shouldAskPinBeforeDelete({ ...withPin, pinBeforeDelete: false })).toBe(false);
    expect(shouldAskPinBeforeDelete({ ...withPin, pinBeforeDelete: true })).toBe(true);
  });
});

describe('guardDelete', () => {
  it('allows straight away when no PIN is needed (no prompt shown)', async () => {
    let shown = 0;
    const off = subscribePinRequests((r) => r && shown++);
    await expect(guardDelete({ pinBeforeDelete: true })).resolves.toBe(true);
    await expect(guardDelete(async () => ({ ...withPin }))).resolves.toBe(true);
    expect(shown).toBe(0);
    off();
  });

  it('prompts and resolves with the PIN result', async () => {
    const seen: string[] = [];
    let answer = true;
    const off = subscribePinRequests((r) => {
      if (!r) return;
      seen.push(`${r.salt}:${r.hash}`);
      queueMicrotask(() => r.resolve(answer));
    });
    await expect(guardDelete({ ...withPin, pinBeforeDelete: true })).resolves.toBe(true);
    answer = false;
    await expect(guardDelete(async () => ({ ...withPin, pinBeforeDelete: true }))).resolves.toBe(false);
    expect(seen).toEqual(['s:h', 's:h']);
    off();
  });

  it('fails closed when no PIN host is mounted', async () => {
    await expect(requestPin('s', 'h')).resolves.toBe(false);
    await expect(guardDelete({ ...withPin, pinBeforeDelete: true })).resolves.toBe(false);
  });

  it('cancels an older prompt when a new one starts', async () => {
    const reqs: Array<{ resolve: (ok: boolean) => void }> = [];
    const off = subscribePinRequests((r) => r && reqs.push(r));
    const first = requestPin('s', 'h');
    const second = requestPin('s', 'h');
    await expect(first).resolves.toBe(false);
    reqs[1].resolve(true);
    await expect(second).resolves.toBe(true);
    off();
  });
});
