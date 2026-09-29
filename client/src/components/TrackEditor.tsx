import { useEffect, useState } from 'react';
import type { PitchMode, TrackInput } from '../types';
import { formatDuration, parseDuration } from '../time';

interface Props {
  tracks: TrackInput[];
  onChange: (tracks: TrackInput[]) => void;
  mode: PitchMode;
}

function DurationCell({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (sec: number) => void;
}) {
  const [text, setText] = useState(formatDuration(value));
  const [editing, setEditing] = useState(false);
  const invalid = parseDuration(text) === null;

  return (
    <input
      className={`duration-input${editing && invalid ? ' invalid' : ''}`}
      value={editing ? text : formatDuration(value)}
      title="支持 mm:ss 或秒数"
      onFocus={() => {
        setText(formatDuration(value));
        setEditing(true);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseDuration(e.target.value);
        if (v !== null) onCommit(v);
      }}
      onBlur={() => setEditing(false)}
    />
  );
}

function CoefficientCell({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const invalid = !Number.isFinite(value) || value < 0.5 || value > 2;
  return (
    <input
      className={`coeff-input${invalid ? ' invalid' : ''}`}
      type="number"
      step={0.05}
      min={0.5}
      max={2}
      value={value}
      title="动态系数 0.5~2:响度大/起伏强的曲目取大系数,平缓曲目可取小系数"
      onChange={(e) => onCommit(Number(e.target.value))}
    />
  );
}

function ExtraSecCell({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  // 编辑过程允许空串;提交非负有限数字,空串按 0 处理
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  // 外部值变化(如载入方案)时同步显示
  useEffect(() => {
    setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);
  const num = text.trim() === '' ? 0 : Number(text);
  const invalid = text.trim() !== '' && (!Number.isFinite(num) || num < 0);
  return (
    <input
      className={`extra-input${invalid ? ' invalid' : ''}`}
      type="number"
      step={1}
      min={0}
      value={text}
      title="压片前可能增加的秒数(非负,缺省 0)。规划时会以「标称+上浮」再校验一遍两面沟距"
      onFocus={(e) => {
        setText(Number.isFinite(value) ? String(value) : '');
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.trim() === '' ? 0 : Number(e.target.value);
        if (Number.isFinite(v) && v >= 0) onCommit(v);
      }}
      onBlur={() => {
        if (invalid) setText('0');
        else if (!Number.isFinite(num)) setText('0');
        else setText(String(num));
      }}
    />
  );
}

export default function TrackEditor({ tracks, onChange, mode }: Props) {
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  const totalExtra = tracks.reduce((s, t) => s + (t.extraSec ?? 0), 0);
  const variable = mode === 'variable';

  const update = (i: number, patch: Partial<TrackInput>) =>
    onChange(tracks.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tracks.length) return;
    const next = [...tracks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="panel">
      <h2>
        曲目顺序 <small>共 {tracks.length} 首 · {formatDuration(total)}</small>
      </h2>
      {variable && (
        <p className="coeff-hint">
          可变沟距模式:为每首曲目填写 <strong>动态系数 0.5~2</strong>
          (大动态/强起伏曲目取大值)。每轨实际沟距 = max(最小沟距, λ × 系数)。
        </p>
      )}
      <p className="coeff-hint">
        <strong>压片前上浮(秒)</strong>:录入每首曲目压片前可能增加的时长(非负,缺省 0,共{' '}
        {formatDuration(totalExtra)})。规划时会用「标称 + 上浮」时长把每个切点再算一遍,
        只有上浮后两面仍达到最小沟距安全要求的切点才能入选;最终排序仍按标称指标。
      </p>
      <table className="track-table">
        <thead>
          <tr>
            <th>#</th>
            <th>曲名</th>
            <th>时长 (mm:ss)</th>
            <th>上浮(秒)</th>
            {variable && <th>动态系数</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => (
            <tr key={i}>
              <td className="idx">{i + 1}</td>
              <td>
                <input
                  className="name-input"
                  value={t.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </td>
              <td>
                <DurationCell value={t.durationSec} onCommit={(sec) => update(i, { durationSec: sec })} />
              </td>
              <td>
                <ExtraSecCell value={t.extraSec ?? 0} onCommit={(v) => update(i, { extraSec: v })} />
              </td>
              {variable && (
                <td>
                  <CoefficientCell
                    value={t.coefficient ?? 1}
                    onCommit={(v) => update(i, { coefficient: v })}
                  />
                </td>
              )}
              <td className="row-actions">
                <button title="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button title="下移" disabled={i === tracks.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button
                  title="删除"
                  disabled={tracks.length <= 2}
                  onClick={() => onChange(tracks.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="add-track"
        onClick={() =>
          onChange([
            ...tracks,
            { name: `新曲目 ${tracks.length + 1}`, durationSec: 180, coefficient: 1, extraSec: 0 },
          ])
        }
      >
        + 添加曲目
      </button>
    </section>
  );
}
