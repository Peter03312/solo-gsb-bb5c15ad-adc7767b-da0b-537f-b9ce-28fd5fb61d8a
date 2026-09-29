import type { PlanParams, TrackInput } from './planner.js';

/** 内置示例数据:一张虚构的 10 首曲目 LP */
export const sampleTracks: TrackInput[] = [
  { name: '序曲 Overture', durationSec: 312, coefficient: 1 },
  { name: '霓虹航道', durationSec: 245, coefficient: 1 },
  { name: '慢速旋转', durationSec: 198, coefficient: 1 },
  { name: '沟槽之间', durationSec: 167, coefficient: 1 },
  { name: '半径之外', durationSec: 284, coefficient: 1 },
  { name: '留白', durationSec: 176, coefficient: 1 },
  { name: '内圈回声', durationSec: 233, coefficient: 1 },
  { name: '四十五转', durationSec: 205, coefficient: 1 },
  { name: '静噪', durationSec: 149, coefficient: 1 },
  { name: '终曲:归位', durationSec: 368, coefficient: 1 },
];

export const sampleParams: PlanParams = {
  mode: 'constant',
  rpm: 33.333,
  outerRadiusMm: 146,
  innerRadiusMm: 60,
  gapWidthMm: 1.2,
  minPitchUm: 80,
};

export const sampleProjectName = '示例:概念专辑《Spiral》';
