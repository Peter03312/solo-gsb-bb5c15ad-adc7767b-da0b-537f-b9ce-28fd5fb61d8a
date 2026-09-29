# 黑胶唱片分面规划(Vinyl Side-Split Planner)

录入按顺序排列的曲目时长、每首曲目的动态系数与刻录参数,系统自动枚举所有 A/B 面切点,支持两种沟距模式:

- **恒定沟距模式**(原行为):每面使用统一沟距,淘汰低于安全阈值的方案;
- **可变沟距模式(新)**:每首曲目可录入 0.5~2 的动态系数,求该面不超过可用径向宽度的最大基准 λ,每轨实际沟距为 `max(最小沟距, λ × 动态系数)`,并展示每轨从外圈向内的起止半径。

候选按「先最大化较差一面指标(恒定:沟距 p;可变:λ),再最小化两面时长差」的字典序规则选出最优切点。页面展示每个候选切点的完整计算明细与淘汰原因。

技术栈:React + TypeScript(Vite)/ Node.js(Express)/ SQLite(better-sqlite3),Docker Compose 一键启动。

## 访问地址

| 方式 | 地址 |
| --- | --- |
| Docker Compose(推荐) | http://localhost:8080 |
| `docker run`(同上) | http://localhost:8080 |
| 本地开发 - 前端(Vite) | http://localhost:5173(`/api` 自动代理到 8080) |
| 本地开发 - 后端 API | http://localhost:8080 |

## 计算模型

### 通用量

| 量 | 公式 |
| --- | --- |
| 可用径向宽度 W | 外有效半径 − 内有效半径 (mm) |
| 留白扣除 | (k − 1) × 曲间留白宽度 (mm) |
| 净径向宽度 Wn | W − 留白扣除 |
| 第 i 轨转数 nᵢ | 该轨时长(秒) × 转速(rpm) ÷ 60 |

枚举规则:n 首曲目有 n − 1 个切点,A 面 = 第 1..c 首,B 面 = 第 c+1..n 首(两面均非空)。

### 模式一:恒定沟距(constant,默认)

| 量 | 公式 |
| --- | --- |
| 面总转数 N | Σ nᵢ |
| 恒定沟距 p | Wn × 1000 ÷ N (µm/转) |
| 留白播放耗时 | 留白宽 × 1000 ÷ p ÷ rpm × 60 (秒) |
| 面总时长 | 音乐时长 + 留白播放耗时 |

过滤:任一面 `p < 最小沟距` 或 `Wn ≤ 0` → 淘汰,并记录原因。

### 模式二:可变沟距(variable)

每首曲目带动态系数 `cᵢ ∈ [0.5, 2]`(缺省按 1)。给定基准 λ(µm/转):

| 量 | 公式 |
| --- | --- |
| 第 i 轨实际沟距 pᵢ | `max(最小沟距 pmin, λ × cᵢ)` |
| 第 i 轨径向宽度 | pᵢ × nᵢ ÷ 1000 (mm) |
| 曲间留白 | 固定物理宽度;按**前一首曲目**的实际沟距刻录并计播放耗时 |

**求最大 λ**:使各轨径向宽度之和不超过净宽度,即

```
Σᵢ max(pmin, λ × cᵢ) × nᵢ ≤ Wn × 1000
```

左边是 λ 的**分段线性单调递增函数**,折点为 `λᵢ = pmin / cᵢ`(λ 低于折点时该轨被压在最小沟距上)。算法把折点升序排列后逐区间扫描,区间内「压线曲目」集合不变,宽度形如 `pmin × R_flat + λ × S_active`,一次线性插值即可解出 λ\*(`O(k log k)`)。

**淘汰**:

1. `Wn ≤ 0`(留白本身已超宽);
2. 即使 λ = 0(全部曲目压到最小沟距),所需宽度 `pmin × N ÷ 1000` 仍大于 Wn —— 即「连最低沟距都容不下」。

**每轨布局**:从外有效半径开始向内,依次铺设每首曲目(宽 pᵢ×nᵢ/1000)与曲间留白(固定宽度),得到每轨/每条留白的外圈起始半径与内圈结束半径;合格方案恰好铺到内有效半径。

