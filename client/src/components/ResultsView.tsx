import type { ReactNode } from 'react';
import type { Candidate, PlanResult, SideCalc } from '../types';
import { fmt, formatDuration } from '../time';

function Row({ label, children, pitch }: { label: string; children: ReactNode; pitch?: boolean }) {
  return (
    <tr className={pitch ? 'pitch-row' : undefined}>
      <td>{label}</td>
      <td>{children}</td>
    </tr>
  );
}

/** 可变模式:每轨及留白的径向布局明细(从外圈向内) */
function LayoutTable({ side }: { side: SideCalc }) {
  if (!side.layout) return null;
  return (
    <table className="layout-table">
      <thead>
        <tr>
          <th>#</th>
          <th>曲目 / 留白</th>
          <th>系数</th>
          <th>转数</th>
          <th>沟距 (µm)</th>
          <th>宽度 (mm)</th>
          <th>外起半径 (mm)</th>
          <th>内止半径 (mm)</th>
        </tr>
      </thead>
      <tbody>
        {side.layout.map((e, i) =>
          e.kind === 'track' ? (
            <tr key={i} className="layout-track">
              <td>{e.globalIndex}</td>
              <td className="layout-name" title={e.name}>
                {e.name}
              </td>
              <td>{e.coefficient.toFixed(2)}</td>
              <td>{fmt(e.revolutions, 1)}</td>
              <td className="pitch-cell">{fmt(e.pitchUm, 1)}</td>
              <td>{fmt(e.widthMm, 2)}</td>
              <td>{fmt(e.outerRadiusMm, 2)}</td>
              <td>{fmt(e.innerRadiusMm, 2)}</td>
            </tr>
          ) : (
            <tr key={i} className="layout-gap">
              <td></td>
              <td className="layout-name gap-label">
                留白(第 {e.afterTrack} 首后 · {formatDuration(e.durationSec)})
              </td>
              <td>—</td>
              <td>—</td>
              <td className="pitch-cell">{fmt(e.pitchUm, 1)}</td>
              <td>{fmt(e.widthMm, 2)}</td>
              <td>{fmt(e.outerRadiusMm, 2)}</td>
              <td>{fmt(e.innerRadiusMm, 2)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function SideDetail({ label, side }: { label: string; side: SideCalc }) {
  const variable = side.mode === 'variable';
  return (
    <div className={`side-detail ${side.ok ? 'ok' : 'bad'}`}>
      <h4>
        {label} <span className="range">曲目 {side.firstTrack}–{side.lastTrack}</span>
      </h4>
      <table>
        <tbody>
          <Row label="音乐时长">
            {formatDuration(side.musicSec)}({side.musicSec.toFixed(0)} 秒)
          </Row>
          <Row label="总转数 N = 时长 × 转速 ÷ 60">{fmt(side.revolutions, 1)} 转</Row>
          <Row label="可用径向宽度(外 − 内)">{fmt(side.totalWidthMm, 2, ' mm')}</Row>
          <Row label={`留白扣除(${side.gapCount} 条)`}>− {fmt(side.gapWidthTotalMm, 2, ' mm')}</Row>
          <Row label="净径向宽度 Wn">{fmt(side.usableWidthMm, 2, ' mm')}</Row>
          {variable ? (
            <>
              <Row pitch label="最大基准 λ(每单位系数)">
                {fmt(side.lambdaUm, 1, ' µm')}
              </Row>
              <Row label="各轨实际沟距区间">
                {side.minTrackPitchUm === null
                  ? '—'
                  : `${fmt(side.minTrackPitchUm, 1)} ~ ${fmt(side.maxTrackPitchUm, 1)} µm`}
              </Row>
            </>
          ) : (
            <Row pitch label="恒定沟距 p = Wn × 1000 ÷ N">
              {fmt(side.pitchUm, 1, ' µm')}
            </Row>
          )}
          <Row label="留白播放总耗时">{fmt(side.gapSec, 1, ' 秒')}</Row>
          <Row label="该面总时长">
            {formatDuration(side.totalSec)}({side.totalSec.toFixed(0)} 秒)
          </Row>
        </tbody>
      </table>
      {variable && side.ok && (
        <details className="layout-details">
          <summary>每轨实际沟距与起止半径(从外圈向内)</summary>
          <LayoutTable side={side} />
        </details>
      )}
      {side.reasons.length > 0 && (
        <ul className="reasons">
          {side.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  isBest,
  mode,
}: {
  candidate: Candidate;
  isBest: boolean;
  mode: PlanResult['mode'];
}) {
  const c = candidate;
  const variable = mode === 'variable';
  const worseLabel = variable ? '较差面 λ' : '较差面沟距';
  return (
    <div className={`candidate ${c.feasible ? 'feasible' : 'rejected'} ${isBest ? 'best' : ''}`}>
      <div className="candidate-head">
        <span className="cut">切点:第 {c.cutAfter} 首之后</span>
        {isBest && <span className="badge best-badge">★ 最优方案</span>}
        {!c.feasible && <span className="badge reject-badge">淘汰</span>}
        {c.feasible && !isBest && <span className="badge ok-badge">合格</span>}
      </div>

      <div className="candidate-summary">
        {variable ? (
          <>
            <span>
              A 面 λ <strong>{fmt(c.sideA.lambdaUm, 1, ' µm')}</strong>
            </span>
            <span>
              B 面 λ <strong>{fmt(c.sideB.lambdaUm, 1, ' µm')}</strong>
            </span>
          </>
        ) : (
          <>
            <span>
              A 面沟距 <strong>{fmt(c.sideA.pitchUm, 1, ' µm')}</strong>
            </span>
            <span>
              B 面沟距 <strong>{fmt(c.sideB.pitchUm, 1, ' µm')}</strong>
            </span>
          </>
        )}
        <span>
          {worseLabel} <strong>{fmt(c.worsePitchUm, 1, ' µm')}</strong>
        </span>
        <span>
          时长差 <strong>{c.durationDiffSec === null ? '—' : `${c.durationDiffSec.toFixed(1)} 秒`}</strong>
        </span>
      </div>

      {c.reasons.length > 0 && (
        <ul className="reasons">
          {c.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <details>
        <summary>计算明细</summary>
        <div className="sides">
          <SideDetail label="A 面" side={c.sideA} />
          <SideDetail label="B 面" side={c.sideB} />
        </div>
      </details>
    </div>
  );
}

export default function ResultsView({ result }: { result: PlanResult }) {
  const feasibleCount = result.candidates.filter((c) => c.feasible).length;
  const variable = result.mode === 'variable';
  return (
    <section className="panel results">
      <h2>
        候选切点({result.candidates.length} 个,合格 {feasibleCount} 个)
        <small className="mode-tag">{variable ? '可变沟距模式' : '恒定沟距模式'}</small>
      </h2>

      {result.bestCutAfter !== null ? (
        <div className="best-banner">
          最优切点:第 <strong>{result.bestCutAfter}</strong> 首之后 ——
          {variable
            ? '先最大化两面较小 λ,再最小化两面时长差'
            : '先最大化较差一面沟距,再最小化两面时长差'}
        </div>
      ) : (
        <div className="best-banner none">
          没有满足安全阈值的方案:请放宽最小沟距、减小留白、缩短曲目或扩大有效半径范围
        </div>
      )}

      {result.candidates.map((c) => (
        <CandidateCard
          key={c.cutAfter}
          candidate={c}
          isBest={c.cutAfter === result.bestCutAfter}
          mode={result.mode}
        />
      ))}
    </section>
  );
}
