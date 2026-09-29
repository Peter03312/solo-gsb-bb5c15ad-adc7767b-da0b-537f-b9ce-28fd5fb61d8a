import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, normalizeInputs, validateInputs } from '../src/planner.js';
import { sampleParams, sampleTracks } from '../src/seed.js';

test('示例数据:最优切点在第 5 首之后,且较差面沟距最大', () => {
  const result = computePlan(sampleTracks, sampleParams);
  assert.equal(result.bestCutAfter, 5);

  const best = result.candidates.find((c) => c.cutAfter === result.bestCutAfter)!;
  assert.ok(best.feasible);
  // 较差面沟距约 121.2µm,且是所有合格方案中最大的
  assert.ok(Math.abs(best.worsePitchUm! - 121.2) < 0.1);
  const feasible = result.candidates.filter((c) => c.feasible);
  assert.ok(feasible.length > 0);
  for (const c of feasible) {
    assert.ok(c.worsePitchUm! <= best.worsePitchUm! + 1e-9);
  }
});

test('沟距低于安全阈值的方案被淘汰并记录原因', () => {
  const result = computePlan(sampleTracks, sampleParams);
  const cut2 = result.candidates.find((c) => c.cutAfter === 2)!;
  assert.equal(cut2.feasible, false);
  assert.ok(cut2.reasons.some((r) => r.includes('B 面') && r.includes('安全阈值')));
  assert.equal(cut2.worsePitchUm, null);
});

test('每面计算明细:转数、净宽度、沟距满足 p = Wn*1000/N', () => {
  const result = computePlan(sampleTracks, sampleParams);
  const cut5 = result.candidates.find((c) => c.cutAfter === 5)!;
  const a = cut5.sideA;
  assert.equal(a.trackCount, 5);
  assert.equal(a.gapCount, 4);
  assert.ok(Math.abs(a.gapWidthTotalMm - 4.8) < 1e-9);
  assert.ok(Math.abs(a.usableWidthMm - (146 - 60 - 4.8)) < 1e-9);
  assert.ok(Math.abs(a.revolutions - (a.musicSec * sampleParams.rpm) / 60) < 1e-9);
  assert.ok(Math.abs(a.pitchUm! - (a.usableWidthMm * 1000) / a.revolutions) < 1e-9);
  assert.ok(a.totalSec > a.musicSec); // 含留白耗时
});

test('字典序优选:较差面沟距并列时取时长差更小者', () => {
  // 构造对称曲目,使中间两个切点的较差面沟距接近,时长差不同
  const tracks = [
    { name: 't1', durationSec: 300 },
    { name: 't2', durationSec: 300 },
    { name: 't3', durationSec: 100 },
    { name: 't4', durationSec: 500 },
  ];
  const params = { rpm: 45, outerRadiusMm: 100, innerRadiusMm: 50, gapWidthMm: 0, minPitchUm: 10 };
  const result = computePlan(tracks, params);
  const best = result.candidates.find((c) => c.cutAfter === result.bestCutAfter)!;
  // 独立穷举验证优选规则
  const feasible = result.candidates.filter((c) => c.feasible);
  const maxPitch = Math.max(...feasible.map((c) => c.worsePitchUm!));
  const tied = feasible.filter((c) => Math.abs(c.worsePitchUm! - maxPitch) < 1e-6);
  const expected = tied.reduce((a, b) => (a.durationDiffSec! <= b.durationDiffSec! ? a : b));
  assert.equal(best.cutAfter, expected.cutAfter);
});

test('输入校验:少于 2 首曲目 / 非法参数直接抛错', () => {
  assert.throws(() => computePlan([{ name: 'x', durationSec: 60 }], sampleParams), /至少需要 2 首/);
  assert.throws(
    () =>
      computePlan(sampleTracks, { ...sampleParams, outerRadiusMm: 50, innerRadiusMm: 60 }),
    /外有效半径必须大于内有效半径/,
  );
  assert.ok(validateInputs(sampleTracks, sampleParams).length === 0);
});

