# Memory Palace OS / Mnemonic Engine v1.8.0

将教材与学习资料转化为可探索的 3D 记忆宫殿，并结合主动回忆、纵向学习证据、遗忘状态估计和交互式知识实验。当前 V1.8.0 增加 Knowledge-to-Simulation Compiler：只编译原文中明确出现的代数等式与数值约束，生成有界、安全、可追溯的交互仿真；它不是通用 AI 物理建模器。

**当前验收基线：** `npm test` 162/162 通过；`npm run typecheck` 通过。真实浏览器 WebGL 端到端验收和真人长期学习效果实验仍未完成，不能把模拟结果视为真人效果证据。

## V1.9 development — causal state machine

独立开发分支 `feature/v1.9-causal-state-machine` 增加证据约束的离散事件状态机：显式状态、事件、守卫条件、不变量和可重放的状态转移轨迹。它不从相关性推断因果，不是连续时间物理求解器；输入单位目前仅作为标签。接口和限制见 `docs/v1.9-causal-state-machine.md`，验收状态见 `verification/v19-causal-report.md`。本地 Node 22.16.0 回归测试 172/172 通过，TypeScript 类型检查和前端语法检查通过；新增独立状态机工作台与宫殿入口。GitHub Actions job 未启动 runner，不能视为远程 CI 通过；Chromium headless 未能初始化，真实浏览器/响应式视觉验收仍未完成。

## V1.5.0 — MMG review planner

新增实验策略 `marginal`：七天边际收益 + 覆盖保护。默认 fixed 不变。`npm run review:experiment:v15` 可复现实验，详见 `verification/v15-report.md`；测量仅为空间定位，不代表独立知识回忆。

## Project overview

持续迭代的 TypeScript 记忆系统：教材理解 → 知识图谱 → 3D 空间宫殿 → 主动回忆 → 证据记录 → 双记忆状态估计与人工复核建议。保留旧版知识编译、认知策略、技能迁移和本地离线能力。

# V0.4：贝叶斯双记忆与鲁棒性验证

- `src/bayesian.ts`：8×8 (K,V) 联合半衰期后验；两种独立暴露时钟；联合观测似然；替换成本离散后验（知识成本及带提示测试成本分开估计）；基于明确混淆证据、干扰降幅、收益概率与下行风险的决策。
- `src/adaptive-service.ts`：复用原始场景验证、候选编译和人工确认边界；新版分析只读，不自动发布或迁移场景。V0.3 `/adaptive` 接口不变。
- `eval/heterogeneous.ts`、`examples/robustness.ts`：六类模拟学习者（包括强提示依赖、弱干扰、高替换成本、异构遗忘、环境漂移、语义混淆），同一复习预算、配对随机数、固定策略/失败驱动/Guarded V0.3/仅先验贝叶斯/自适应贝叶斯。`npm run robustness -- --pilot` 为12种子、4场景预实验；`npm run robustness` 为64新种子、6场景验证。
- `verification/robustness-report.md` 为结果报告；CSV/JSON 保存完整种子级结果，V0.3 结果保留。

### 新增 HTTP API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/publications/:id/bayesian` | 双记忆状态、成本后验、干扰矩阵、可选替换草案 |
| POST | `/api/cost-evidence` | 手动记录匹配测试的汇总数据 |
| GET | `/api/cost-evidence` | 当前本地用户的成本估计 |

示例（仅演示数据格式，不是真实实验结果）：

```json
{"id":"probe-001","mode":"unaided","delayDays":2,"changedCorrect":7,"changedTotal":10,"controlCorrect":9,"controlTotal":10}
```

两个条件应使用同样延迟、学习时间及难度可比的知识，在公布答案之前测试。同一 `id` 重试幂等；不同内容重用 ID 返回 409。每组最多200次观察，最多256批。数据为调用者自报，服务不能证明两组匹配、相互独立或来源可靠。此接口不会主动执行对照实验，也不会自动接受建议、自动建立场景版本或从真实使用中自动收集替换样本。没有观测时使用 `prior_only`，不能视作个体成本已测量。`cued` 成本是带提示任务的总损失代理，不等于可直接观测的纯视觉记忆损失。

双记忆概率为 `K+(1-K)*V*D`（D 为干扰修正）；它强制带提示不劣于无提示，这对强上下文依赖者不一定成立。联合后验因观测有限而可能不可识别，`weakly_identified` 不应解读为能力等级。对照汇总的成本似然采用离散基准成功率积分、固定恢复时间常数14天；收益计算的视觉/知识状态使用后验均值，成本与混淆频率采用独立后验近似。收益概率为模型内部决策概率，不是现实因果置信度。场景替换状态在模拟器里显式记录，真实版本迁移尚未实现。实验中使用同等额外校准探针，不能当作免费学习收益；模型未基于真人数据校准。

参考：Settles & Meeder (2016), https://aclanthology.org/P16-1174/；线索过载研究 https://pmc.ncbi.nlm.nih.gov/articles/PMC5104237/ 。以上是研究启发而非论文算法复现。

下面保留 V0.1–V0.3 的使用说明与实现记录；V0.3 实验状态、测试数等是历史结果，以 V0.4 的 `verification/test-results.txt` 为本次回归结果。

## 快速启动（Windows / macOS / Linux）

需要 Node.js 22.16+（推荐 24 LTS）。运行时无第三方 npm 依赖；要执行静态类型检查需安装开发依赖。

```sh
node -v
npm test
npm run eval
npm run experiment
npm run robustness
npm run demo
npm start
```

默认仅监听 http://127.0.0.1:8787 。`npm run demo` 不需要 API Key，并使用临时目录；服务通过 `.data/state.json` 持久化。可设置 `DATA_FILE` 修改路径。

