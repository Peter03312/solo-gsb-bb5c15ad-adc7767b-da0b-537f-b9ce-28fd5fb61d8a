export type PitchMode = 'constant' | 'variable';

export interface TrackInput {
  name: string;
  durationSec: number;
  /** 可变沟距模式动态系数(0.5~2),缺省 1 */
  coefficient?: number;
}

export interface PlanParams {
  /** 缺省恒定模式,兼容旧数据 */
  mode?: PitchMode;
  rpm: number;
  outerRadiusMm: number;
  innerRadiusMm: number;
  gapWidthMm: number;
  minPitchUm: number;
}

export interface TrackLayout {
  kind: 'track';
  globalIndex: number;
  name: string;
  durationSec: number;
  coefficient: number;
  revolutions: number;
  pitchUm: number;
  widthMm: number;
  outerRadiusMm: number;
  innerRadiusMm: number;
}

export interface GapLayout {
  kind: 'gap';
  afterTrack: number;
  widthMm: number;
  pitchUm: number;
  durationSec: number;
  outerRadiusMm: number;
  innerRadiusMm: number;
}

export type LayoutEntry = TrackLayout | GapLayout;

export interface SideCalc {
  mode: PitchMode;
  firstTrack: number;
  lastTrack: number;
  trackCount: number;
  musicSec: number;
  revolutions: number;
  gapCount: number;
  gapWidthTotalMm: number;
  totalWidthMm: number;
  usableWidthMm: number;
  pitchUm: number | null;
  lambdaUm: number | null;
  minTrackPitchUm: number | null;
  maxTrackPitchUm: number | null;
  gapSec: number;
  totalSec: number;
  layout: LayoutEntry[] | null;
  ok: boolean;
  reasons: string[];
}

export interface Candidate {
  cutAfter: number;
  sideA: SideCalc;
  sideB: SideCalc;
  feasible: boolean;
  reasons: string[];
  worsePitchUm: number | null;
  durationDiffSec: number | null;
}

export interface PlanResult {
  mode: PitchMode;
  candidates: Candidate[];
  bestCutAfter: number | null;
}

export interface ProjectMeta {
  id: number;
  name: string;
  created_at: string;
}

export interface ProjectDetail extends ProjectMeta {
  payload: { tracks: TrackInput[]; params: PlanParams };
}