### 优选与排序

- **恒定模式**:合格方案按切点顺序展示;最优 = 最大化 `min(pA, pB)`,并列时最小化 `|TA − TB|`。
- **可变模式**:合格方案按 `min(λA, λB)` 降序排列(并列再按 `|TA − TB|` 升序),淘汰方案附后;最优即列表第一项。

## 快速开始(Docker)

```bash
docker compose up --build
# 打开 http://localhost:8080
```

SQLite 数据持久化在命名卷 `vinyl-data` 中。首次启动时数据库为空会自动写入示例方案。

也可以不用 Compose:

```bash
docker build -t vinyl-planner .
docker run -p 8080:8080 -v vinyl-data:/app/data vinyl-planner
# 打开 http://localhost:8080
```

## 本地开发

```bash
# 终端 1:后端(http://localhost:8080)
cd server && npm install && npm run dev

# 终端 2:前端(http://localhost:5173,/api 自动代理到 8080)
cd client && npm install && npm run dev
```

## 测试与构建

```bash
cd server && npm test        # 规划算法单元测试(node:test,含两种模式)
cd server && npm run build   # 编译 TypeScript → dist/
cd client && npm run build   # 类型检查 + 打包 → dist/
```

生产模式本地运行:

```bash
cd client && npm run build
cd ../server && npm run build
STATIC_DIR=../client/dist npm start
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/plan` | 计算分面方案 |
| GET | `/api/projects` | 已存方案列表 |
| GET | `/api/projects/:id` | 方案详情(含 tracks 与 params) |
| POST | `/api/projects` | 保存方案(模式与每首系数随方案持久化) |
| DELETE | `/api/projects/:id` | 删除方案 |

请求/保存 body:

```json
{
  "name": "我的唱片(可选,仅保存时需要)",
  "params": {
    "mode": "variable",
    "rpm": 33.333,
    "outerRadiusMm": 146,
    "innerRadiusMm": 60,
    "gapWidthMm": 1.2,
    "minPitchUm": 80
  },
  "tracks": [
    { "name": "第一首", "durationSec": 312, "coefficient": 1.3 },
    { "name": "第二首", "durationSec": 245, "coefficient": 0.7 }
  ]
}
```

说明:

- `mode` 缺省为 `"constant"`(恒定沟距,与旧版完全兼容);`"variable"` 为可变沟距。
- 可变模式下每首曲目需要 `coefficient`(0.5~2),缺省按 1;恒定模式忽略该字段。
- 保存/加载完整保留模式与动态系数;旧版保存的方案加载时自动补全为恒定模式、系数 1。

示例:

```bash
# 恒定沟距示例
curl -X POST http://localhost:8080/api/plan \
  -H 'Content-Type: application/json' \
  -d @sample/sample-album.json        # 该文件含 name 字段,多余字段会被忽略

# 可变沟距示例(每首带动态系数)
curl -X POST http://localhost:8080/api/plan \
  -H 'Content-Type: application/json' \
  -d @sample/sample-album-variable.json
```

## 目录结构

```
├── Dockerfile              # 多阶段:前端构建 → 后端编译 → 精简运行时
├── docker-compose.yml      # 一键启动,访问 http://localhost:8080
├── sample/
│   ├── sample-album.json           # 恒定沟距示例(与服务端内置种子一致)
│   └── sample-album-variable.json  # 可变沟距示例(含每首动态系数)
├── server/                 # Express + better-sqlite3
│   ├── src/planner.ts      # 核心规划算法(纯函数,两种模式)
│   ├── src/db.ts           # SQLite 持久化 + 启动种子 + 旧数据兼容
│   ├── src/index.ts        # HTTP API + 静态托管
│   └── test/planner.test.ts
└── client/                 # React + TypeScript (Vite)
    └── src/components/     # 参数表单(模式切换)/ 曲目编辑(系数列)/ 结果明细(每轨布局)
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务端口 |
| `DB_PATH` | `./data/vinyl.db`(容器内 `/app/data/vinyl.db`) | SQLite 文件路径 |
| `STATIC_DIR` | `./public`(容器内 `/app/public`) | 前端静态资源目录 |