静态检查：

```sh
npm install
npm run typecheck
```

Node 22 的 TypeScript 类型擦除可能显示实验性警告，不等于测试错误。运行时类型擦除不做静态类型检查，故单独提供 `typecheck`。

## 真实模型接入

复制 `.env.example` 为 `.env`，将 `MODEL_MODE` 设置为 `remote`，填写 `MODEL_ID` 和 `MODEL_API_KEY`。使用支持 Chat Completions 的服务，`MODEL_BASE_URL` 填到 `/v1` 等基础路径，不要包含 `/chat/completions`。若供应商只支持 JSON object 而非严格 JSON Schema，设置 `MODEL_FORMAT=json_object`（仍会进行本地验证）。

```
node --env-file=.env --experimental-strip-types src/server.ts
```

API 密钥仅在服务端。不要把 `.env` 提交到版本库。真实模型调用适配器有超时、结构校验、不完整输出和拒绝检测；本交付未连接真实供应商，测试通过模拟 HTTP 响应完成。各供应商格式兼容性需实际验证。模型失败不会悄悄切换到离线模板。

## API（均返回 JSON）

以 `examples/http-demo.ts` 为实际可执行的 HTTP 客户端示例，启动服务后另开终端执行：

```
node --experimental-strip-types examples/http-demo.ts
```

| 方法 | 路径 | 请求内容 |
|---|---|---|
| GET | `/health` | 无 |
| GET | `/api/assets` | 无 |
| POST | `/api/parse` | `{ "source": "原文" }` |
| POST | `/api/math/parse` | `{ "expression": "(x+1)^2" }`，返回 AST 或 unsupported |
| POST | `/api/math/compare` | `{ "left": "(x+1)^2", "right": "x^2+2*x+1" }` |
| POST | `/api/math/check-answer` | `{ "knowledgeId": "...", "answer": "..." }`，知识必须确认 |
| POST | `/api/confirm` | `{ "knowledgeId": "...", "revision": "..." }` |
| POST | `/api/generate` | `{ "knowledgeId": "...", "anchor": { "id": "desk", "position": [0,2,0] } }` |
| GET | `/api/jobs/:id` | 无 |
| POST | `/api/publish` | `{ "jobId": "...", "sceneId": "...", "acknowledge": true }` |
| GET | `/api/publications/:id` | `?mode=recall` 去除原子答案及自由文本说明 |
| POST | `/api/publications/:id/reviews` | `{ "atoms": [{ "atomId":"a1", "grade":"correct" }] }`，必须覆盖全部原子 |
| GET | `/api/publications/:id/feedback` | 无 |

错误格式：`{"error":{"code":"...","message":"..."}}`。生成接口返回三个候选的验证报告和场景草稿，失败候选的 `scene` 是 null。`job` 是同步完成后的持久化记录，不是后台任务队列。发布前需人工审查对应关系，并传入确认字段。示例脚本的自动确认仅用于测试已知夹具，不应复制到正式用户流程。

## 架构和数据契约

- `schema.ts`: 类型+严格 JSON Schema 子集校验。相同 Schema 同时用于模型输出约束与服务端检查；字符串长度、数组长度在本地额外限定。
- `knowledge.ts`: 原文、原子证据、内容散列和确认状态；唯一内置人工审查夹具为精确 LaTeX 泊松分布公式。其他知识必须确认，即使只是同一公式的等价变体。数学输入可返回 `math` 元数据；顶层分式用 AST 确定性提取分子/分母因子与原文片段，其余知识保留原流程。
- `model.ts`: 离线模板和真实 Chat Completions 适配器；`prompts.ts` 提示词版本。优化提示词为后续使用的模板，目前 feedback 由规则生成。
- `validator.ts`: 候选结构、策略数量、原子覆盖、引用关系、资源白名单和角色约束；`conflicts.ts` 检测重复视觉签名与联想文本冲突，计算候选分数及排名；自由文本学科/视觉语义尚需人工审核。
- `compiler.ts`: 确定性场景编译，固定锚点、分子/分母空间布局、基础几何资产、动画类型和稳定 ID。`answer` 来自原子而非模型生成的联想说明。`recallScene` 只做回忆视图字段裁剪，不是安全级的答案访问控制。
- `store.ts`: 单进程串行事务队列、临时文件原子替换；不支持多进程并发共享文件，不保证断电级耐久。
- `service.ts`: 解析、确认、生成、发布、复习记录、原子级反馈。
- `server.ts`: 本机 HTTP API、输入限制、来源/Host 检查、同时最多两个模型任务。
- `test/engine.test.ts`: Node test runner 单元、集成、模拟远程 API 和真实本机 HTTP 回归测试。

### 前端集成

每个 `Scene.objects[]` 包含 `id`, `atomId`, `assetId`, `shape`, `color`, `position`, `scale`, `animation`, `cue`, `explanation`, `answer`。建议在 React Three Fiber 中通过 `shape` 构造 box/sphere/cylinder（尺寸归一化），设置 transform；`fractionBar` 用 boxGeometry；动作枚举 `none/pulse/rotate/bounce` 应由前端受控实现。`assetId` 表示语义道具，可进一步注册 GLB 模型，原型资源库只有基础形状描述，不包含高质量美术模型。学习态显示 cue/explanation/answer，并渲染原文 LaTeX；回忆态使用裁剪后的场景。务必用安全的文本渲染方式，不要把模型生成字符串插入 HTML。

### 安全与验证边界

