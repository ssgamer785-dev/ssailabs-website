import { describe, expect, it } from 'bun:test';
import { createIncomingGate } from './incoming-gate';

describe('incoming notification reconciliation', () => {
  it('ignores historical rows, preserves an INSERT during bootstrap, and dedupes reconnects', () => {
    const gate = createIncomingGate<{ id: string }>();
    expect(gate.insert({ id: 'new' })).toBeNull();
    expect(gate.baseline([{ id: 'old' }, { id: 'new' }])).toEqual([{ id: 'new' }]);
    expect(gate.insert({ id: 'new' })).toBeNull();
    expect(gate.poll([{ id: 'new' }, { id: 'later' }])).toEqual([{ id: 'later' }]);
    expect(gate.poll([{ id: 'later' }])).toEqual([]);
  });

  it('keeps separate account/event streams isolated', () => {
    const admin = createIncomingGate<{ id: string }>();
    const student = createIncomingGate<{ id: string }>();
    admin.baseline([]);
    student.baseline([]);
    expect(admin.insert({ id: 'same' })).toEqual({ id: 'same' });
    expect(student.insert({ id: 'same' })).toEqual({ id: 'same' });
  });
});
