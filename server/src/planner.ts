/**
 * 黑胶唱片 A/B 面切分规划核心算法(纯函数,不依赖 Express / SQLite)。
 *
 * 两种沟距模式:
 *
 * 1. 恒定沟距(constant,原行为):
 *   - 有效径向宽度 W = 外有效半径 - 内有效半径 (mm)
 *   - 面内 k 首曲目之间有 (k-1) 条留白带,每条占径向宽度 gapWidthMm
 *   - 扣除留白后的净宽度 Wn = W - (k-1) * gapWidthMm
 *   - 该面音乐总时长 T(秒)在转速 rpm 下需要的总转数 N = T * rpm / 60
 *   - 恒定沟距 p = Wn * 1000 / N  (µm/转)
 *   - 安全约束:p >= minPitchUm,且 Wn > 0
 *   - 留白带自身耗时:以相同沟距刻录,rev_gap = 留白宽*1000/p,耗时 = rev_gap / rpm * 60
 *
 * 2. 可变沟距(variable):
 *   - 每首曲目录入动态系数 c_i ∈ [0.5, 2](缺省按 1 处理)
 *   - 给定基准 λ(µm/转),该轨实际沟距 p_i = max(minPitchUm, λ * c_i)
 *   - 该轨占用径向宽度 = p_i * n_i / 1000 (mm),n_i 为该轨转数 = 时长 * rpm / 60
 *   - 留白带为固定物理宽度,按「前一首曲目」的实际沟距刻录并计算播放耗时
 *   - 求不超过净径向宽度 Wn 的最大 λ:
 *       Σ_i max(pmin, λ*c_i) * n_i / 1000 + (k-1)*gapWidthMm ≤ W
 *     即 Σ_i max(pmin, λ*c_i) * n_i ≤ Wn*1000
 *   - 左侧是 λ 的分段线性单调函数,折点为 λ_i = pmin / c_i;
 *     按折点升序扫描各区间,用一次线性插值即可求出 λ*
 *   - 淘汰:Wn ≤ 0,或 λ=0 时(全部曲目压到最小沟距)所需宽度仍超过 Wn
 *
 * 枚举与优选:
 *   - 曲目顺序固定,切点 c ∈ [1, n-1],A 面 = 1..c,B 面 = c+1..n
 *   - 任一面不满足安全约束 → 淘汰,并记录原因
 *   - 合格方案中:
 *       恒定模式:先最大化 min(pA, pB),再最小化 |TA - TB|
 *       可变模式:先最大化 min(λA, λB),再最小化 |TA - TB|
 */

export type PitchMode = 'constant' | 'variable';

export interface TrackInput {
  name: string;
  /** 曲目时长(秒) */
  durationSec: number;
  /** 可变沟距模式的动态系数(0.5~2);缺省按 1 处理,恒定模式下忽略 */
  coefficient?: number;
}

export interface PlanParams {
  /** 沟距模式:恒定(缺省,原行为)/ 可变 */
  mode?: PitchMode;
  /** 转速(转/分钟),如 33.333 或 45 */
  rpm: number;
  /** 外有效半径 mm(最外圈沟槽半径) */
  outerRadiusMm: number;
  /** 内有效半径 mm(最内圈沟槽半径) */
  innerRadiusMm: number;
  /** 曲间留白:每条留白带占用的径向宽度 mm */
  gapWidthMm: number;
  /** 最小沟距(安全阈值)µm/转 */
  minPitchUm: number;
}

/** 可变模式下单轨(或留白带)从外圈向内的径向布局 */
export interface TrackLayout {
  kind: 'track';
  /** 全局曲目序号(从 1 开始) */
  globalIndex: number;
  name: string;
  durationSec: number;
  /** 动态系数 */
  coefficient: number;
  /** 该轨转数 */
  revolutions: number;
  /** 实际沟距 = max(最小沟距, λ × 系数)(µm/转) */
  pitchUm: number;
  /** 占用径向宽度 mm */
  widthMm: number;
  /** 外圈起始半径 mm */
  outerRadiusMm: number;
  /** 内圈结束半径 mm */
  innerRadiusMm: number;
}

