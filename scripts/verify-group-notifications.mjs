// Verification for src/context/groupNotificationDerive.js (WO-11).
// The repo has no unit-test runner; this standalone script asserts the pure
// unread-derivation logic the GroupNotificationContext provider builds on.
//
//   node scripts/verify-group-notifications.mjs

import assert from 'node:assert/strict';

// loadBaselines/saveBaselines touch localStorage; give node a minimal stub.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  loadBaselines, saveBaselines, snapshotGroup, deriveUnread, reconcile, classifyDisappearance,
} = await import('../src/context/groupNotificationDerive.js');

const NOW = '2026-06-10T12:00:00.000Z';
const group = (over = {}) => ({
  id: 'g1', name: 'Bio Finals', memberCount: 3, libraryCount: 5, activeSession: null, ...over,
});

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// --- snapshotGroup / deriveUnread -------------------------------------------

check('first sight: no baseline => 0 unread', () => {
  assert.equal(deriveUnread(group(), undefined), 0);
});

check('snapshot then unchanged poll => 0 unread', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(base.lastSeenAt, NOW);
  assert.equal(deriveUnread(group(), base), 0);
});

check('contribution delta counts one per new item', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(deriveUnread(group({ libraryCount: 8 }), base), 3);
});

check('library shrink never goes negative', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(deriveUnread(group({ libraryCount: 2 }), base), 0);
});

check('new live session adds 1', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(deriveUnread(group({ activeSession: { sessionId: 's1' } }), base), 1);
});

check('session already seen adds 0', () => {
  const base = snapshotGroup(group({ activeSession: { sessionId: 's1' } }), NOW);
  assert.equal(deriveUnread(group({ activeSession: { sessionId: 's1' } }), base), 0);
});

check('a later, different session alerts again', () => {
  const base = snapshotGroup(group({ activeSession: { sessionId: 's1' } }), NOW);
  assert.equal(deriveUnread(group({ activeSession: { sessionId: 's2' } }), base), 1);
});

check('ended session adds 0', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(deriveUnread(group({ activeSession: null }), base), 0);
});

check('membership change adds 1 (either direction)', () => {
  const base = snapshotGroup(group(), NOW);
  assert.equal(deriveUnread(group({ memberCount: 4 }), base), 1);
  assert.equal(deriveUnread(group({ memberCount: 2 }), base), 1);
});

check('combined: contributions + session + membership', () => {
  const base = snapshotGroup(group(), NOW);
  const g = group({ libraryCount: 7, memberCount: 4, activeSession: { sessionId: 's9' } });
  assert.equal(deriveUnread(g, base), 4); // 2 items + 1 session + 1 membership
});

// --- reconcile ----------------------------------------------------------------

check('reconcile baselines unknown groups at zero unread', () => {
  const { unreadCountByGroup, nextBaselines, disappearedIds } = reconcile([group()], {}, NOW);
  assert.deepEqual(unreadCountByGroup, { g1: 0 });
  assert.equal(nextBaselines.g1.libraryCount, 5);
  assert.deepEqual(disappearedIds, []);
});

check('reconcile derives unread for known groups and keeps lastSeenAt', () => {
  const baselines = { g1: snapshotGroup(group(), '2026-06-09T00:00:00.000Z') };
  const { unreadCountByGroup, nextBaselines } =
    reconcile([group({ libraryCount: 6 })], baselines, NOW);
  assert.deepEqual(unreadCountByGroup, { g1: 1 });
  assert.equal(nextBaselines.g1.lastSeenAt, '2026-06-09T00:00:00.000Z'); // not seen, not advanced
});

check('reconcile lowers a baseline past removed items (self-healing)', () => {
  const baselines = { g1: snapshotGroup(group({ libraryCount: 9 }), NOW) };
  const { nextBaselines } = reconcile([group({ libraryCount: 4 })], baselines, NOW);
  assert.equal(nextBaselines.g1.libraryCount, 4);
});

check('reconcile re-snapshots the open detail group (continuously seen)', () => {
  const baselines = { g1: snapshotGroup(group(), '2026-06-09T00:00:00.000Z') };
  const { unreadCountByGroup, nextBaselines } =
    reconcile([group({ libraryCount: 9, activeSession: { sessionId: 's3' } })], baselines, NOW, 'g1');
  assert.deepEqual(unreadCountByGroup, { g1: 0 });
  assert.equal(nextBaselines.g1.libraryCount, 9);
  assert.equal(nextBaselines.g1.lastSessionId, 's3');
  assert.equal(nextBaselines.g1.lastSeenAt, NOW);
});

check('reconcile reports disappeared groups and drops their baselines', () => {
  const baselines = {
    g1: snapshotGroup(group(), NOW),
    gone: snapshotGroup(group({ id: 'gone' }), NOW),
  };
  const { nextBaselines, disappearedIds } = reconcile([group()], baselines, NOW);
  assert.deepEqual(disappearedIds, ['gone']);
  assert.equal(nextBaselines.gone, undefined);
});

// --- classifyDisappearance ------------------------------------------------------

const NOTIFS = [
  { type: 'group_removed', groupId: 'gA', groupName: 'Chem', fromUserId: 'u2', fromName: 'Ada', createdAt: '2026-06-10T01:00:00Z', read: false },
  { type: 'group_disbanded', groupId: 'gB', groupName: 'Physics', fromUserId: 'u3', fromName: 'Grace', createdAt: '2026-06-10T02:00:00Z', read: false },
  { type: 'group_invitation', groupId: 'gC', groupName: 'Math', createdAt: '2026-06-10T03:00:00Z', read: false },
];

check('classify removal', () => {
  const info = classifyDisappearance(NOTIFS, 'gA');
  assert.equal(info.type, 'group_removed');
  assert.equal(info.groupName, 'Chem');
  assert.equal(info.fromName, 'Ada');
});

check('classify disband', () => {
  assert.equal(classifyDisappearance(NOTIFS, 'gB').type, 'group_disbanded');
});

check('no matching record => null (caller falls back to generic notice)', () => {
  assert.equal(classifyDisappearance(NOTIFS, 'gZ'), null);
  assert.equal(classifyDisappearance(NOTIFS, 'gC'), null); // invitation is not a disappearance
  assert.equal(classifyDisappearance(undefined, 'gA'), null);
});

check('latest matching record wins', () => {
  const twice = [
    { type: 'group_removed', groupId: 'gA', groupName: 'Chem v1', createdAt: '2026-06-01T00:00:00Z' },
    { type: 'group_removed', groupId: 'gA', groupName: 'Chem v2', createdAt: '2026-06-09T00:00:00Z' },
  ];
  assert.equal(classifyDisappearance(twice, 'gA').groupName, 'Chem v2');
});

// --- persistence ----------------------------------------------------------------

check('save/load round-trip per user', () => {
  const baselines = { g1: snapshotGroup(group(), NOW) };
  saveBaselines('user-1', baselines);
  assert.deepEqual(loadBaselines('user-1'), baselines);
  assert.deepEqual(loadBaselines('user-2'), {});
});

check('corrupt payload tolerated', () => {
  localStorage.setItem('covalent.groupSeen.user-3', '{not json');
  assert.deepEqual(loadBaselines('user-3'), {});
  localStorage.setItem('covalent.groupSeen.user-4', '[1,2,3]');
  assert.deepEqual(loadBaselines('user-4'), {});
  assert.deepEqual(loadBaselines(null), {});
});

console.log(`\nAll ${passed} checks passed.`);
