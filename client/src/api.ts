import type {
  PlanParams,
  PlanResult,
  ProjectDetail,
  ProjectMeta,
  TrackInput,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `请求失败(HTTP ${res.status})`);
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  plan: (tracks: TrackInput[], params: PlanParams) =>
    request<PlanResult>('/api/plan', json({ tracks, params })),
  listProjects: () => request<ProjectMeta[]>('/api/projects'),
  getProject: (id: number) => request<ProjectDetail>(`/api/projects/${id}`),
  saveProject: (name: string, tracks: TrackInput[], params: PlanParams) =>
    request<ProjectMeta>('/api/projects', json({ name, tracks, params })),
  deleteProject: (id: number) =>
    request<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),
};