这是单用户、本机开发原型，尚未接入账号鉴权、数据库/RLS、持久化作业队列、限额计费、FSRS、语义判分、PDF/OCR、图像模型或 3D 前端。不要直接暴露到公网。用户确认 ≠ 数学证明；原文证据检查只防止虚构引用，并不能证明原文正确或覆盖完整。当前公式验证为受限符号等价检查，不是通用 CAS 或学科事实核查；无已知夹具的公式必须人工核实。自由文本联想仍可能包含错误，必须人工审核；原有回忆记录仍是用户自评；新增独立公式答案检查 API 未自动写入评分或 FSRS。实验室中的端到端测试不代表记忆有效性已被科学验证。

## V0.2 数学引擎：输入语法与证明边界

`src/math.ts` 从 tokenizer → AST → BigInt 系数稀疏多项式/有理式 → 定义域守卫 → 三值判定。无需联网、无浮点容差、无 eval。

- 支持 ASCII 标识符、部分希腊字母/LaTeX 命令、整数和有限小数、四则运算、整数幂、符号幂、阶乘、`exp`/`e^`、`\frac`、分组、同一左侧标签的等式（例如 `P(X=k)=...`）。连续 ASCII 字母是一个标识符；`xy` 不自动拆成 `x*y`。使用显式 `*` 或无歧义隐式乘法。`1/2x` 拒绝猜测。`e` 与 `pi` 保留为常数；单字母紧邻括号视为乘法，`P(...)` 是概率标签的特例。不是完整 LaTeX。
- `equivalent`：在支持的表达式语义和相同定义域守卫下，交叉相乘得到严格零多项式。符号幂、非整数指数的指数函数、非具体阶乘和 π 在适用场合使用保守的形式原子，不能据此假定不同原子相互独立。
- `not_equivalent`：纯实变量有理多项式且定义域守卫一致时，非零差多项式构成不等价证明；另可使用有限整数代入给出精确反例。涉及指数的整数反例通过 e 的超越性判断整数多项式非零，不使用浮点数。夹具答案检查限制反例 `lambda>0`、`k` 非负整数。
- `inconclusive`：未知函数、资源限制、定义域可能不一致、不可证明的表达式、不同等式标签等。例：`x/x` 与 `1` 不自动判等，因为原式在 `x=0` 无定义。`x^0` 保守要求 `x!=0`。
- 这是表达式比较，不是求解方程、定理证明或通用定义域求解；等式两边的标签必须结构相同，直接比较右边。一般变量默认为实数，不从自然语言推断约束；复杂条件下的等价需人工核对。保留形式原子不代表已证明其定义域非空。数学解析成功也不证明学科知识正确。
- 运算设有 2,000 字符、192 token、40 层嵌套、±16 整数幂、256 多项式项、45,000 运算预算等限制；精确值和比较结果分别受有界资源控制。确定性反例取有限整数赋值，未找到反例不等于等价。

## V0.2 联想冲突及候选排序

视觉签名 = catalog 中的几何形状、颜色、动画。不同原子共享同一视觉签名且归一化后的联想文本相同、角色相同时，作为严格工程规则阻断候选；只共享视觉、只共享联想文本或不同空间角色则提醒人工检查。确定性数学等价可用于排除部分误报。自然语言同义词或实际 GLB 渲染外观尚无语义/视觉模型核验；位置可能提供额外区分，规则不是心理学验证。

生成时比较最近 128 次发布的最多 512 个线索，历史冲突仅预警（V0.1 锚点暂无房间/宫殿 ID，按本机全局历史处理），最多记录 64 个历史冲突；内部检查优先完成。数学消歧每候选最多 32 次比较；超出可能多报。评分以覆盖率为基础，局部和历史冲突降分，有阻断则 0 分；`rank` 给出排序而不改变原候选数组顺序。已发布历史不自动修改；旧作业在新发布前重新走验证，既有发布可幂等读取。

## 评测与验收

```sh
npm test       # 45 个 Node test runner 测试组（含原 34 项回归）
npm run eval  # 63 条手工公式案例 + 200 条确定性生成案例 + 14 条冲突案例
```

`eval/cases.ts` 与 `eval/conflict-cases.ts` 是可编辑评测集；`verification/evaluation.json` 包含固定案例逐项结果、三分类混淆矩阵及生成案例汇总。`verification/test-results.txt` 为实际测试日志。固定和生成案例也由 npm test 中的测试组复跑，因此不要将数字相加当作独立测试总量。评测集是本版本自建回归集，不是独立盲测、真实用户数据、通用数学准确率或记忆提升实验。

兼容性：旧版 JSON 状态不需强制迁移，新增字段可选；在单进程、本机的边界内验证旧记录读取、新生成及公式核对。建议先备份 `.data/state.json`，不要让两个版本同时写同一个文件。无真实模型联网测试、3D渲染测试、FSRS或公网部署验收；这些仍是后续工作。

## 下一版本设计建议

接入 React Three Fiber / KaTeX 前端；拓展函数与带条件的等价判定；加入房间级语义索引与可观察的视觉差异，建立独立标注测试集；接入独立用户存储、FSRS 和真实延迟回忆实验。不要将规则评测通过率当作真实记忆提升。

## V0.3 自适应记忆联想优化（AMO）

新增 `src/adaptive.ts`（估计器、干扰矩阵、单步优化）和 `src/adaptive-service.ts`（状态衔接、校验、场景草稿）。此版本默认采用有真实混淆记录门槛的保守策略。它不依赖 LLM 或外部 API，不是 FSRS 实现，不代表已经验证的临床或心理学模型。

### 记忆估计