test('留白过宽导致净宽度 ≤ 0 时给出淘汰原因', () => {
  // 3 首曲目:无论怎么切,总有一面含 2 首 → 1 条 100mm 留白超过 86mm 可用宽度
  const tracks = [
    { name: 'a', durationSec: 60 },
    { name: 'b', durationSec: 60 },
    { name: 'c', durationSec: 60 },
  ];
  const params = { ...sampleParams, gapWidthMm: 100 };
  const result = computePlan(tracks, params);
  assert.equal(result.bestCutAfter, null);
  assert.ok(result.candidates.every((c) => !c.feasible));
  assert.ok(result.candidates[0].reasons.some((r) => r.includes('净径向宽度')));
});

// ---------------- 可变沟距模式 ----------------

const varParams = {
  mode: 'variable' as const,
  rpm: 33.333,
  outerRadiusMm: 146,
  innerRadiusMm: 60,
  gapWidthMm: 1.2,
  minPitchUm: 80,
};

test('可变模式:系数全为 1 时 λ 等于恒定模式沟距,且每轨宽度之和填满净宽度', () => {
  const tracks = sampleTracks.map((t) => ({ ...t, coefficient: 1 }));
  const result = computePlan(tracks, varParams);
  const constResult = computePlan(sampleTracks, sampleParams);
  assert.equal(result.mode, 'variable');
  assert.equal(result.bestCutAfter, constResult.bestCutAfter);

  for (const c of result.candidates) {
    const cc = constResult.candidates.find((x) => x.cutAfter === c.cutAfter)!;
    assert.equal(c.feasible, cc.feasible);
    if (c.feasible) {
      assert.ok(Math.abs(c.sideA.lambdaUm! - cc.sideA.pitchUm!) < 1e-9);
      assert.ok(Math.abs(c.sideB.lambdaUm! - cc.sideB.pitchUm!) < 1e-9);
      for (const side of [c.sideA, c.sideB]) {
        const trackEntries = side.layout!.filter((e) => e.kind === 'track');
        const tracksWidth = trackEntries.reduce((s, e) => s + (e as { widthMm: number }).widthMm, 0);
        assert.ok(Math.abs(tracksWidth - side.usableWidthMm) < 1e-6);
        // 从外圈向内连续铺设
        const outer = side.layout![0].outerRadiusMm;
        const inner = side.layout![side.layout!.length - 1].innerRadiusMm;
        assert.ok(Math.abs(outer - varParams.outerRadiusMm) < 1e-9);
        assert.ok(Math.abs(inner - varParams.innerRadiusMm) < 1e-6);
      }
    }
  }
});

test('可变模式:每轨实际沟距 = max(最小沟距, λ × 系数),并给出起止半径', () => {
  const tracks = [
    { name: 'loud', durationSec: 600, coefficient: 1.6 },
    { name: 'quiet', durationSec: 200, coefficient: 0.6 },
    { name: 'mid', durationSec: 400, coefficient: 1 },
  ];
  const result = computePlan(tracks, varParams);
  const best = result.candidates.find((c) => c.cutAfter === result.bestCutAfter)!;
  assert.ok(best.feasible);

  for (const side of [best.sideA, best.sideB]) {
    const lambda = side.lambdaUm!;
    let cursor = varParams.outerRadiusMm;
    for (const entry of side.layout!) {
      assert.ok(Math.abs(entry.outerRadiusMm - cursor) < 1e-9);
      if (entry.kind === 'track') {
        assert.ok(Math.abs(entry.pitchUm - Math.max(80, lambda * entry.coefficient)) < 1e-9);
        assert.ok(entry.pitchUm >= 80 - 1e-9);
        assert.ok(Math.abs(entry.widthMm - (entry.pitchUm * entry.revolutions) / 1000) < 1e-9);
      }
      cursor = entry.innerRadiusMm;
    }
    assert.ok(Math.abs(cursor - varParams.innerRadiusMm) < 1e-6);
  }
});

