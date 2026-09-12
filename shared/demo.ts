import type { AssessmentInput } from './schema';
export const exampleInput: AssessmentInput = {
  identifier: 'Student A', ageRange: '13–15', grade: 'Year 9', studentContext: '',
  observations: ['Withdrawal / social isolation', 'Reduced participation', 'Missing homework', 'Frequent tiredness'],
  otherObservation: '', duration: 'Several weeks', frequency: 'Sometimes', contexts: ['Academic work', 'Peer relationships'], otherContext: '',
  notes: 'Usually volunteers in class. Over the past three weeks, has spoken less, missed two assignments, appeared tired, and spent breaks apart from classmates.',
  safetyConcerns: [], safetyReviewed: true,
};
export const demoInputs: AssessmentInput[] = [
  { ...exampleInput, identifier: 'Student C', grade: 'Year 10', observations: ['Withdrawal / social isolation', 'Changes in attendance'], duration: '1–2 weeks', frequency: 'Often', contexts: ['Unknown'], notes: 'The student said they do not feel safe at home. A safeguarding concern needs to be shared with the designated lead.', safetyConcerns: ['Abuse or serious safeguarding concern'] },
  { ...exampleInput },
  { ...exampleInput, identifier: 'Student B', grade: 'Year 7', ageRange: '9–12', observations: ['Reduced participation'], duration: 'Less than a week', frequency: 'Rarely', contexts: ['Classroom environment'], notes: 'Has been quieter during two whole-class discussions this week; still joins paired activities.' },
];