半衰期网格为 0.25、0.5、1、2、4、8、16、32、64 天，使用代码中固定先验，通过成功/失败的 Bernoulli 似然更新权重。`P(recall|h,t)=2^(-t/h)`；模型预测为网格后验加权平均。公开输出 10%/90% 模型分位区间（不是经验置信区间）、中位半衰期、80% 目标回忆率推荐到期日及证据数量。显式揭晓答案后更新曝光时间，并用有界启发式增益表示复习。两种模式分别估计似然，共享曝光与复习增益；未揭晓的成功回忆暂不建模为一次独立学习事件。初始曝光暂以发布时间代理，没有实际曝光即不应解释为已学习。短于 0.05 天的重复观测不重复计入；不确定评分不更新二元似然。旧版无模式记录仅在传统 feedback 中保留，不用于新模型。

### 干扰矩阵及调整限制

矩阵是有方向的稀疏边列表（包含零权重、无对角线），线索 ID 是 `publicationId:atomId`。权重 = 0.65 × 视觉相似度 + 0.35 × 明确混淆次数/(有效场景提示测试数+4)。视觉相似度按资产、形状、颜色、动画及空间距离组合。同一原文字面意义不作为互相干扰；尚未引入通用语义等价。`exposures` 字段实际是去重后的有效提示测试次数，不等于真实曝光次数。按每行最大的三个权重计算负载（1、0.35、0.15），最大负载可大于1，权重或负载并非概率。

仅当最近至多六次有效提示测试中至少三次测试、至少两次失败、失败比例≥50%，且在不同时间有至少两次明确混淆到不同含义线索的记录（可为同一竞争线索）时，才考虑替换。候选仅来自该知识已有的合格联想方案，逐个替换一个原子的 cue 并用 V0.2 验证器和场景编译器重新校验。位置、知识、标准答案不变。评分考虑目标负载降低、其他线索负载影响和固定替换成本；原有混淆记录不会因换图自动归零。最多推荐一个候选，分数不足或缺少证据时返回 null。未自动解决知识理解错误与记忆提取错误的因果区分，也不估计真实替换成本。用户需要先核对理解。

矩阵以目标 publication 和最近其他 knowledge+anchor 组合（每组合只取一个）为范围、至多128个 cue；尚无房间级逻辑隔离。`GET` 只读取和计算，不修改已发布记录，不自动布置新的复习任务。`proposal` 含完整候选与编译后的 DSL 作为待人工确认草稿。尚无持久化接受替换/版本迁移端点（V0.2 的正式发布仍可使用原有 job）。因此不要把建议描述为已经应用的变更。实验中的替换自动接受是模拟设定，不是生产行为。

### API 扩展（兼容原有 reviews）

`POST /api/publications/:id/reviews` 仍接受 `{atoms:[...]}`；新客户端推荐：

```json
{
  "context": {"mode":"cued","revealed":true},
  "atoms":[
    {"atomId":"a1","grade":"missed","confusedWith":{"publicationId":"实际已有的发布ID","atomId":"a2"}},
    {"atomId":"a2","grade":"correct"},
    {"atomId":"a3","grade":"uncertain"}
  ]
}
```

须替换为实际发布与原子 ID，并为全部原子各提交一次；仅明确 `cued` + `missed` 可报混淆；自引用、未知 ID、缺少上下文时拒绝。`revealed` 是用户在测后实际看到答案的声明，不自动判断。`GET /api/publications/:id/adaptive` 返回记忆估计、矩阵、建议、范围和局限。请求时间使用服务端时钟。报告只读，原 JSON 存储可直接兼容。

### 对照实验和复现

```sh
npm run experiment -- --initial  # 48 初始种子 × 3 场景 × 3 策略
npm run experiment              # 48 新种子 × 3 场景 × 4 策略
```

模拟器 `eval/simulation.ts` 以不同于估计器的幂律遗忘与潜变量构造虚拟用户；各策略使用相同初始条件、相同按天/原子索引的随机冲击、每天8次训练，42天共336次，24个知识原子。最多每周1次替换，单个原子最多替换一次；替换发生在现有训练之外的决策点，真实额外学习时间未计量，模拟器加入编码损失与短期冲击代替部分成本。7和28天的无反馈探测相互独立，不修改状态。主要终点为28天脱离视觉提示正确率；其他终点为次要探索性结果。以随机种子为分析单位，配对 t 区间未做多重校正。保守门槛是在初轮发现退化后设定，用新种子验证，**没有换一个独立的记忆生成模型**。代码和结果不是人体实验、不能用于声称真人学习提高。

见 `verification/experiment-report.md`、`adaptive-experiment.json`、`adaptive-seeds.csv` 和对应初轮文件。理论启发：Settles & Meeder (2016), https://aclanthology.org/P16-1174/；Watkins & Watkins (1975), https://doi.org/10.1037/0278-7393.1.4.442 。本实现的先验、权重、阈值和复习增益是工程设计，不是上述论文给出的参数。

## V0.5 additions

V0.5 adds `src/model-selection.ts`:

- `bayesianModelAverage`: sequential Bayesian model averaging over exponential, power-law and two-phase forgetting families. It returns family posterior weights, a bounded prediction, evidence count and per-family forecasts.
- `splitInterference`: separates visual similarity from observed semantic confusion. Semantic similarity is currently supplied by the caller/annotation pipeline; it is not inferred by this module.
- `OnlineChangePointDetector`: online Beta-Bernoulli comparison of a recent window against the historical window. Default threshold is conservative (`0.95`).

Run:

```bash
npm test
npm run robustness:v05
npm start
```

The new robustness experiment uses 32 deterministic seeds in each of six synthetic environments. It compares BMA forecasts with a fixed exponential baseline and reports change-point detection rates. It is a software simulation, not a human memory study. The current change detector has low sensitivity to abrupt shifts under its conservative default threshold; it must not yet trigger automatic memory edits. Treat detections as advisory signals only.

