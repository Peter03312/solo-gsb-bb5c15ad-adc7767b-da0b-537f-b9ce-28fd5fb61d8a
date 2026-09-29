import type { ReactNode } from 'react';
import type { Candidate, PlanResult, ScenarioCalc, SideCalc } from '../types';
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

/** 一种情形(标称 / 上浮)下两面的关键指标条 */
function ScenarioStrip({
  scenario,
  variable,
  tag,
}: {
  scenario: ScenarioCalc;
  variable: boolean;
  tag: string;
}) {
  const metric = (side: SideCalc) =>
    variable ? side.lambdaUm : side.pitchUm;
  return (
    <div className={`scenario-strip ${scenario.ok ? 'ok' : 'bad'}`}>
      <span className="scenario-tag">{tag}</span>
      <span className={scenario.sideA.ok ? '' : 'side-bad'}>
        A 面{variable ? ' λ' : '沟距'} <strong>{fmt(metric(scenario.sideA), 1, ' µm')}</strong>
        <em className="side-time">{formatDuration(scenario.sideA.totalSec)}</em>
      </span>
      <span className={scenario.sideB.ok ? '' : 'side-bad'}>
        B 面{variable ? ' λ' : '沟距'} <strong>{fmt(metric(scenario.sideB), 1, ' µm')}</strong>
        <em className="side-time">{formatDuration(scenario.sideB.totalSec)}</em>
      </span>
      <span>
        较差面{variable ? ' λ' : '沟距'} <strong>{fmt(scenario.worsePitchUm, 1, ' µm')}</strong>
      </span>
      <span>
        时长差 <strong>{scenario.durationDiffSec === null ? '—' : `${scenario.durationDiffSec.toFixed(1)} 秒`}</strong>
      </span>
      {!scenario.ok && <span className="scenario-fail">✗ 不达标</span>}
    </div>
  );
}

function CandidateCard({
  candidate,
  isBest,
  mode,
  upliftApplied,
}: {
  candidate: Candidate;
  isBest: boolean;
  mode: PlanResult['mode'];
  upliftApplied: boolean;
}) {
  const c = candidate;
  const variable = mode === 'variable';
  const worseLabel = variable ? '较差面 λ' : '较差面沟距';
  // 入选条件:标称与上浮两面均达标
  const eligible = c.rejectedAt === null;
  return (
    <div className={`candidate ${eligible ? 'feasible' : 'rejected'} ${isBest ? 'best' : ''}`}>
      <div className="candidate-head">
        <span className="cut">切点:第 {c.cutAfter} 首之后</span>
        {isBest && <span className="badge best-badge">★ 最优方案</span>}
        {c.rejectedAt === 'uplift' && (
          <span className="badge reject-badge" title="标称时长合格,但按「标称+上浮」重算后某一面低于最小沟距">
            上浮后淘汰
          </span>
        )}
        {c.rejectedAt === 'nominal' && <span className="badge reject-badge">标称即淘汰</span>}
        {eligible && !isBest && <span className="badge ok-badge">合格</span>}
      </div>

      <ScenarioStrip
        scenario={{
          sideA: c.sideA,
          sideB: c.sideB,
          ok: c.feasible,
          worsePitchUm: c.worsePitchUm,
          durationDiffSec: c.durationDiffSec,
        }}
        variable={variable}
        tag="标称"
      />
      {upliftApplied && <ScenarioStrip scenario={c.uplift} variable={variable} tag="标称+上浮" />}

      {eligible && (
        <div className="candidate-summary">
          <span>
            {worseLabel}(用于优选) <strong>{fmt(c.worsePitchUm, 1, ' µm')}</strong>
          </span>
          <span>
            时长差 <strong>{c.durationDiffSec === null ? '—' : `${c.durationDiffSec.toFixed(1)} 秒`}</strong>
          </span>
        </div>
      )}

      {c.reasons.length > 0 && (
        <ul className="reasons">
          {c.reasons.map((r, i) => (
            <li key={i} className={r.startsWith('上浮后') ? 'reason-uplift' : undefined}>
              {r}
            </li>
          ))}
        </ul>
      )}

      <details>
        <summary>计算明细{upliftApplied ? '(标称 / 上浮两种情形)':''}</summary>
        <div className="scenario-cols">
          <div className="scenario-col">
            <h5 className="scenario-col-title">标称时长</h5>
            <div className="sides">
              <SideDetail label="A 面" side={c.sideA} />
              <SideDetail label="B 面" side={c.sideB} />
            </div>
          </div>
          {upliftApplied && (
            <div className="scenario-col">
              <h5 className="scenario-col-title">标称 + 上浮</h5>
              <div className="sides">
                <SideDetail label="A 面" side={c.uplift.sideA} />
                <SideDetail label="B 面" side={c.uplift.sideB} />
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export default function ResultsView({ result }: { result: PlanResult }) {
  const variable = result.mode === 'variable';
  const eligibleCount = result.candidates.filter((c) => c.rejectedAt === null).length;
  const nominalRejected = result.candidates.filter((c) => c.rejectedAt === 'nominal');
  const upliftRejected = result.candidates.filter((c) => c.rejectedAt === 'uplift');
  return (
    <section className="panel results">
      <h2>
        候选切点({result.candidates.length} 个,入选 {eligibleCount} 个)
        <small className="mode-tag">{variable ? '可变沟距模式' : '恒定沟距模式'}</small>
      </h2>

      {result.bestCutAfter !== null ? (
        <div className="best-banner">
          最优切点:第 <strong>{result.bestCutAfter}</strong> 首之后 ——
          {result.upliftApplied
            ? '该切点在「标称 + 上浮」情形下两面仍达标;再按标称指标(先最大化较差一面沟距/λ,再最小化两面时长差)优选'
            : variable
              ? '先最大化两面较小 λ,再最小化两面时长差'
              : '先最大化较差一面沟距,再最小化两面时长差'}
        </div>
      ) : result.upliftApplied ? (
        <div className="best-banner none">
          没有可入选切点:标称即不合格 {nominalRejected.length} 个,标称合格但上浮后某面失效{' '}
          {upliftRejected.length} 个。可放宽最小沟距、减小留白/上浮秒数或扩大有效半径范围。
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
          upliftApplied={result.upliftApplied}
        />
      ))}
    </section>
  );
}