export interface GapLayout {
  kind: 'gap';
  /** 该留白位于第几首曲目(全局序号)之后 */
  afterTrack: number;
  /** 留白固定径向宽度 mm */
  widthMm: number;
  /** 刻录该留白所按的沟距(取前一首曲目实际沟距)µm/转 */
  pitchUm: number;
  /** 留白播放耗时(秒) */
  durationSec: number;
  outerRadiusMm: number;
  innerRadiusMm: number;
}

export type LayoutEntry = TrackLayout | GapLayout;

export interface SideCalc {
  /** 该面使用的沟距模式 */
  mode: PitchMode;
  /** 该面第 1 首曲目的全局序号(从 1 开始) */
  firstTrack: number;
  /** 该面最后一首曲目的全局序号 */
  lastTrack: number;
  trackCount: number;
  /** 音乐总时长(秒,不含留白) */
  musicSec: number;
  /** 该面总转数 N = musicSec * rpm / 60 */
  revolutions: number;
  /** 面内留白带数量 = trackCount - 1 */
  gapCount: number;
  /** 留白带总径向宽度 mm */
  gapWidthTotalMm: number;
  /** 可用径向总宽度 mm(外半径 - 内半径) */
  totalWidthMm: number;
  /** 扣除留白后的净径向宽度 mm */
  usableWidthMm: number;
  /** 恒定沟距 µm/转(仅恒定模式;净宽度 ≤ 0 时为 null) */
  pitchUm: number | null;
  /** 可变模式求出的最大基准 λ(µm/转,每单位系数);仅可变模式且合格时非 null */
  lambdaUm: number | null;
  /** 可变模式下各轨实际沟距的最小值 µm */
  minTrackPitchUm: number | null;
  /** 可变模式下各轨实际沟距的最大值 µm */
  maxTrackPitchUm: number | null;
  /** 留白带播放耗时(秒) */
  gapSec: number;
  /** 该面总时长(秒,音乐 + 留白) */
  totalSec: number;
  /** 可变模式:每轨及留白从外圈向内的径向布局;恒定模式为 null */
  layout: LayoutEntry[] | null;
  ok: boolean;
  /** 不满足安全约束的原因 */
  reasons: string[];
}

export interface Candidate {
  /** 切点:A 面为第 1..cutAfter 首,B 面为其余 */
  cutAfter: number;
  sideA: SideCalc;
  sideB: SideCalc;
  feasible: boolean;
  /** 淘汰原因(合格时为空数组) */
  reasons: string[];
  /** 较差一面的沟距:恒定模式为 min(pA,pB);可变模式为 min(λA,λB)(仅合格方案) */
  worsePitchUm: number | null;
  /** 两面总时长差(秒,仅合格方案) */
  durationDiffSec: number | null;
}

export interface PlanResult {
  /** 本次计算使用的沟距模式 */
  mode: PitchMode;
  candidates: Candidate[];
  /** 最优方案切点;无合格方案时为 null */
  bestCutAfter: number | null;
}

const EPS = 1e-6;

/** 系数下限/上限 */
export const MIN_COEFFICIENT = 0.5;
export const MAX_COEFFICIENT = 2;

/**
 * 规范化输入:补全缺省的 mode(恒定)与动态系数(可变模式下缺省为 1)。
 * 保存方案时也应使用本函数,确保持久化数据自描述。
 */
export function normalizeInputs(
  tracks: TrackInput[],
  params: PlanParams,
): { tracks: TrackInput[]; params: PlanParams } {
  const mode: PitchMode = params && params.mode === 'variable' ? 'variable' : 'constant';
  const normParams: PlanParams = { ...params, mode };
  const normTracks: TrackInput[] = Array.isArray(tracks)
    ? tracks.map((t) => {
        const coeff =
          t && typeof t.coefficient === 'number' && Number.isFinite(t.coefficient)
            ? t.coefficient
            : 1;
        return { name: t?.name, durationSec: t?.durationSec, coefficient: coeff };
      })
    : [];
  return { tracks: normTracks, params: normParams };
}