The full V0.4 test suite remains in place. V0.5 adds 10 tests. The focused type check for `src/model-selection.ts` was run with TypeScript 5.8.3. Full-project `npm run typecheck` requires installing the declared dev dependencies (`npm install`); package installation timed out in this environment, so a full-project typecheck is not claimed.


## V0.5.1 predictive hardening

This is an incremental release over V0.5. It keeps the legacy V0.1–V0.5 APIs and storage records, and adds `src/adaptive-model-selection.ts`:

- `adaptiveBayesianModelAverage`: 21 joint family/half-life hypotheses, prequential residual calibration, legacy BMA as the stable-regime anchor, and a change-triggered shift toward the adaptive posterior. Delay-conditioned baseline rates prevent different review intervals from being treated as identical observations.
- `BayesianOnlineChangePointDetector`: Bernoulli BOCPD run-length posterior with a three-observation directional confirmation rule. Its posterior is diagnostic, not by itself an intervention command.
- `HybridChangePointDetector`: one-sided CUSUM against an expected success probability supplied by a delay-conditioned model or channel baseline. The alert requires sustained evidence; a generic single miss does not trigger a change alert.
- `estimateSeparatedForecast`: estimates forgetting from unaided observations only; separately estimates cue rescue, visual confusion and semantic confusion from paired probes and explicitly labelled outcomes. Unlabelled misses are not assigned a cause.
- `ChannelChangePointBank`: maintains independent change detectors for knowledge, visual and semantic channels.

### New local API

`POST /api/model-selection/forecast` accepts `{ "nowDay": number, "observations": [...] }` (maximum 2,000 observations). Each observation requires `id`, `day`, `mode` (`unaided` or `cued`) and `grade` (`correct`, `missed` or `uncertain`). Optional fields: `pairId`, `cause` (`none`, `knowledge_gap`, `visual_confusion`, `semantic_confusion`, `unknown`), and `cueHelped` (retained for compatibility; cue rescue is estimated from paired observations). A paired cue-rescue observation must share `pairId` with an unaided probe; rescue is counted only when the unaided probe was missed. The server validates the shape and rejects unknown causes. The endpoint is read-only and does not change a review schedule or published scene.

Example:

```json
{
  "nowDay": 15,
  "observations": [
    {"id":"u-1","pairId":"p-1","day":1,"mode":"unaided","grade":"missed","cause":"knowledge_gap"},
    {"id":"c-1","pairId":"p-1","day":1,"mode":"cued","grade":"correct","cause":"none"},
    {"id":"u-2","pairId":"p-2","day":3,"mode":"unaided","grade":"correct","cause":"none"},
    {"id":"c-2","pairId":"p-2","day":3,"mode":"cued","grade":"missed","cause":"semantic_confusion"}
  ]
}
```

The cause labels are caller-supplied evidence, not inferred by the endpoint. If they are missing or unreliable, the output should remain `sparse` / `underidentified`; do not interpret the channel estimates as measured cognitive states.

### Independent evaluation

```sh
npm test
npm run robustness:v051
npm run start
```

The independent experiment uses 16 pilot seeds per scenario to select a CUSUM threshold and 64 new holdout seeds per scenario across eight synthetic conditions (512 holdout runs). It reports prequential Brier score and log loss, paired seed-level comparisons, stable false alerts, and detection latency. The holdout seeds are disjoint from pilot seeds; all predictors receive the same generated observations and no latent generator parameters.

Important results and limitations are in `verification/experiment-report-v051.md`, `verification/v051-independent.json`, and `verification/v051-independent.csv`. In this synthetic test, the adaptive predictor improves on legacy BMA in the abrupt-forgetting scenario while remaining close to legacy BMA in stable scenarios. Cause-separated cue forecasting improves in the visual- and semantic-dominant scenarios when explicit cause labels are accurate. Change detection is still imperfect and must remain advisory-only. These are simulator results, not evidence of improved human learning.

Selected holdout results (synthetic only):

| Comparison | Result |
|---|---:|
| Abrupt-shift unaided Brier: adaptive BMA vs legacy BMA | 0.2441 vs 0.2618 |
| Paired Brier difference, 95% CI | -0.0177 [-0.0230, -0.0123] |
| Semantic-dominant cued Brier: separated vs legacy | 0.2609 vs 0.3175 |
| Visual-dominant cued Brier: separated vs legacy | 0.2647 vs 0.3174 |
| Abrupt change detection within five sessions: new vs legacy | 34.4% vs 7.8% |
| Stable knowledge-channel false alerts: new vs legacy | 10.2% vs 3.1% |

The change detector therefore trades higher sensitivity for more false alerts; it is not a uniformly superior detector. The cause-separated prediction results also assume accurate caller-supplied labels.

Verification in this environment: 74/74 Node tests passed; focused strict TypeScript checking passed for `src/adaptive-model-selection.ts`, `src/model-selection.ts` and `src/adaptive.ts`. Full-project `npm run typecheck` was attempted but could not complete because `@types/node` was not installed and `npm install` timed out. Do not treat the focused check as a full-project typecheck.


## V0.6：可演化模块化认知架构

V0.6 在 V0.5.1 的知识解析、数学 AST、联想生成、质量验证、场景编译、遗忘估计和视觉/语义分离模块之上，新增一个**受约束、可审计的认知策略编排层**。它演化的是允许列表中的模块组合和参数，不会生成或执行任意代码。

### 架构模块

