import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardList, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';
import { assessmentSchema, observations, contexts, durations, frequencies, safetyOptions, disclaimer, type Assessment, type AssessmentInput, type AppConfig } from '../shared/schema';
import { exampleInput } from '../shared/demo';
import { hasSafetyConcern } from '../shared/guidance';
import { api } from './api';
import { ErrorNotice, PageHeading, SafetyNotice } from './components';

type Draft = Omit<AssessmentInput, 'safetyReviewed'> & { safetyReviewed: boolean };
const blank: Draft = { identifier: '', grade: '', ageRange: 'Prefer not to say', studentContext: '', observations: [], otherObservation: '', duration: 'Unsure', frequency: 'Unsure', contexts: [], otherContext: '', notes: '', safetyConcerns: [], safetyReviewed: false };
export function AssessmentForm({ config, onSaved }: { config: AppConfig; onSaved: (entry: Assessment) => void }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingText, setLoadingText] = useState('Reviewing the observations…');
  const submitLock = useRef(false);
  const stepRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stepRef.current?.focus(); }, [step]);
  useEffect(() => { if (!busy) return; const timer = setTimeout(() => setLoadingText('Preparing teacher guidance…'), 1000); return () => clearTimeout(timer); }, [busy]);
  function set<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(old => ({ ...old, [key]: value })); setFields(old => ({ ...old, [key]: [] })); }
  function toggle<K extends 'observations' | 'contexts' | 'safetyConcerns'>(key: K, value: Draft[K][number]) {
    const current = draft[key] as string[];
    set(key, (current.includes(value) ? current.filter(v => v !== value) : [...current, value]) as Draft[K]);
  }
  const safety = hasSafetyConcern({ ...draft, safetyReviewed: true });
  function validateStep() {
    const parsed = assessmentSchema.safeParse({ ...draft, safetyReviewed: step < 2 ? true : draft.safetyReviewed });
    if (parsed.success) return true;
    const relevant = step === 0 ? ['identifier', 'grade', 'studentContext'] : step === 1 ? ['observations', 'otherObservation', 'otherContext', 'notes'] : Object.keys(draft);
    const errors = Object.fromEntries(Object.entries(parsed.error.flatten().fieldErrors).filter(([key]) => relevant.includes(key)));
    setFields(errors);
    if (Object.keys(errors).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return false; }
    return true;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || !validateStep()) return;
    if (step < 2) { setStep(step + 1); window.scrollTo(0, 0); return; }
    submitLock.current = true; setBusy(true); setError(''); setLoadingText('Reviewing the observations…');
    try { const input = assessmentSchema.parse(draft); const entry = await api<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(input) }); onSaved(entry); }
    catch (e) { setError((e as Error).message); }
    finally { submitLock.current = false; setBusy(false); }
  }
  const fieldError = (key: string) => fields[key]?.length ? <span className="field-error" id={`${key}-error`} role="alert">{fields[key][0]}</span> : null;
  const inputProps = (key: string) => ({ 'aria-invalid': fields[key]?.length ? true as const : undefined, 'aria-describedby': fields[key]?.length ? `${key}-error` : undefined });
  return <>
    <PageHeading eyebrow="A THOUGHTFUL FIRST STEP" title="Let’s understand the concern.">Start with what you’ve noticed. We’ll help you think through what comes next.</PageHeading>
    <div className="assessment-layout"><div>
      <ol className="steps" aria-label="Assessment progress">{['Student context', 'Observations', 'Review & guidance'].map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'finished' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check size={16}/> : index + 1}</span>{label}</li>)}</ol>
      <form onSubmit={submit} noValidate className="form-card" aria-busy={busy}>
        <div className="form-card-heading"><span className="eyebrow">STEP {step + 1} OF 3</span><h2 ref={stepRef} tabIndex={-1}>{['A little context', 'What has changed?', 'Review with care'][step]}</h2><p>{['Use a nickname or identifier. The student’s real name is not needed.', 'Record things you have seen or heard, rather than assumptions or diagnoses.', 'Check the observations and safety information before preparing guidance.'][step]}</p></div>
        {step === 0 && <>
          <div className="notice subtle"><LockKeyhole size={18}/><p>This is a prototype. Use fictional information only. No sign-in or verified teacher account is provided.</p></div>
          <label className="field">Student nickname / identifier <span className="required">Required</span><input autoComplete="off" maxLength={40} placeholder="e.g. Student A" value={draft.identifier} onChange={e => set('identifier', e.target.value)} {...inputProps('identifier')}/>{fieldError('identifier')}</label>
          <div className="field-grid"><label className="field">Age range<select value={draft.ageRange} onChange={e => set('ageRange', e.target.value as Draft['ageRange'])}>{['Prefer not to say', '5–8', '9–12', '13–15', '16–18', '18+'].map(age => <option key={age}>{age}</option>)}</select></label><label className="field">Grade / year <span className="optional">Optional</span><input maxLength={30} placeholder="e.g. Year 9" value={draft.grade} onChange={e => set('grade', e.target.value)} {...inputProps('grade')}/>{fieldError('grade')}</label></div>
          <label className="field">Relevant classroom context <span className="optional">Optional</span><textarea rows={3} maxLength={500} placeholder="e.g. Recently moved to a new class. Avoid personal or family details." value={draft.studentContext} onChange={e => set('studentContext', e.target.value)} {...inputProps('studentContext')}/>{fieldError('studentContext')}</label>
        </>}
        {step === 1 && <>
          <fieldset className="field"><legend>Observed changes <span className="required">Choose at least one</span></legend><p className="field-hint">Select all that you’ve observed.</p><div className="choice-grid" tabIndex={-1} {...inputProps('observations')}>{observations.map(value => <label className={`choice ${draft.observations.includes(value) ? 'selected' : ''}`} key={value}><input type="checkbox" checked={draft.observations.includes(value)} onChange={() => toggle('observations', value)}/><span>{value}</span></label>)}</div>{fieldError('observations')}</fieldset>
          {draft.observations.includes('Other') && <label className="field">Other observed change<input maxLength={300} value={draft.otherObservation} onChange={e => set('otherObservation', e.target.value)} {...inputProps('otherObservation')}/>{fieldError('otherObservation')}</label>}
          <div className="field-grid"><label className="field">How long has this been happening?<select value={draft.duration} onChange={e => set('duration', e.target.value as Draft['duration'])}>{durations.map(value => <option key={value}>{value}</option>)}</select></label><label className="field">How often have you noticed it?<select value={draft.frequency} onChange={e => set('frequency', e.target.value as Draft['frequency'])}>{frequencies.map(value => <option key={value}>{value}</option>)}</select></label></div>
          <fieldset className="field"><legend>Where does the change seem connected?</legend><p className="field-hint">Only select context you already know. It’s okay to be unsure.</p><div className="chip-options">{contexts.map(value => <label className={`chip-choice ${draft.contexts.includes(value) ? 'selected' : ''}`} key={value}><input type="checkbox" checked={draft.contexts.includes(value)} onChange={() => toggle('contexts', value)}/>{value}</label>)}</div></fieldset>
          {draft.contexts.includes('Other') && <label className="field">Other context<input maxLength={300} value={draft.otherContext} onChange={e => set('otherContext', e.target.value)} {...inputProps('otherContext')}/>{fieldError('otherContext')}</label>}
          <label className="field">What have you noticed? <span className="optional">Optional</span><textarea rows={5} maxLength={2000} placeholder="Describe specific changes: what happened, when, and how it differs from usual. Please avoid names and diagnoses." value={draft.notes} onChange={e => set('notes', e.target.value)} {...inputProps('notes')}/><span className="field-hint character-count">Observation, not interpretation. <span>{draft.notes.length}/2,000</span></span>{fieldError('notes')}</label>
        </>}
        {step === 2 && <>
          <section className="review-box"><div><h3>{draft.identifier}</h3><span>{draft.grade || 'Grade not recorded'} · Age {draft.ageRange}</span><button type="button" className="text-button" onClick={() => setStep(0)}>Edit context</button></div><div className="tags">{draft.observations.map(o => <span key={o}>{o}</span>)}</div><p><strong>Duration:</strong> {draft.duration} <span className="review-spacer"/> <strong>Frequency:</strong> {draft.frequency}</p>{draft.contexts.length > 0 && <p><strong>Context:</strong> {draft.contexts.join(', ')}</p>}{draft.studentContext && <p><strong>Classroom context:</strong> {draft.studentContext}</p>}{draft.otherObservation && <p><strong>Other observation:</strong> {draft.otherObservation}</p>}{draft.otherContext && <p><strong>Other context:</strong> {draft.otherContext}</p>}{draft.notes && <blockquote>{draft.notes}</blockquote>}<button type="button" className="text-button" onClick={() => setStep(1)}>Edit observations <ChevronRight size={15}/></button></section>
          <fieldset className="field safety-field"><legend>First, is there a potential safety concern?</legend><p className="field-hint">Select anything reported or suspected. You do not need proof. Uncertainty about immediate safety should be shared with appropriate staff.</p><div className="safety-options">{safetyOptions.map(value => <label key={value} className="check-line"><input type="checkbox" checked={draft.safetyConcerns.includes(value)} onChange={() => { toggle('safetyConcerns', value); set('safetyReviewed', false); }}/>{value}</label>)}</div><label className="check-line safety-reviewed"><input type="checkbox" checked={draft.safetyReviewed} onChange={e => set('safetyReviewed', e.target.checked)} {...inputProps('safetyReviewed')}/>{draft.safetyConcerns.length ? 'I have reviewed these safety concerns and understand that I should follow school procedures now.' : 'I have reviewed the safety question. I have not identified an immediate safety concern from the information available.'}</label>{fieldError('safetyReviewed')}</fieldset>
          <div className="notice subtle"><Sparkles size={19}/><p>{config.aiEnabled ? 'The server will send these observations (excluding the identifier and grade) to the configured AI provider to select reviewed guidance. Use fictional details only.' : 'Demo mode uses transparent rules and reviewed guidance. No external AI service receives these observations.'} You remain the decision maker.</p></div>
        </>}
        {safety && <SafetyNotice config={config.safety} compact/>}
        {error && <ErrorNotice message={error}/>}
        {busy && <div className="analysis-loading" role="status"><LoaderCircle className="spin" size={22}/><div><strong>{loadingText}</strong><p>Preparing practical, supportive next steps.</p></div></div>}
        <div className="form-actions">{step > 0 ? <button type="button" className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}><ArrowLeft size={17}/> Back</button> : <a href="#/" className="text-button">Cancel</a>}<button type="submit" className="button primary" disabled={busy}>{busy ? 'Preparing guidance…' : step < 2 ? 'Continue' : safety ? 'Save safety concern' : 'Prepare & save guidance'}{!busy && <ArrowRight size={17}/>}</button></div>
      </form>
    </div><aside className="form-aside"><div className="tip-card"><ClipboardList size={25}/><h3>Notice. Don’t label.</h3><p>Instead of “unmotivated,” try “has missed two assignments this week.”</p><div className="tip-divider"/><h4>You know your classroom.</h4><p>This workflow helps organise your observations. It doesn’t replace your judgment or school support staff.</p></div><div className="demo-card"><span className="eyebrow">TRY THE DEMO</span><h3>Meet Student A</h3><p>Usually engaged. Recently quieter, tired, and missing assignments.</p><button type="button" className="text-button" disabled={busy} onClick={() => { setDraft({ ...exampleInput, safetyReviewed: false }); setStep(0); setFields({}); setError(''); }}>Fill fictional example <ArrowRight size={16}/></button></div><p className="small-print">{disclaimer}</p></aside></div>
  </>;
}