export function validateInputs(tracks: TrackInput[], params: PlanParams): string[] {
  const errors: string[] = [];
  if (!Array.isArray(tracks) || tracks.length < 2) {
    errors.push('至少需要 2 首曲目才能划分 A/B 两面');
  } else {
    tracks.forEach((t, i) => {
      if (!t || typeof t.name !== 'string' || !t.name.trim()) {
        errors.push(`第 ${i + 1} 首曲目缺少名称`);
      }
      if (!t || !Number.isFinite(t.durationSec) || t.durationSec <= 0) {
        errors.push(`第 ${i + 1} 首曲目时长必须为正数(秒)`);
      }
      if (params?.mode === 'variable') {
        const c = t?.coefficient;
        if (
          typeof c !== 'number' ||
          !Number.isFinite(c) ||
          c < MIN_COEFFICIENT - EPS ||
          c > MAX_COEFFICIENT + EPS
        ) {
          errors.push(`第 ${i + 1} 首曲目的动态系数必须在 ${MIN_COEFFICIENT}~${MAX_COEFFICIENT} 之间`);
        }
      }
    });
  }
  if (!params || typeof params !== 'object') {
    errors.push('缺少参数');
    return errors;
  }
  if (params.mode !== 'constant' && params.mode !== 'variable') {
    errors.push('沟距模式必须是 constant(恒定)或 variable(可变)');
  }
  if (!(params.rpm > 0)) errors.push('转速必须为正数');
  if (!(params.innerRadiusMm > 0)) errors.push('内有效半径必须为正数');
  if (!(params.outerRadiusMm > params.innerRadiusMm)) errors.push('外有效半径必须大于内有效半径');
  if (!(params.gapWidthMm >= 0)) errors.push('曲间留白宽度不能为负数');
  if (!(params.minPitchUm > 0)) errors.push('最小沟距必须为正数');
  return errors;
}

/** 两种模式共用的基础量 */
function sideBase(sideTracks: TrackInput[], params: PlanParams, firstTrack: number) {
  const musicSec = sideTracks.reduce((s, t) => s + t.durationSec, 0);
  const revolutions = (musicSec * params.rpm) / 60;
  const gapCount = Math.max(0, sideTracks.length - 1);
  const gapWidthTotalMm = gapCount * params.gapWidthMm;
  const totalWidthMm = params.outerRadiusMm - params.innerRadiusMm;
  const usableWidthMm = totalWidthMm - gapWidthTotalMm;
  return {
    musicSec,
    revolutions,
    gapCount,
    gapWidthTotalMm,
    totalWidthMm,
    usableWidthMm,
    firstTrack,
    lastTrack: firstTrack + sideTracks.length - 1,
    trackCount: sideTracks.length,
  };
}

function widthNotPositiveReason(base: ReturnType<typeof sideBase>): string {
  return (
    `扣除 ${base.gapCount} 条留白(共 ${base.gapWidthTotalMm.toFixed(2)}mm)后净径向宽度为 ` +
    `${base.usableWidthMm.toFixed(2)}mm ≤ 0(可用总宽 ${base.totalWidthMm.toFixed(2)}mm)`
  );
}

/** 恒定沟距模式(原行为,不输出每轨布局) */
function calcSideConstant(sideTracks: TrackInput[], params: PlanParams, firstTrack: number): SideCalc {
  const base = sideBase(sideTracks, params, firstTrack);
  const reasons: string[] = [];
  let pitchUm: number | null = null;
  if (base.usableWidthMm <= 0) {
    reasons.push(widthNotPositiveReason(base));
  } else {
    pitchUm = (base.usableWidthMm * 1000) / base.revolutions;
    if (pitchUm < params.minPitchUm - EPS) {
      reasons.push(`沟距 ${pitchUm.toFixed(1)}µm 低于安全阈值 ${params.minPitchUm}µm`);
    }
  }

  const gapSec = pitchUm !== null ? ((base.gapWidthTotalMm * 1000) / pitchUm / params.rpm) * 60 : 0;

  return {
    mode: 'constant',
    ...base,
    pitchUm,
    lambdaUm: null,
    minTrackPitchUm: null,
    maxTrackPitchUm: null,
    gapSec,
    totalSec: base.musicSec + gapSec,
    layout: null,
    ok: reasons.length === 0,
    reasons,
  };
}