| 模块 | 文件 | 职责 |
|---|---|---|
| 技能基因库 | `src/cognition/registry.ts` | 版本化 SkillGene、输入/输出能力、确定性处理器与计算成本 |
| 能力依赖图 | `src/cognition/graph.ts` | 能力 DAG、拓扑排序、循环检测、上游能力验证 |
| 策略组合 | `src/cognition/graph.ts` | Genome 节点与有向边；按能力依赖自动连接 |
| 认知运行时 | `src/cognition/runtime.ts` | DAG 执行、运行时依赖检查、预算账本、可审计执行轨迹 |
| 架构演化 | `src/cognition/evolution.ts` | 基因替换、参数变异、交叉、精英父代选择、留存历史最佳候选 |
| 等预算实验 | `eval/v06-budget.ts` | 固定启发式、静态模块化搜索、演化模块化搜索的配对留出对照 |

### 技能基因库

每个 SkillGene 都声明：`id/version/role/requires/provides/cost/description/deterministic`。当前包含：

- 证据：`evidence-normalizer`
- 诊断：`cause-diagnosis-balanced`、`cause-diagnosis-conservative`
- 遗忘预测：`memory-forecast-fast`、`memory-forecast-bma`
- 干扰分析：`interference-separated`、`interference-light`
- 决策：`decision-risk-sensitive`、`decision-conservative`
- 干预：`local-intervention`
- 安全验证：`proposal-verifier`
- 复习调度：`review-scheduler`

### 能力依赖图

```text
raw_observations
       |
normalized_evidence
   /      |       \
cause   forecast  (evidence)
  |        |          \
  +---- interference_profile
             |
     intervention_decision
             |
     intervention_proposal
             |
      validated_proposal

memory_forecast -> review_schedule
```

`validateGenome()` 会检查重复角色、未知基因、非法参数、悬空边、环路以及缺失的上游能力。基因只能从注册表中选择；参数采用白名单和范围检查。用户提交的 Genome 不会变成可执行脚本。

### 演化机制

- **初始化**：固定启发式、静态模块方案和随机合法组合共同构成初始候选。
- **变异**：替换 diagnose/forecast/analyze/decide 角色中的基因，扰动置信阈值和效用阈值，可选择启用/关闭复习调度模块。
- **交叉**：从两个父代按角色继承基因，合并策略参数。
- **选择**：基于行动匹配、预测误差、安全验证和推理成本的加权适应度；保留历史最佳候选，避免代际回退。
- **约束**：每代候选必须通过 Genome DAG 与能力依赖验证；预算不足时运行时跳过模块，不绕过依赖继续执行。

### 等计算预算实验协议

命令：

```bash
npm test
npm run cognition:demo
npm run cognition:experiment
```

实验不是“让演化算法无限搜索，再和固定算法比较”。三个调优策略都使用同一训练集、同样的候选评估次数、同样的每案例推理预算上限：

| 项目 | 设置 |
|---|---:|
| 训练案例 | 60（6种环境各10例） |
| 每个搜索策略候选数 | 40 |
| 每个训练案例预留推理预算 | 40 units |
| 每个候选架构操作预算 | 1 unit |
| 每个调优策略搜索预算 | 96,040 units |
| 留出随机种子 | 32 |
| 留出环境 | 6种 |
| 每环境留出案例 | 320 |
| 每策略留出总案例 | 1,920 |
| 每个留出案例推理预算上限 | 40 units |

预算单位是**确定性的工程记账单位**，不是 CPU 秒、GPU FLOPs、能耗或真实模型 Token。搜索阶段按完整推理预算预留每个候选的每个训练案例，即使某个策略提前结束也不返还预留额；推理阶段同时报告实际模块消耗量。`untuned-static-reference` 只作上下文参照，不参与等搜索预算比较。

### 留出实验结果

本次生成的实际结果见 `verification/v06-equal-budget-report.md`、`v06-equal-budget.json` 和 `v06-seed-results.csv`。

| 策略 | 行动匹配分 | Forecast Brier（越低越好） | 平均推理消耗 |
|---|---:|---:|---:|
| 固定启发式（调优） | 0.5220 | 0.0646 | 26 units |
| 静态模块化（调优） | 0.5220 | 0.0646 | 26 units |
| 演化模块化（调优） | **0.5460** | 0.0646 | **24 units** |
| 未调优静态参考（非等预算对照） | 0.4333 | 0.0398 | 38 units |

演化模块化相对固定启发式的种子级配对行动分差值为 `+0.0240`，32个配对种子的正态近似95%区间为 `[+0.0188, +0.0292]`；Forecast Brier 差值为 `0`。本次演化选出的结构仍偏向低成本诊断/预测/干扰模块，并关闭可选复习调度器，说明在当前模拟任务和适应度权重下，昂贵模块没有带来足够的行动收益。

### HTTP API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/cognition/genes` | 查看可用技能基因 |
| GET | `/api/cognition/capabilities` | 查看能力依赖图 |
| GET | `/api/cognition/default-genome` | 获取默认合法 Genome |
| POST | `/api/cognition/compose` | 根据技能基因 ID 组合合法 Genome |
| POST | `/api/cognition/validate-genome` | 验证自定义 Genome |
| POST | `/api/cognition/run` | 在指定预算下执行认知策略 |

`POST /api/cognition/run` 请求示例：

```json
{
  "budgetUnits": 40,
  "input": {
    "nowDay": 18,
    "targetId": "poisson-formula-001",
    "sourceRevision": "knowledge-rev-3",
    "estimatedReplacementCost": 0.18,
    "observations": [
      {
        "id": "review-001",
        "day": 12,
        "mode": "cued",
        "outcome": "missed",
        "cause": "semantic_confusion",
        "visualSimilarity": 0.12,
        "semanticSimilarity": 0.88
      }
    ]
  }
}
```

如不传 `genome`，服务端使用默认模块化 Genome。返回内容包括预算、模块执行轨迹、诊断、预测、干扰画像、建议和验证状态。所有干预仅生成单知识项草案，必须人工确认；不会自动改写原始知识、场景或发布版本。

