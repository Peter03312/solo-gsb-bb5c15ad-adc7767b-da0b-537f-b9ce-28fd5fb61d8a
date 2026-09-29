import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { computePlan, normalizeInputs, validateInputs } from './planner.js';
import { createProject, deleteProject, getProject, listProjects, seedIfEmpty } from './db.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

seedIfEmpty();

/** 计算分面方案 */
app.post('/api/plan', (req, res) => {
  try {
    const { tracks, params } = req.body ?? {};
    res.json(computePlan(tracks, params));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** 方案列表 */
app.get('/api/projects', (_req, res) => {
  res.json(listProjects());
});

app.get('/api/projects/:id', (req, res) => {
  const project = getProject(Number(req.params.id));
  if (!project) {
    res.status(404).json({ error: '方案不存在' });
    return;
  }
  res.json(project);
});

/** 保存当前输入为方案 */
app.post('/api/projects', (req, res) => {
  const { name, tracks: rawTracks, params: rawParams } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: '方案名称不能为空' });
    return;
  }
  const { tracks, params } = normalizeInputs(rawTracks, rawParams ?? {});
  const errors = validateInputs(tracks, params);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join(';') });
    return;
  }
  res.status(201).json(createProject(name.trim(), { tracks, params }));
});

app.delete('/api/projects/:id', (req, res) => {
  if (!deleteProject(Number(req.params.id))) {
    res.status(404).json({ error: '方案不存在' });
    return;
  }
  res.json({ ok: true });
});

// 生产模式:托管前端构建产物(SPA 回退到 index.html)
const staticDir = process.env.STATIC_DIR ?? path.join(process.cwd(), 'public');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`黑胶分面规划服务已启动: http://localhost:${port}`);
});
