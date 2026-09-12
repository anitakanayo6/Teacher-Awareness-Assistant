import { z } from 'zod';

export const observations = ['Withdrawal / social isolation', 'Reduced participation', 'Sudden academic decline', 'Missing homework', 'Difficulty concentrating', 'Irritability', 'Aggressive behavior', 'Frequent tiredness', 'Changes in attendance', 'Appearing anxious', 'Crying / emotional reactions', 'Changes in friendships', 'Bullying concerns', 'Loss of interest', 'Changes in eating behavior', 'Changes in sleep / fatigue', 'Other'] as const;
export const durations = ['Less than a week', '1–2 weeks', 'Several weeks', 'More than a month', 'Unsure'] as const;
export const frequencies = ['Rarely', 'Sometimes', 'Often', 'Almost every day', 'Unsure'] as const;
export const contexts = ['Academic work', 'Peer relationships', 'Bullying', 'Family / home situation', 'Recent major life event', 'Attendance', 'Classroom environment', 'Unknown', 'Other'] as const;
export const safetyOptions = ['Self-harm or suicidal thoughts', 'Threats of harm', 'Abuse or serious safeguarding concern', 'Immediate danger', 'Unsure about immediate safety'] as const;
export const concernLevels = ['low', 'moderate', 'elevated'] as const;
export const disclaimer = 'This tool does not diagnose mental health conditions. It helps teachers notice patterns, consider possible explanations, and choose appropriate supportive next steps.';
const limitedText = (max: number) => z.string().trim().max(max);
export const assessmentSchema = z.object({
  identifier: limitedText(40).min(1, 'Enter a nickname or anonymous identifier.'),
  ageRange: z.enum(['5–8', '9–12', '13–15', '16–18', '18+', 'Prefer not to say']),
  grade: limitedText(30), studentContext: limitedText(500),
  observations: z.array(z.enum(observations)).min(1, 'Select at least one observed change.').max(observations.length),
  otherObservation: limitedText(300), duration: z.enum(durations), frequency: z.enum(frequencies),
  contexts: z.array(z.enum(contexts)).max(contexts.length), otherContext: limitedText(300),
  notes: limitedText(2000), safetyConcerns: z.array(z.enum(safetyOptions)).max(safetyOptions.length),
  safetyReviewed: z.literal(true, { errorMap: () => ({ message: 'Please review the safety question before continuing.' }) }),
}).strict().superRefine((v, ctx) => {
  if (v.observations.includes('Other') && !v.otherObservation) ctx.addIssue({ code: 'custom', path: ['otherObservation'], message: 'Describe the other observed change.' });
  if (v.contexts.includes('Other') && !v.otherContext) ctx.addIssue({ code: 'custom', path: ['otherContext'], message: 'Describe the other context.' });
});
export type AssessmentInput = z.infer<typeof assessmentSchema>;
const lines = z.array(z.string().min(1).max(1000)).min(1).max(10);
export const guidanceSchema = z.object({
  summary: z.string().min(1).max(4000), possibleFactors: z.array(z.string().min(1).max(500)).max(10),
  concernLevel: z.enum(concernLevels), signalExplanation: z.string().min(1).max(1000),
  recommendedActions: lines, conversationStarters: z.array(z.string().min(1).max(1000)).max(10), followUpPlan: lines,
  safetyFlag: z.boolean(), safetyMessage: z.string().max(1000).nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.safetyFlag && (v.concernLevel !== 'elevated' || !v.safetyMessage)) ctx.addIssue({ code: 'custom', message: 'Safety escalation requires elevated support and a safety message.' });
  if (!v.safetyFlag && v.safetyMessage !== null) ctx.addIssue({ code: 'custom', message: 'Unexpected safety message.' });
});
export type Guidance = z.infer<typeof guidanceSchema>;
export type AnalysisMode = 'demo' | 'ai' | 'fallback' | 'safety';
export type FollowUp = { dueDate: string; status: 'pending' | 'complete'; completedAt: string | null };
export type Assessment = { id: string; createdAt: string; input: AssessmentInput; guidance: Guidance; mode: AnalysisMode; followUp: FollowUp };
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date.');
export const followUpSchema = z.object({ dueDate: dateSchema.optional(), status: z.enum(['pending', 'complete']).optional() }).strict().refine(v => v.dueDate || v.status, 'Choose a date or status.');
export type SafetyConfig = { emergency: string; safeguarding: string; wellbeing: string; crisis: string };
export type AppConfig = { aiEnabled: boolean; safety: SafetyConfig; privacy: string };
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function dateAfter(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return localDate(date); }
