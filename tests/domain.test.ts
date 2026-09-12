import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessmentSchema, guidanceSchema, followUpSchema, safetyOptions } from '../shared/schema';
import { exampleInput, demoInputs } from '../shared/demo';
import { concernLevel, buildGuidance, hasSafetyConcern, selectionSchema, defaultSelection } from '../shared/guidance';
import { AIService, CompatibleProvider } from '../server/ai';

test('assessment validates observations, anonymous identifier, review and text limits', () => {
  assert.equal(assessmentSchema.safeParse(exampleInput).success, true);
  for (const invalid of [{ ...exampleInput, identifier: ' ' }, { ...exampleInput, observations: [] }, { ...exampleInput, notes: 'x'.repeat(2001) }, { ...exampleInput, safetyReviewed: false }, { ...exampleInput, observations: ['Other'] }, { ...exampleInput, contexts: ['Other'] }, { ...exampleInput, unexpected: 'ignore validation' }]) assert.equal(assessmentSchema.safeParse(invalid).success, false);
});
test('support signals cover low, moderate, elevated without claiming medical certainty', () => {
  assert.equal(concernLevel(demoInputs[2]), 'low');
  assert.equal(concernLevel(exampleInput), 'moderate');
  assert.equal(concernLevel({ ...exampleInput, frequency: 'Often' }), 'elevated');
  assert.equal(concernLevel({ ...demoInputs[2], contexts: ['Bullying'] }), 'moderate');
  assert.equal(concernLevel({ ...demoInputs[2], observations: ['Aggressive behavior'] }), 'moderate');
  assert.match(buildGuidance(demoInputs[2]).signalExplanation, /does not establish.*safe/);
});
test('every explicit safety option escalates even a recent isolated observation', () => {
  for (const option of safetyOptions) {
    const input = { ...demoInputs[2], safetyConcerns: [option] };
    const guidance = buildGuidance(input);
    assert.equal(guidance.safetyFlag, true);
    assert.equal(guidance.concernLevel, 'elevated');
    assert.deepEqual(guidance.conversationStarters, []);
    assert.match(guidance.safetyMessage!, /Do not rely on this tool for emergencies/);
  }
});
test('text safety tripwires scan all free-text fields and cannot be disabled by unchecked answers', () => {
  for (const notes of ['Student said I want to die', 'She is self-harming', 'He might hurt himself', 'Threatened another student', 'Reported abuse', 'They said they are better off dead', 'He did not want to live', 'They said their parent hit them', 'A weapon was seen']) assert.equal(hasSafetyConcern({ ...exampleInput, notes }), true, notes);
  for (const field of ['identifier', 'grade', 'studentContext', 'otherObservation', 'otherContext']) assert.equal(hasSafetyConcern({ ...exampleInput, [field]: 'self harm' }), true);
  assert.equal(hasSafetyConcern(exampleInput), false);
  assert.equal(hasSafetyConcern({ ...exampleInput, notes: 'No self-harm was reported.' }), true, 'Conservative false positives are intentional and disclosed');
});
test('structured guidance rejects malformed, empty, and inconsistent safety responses', () => {
  const guidance = buildGuidance(exampleInput);
  assert.equal(guidanceSchema.safeParse(guidance).success, true);
  for (const value of [{}, { ...guidance, concernLevel: 'certain' }, { ...guidance, recommendedActions: [] }, { ...guidance, safetyFlag: true }, { ...guidance, safetyMessage: 'unexpected' }]) assert.equal(guidanceSchema.safeParse(value).success, false);
  assert.equal(selectionSchema.safeParse({ factors: ['diagnosis'], actions: ['checkIn', 'listen'], conversations: ['quiet'], safetyFlag: false }).success, false);
});
test('AI service works with no key and with unavailable or malformed providers', async () => {
  assert.equal((await new AIService().analyzeStudentConcern(exampleInput)).mode, 'demo');
  assert.equal((await new AIService(undefined, true).analyzeStudentConcern(exampleInput)).mode, 'fallback');
  const broken = new AIService({ selectGuidance: async () => { throw Error('offline'); } });
  assert.equal((await broken.analyzeStudentConcern(exampleInput)).mode, 'fallback');
  const malformed = new AIService({ selectGuidance: async () => ({ factors: ['diagnosis'] }) as never });
  assert.equal((await malformed.analyzeStudentConcern(exampleInput)).mode, 'fallback');
});
test('safety bypasses provider and provider can escalate but never override explicit risk', async () => {
  let calls = 0;
  const service = new AIService({ selectGuidance: async () => { calls++; return defaultSelection(exampleInput); } });
  const result = await service.analyzeStudentConcern(demoInputs[0]);
  assert.equal(calls, 0); assert.equal(result.mode, 'safety'); assert.equal(result.guidance.safetyFlag, true);
  const escalating = new AIService({ selectGuidance: async () => ({ ...defaultSelection(exampleInput), safetyFlag: true }) });
  assert.equal((await escalating.analyzeStudentConcern(exampleInput)).guidance.safetyFlag, true);
});
test('compatible provider validates JSON, omits identifier and grade, and uses server key', async () => {
  let posted = '';
  const provider = new CompatibleProvider({ baseUrl: 'https://example.test/v1', model: 'test', key: 'test-key' }, (async (_url, options) => { posted = String(options?.body); assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-key'); return Response.json({ choices: [{ message: { content: JSON.stringify(defaultSelection(exampleInput)) } }] }); }) as typeof fetch);
  const result = await new AIService(provider).analyzeStudentConcern({ ...exampleInput, identifier: 'UNIQUE_PRIVATE_ID', grade: 'UNIQUE_GRADE' });
  assert.equal(result.mode, 'ai'); assert.equal(posted.includes('UNIQUE_PRIVATE_ID'), false); assert.equal(posted.includes('UNIQUE_GRADE'), false);
  for (const body of [{ choices: [{ message: { content: 'bad JSON' } }] }, { choices: [{ message: { refusal: 'Cannot help' } }] }]) {
    const bad = new CompatibleProvider({ baseUrl: 'https://example.test/v1', model: 'test', key: 'key' }, (async () => Response.json(body)) as typeof fetch);
    assert.equal((await new AIService(bad).analyzeStudentConcern(exampleInput)).mode, 'fallback');
  }
});
test('follow-up date validation rejects impossible dates and empty patches', () => {
  assert.equal(followUpSchema.safeParse({ dueDate: '2026-02-30' }).success, false);
  assert.equal(followUpSchema.safeParse({ dueDate: '2028-02-29' }).success, true);
  assert.equal(followUpSchema.safeParse({}).success, false);
  assert.equal(followUpSchema.safeParse({ status: 'complete' }).success, true);
});