test('可变模式:候选按两面较小 λ 降序、再按时长差升序排列', () => {
  const tracks = [
    { name: 't1', durationSec: 312, coefficient: 1.4 },
    { name: 't2', durationSec: 245, coefficient: 0.7 },
    { name: 't3', durationSec: 198, coefficient: 1 },
    { name: 't4', durationSec: 368, coefficient: 1.3 },
  ];
  const result = computePlan(tracks, varParams);
  const feasible = result.candidates.filter((c) => c.feasible);
  assert.ok(feasible.length >= 2);
  for (let i = 1; i < feasible.length; i++) {
    const prev = feasible[i - 1].worsePitchUm!;
    const cur = feasible[i].worsePitchUm!;
    assert.ok(prev >= cur - 1e-9);
    if (Math.abs(prev - cur) <= 1e-6) {
      assert.ok(feasible[i - 1].durationDiffSec! <= feasible[i].durationDiffSec! + 1e-9);
    }
  }
  // 淘汰方案排在合格方案之后
  const firstRejected = result.candidates.findIndex((c) => !c.feasible);
  if (firstRejected >= 0) {
    assert.ok(result.candidates.slice(firstRejected).every((c) => !c.feasible));
  }
  // 最优方案就是列表中的第一个合格方案
  assert.equal(result.candidates[0].cutAfter, result.bestCutAfter);
});

test('可变模式:连最小沟距都容不下时淘汰并记录原因,λ 与布局为 null', () => {
  const tracks = [
    { name: 'a', durationSec: 2400, coefficient: 2 },
    { name: 'b', durationSec: 2400, coefficient: 2 },
  ];
  const result = computePlan(tracks, varParams);
  assert.equal(result.bestCutAfter, null);
  const c = result.candidates[0];
  assert.equal(c.feasible, false);
  assert.equal(c.sideA.lambdaUm, null);
  assert.equal(c.sideA.layout, null);
  assert.ok(c.reasons.some((r) => r.includes('最小沟距')));
});

test('可变模式:动态系数超出 0.5~2 被拒绝;缺省系数规范化为 1;恒定模式忽略系数', () => {
  assert.throws(
    () =>
      computePlan(
        [
          { name: 'a', durationSec: 60, coefficient: 2.1 },
          { name: 'b', durationSec: 60, coefficient: 1 },
        ],
        varParams,
      ),
    /动态系数/,
  );
  assert.throws(
    () =>
      computePlan(
        [
          { name: 'a', durationSec: 60, coefficient: 0.4 },
          { name: 'b', durationSec: 60 },
        ],
        varParams,
      ),
    /动态系数/,
  );

  // 缺省系数 → 1,与显式全 1 结果一致
  const noCoeff = computePlan(
    [
      { name: 'a', durationSec: 300 },
      { name: 'b', durationSec: 250 },
    ],
    varParams,
  );
  const withOne = computePlan(
    [
      { name: 'a', durationSec: 300, coefficient: 1 },
      { name: 'b', durationSec: 250, coefficient: 1 },
    ],
    varParams,
  );
  assert.ok(
    noCoeff.candidates.every(
      (c, i) => Math.abs(c.worsePitchUm! - withOne.candidates[i].worsePitchUm!) < 1e-9,
    ),
  );

  // 恒定模式下即使系数非法也被忽略,行为与原来完全一致
  const constResult = computePlan(
    [
      { name: 'a', durationSec: 300, coefficient: 9 },
      { name: 'b', durationSec: 250, coefficient: -1 },
    ],
    sampleParams,
  );
  assert.equal(constResult.mode, 'constant');
  assert.equal(constResult.candidates[0].sideA.pitchUm !== null, true);
});

test('normalizeInputs:旧数据(无 mode / coefficient)补全为恒定模式与系数 1', () => {
  const norm = normalizeInputs(
    [
      { name: 'a', durationSec: 60 },
      { name: 'b', durationSec: 90 },
    ],
    { rpm: 45, outerRadiusMm: 100, innerRadiusMm: 50, gapWidthMm: 1, minPitchUm: 10 },
  );
  assert.equal(norm.params.mode, 'constant');
  assert.deepEqual(norm.tracks.map((t) => t.coefficient), [1, 1]);
  assert.equal(validateInputs(norm.tracks, norm.params).length, 0);
});

// ---------------- 压片前时长上浮(extraSec) ----------------