/**
 * 可变沟距模式:在约束 Σ max(pmin, λ*c_i)*n_i ≤ Wn*1000 下求最大 λ。
 *
 * 宽度函数 W(λ)= Σ max(pmin, λ*c_i)*n_i 关于 λ 连续、分段线性、单调递增,
 * 折点 λ_i = pmin / c_i(λ 超过折点后该轨脱离 pmin)。
 *
 * 设折点升序为 bp_1 ≤ bp_2 ≤ …。在折点 bp_k 处(取连续点的归属):
 *   已激活曲目 = entries[0..k],压线曲目 = entries[k+1..]
 * 区间 [bp_k, bp_{k+1}] 内
 *   W(λ) = pmin·R_flat + λ·S_active,
 *   R_flat = Σ_{j>k} n_j,S_active = Σ_{j≤k} c_j·n_j
 * 逐区间检验目标宽度是否落于 [W(bp_k), W(bp_{k+1})],命中则一次线性插值。
 * 首区间 [0, bp_1] 全部压线(S_active=0);λ=0 即超宽由调用方先行淘汰。
 */
function solveLambda(
  tracks: { coefficient: number; revolutions: number }[],
  usableWidthUm: number,
  minPitchUm: number,
): number {
  const entries = tracks
    .map((t) => ({ bp: minPitchUm / t.coefficient, revs: t.revolutions, coeff: t.coefficient }))
    .sort((a, b) => a.bp - b.bp);

  let flatRev = entries.reduce((s, e) => s + e.revs, 0);
  let activeSlope = 0;
  let k = -1; // 已跨过的折点下标(entries[0..k] 激活)
  while (true) {
    const segStart = k < 0 ? 0 : entries[k].bp;
    const segEnd = k + 1 < entries.length ? entries[k + 1].bp : Infinity;
    const wEnd = segEnd === Infinity ? Infinity : minPitchUm * flatRev + segEnd * activeSlope;

    if (usableWidthUm <= wEnd + EPS * 1000) {
      if (activeSlope === 0) return segStart; // 首段宽度恒定
      // W(λ) = pmin·R_flat + λ·S_active → λ = (Wn - pmin·R_flat) / S_active
      const lambda = (usableWidthUm - minPitchUm * flatRev) / activeSlope;
      return Math.min(segEnd, Math.max(lambda, segStart));
    }

    if (k + 1 >= entries.length) return usableWidthUm / activeSlope;
    // 跨过折点 bp_{k+1}:相同折点的曲目同时激活
    const bp = entries[k + 1].bp;
    while (k + 1 < entries.length && entries[k + 1].bp <= bp + EPS) {
      k++;
      flatRev -= entries[k].revs;
      activeSlope += entries[k].coeff * entries[k].revs;
    }
  }
}

/** 可变沟距模式 */
function calcSideVariable(sideTracks: TrackInput[], params: PlanParams, firstTrack: number): SideCalc {
  const base = sideBase(sideTracks, params, firstTrack);
  const reasons: string[] = [];

  if (base.usableWidthMm <= 0) {
    reasons.push(widthNotPositiveReason(base));
    return {
      mode: 'variable',
      ...base,
      pitchUm: null,
      lambdaUm: null,
      minTrackPitchUm: null,
      maxTrackPitchUm: null,
      gapSec: 0,
      totalSec: base.musicSec,
      layout: null,
      ok: false,
      reasons,
    };
  }

  const rpm = params.rpm;
  const pmin = params.minPitchUm;
  const tracks = sideTracks.map((t) => ({
    name: t.name,
    coefficient: t.coefficient!,
    durationSec: t.durationSec,
    revolutions: (t.durationSec * rpm) / 60,
  }));

  // λ=0 时所有曲目都压在最小沟距上;此时仍放不下 → 直接淘汰
  const minWidthNeededMm = (pmin * base.revolutions) / 1000;
  if (minWidthNeededMm > base.usableWidthMm + EPS * 1000) {
    reasons.push(
      `即使全部 ${base.trackCount} 首曲目按最小沟距 ${pmin}µm 刻录,仍需径向宽度 ` +
        `${minWidthNeededMm.toFixed(2)}mm,超过净宽度 ${base.usableWidthMm.toFixed(2)}mm`,
    );
  }

  const lambdaUm = reasons.length === 0 ? solveLambda(tracks, base.usableWidthMm * 1000, pmin) : null;

  // 从外圈向内依次铺设每轨与曲间留白
  const layout: LayoutEntry[] = [];
  let gapSec = 0;
  let minTrackPitchUm: number | null = null;
  let maxTrackPitchUm: number | null = null;
  if (lambdaUm !== null) {
    let cursorMm = params.outerRadiusMm;
    tracks.forEach((t, i) => {
      const pitchUm = Math.max(pmin, lambdaUm * t.coefficient);
      const widthMm = (pitchUm * t.revolutions) / 1000;
      const outerRadiusMm = cursorMm;
      const innerRadiusMm = cursorMm - widthMm;
      layout.push({
        kind: 'track',
        globalIndex: firstTrack + i,
        name: t.name,
        durationSec: t.durationSec,
        coefficient: t.coefficient,
        revolutions: t.revolutions,
        pitchUm,
        widthMm,
        outerRadiusMm,
        innerRadiusMm,
      });
      cursorMm = innerRadiusMm;
      minTrackPitchUm = minTrackPitchUm === null ? pitchUm : Math.min(minTrackPitchUm, pitchUm);
      maxTrackPitchUm = maxTrackPitchUm === null ? pitchUm : Math.max(maxTrackPitchUm, pitchUm);

      if (i < tracks.length - 1) {
        // 留白带按前一首曲目的实际沟距刻录
        const durationSec = ((params.gapWidthMm * 1000) / pitchUm / rpm) * 60;
        const gapOuter = cursorMm;
        const gapInner = cursorMm - params.gapWidthMm;
        layout.push({
          kind: 'gap',
          afterTrack: firstTrack + i,
          widthMm: params.gapWidthMm,
          pitchUm,
          durationSec,
          outerRadiusMm: gapOuter,
          innerRadiusMm: gapInner,
        });
        cursorMm = gapInner;
        gapSec += durationSec;
      }
    });
  }

  return {
    mode: 'variable',
    ...base,
    pitchUm: null,
    lambdaUm,
    minTrackPitchUm,
    maxTrackPitchUm,
    gapSec,
    totalSec: base.musicSec + gapSec,
    layout: reasons.length === 0 ? layout : null,
    ok: reasons.length === 0,
    reasons,
  };
}

