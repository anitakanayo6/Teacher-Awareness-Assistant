export class ApiError extends Error {
  constructor(message: string, public fields: Record<string, string[]> = {}) { super(message); }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TeacherAwareness', ...options?.headers }, signal: AbortSignal.timeout(25000) }); }
  catch { throw new ApiError('We couldn’t reach the server. Check your connection. If you were saving, check history before trying again.'); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({ error: 'The server returned an unreadable response. Please try again.' }));
  if (!response.ok) throw new ApiError(body.error || 'Something went wrong. Please try again.', body.fields);
  return body as T;
}
