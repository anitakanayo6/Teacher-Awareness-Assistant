import { z } from 'zod';
import { guidanceSchema, type AssessmentInput, type Guidance } from './schema';

// The model selects reviewed content; no generated prose is rendered to a teacher.
export const factorLibrary = {
  academic: 'Academic pressure or a mismatch between current work and available support.',
  peers: 'Peer relationships, belonging, or changes in friendships.',
  bullying: 'Possible bullying or feeling unsafe with peers; seek school support rather than investigating alone.',
  change: 'Adjustment to change, grief, or a major life event, if already known to you.',
  energy: 'Fatigue or everyday wellbeing needs that may affect engagement.',
  worry: 'Worry or uncertainty about school; observations alone cannot establish the cause.',
  environment: 'Classroom routines, accessibility, or the learning environment.',
  unknown: 'The reason is not yet clear. The student’s perspective and a supportive check-in may help.',
} as const;
export const actionLibrary = {
  checkIn: 'Choose a private, appropriate moment for a calm check-in. Describe a specific change without labeling the student.',
  listen: 'Use open-ended questions and listen without rushing to solve things. Let the student choose how much to share.',
  academic: 'Offer a manageable next step, such as breaking an assignment into smaller parts or agreeing on a realistic deadline.',
  peers: 'Ask whether the student feels safe and included at school. Follow the school’s bullying procedure if concerns arise.',
  routine: 'Offer predictable routines and a low-pressure way to participate. Avoid calling attention to the concern in front of peers.',
  support: 'Consult the school’s designated wellbeing or support staff about the observed pattern, sharing only what is necessary.',
  observe: 'Record factual changes and the support offered. Review patterns rather than drawing conclusions from one incident.',
} as const;
export const conversationLibrary = {
  quiet: '“I’ve noticed you’ve been a little quieter in class lately. How have things been going for you?”',
  work: '“I noticed a few assignments have been harder to finish recently. Is there something that would make schoolwork more manageable?”',
  safety: '“How have things been going with other students? Do you feel safe and included at school?”',
  choice: '“You don’t have to tell me everything. Would you like to talk now, another time, or with someone else you trust at school?”',
  support: '“What is one thing we could do at school that would make this week a little easier?”',
} as const;
const keys = <T extends Record<string, string>>(value: T) => Object.keys(value) as [keyof T & string, ...(keyof T & string)[]];
export const selectionSchema = z.object({
  factors: z.array(z.enum(keys(factorLibrary))).min(1).max(5),
  actions: z.array(z.enum(keys(actionLibrary))).min(2).max(7),
  conversations: z.array(z.enum(keys(conversationLibrary))).min(1).max(4),
  safetyFlag: z.boolean(),
}).strict();
export type GuidanceSelection = z.infer<typeof selectionSchema>;
export const selectionJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['factors', 'actions', 'conversations', 'safetyFlag'],
  properties: {
    factors: { type: 'array', items: { type: 'string', enum: Object.keys(factorLibrary) }, minItems: 1, maxItems: 5 },
    actions: { type: 'array', items: { type: 'string', enum: Object.keys(actionLibrary) }, minItems: 2, maxItems: 7 },
    conversations: { type: 'array', items: { type: 'string', enum: Object.keys(conversationLibrary) }, minItems: 1, maxItems: 4 },
    safetyFlag: { type: 'boolean' },
  },
};