export function computePlan(rawTracks: TrackInput[], rawParams: PlanParams): PlanResult {
  const { tracks, params } = normalizeInputs(rawTracks, rawParams);
  const errors = validateInputs(tracks, params);
  if (errors.length > 0) {
    throw new Error(errors.join(';'));
  }

  const mode = params.mode!;
  const calcSide = mode === 'variable' ? calcSideVariable : calcSideConstant;

  const candidates: Candidate[] = [];
  for (let cut = 1; cut < tracks.length; cut++) {
    const sideA = calcSide(tracks.slice(0, cut), params, 1);
    const sideB = calcSide(tracks.slice(cut), params, cut + 1);
    const feasible = sideA.ok && sideB.ok;
    candidates.push({
      cutAfter: cut,
      sideA,
      sideB,
      feasible,
      reasons: [
        ...sideA.reasons.map((r) => `A 面:${r}`),
        ...sideB.reasons.map((r) => `B 面:${r}`),
      ],
      worsePitchUm: feasible
        ? mode === 'variable'
          ? Math.min(sideA.lambdaUm!, sideB.lambdaUm!)
          : Math.min(sideA.pitchUm!, sideB.pitchUm!)
        : null,
      durationDiffSec: feasible ? Math.abs(sideA.totalSec - sideB.totalSec) : null,
    });
  }

  // 字典序优选:① 最大化较差一面指标(恒定:沟距;可变:λ);② 最小化两面时长差
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (!c.feasible) continue;
    if (!best) {
      best = c;
      continue;
    }
    const dPitch = c.worsePitchUm! - best.worsePitchUm!;
    if (
      dPitch > EPS ||
      (Math.abs(dPitch) <= EPS && c.durationDiffSec! < best.durationDiffSec! - EPS)
    ) {
      best = c;
    }
  }

  // 可变模式:合格候选按「两面较小 λ 降序、时长差升序」排列,淘汰方案附后(按切点);
  // 恒定模式保持原有按切点顺序输出
  let ordered = candidates;
  if (mode === 'variable') {
    const feasibleList = candidates.filter((c) => c.feasible);
    const rejectedList = candidates.filter((c) => !c.feasible);
    feasibleList.sort((a, b) => {
      const d = b.worsePitchUm! - a.worsePitchUm!;
      if (Math.abs(d) > EPS) return d;
      return a.durationDiffSec! - b.durationDiffSec!;
    });
    ordered = [...feasibleList, ...rejectedList];
  }

  return { mode, candidates: ordered, bestCutAfter: best ? best.cutAfter : null };
}
