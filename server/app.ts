import express, { type ErrorRequestHandler } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { assessmentSchema, followUpSchema, type AppConfig } from '../shared/schema';
import { Repository } from './db';
import { AIService } from './ai';
import { resources } from '../shared/resources';

export function getConfig(): AppConfig {
  return {
    aiEnabled: process.env.AI_PROVIDER === 'openai-compatible' && !!process.env.AI_API_KEY && !!process.env.AI_MODEL,
    safety: { emergency: process.env.EMERGENCY_CONTACT || '', safeguarding: process.env.SAFEGUARDING_CONTACT || '', wellbeing: process.env.WELLBEING_CONTACT || '', crisis: process.env.CRISIS_RESOURCES || '' },
    privacy: 'Prototype only. Use fictional or anonymous identifiers, never identifiable student information. This browser has a demo workspace, not an authenticated teacher account. Records are stored on this server. Clearing cookies loses access to this workspace; it does not delete its records.',
  };
}
export function createApp(repository: Repository, ai: AIService) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-inline'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${process.env.NODE_ENV === 'production' ? '' : ' ws: wss:'}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
    next();
  });
  app.get('/api/health', (_req, res) => { repository.db.prepare('SELECT 1').get(); res.json({ ok: true }); });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== req.get('host')) || req.get('x-requested-with') !== 'TeacherAwareness') { res.status(403).json({ error: 'This request could not be verified. Refresh the page and try again.' }); return; }
      if (!req.is('application/json')) { res.status(415).json({ error: 'Send JSON data.' }); return; }
    }
    next();
  });
  app.use('/api', express.json({ limit: '20kb' }));
  app.use('/api', (req, res, next) => {
    const existing = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('taa_session='))?.slice(12);
    const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
    if (token !== existing) res.cookie('taa_session', token, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', maxAge: 30 * 86400000, path: '/' });
    const teacher = createHash('sha256').update(token).digest('hex');
    repository.ensureTeacher(teacher);
    res.locals.teacher = teacher;
    next();
  });
  const active = new Set<string>();
  app.get('/api/config', (_req, res) => res.json(getConfig()));
  app.get('/api/resources', (_req, res) => res.json(resources));
  app.get('/api/assessments', (_req, res) => res.json(repository.list(res.locals.teacher)));
  app.param('id', (_req, _res, next, id) => { try { z.string().uuid().parse(id); next(); } catch (error) { next(error); } });
  app.get('/api/assessments/:id', (req, res) => { const result = repository.get(res.locals.teacher, String(req.params.id)); res.status(result ? 200 : 404).json(result || { error: 'This assessment was not found in this demo workspace.' }); });
  app.post('/api/assessments', async (req, res) => {
    const input = assessmentSchema.parse(req.body);
    const teacher = res.locals.teacher as string;
    if (active.has(teacher)) { res.status(429).json({ error: 'An assessment is already being reviewed. Please wait for it to finish.' }); return; }
    if (repository.list(teacher).length >= 100) { res.status(409).json({ error: 'This demo workspace holds up to 100 assessments. Delete an old assessment before adding another.' }); return; }
    active.add(teacher);
    try { const result = await ai.analyzeStudentConcern(input); res.status(201).json(repository.create(teacher, input, result.guidance, result.mode)); }
    finally { active.delete(teacher); }
  });
  app.patch('/api/assessments/:id/follow-up', (req, res) => { const patch = followUpSchema.parse(req.body); const result = repository.updateFollowUp(res.locals.teacher, String(req.params.id), patch); res.status(result ? 200 : 404).json(result || { error: 'This assessment was not found.' }); });
  app.delete('/api/assessments/:id', (req, res) => { if (!repository.delete(res.locals.teacher, String(req.params.id))) { res.status(404).json({ error: 'This assessment was not found.' }); return; } res.status(204).end(); });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'This API route does not exist.' }));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) { res.status(400).json({ error: 'Please check the assessment fields.', fields: error.flatten().fieldErrors }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'The request could not be read. Refresh and try again.' }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'The assessment is too long. Shorten the notes and try again.' }); return; }
    res.status(500).json({ error: 'We could not complete this operation. Your changes may not have saved. Refresh history to check, then try again.' });
  };
  app.use(handleError);
  return app;
}