test('上浮全为 0:两种情形数值一致,候选顺序、合格性、最优切点与旧版完全相同', () => {
  for (const params of [sampleParams, varParams]) {
    const oldResult = computePlan(sampleTracks, params);
    const withZero = computePlan(
      sampleTracks.map((t) => ({ ...t, extraSec: 0 })),
      params,
    );
    assert.equal(withZero.upliftApplied, false);
    assert.equal(withZero.bestCutAfter, oldResult.bestCutAfter);
    assert.deepEqual(
      withZero.candidates.map((c) => c.cutAfter),
      oldResult.candidates.map((c) => c.cutAfter),
    );
    for (const c of withZero.candidates) {
      // 无上浮时失效切点全部归为 nominal,不存在「上浮后才失效」
      assert.equal(c.rejectedAt, c.feasible ? null : 'nominal');
      assert.equal(c.uplift.ok, c.feasible);
      // 上浮情形各指标与标称情形逐项一致
      assert.ok(Math.abs(c.uplift.sideA.musicSec - c.sideA.musicSec) < 1e-9);
      assert.ok(Math.abs(c.uplift.sideB.musicSec - c.sideB.musicSec) < 1e-9);
      if (c.feasible) {
        assert.ok(Math.abs(c.uplift.worsePitchUm! - c.worsePitchUm!) < 1e-9);
        assert.ok(Math.abs(c.uplift.durationDiffSec! - c.durationDiffSec!) < 1e-9);
      }
    }
  }
});

test('上浮校验:标称合格但上浮后超宽的切点被标记为 uplift 失效,仍有切点两面均达标时按标称指标入选', () => {
  // 给第 6~10 首各加 150 秒:第 5 切点标称合格,但 B 面上浮后失效;
  // 第 6 切点标称合格且上浮情形两面仍达标 → 最优落在第 6 首之后
  const tracks = sampleTracks.map((t, i) => (i >= 5 ? { ...t, extraSec: 150 } : t));
  const result = computePlan(tracks, sampleParams);
  assert.equal(result.upliftApplied, true);
  assert.equal(result.bestCutAfter, 6);

  const cut5 = result.candidates.find((c) => c.cutAfter === 5)!;
  assert.equal(cut5.feasible, true); // 标称仍合格
  assert.equal(cut5.rejectedAt, 'uplift');
  assert.equal(cut5.uplift.ok, false);
  assert.equal(cut5.uplift.sideA.ok, true);
  assert.equal(cut5.uplift.sideB.ok, false);
  // 标称原因列表不含上浮信息;上浮失效原因单独以「上浮后」前缀追加
  assert.ok(cut5.reasons.some((r) => r.startsWith('上浮后 B 面:') && r.includes('安全阈值')));
  assert.ok(!cut5.reasons.some((r) => r.startsWith('上浮后 A 面:')));

  const cut6 = result.candidates.find((c) => c.cutAfter === 6)!;
  assert.equal(cut6.rejectedAt, null);
  assert.equal(cut6.uplift.sideA.ok, true);
  assert.equal(cut6.uplift.sideB.ok, true);
  // 上浮情形音乐时长 = 标称 + 该面包含的上浮秒数(B 面为第 7~10 首,共 4×150)
  assert.ok(Math.abs(cut6.uplift.sideB.musicSec - (cut6.sideB.musicSec + 4 * 150)) < 1e-9);
  // 上浮后沟距必然不大于标称沟距
  assert.ok(cut6.uplift.sideB.pitchUm! < cut6.sideB.pitchUm!);
  assert.ok(cut6.uplift.worsePitchUm! <= cut6.worsePitchUm! + 1e-9);
});

test('标称即不合格的切点标记 nominal,即使上浮情形给出数值也不影响判定', () => {
  const tracks = sampleTracks.map((t) => ({ ...t, extraSec: 30 }));
  const result = computePlan(tracks, sampleParams);
  const cut2 = result.candidates.find((c) => c.cutAfter === 2)!;
  assert.equal(cut2.feasible, false);
  assert.equal(cut2.rejectedAt, 'nominal');
  assert.ok(cut2.reasons.some((r) => r.startsWith('B 面:')));
  assert.ok(!cut2.reasons.some((r) => r.startsWith('上浮后')));
  assert.ok(result.bestCutAfter !== null); // 仍有切点入选
});