// Conservative English-language tripwire, not a comprehensive safeguarding classifier.
// Explicit safety answers always take priority, including uncertainty.
export function hasSafetyConcern(input: AssessmentInput) {
  const text = [input.identifier, input.grade, input.studentContext, input.otherObservation, input.otherContext, input.notes].join(' ').normalize('NFKC');
  return input.safetyConcerns.length > 0 || /\b(self[\s-]?harm\w*|suicid\w*|abus(?:e|ed|ing|ive)|molest\w*|rape|raped|assault\w*|overdos\w*|weapon|kill\w*|cutting\s+(?:my|him|her|them|your)?self|hurt\s+(?:my|him|her|them|your)self|harm\s+(?:my|him|her|them|your)self|end\s+(?:my|his|her|their)\s+life|want(?:s|ed)?\s+to\s+die|wish(?:es)?\s+(?:I|he|she|they)\s+(?:was|were)\s+dead|better\s+off\s+dead|not\s+want\s+to\s+(?:live|be\s+alive)|threat\w*|immediate\s+danger|unsafe\s+at\s+home|hit\s+(?:me|him|her|them)|touch(?:ed|ing)\s+(?:me|him|her|them)\s+inappropriately)\b/i.test(text);
}
export function concernLevel(input: AssessmentInput): Guidance['concernLevel'] {
  if (hasSafetyConcern(input)) return 'elevated';
  const persistent = ['Several weeks', 'More than a month'].includes(input.duration);
  const frequent = ['Often', 'Almost every day'].includes(input.frequency);
  if (persistent && frequent && new Set(input.observations).size >= 4) return 'elevated';
  if (persistent || frequent || input.observations.length >= 3 || input.observations.includes('Bullying concerns') || input.contexts.includes('Bullying') || input.observations.includes('Aggressive behavior')) return 'moderate';
  return 'low';
}
export function defaultSelection(input: AssessmentInput): GuidanceSelection {
  const factors: GuidanceSelection['factors'] = [];
  const actions: GuidanceSelection['actions'] = ['checkIn', 'listen'];
  const conversations: GuidanceSelection['conversations'] = ['quiet', 'choice'];
  if (input.observations.some(o => ['Sudden academic decline', 'Missing homework', 'Difficulty concentrating'].includes(o)) || input.contexts.includes('Academic work')) { factors.push('academic'); actions.push('academic'); conversations[0] = 'work'; }
  if (input.observations.some(o => ['Withdrawal / social isolation', 'Changes in friendships'].includes(o)) || input.contexts.includes('Peer relationships')) factors.push('peers');
  if (input.observations.includes('Bullying concerns') || input.contexts.includes('Bullying')) { factors.push('bullying'); actions.push('peers'); conversations.push('safety'); }
  if (input.observations.some(o => /tiredness|fatigue|eating/.test(o))) factors.push('energy');
  if (input.observations.includes('Appearing anxious')) factors.push('worry');
  if (input.contexts.includes('Recent major life event')) factors.push('change');
  if (input.contexts.includes('Classroom environment')) factors.push('environment');
  if (!factors.length) factors.push('unknown');
  actions.push(concernLevel(input) === 'low' ? 'routine' : 'support', 'observe');
  return { factors: factors.slice(0, 5), actions, conversations, safetyFlag: hasSafetyConcern(input) };
}
export function buildGuidance(input: AssessmentInput, selected = defaultSelection(input)): Guidance {
  const safetyFlag = hasSafetyConcern(input) || selected.safetyFlag;
  const level = safetyFlag ? 'elevated' : concernLevel(input);
  const changes = [...new Set(input.observations)].map(o => o === 'Other' ? `another change (${input.otherObservation})` : o.toLowerCase()).join(', ');
  const summary = `You recorded ${changes}. Duration: ${input.duration.toLowerCase()}; frequency: ${input.frequency.toLowerCase()}. These observations do not establish a cause.`;
  if (safetyFlag) return guidanceSchema.parse({
    summary, possibleFactors: [], concernLevel: 'elevated',
    signalExplanation: 'A potential safety concern was recorded or detected. This is a prompt for safeguarding action, not a clinical assessment. The text check is cautious and may flag quoted or negated wording.',
    recommendedActions: [
      'Follow your school’s emergency and safeguarding procedures now. If there is immediate danger, contact the appropriate local emergency service.',
      'Contact the designated safeguarding lead or an appropriate qualified professional promptly. If unavailable, follow the school’s escalation route.',
      'Prioritise immediate safety according to school procedures. Listen calmly, do not promise secrecy, and do not investigate or ask leading questions.',
      'Record factual observations through the school’s approved safeguarding system. Share only with those who need to act.',
    ], conversationStarters: [],
    followUpPlan: ['Act on the safety concern now; a reminder in this tool is not an escalation or referral.', 'Confirm the concern has reached the appropriate safeguarding professional according to school procedures.'],
    safetyFlag: true, safetyMessage: 'Do not rely on this tool for emergencies. Follow your school’s safeguarding/emergency procedures and contact the appropriate qualified professional or emergency service.',
  });
  const unique = <T,>(values: T[]) => [...new Set(values)];
  return guidanceSchema.parse({
    summary, possibleFactors: unique(selected.factors).map(k => factorLibrary[k]), concernLevel: level,
    signalExplanation: level === 'elevated' ? 'Several changes are reported frequently over an extended period. Seek timely school support. This rule-based support signal is not a diagnosis or a measure of clinical risk.' : level === 'moderate' ? 'The reported pattern merits a check-in and a planned review. This rule-based support signal is not a diagnosis or a measure of clinical risk.' : 'The information is limited or the changes are recent. A gentle check-in may help. Low concern does not establish that the student is safe or rule out distress.',
    recommendedActions: unique(['checkIn', 'listen', ...selected.actions, ...(level === 'elevated' ? ['support'] : []), 'observe'] as (keyof typeof actionLibrary)[]).map(k => actionLibrary[k]),
    conversationStarters: unique(selected.conversations).map(k => conversationLibrary[k]),
    followUpPlan: [level === 'elevated' ? 'Speak with school support staff promptly and agree a check-in within one school day.' : 'Arrange a gentle check-in within a few school days, at a time that works for the student.', 'Observe participation, peer interactions, and access to schoolwork; note what changes after support.', 'If concerns continue or increase, involve the designated school support staff. Any safety concern takes priority over this plan.'],
    safetyFlag: false, safetyMessage: null,
  });
}
