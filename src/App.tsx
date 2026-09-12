import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarCheck2, ChevronRight, CircleHelp, LayoutDashboard, ListChecks, Menu, Plus, ShieldCheck, Sprout, X } from 'lucide-react';
import { api } from './api';
import type { Assessment, AppConfig } from '../shared/schema';
import { localDate } from '../shared/schema';
import { Brand, ErrorNotice, go, PrivacyStrip } from './components';
import { AssessmentForm } from './AssessmentForm';
import { Dashboard, History, Results, Resources, About } from './pages';

export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const [entries, setEntries] = useState<Assessment[]>([]);
  const [config, setConfig] = useState<AppConfig>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  async function load() {
    setError(''); setLoading(true);
    try { const settings = await api<AppConfig>('/config'); setConfig(settings); setEntries(await api<Assessment[]>('/assessments')); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const handler = () => { setRoute(location.hash.slice(1) || '/'); setMenu(false); window.scrollTo(0, 0); }; addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  useEffect(() => { const timer = setTimeout(() => document.querySelector<HTMLElement>('h1')?.focus(), 50); return () => clearTimeout(timer); }, [route, loading]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const due = entries.filter(e => e.followUp.status === 'pending' && e.followUp.dueDate <= localDate()).length;
  const notify = (message: string) => setToast(message);
  function update(entry: Assessment) { setEntries(old => old.some(e => e.id === entry.id) ? old.map(e => e.id === entry.id ? entry : e) : [entry, ...old]); }
  const navigation = [{ path: '/', label: 'Overview', icon: LayoutDashboard }, { path: '/new', label: 'Check a concern', icon: Plus }, { path: '/history', label: 'Assessment history', icon: ListChecks }, { path: '/follow-ups', label: 'Follow-ups', icon: CalendarCheck2 }, { path: '/resources', label: 'Resource library', icon: BookOpen }];
  const activePath = route.startsWith('/assessment/') ? '/history' : route;
  let content;
  if (loading) content = <div className="loading-page" role="status"><Sprout size={35}/><h1>Preparing your workspace…</h1><p>Gathering your assessments and follow-ups.</p><div className="skeleton"/><div className="skeleton"/></div>;
  else if (error || !config) content = <ErrorNotice message={error || 'Configuration could not be loaded.'} retry={() => void load()}/>;
  else if (route === '/') content = <Dashboard entries={entries}/>;
  else if (route === '/new') content = <AssessmentForm config={config} onSaved={entry => { update(entry); go(`/assessment/${entry.id}`); notify('Assessment and follow-up saved.'); }}/>;
  else if (route === '/history' || route === '/follow-ups') content = <History entries={entries} followUps={route === '/follow-ups'}/>;
  else if (route.startsWith('/assessment/')) content = <Results key={route} id={route.split('/')[2]} initial={entries.find(e => e.id === route.split('/')[2])} config={config} update={update} onDeleted={id => { setEntries(old => old.filter(e => e.id !== id)); go('/history'); notify('Assessment deleted.'); }} notify={notify}/>;
  else if (route === '/resources') content = <Resources/>;
  else if (route === '/about') content = <About config={config}/>;
  else content = <div className="empty"><h1>We couldn’t find that page.</h1><a className="button primary" href="#/">Back to overview</a></div>;
  return <div className="app-shell"><a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    <div className="mobile-header"><Brand/><button className="icon-button" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div>
    <aside className={`sidebar ${menu ? 'is-open' : ''}`}><a href="#/" className="brand-link" aria-label="Teacher Awareness Assistant overview"><Brand/></a><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">{navigation.map(({ path, label, icon: Icon }) => <a key={path} href={`#${path}`} className={activePath === path ? 'active' : ''} aria-current={activePath === path ? 'page' : undefined}><Icon size={19}/><span>{label}</span>{path === '/follow-ups' && due > 0 && <span className="nav-count">{due}</span>}</a>)}</nav><div className="sidebar-bottom"><div className="care-note"><span className="tiny-leaf"><Sprout size={21}/></span><h3>Small moments.<br/>Meaningful support.</h3><p>You don’t need all the answers to make a difference.</p><a href="#/resources">Find a starting point <ArrowRight size={15}/></a></div><a href="#/about" className="sidebar-help"><ShieldCheck size={18}/> Safety & privacy <ChevronRight size={15}/></a><div className="demo-profile"><span className="profile-avatar">T</span><div><strong>Teacher workspace</strong><span>Fictional demo · no sign-in</span></div></div></div></aside>
    <div className="main-wrap"><header className="topbar"><span>YOUR STUDENTS. YOUR CONTEXT. <strong>YOUR CARE.</strong></span><a href="#/about" className="demo-pill"><span/> Demo workspace <CircleHelp size={14}/></a></header><main id="main" tabIndex={-1}>{content}<PrivacyStrip/></main><footer>Teacher Awareness Assistant <span>Built for thoughtful teaching · AfriHack prototype</span></footer></div>{toast && <div className="toast" role="status"><ShieldCheck size={18}/>{toast}</div>}
  </div>;
}