### 验证结果与限制

- Node 原生测试：`89/89` 通过（包含原有 V0.1–V0.5.1 回归和 V0.6 新增测试）。
- V0.6 认知核心模块与实验运行器通过 `tsc --strict` 独立类型检查（Node API 使用最小类型声明辅助）。
- HTTP API 通过本地端到端测试。
- 完整仓库 `npm run typecheck` 尚未完成：当前交付环境缺少 `@types/node`，依赖安装请求超时；不要把核心模块类型检查表述为全仓库类型检查。
- 六种环境是合成学习者模拟，标签由模拟器生成；结果不构成真人记忆效果证据。
- 搜索目标与基因库规模有限，演化结果依赖训练集、成本单位和适应度权重；需要扩展真实数据和未见环境验证。
- Brier 分数在本轮主要由固定预测基因决定，演化带来的行动分提升不等于预测能力提升。


---

# V0.7 跨领域记忆技能迁移与组合泛化

V0.7 在 V0.6 原有认知架构上新增技能基因库、跨领域特征迁移、依赖DAG、版本化等位基因进化、组合泛化评测和独立留出实验。完整设计、API、实验协议与边界见 [`verification/V07-DESIGN.md`](verification/V07-DESIGN.md)。

新增命令：

```bash
npm test
npm run typecheck:v07-core
npm run transfer:demo
npm run transfer:experiment
```

核心文件：`src/cognition/transfer-types.ts`、`transfer-library.ts`、`transfer-graph.ts`、`transfer-engine.ts`、`transfer-evolution.ts`。实验脚本：`eval/v07-transfer.ts`。本版本的技能参数是工程先验，实验是合成基准，不构成真人记忆改善证据。


## V0.8 Knowledge Feature Discovery

New endpoints:
- `POST /api/transfer/extract-features` — deterministic, evidence-returning text feature extraction.
- `POST /api/transfer/discover` — budgeted strategy candidates with dependency validation.
- `POST /api/transfer/detect-negative-transfer` — flags sufficiently evidenced target-domain harm.
- `GET /api/transfer/discovery-info` — supported features/domains and extractor mode.

The extractor is rule-based, not a semantic language model. Treat results as proposals; low-confidence cases require user confirmation. See `verification/V08-DESIGN.md` and `verification/v08-report.md`.


## V0.9 AI Knowledge Understanding

`POST /api/knowledge/understand` accepts `{ "source": "..." }` and returns:
- structured concepts and relations,
- ten-dimensional knowledge feature vector,
- source-quote validation and quality warnings,
- budgeted memory-skill strategy candidates,
- model mode and source fingerprint provenance.

Default mode is `KNOWLEDGE_MODEL_MODE=offline`. To use a real OpenAI-compatible provider, set `KNOWLEDGE_MODEL_MODE=remote`, `KNOWLEDGE_MODEL_BASE_URL`, `KNOWLEDGE_MODEL_ID`, and `KNOWLEDGE_MODEL_API_KEY` in the process environment before starting the server. Never commit API keys.

The offline baseline is a deterministic rule extractor, not deep semantic understanding. The remote adapter was tested with mocked HTTP responses; no live provider call was made in this development run. Source quotes are checked locally, but quote presence does not prove semantic correctness. See `verification/V09-DESIGN.md` and `verification/v09-report.md`.

Run the fixture smoke benchmark with `npm run knowledge:fixtures`.


## V1.0 3D Memory Palace Workspace

Start the app with `npm start` and open `http://127.0.0.1:8787`.
The browser workspace uses Three.js via a jsDelivr import map and requires access to jsDelivr to load the WebGL engine.

Features:
- Orbit/zoom 3D cloister scene with clickable knowledge anchors.
- Add, move, inspect and remove concept/formula/condition/procedure/mechanism/example anchors.
- Import plain text through the V0.9 `/api/knowledge/understand` pipeline.
- Basic active-recall task: locate the anchor matching a displayed source clue.
- Local palace persistence through `GET/POST/PUT /api/palaces`.

This is a first 3D MVP. PDF/OCR, image and diagram parsing, drag-and-drop placement, long-term spaced repetition, account sync and multi-user security are not implemented. See `verification/v10-report.md` and `verification/V10-ARCHITECTURE.md`.


## V1.1 Procedural Memory Architecture

The new `POST /api/palaces/compile` endpoint runs the knowledge-understanding pipeline, compiles semantic rooms and concept placements, validates the architecture, and persists a new palace. The UI now creates room types (gallery, library, threshold, corridor, workshop, garden), renders room-specific procedural props, shows room navigation, and displays spatial metrics.

Run `npm run spatial:smoke` for a deterministic 18-concept synthetic layout comparison. This is an engineering smoke benchmark, not a human-memory efficacy study. See `verification/V11-SPACE-ENGINE.md`, `verification/v11-report.md`, and `verification/v11-layout-smoke.json`.

The V1.1 spatial compiler itself passes an isolated strict TypeScript check. Full-project `npm run typecheck` still needs the declared dev dependencies installed (`npm install`, including `@types/node`). Automated tests use Node.js type stripping and do not replace the full-project typecheck.

V1.1 release verification: 121/121 automated tests pass; the spatial compiler passes an isolated strict TypeScript check. A real browser/WebGL visual test has not yet been run.


## V1.2 Evidence-Driven Memory Loop

V1.2 connects the V1.1 3D palace to persistent, per-concept recall evidence.

### Recall modes
- `cued`: displays the source excerpt and anchor labels; this is a cue-assisted matching task.
- `unaided`: displays the concept name but hides anchor labels; the learner must recall the anchor's spatial location.