test('上浮使全部切点失效时无最优切点,并区分 nominal / uplift 两类原因', () => {
  // 场景一:曲目本身长到标称就放不下 → 全部 nominal(上浮值大小不影响标称判定)
  const huge = [
    { name: 'a', durationSec: 1500, extraSec: 0 },
    { name: 'b', durationSec: 1500, extraSec: 0 },
    { name: 'c', durationSec: 1500, extraSec: 300 },
  ];
  const r1 = computePlan(huge, sampleParams);
  assert.equal(r1.bestCutAfter, null);
  assert.ok(r1.candidates.length >= 1);
  assert.ok(r1.candidates.every((c) => c.rejectedAt === 'nominal'));
  assert.ok(r1.candidates.every((c) => c.feasible === false));

  // 场景二:标称全部合格、上浮后全部失效 → 全部标 uplift 且原因含「上浮后」
  // 第 6~10 首各 +300 秒:标称结果不变(切点 1、2 本就 nominal);
  // 因此改用让标称全部合格的小曲目集合
  const smallParams = { ...sampleParams, minPitchUm: 40 };
  const small = sampleTracks.map((t) => ({ ...t, extraSec: 900 }));
  const base = computePlan(sampleTracks, smallParams);
  assert.ok(base.candidates.every((c) => c.feasible)); // 前提:放宽阈值后标称全合格
  const r2 = computePlan(small, smallParams);
  assert.equal(r2.bestCutAfter, null);
  assert.ok(r2.candidates.every((c) => c.feasible)); // 标称仍全部合格
  assert.ok(r2.candidates.every((c) => c.rejectedAt === 'uplift'));
  assert.ok(r2.candidates.every((c) => c.reasons.some((r) => r.startsWith('上浮后'))));
});

test('无效或非有限上浮值报错,不返回任何规划结果', () => {
  const bad = [
    { name: 'a', durationSec: 300, extraSec: -1 },
    { name: 'b', durationSec: 250, extraSec: 0 },
  ];
  for (const v of [-1, NaN, Infinity, -Infinity, '5']) {
    assert.throws(
      () =>
        computePlan(
          [
            { name: 'a', durationSec: 300, extraSec: v as number },
            { name: 'b', durationSec: 250, extraSec: 0 },
          ],
          sampleParams,
        ),
      /上浮秒数必须是非负有限数值/,
    );
  }
  // 恒定与可变两种模式都拦截
  assert.throws(
    () =>
      computePlan(
        bad.map((t, i) => (i === 0 ? { ...t, extraSec: NaN } : t)),
        varParams,
      ),
    /上浮秒数必须是非负有限数值/,
  );
});

test('normalizeInputs:旧数据缺省 extraSec 补 0;显式非数值保留 NaN 交由校验报错', () => {
  const norm = normalizeInputs(
    [
      { name: 'a', durationSec: 60 },
      { name: 'b', durationSec: 90, extraSec: 12 },
    ],
    sampleParams,
  );
  assert.deepEqual(norm.tracks.map((t) => t.extraSec), [0, 12]);
  assert.equal(validateInputs(norm.tracks, norm.params).length, 0);

  const bad = normalizeInputs(
    [
      { name: 'a', durationSec: 60 },
      { name: 'b', durationSec: 90, extraSec: 'x' as unknown as number },
    ],
    sampleParams,
  );
  assert.ok(validateInputs(bad.tracks, bad.params).some((e) => e.includes('上浮秒数')));
});

test('可变模式上浮:λ 随上浮时长下降,失效时给出上浮侧最小沟距原因', () => {
  const tracks = sampleTracks.map((t, i) =>
    i >= 5 ? { ...t, coefficient: 1.6, extraSec: 300 } : { ...t, coefficient: 1 },
  );
  const result = computePlan(tracks, varParams);
  // 切点 5 标称 λ 最大,但 B 面曲目大幅上浮后 λ 低于安全阈值 → uplift 失效
  const cut5 = result.candidates.find((c) => c.cutAfter === 5)!;
  assert.equal(cut5.feasible, true);
  assert.equal(cut5.rejectedAt, 'uplift');
  assert.equal(cut5.uplift.sideB.ok, false);
  assert.ok(cut5.reasons.some((r) => r.startsWith('上浮后 B 面:') && r.includes('最小沟距')));
  // 入选切点的上浮情形 λ 不大于标称 λ
  for (const c of result.candidates.filter((x) => x.rejectedAt === null)) {
    assert.ok(c.uplift.sideA.lambdaUm! <= c.sideA.lambdaUm! + 1e-9);
    assert.ok(c.uplift.sideB.lambdaUm! <= c.sideB.lambdaUm! + 1e-9);
  }
});
