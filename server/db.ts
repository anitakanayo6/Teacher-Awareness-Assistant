import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Assessment, type AssessmentInput, type Guidance, type AnalysisMode, dateAfter, guidanceSchema, assessmentSchema } from '../shared/schema';
import { demoInputs } from '../shared/demo';
import { buildGuidance } from '../shared/guidance';

export const migration = `
 PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS assessments (
   id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
   created_at TEXT NOT NULL, input_json TEXT NOT NULL, guidance_json TEXT NOT NULL,
   mode TEXT NOT NULL CHECK(mode IN ('demo','ai','fallback','safety'))
 );
 CREATE INDEX IF NOT EXISTS assessments_teacher ON assessments(teacher_id,created_at);
 CREATE TABLE IF NOT EXISTS observations (
   assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
   label TEXT NOT NULL, PRIMARY KEY(assessment_id,label)
 );
 CREATE TABLE IF NOT EXISTS follow_ups (
   assessment_id TEXT PRIMARY KEY REFERENCES assessments(id) ON DELETE CASCADE,
   due_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','complete')), completed_at TEXT
 );
 PRAGMA user_version=1;
`;
type Row = { id: string; created_at: string; input_json: string; guidance_json: string; mode: AnalysisMode; due_date: string; status: 'pending' | 'complete'; completed_at: string | null };
export class Repository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(migration);
  }
  ensureTeacher(id: string) {
    if (this.db.prepare('SELECT id FROM teachers WHERE id=?').get(id)) return;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO teachers(id,created_at) VALUES(?,?)').run(id, new Date().toISOString());
      demoInputs.forEach((input, index) => {
        const created = new Date(); created.setDate(created.getDate() - (index + 1));
        this.insert(id, input, buildGuidance(input), 'demo', created.toISOString(), dateAfter(index === 0 ? 0 : index === 1 ? -1 : 2));
      });
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private insert(teacher: string, input: AssessmentInput, guidance: Guidance, mode: AnalysisMode, createdAt = new Date().toISOString(), dueDate = dateAfter(guidance.safetyFlag ? 0 : guidance.concernLevel === 'elevated' ? 1 : 3)) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO assessments VALUES(?,?,?,?,?,?)').run(id, teacher, createdAt, JSON.stringify(input), JSON.stringify(guidance), mode);
    for (const label of new Set(input.observations)) this.db.prepare('INSERT INTO observations VALUES(?,?)').run(id, label);
    this.db.prepare('INSERT INTO follow_ups VALUES(?,?,?,NULL)').run(id, dueDate, 'pending');
    return id;
  }
  create(teacher: string, input: AssessmentInput, guidance: Guidance, mode: AnalysisMode) {
    assessmentSchema.parse(input); guidanceSchema.parse(guidance);
    this.db.exec('BEGIN');
    try { const id = this.insert(teacher, input, guidance, mode); this.db.exec('COMMIT'); return this.get(teacher, id)!; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private unpack(row: Row): Assessment {
    return { id: row.id, createdAt: row.created_at, input: assessmentSchema.parse(JSON.parse(row.input_json)), guidance: guidanceSchema.parse(JSON.parse(row.guidance_json)), mode: row.mode, followUp: { dueDate: row.due_date, status: row.status, completedAt: row.completed_at } };
  }
  list(teacher: string) { return (this.db.prepare('SELECT a.*,f.due_date,f.status,f.completed_at FROM assessments a JOIN follow_ups f ON f.assessment_id=a.id WHERE teacher_id=? ORDER BY created_at DESC').all(teacher) as Row[]).map(r => this.unpack(r)); }
  get(teacher: string, id: string) {
    const row = this.db.prepare('SELECT a.*,f.due_date,f.status,f.completed_at FROM assessments a JOIN follow_ups f ON f.assessment_id=a.id WHERE teacher_id=? AND a.id=?').get(teacher, id) as Row | undefined;
    return row ? this.unpack(row) : null;
  }
  updateFollowUp(teacher: string, id: string, patch: { dueDate?: string; status?: 'pending' | 'complete' }) {
    const entry = this.get(teacher, id); if (!entry) return null;
    const status = patch.status ?? entry.followUp.status;
    const completedAt = status === 'complete' ? entry.followUp.completedAt || new Date().toISOString() : null;
    this.db.prepare('UPDATE follow_ups SET due_date=?,status=?,completed_at=? WHERE assessment_id=?').run(patch.dueDate ?? entry.followUp.dueDate, status, completedAt, id);
    return this.get(teacher, id);
  }
  delete(teacher: string, id: string) { return this.db.prepare('DELETE FROM assessments WHERE teacher_id=? AND id=?').run(teacher, id).changes > 0; }
  close() { this.db.close(); }
}