A wrong selection is stored as an observed choice (`confusedWith`), not treated as proof of a cognitive cause. Each event stores its mode, grade, reveal status, session ID, response time, and optional confidence. Events are append-only in `palaceRecalls`; old state files without this field remain readable.

### New API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/palaces/:id/recalls` | Persist one per-concept recall event |
| GET | `/api/palaces/:id/learning` | Return recall evidence, separate cued/unaided estimates, confusion diagnostics, and advisory review suggestions |

The report reuses the joint knowledge/visual half-life model and visual interference matrix. Review timing is a heuristic threshold crossing at 80% predicted recall, shown only after at least three model-accepted observations in a mode. Recommendations never modify the palace automatically.

### Evidence and limitations

- The palace creation timestamp is currently used as a proxy for first exposure; actual first-view time is not tracked.
- Events are preserved even when too close to the assumed exposure or another observation to enter the model. `eventCount`, `independentAttempts`, and `modelObservations` are separate fields for this reason.
- The dual-memory model is an engineering heuristic and has not been calibrated on a prospective human-learning dataset.
- A repeated wrong selection triggers pair inspection, not a causal claim. Geometry changes remain manual.
- Response time and optional confidence are stored as descriptive evidence; they are not yet used by the prediction model.

See `verification/V12-LEARNING-LOOP.md` and `verification/v12-report.md`.

## V1.6 独立知识测评

启动服务并保存至少一座宫殿后，从导航进入“独立知识测评”或直接打开 `http://127.0.0.1:8787/assessment.html`。可选择有实质原文证据的知识点独立作答，也可在作者模式中录入新情境与参考要点，提交后参考答案显示，再进行自评。自评与空间定位预测分离。自行编题不能视为盲测；参考原文也可能不完整。

API: `GET /api/assessment/palaces`；以下路径均位于 `/api/palaces/:id/assessment` 下：`GET/POST /bank`、`POST /attempts`、`GET /attempts/:attemptId`、`POST /attempts/:attemptId/submit`、`POST /attempts/:attemptId/grade`、`GET /report`。首次提交与全部提交分别统计；不确定和未评分不进入严格正确率分母。接口是本地自学工具而非防作弊考试权限系统。

## V1.7 动态知识实验台

使用 `npm start`，在首页粘贴 `欧姆定律：U=IR。` 并生成宫殿；打开导航中的动态知识实验台，选择已保存宫殿与锚点。也可分别导入 `与非门：Y=¬(A∧B)。` 或 `泊松分布：P(X=k)=λ^k*e^(-λ)/k!。`。输入改变后先填写可选预测，再点击运行。欧姆实验默认电流 1 A、电阻 4 Ω，结果 4 V。

编译 `GET /api/palaces/:id/labs/:conceptId` 返回 supported、输入定义、模型公式、原文、假设及 revision。计算 `POST /api/palaces/:id/labs/:conceptId/run`，请求示例 `{"revision":"<GET 返回值>","inputs":{"I":2,"R":4}}`。成功结果 8 V，错误输入返回 422，过期修订返回 409。此接口不修改记忆状态。

当前采用守规则模板而非大模型自由生成，支持详见 CHANGELOG-V1.7.md。匹配只要求名称与原文独立公式符合模板；不能验证全部自然语言条件与教材真实性。实际使用前核对物理约定与适用范围。动态实验结果不自动计入独立回忆或迁移分数。

## V1.8 通用公式仿真（Knowledge-to-Simulation Compiler）

从宫殿侧栏或已保存锚点的“打开通用公式仿真”进入 `/simulation.html`。可在宫殿添加一个公式锚点，填写如下原文，再保存宫殿：

```text
匀加速运动：v=v0+a*t；s=v0*t+0.5*a*t^2；t>=0。
```

设置 `a=2, t=3, v0=1`，应该得到 `v=7, s=12`。可选 `t` 为扫描变量、`s` 为输出，观察数值曲线。单位应由教材与学习者确认，系统不自动推断单位；默认初值 1 仅用于演示，可能不满足约束。建议明确写出单位和物理条件供人工阅读，将可执行的等式/约束用分号隔开。旧版离线教材拆句可能拆散多等式或小数，请使用手动添加/编辑锚点的原文输入验证多等式场景。既有模板实验台仍处于 `/lab.html`。

语法：独立 `name=expression`，明确乘号 `*`，`+ - * / ^`、括号、`exp`, `sqrt`, `log`（自然对数）, `abs`, `sin`, `cos`（弧度）、常数 `e`, `pi`，受限 ASCII 名称和少数希腊字母映射。连续字母名称视为单个符号（拒绝连续大写字母以减少隐式乘法歧义）。不接受导数、积分、隐式方程、阶乘、布尔语法或任意代码。支持独立 `x>=0`、`y<10` 等变量与常数的约束。任意自然语言条件不会被可靠地识别或执行。

API：`GET /api/palaces/:palaceId/simulations/:conceptId` 读取编译结果；`POST .../run` body `{"revision":"...","inputs":{"a":2,"t":3,"v0":1}}`；`POST .../sweep` body `{"revision":"...","inputs":{"a":2,"t":3,"v0":1},"variable":"t","low":0,"high":10,"points":41}`。输入最多 8 个、等式最多 6 条、约束最多 12 条、扫描 2–81 点；无效点返回空输出和原因。曲线是有限离散采样，不能保证发现采样点之间的奇点。源证据版本改变时旧 revision 被拒绝；执行不修改宫殿或学习状态。

本模块是确定性安全代数编译器，而不是通用 AI 物理仿真器。不自动生成可执行代码，不推断物理因果与单位，也不验证教材真假。参见 `CHANGELOG-V1.8.md` 和 `verification/v18-report.md`。
