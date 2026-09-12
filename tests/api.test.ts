import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { Repository } from '../server/db';
import { AIService } from '../server/ai';
import { createApp } from '../server/app';
import { exampleInput } from '../shared/demo';
import { buildGuidance } from '../shared/guidance';
import type { Assessment } from '../shared/schema';

test('SQLite migration, transaction, persistence, ownership, follow-up completion and cascade delete', () => {
  const directory = mkdtempSync(join(tmpdir(), 'taa-test-'));
  const path = join(directory, 'test.db');
  let repo = new Repository(path);
  try {
    repo.ensureTeacher('teacher-1'); repo.ensureTeacher('teacher-1');
    assert.equal(repo.list('teacher-1').length, 3, 'Seeding is idempotent');
    const entry = repo.create('teacher-1', exampleInput, buildGuidance(exampleInput), 'demo');
    assert.equal(repo.get('other-teacher', entry.id), null);
    assert.equal(repo.updateFollowUp('other-teacher', entry.id, { status: 'complete' }), null);
    assert.equal(repo.delete('other-teacher', entry.id), false);
    repo.close(); repo = new Repository(path);
    assert.equal(repo.get('teacher-1', entry.id)?.input.identifier, 'Student A');
    const done = repo.updateFollowUp('teacher-1', entry.id, { status: 'complete' })!;
    assert.equal(done.followUp.status, 'complete'); assert.ok(done.followUp.completedAt);
    const reopened = repo.updateFollowUp('teacher-1', entry.id, { dueDate: '2028-01-20', status: 'pending' })!;
    assert.equal(reopened.followUp.completedAt, null); assert.equal(reopened.followUp.dueDate, '2028-01-20');
    assert.equal(repo.delete('teacher-1', entry.id), true);
    assert.equal(repo.db.prepare('SELECT * FROM observations WHERE assessment_id=?').all(entry.id).length, 0);
    assert.equal(repo.db.prepare('SELECT * FROM follow_ups WHERE assessment_id=?').all(entry.id).length, 0);
  } finally { repo.close(); rmSync(directory, { recursive: true }); }
});

test('API validates, persists, retrieves, isolates sessions, handles failures and protects mutations', async () => {
  const repo = new Repository(':memory:');
  const server = createApp(repo, new AIService()).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  let cookie = '';
  const call = async (path: string, method = 'GET', body?: unknown, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'TeacherAwareness', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  try {
    const config = await call('/config');
    assert.equal(config.status, 200); assert.match(config.headers.get('set-cookie')!, /HttpOnly/); assert.match(config.headers.get('set-cookie')!, /SameSite=Strict/);
    assert.equal(config.headers.get('cache-control'), 'no-store');
    const settings = await config.json(); assert.equal('key' in settings, false);
    assert.equal((await (await call('/assessments')).json()).length, 3);
    assert.equal((await call('/assessments', 'POST', {})).status, 400);
    assert.equal((await call('/assessments', 'POST', exampleInput, { Origin: 'https://untrusted.test' })).status, 403);
    const created = await call('/assessments', 'POST', exampleInput); assert.equal(created.status, 201);
    const entry = await created.json() as Assessment; assert.equal(entry.mode, 'demo');
    assert.equal((await (await call(`/assessments/${entry.id}`)).json()).input.identifier, 'Student A');
    const oldCookie = cookie; cookie = '';
    assert.equal((await call(`/assessments/${entry.id}`)).status, 404);
    assert.equal((await call(`/assessments/${entry.id}/follow-up`, 'PATCH', { status: 'complete' })).status, 404);
    cookie = oldCookie;
    assert.equal((await call(`/assessments/${entry.id}/follow-up`, 'PATCH', { dueDate: '2026-02-30' })).status, 400);
    const follow = await call(`/assessments/${entry.id}/follow-up`, 'PATCH', { status: 'complete' });
    assert.equal((await follow.json()).followUp.status, 'complete');
    const safety = await call('/assessments', 'POST', { ...exampleInput, notes: 'Student mentioned self-harm.' });
    assert.equal((await safety.json()).guidance.safetyFlag, true);
    assert.equal((await call(`/assessments/${entry.id}`, 'DELETE', {})).status, 204);
    assert.equal((await call(`/assessments/${entry.id}`)).status, 404);
    assert.equal((await call('/assessments/not-an-id')).status, 400);
    repo.db.exec('DROP TABLE follow_ups');
    const failure = await call('/assessments'); assert.equal(failure.status, 500); assert.match((await failure.json()).error, /Refresh history/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); repo.close(); }
});
