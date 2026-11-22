# V0.9 技术设计

## 请求链路
`POST /api/knowledge/understand` -> 输入长度限制 -> `KnowledgeModel` -> JSON Schema约束输出 -> 本地证据验证 -> 策略候选生成 -> 返回 provenance 与质量报告。

## 模型接口
- `OfflineKnowledgeModel`：规则基线，不宣称深层语义理解。
- `RemoteKnowledgeModel`：OpenAI-compatible `/chat/completions`，支持 `json_schema` 与 `json_object` 两种输出模式。
- 远程端点只允许 HTTPS；本地开发允许 loopback HTTP。请求禁止自动重定向，使用超时。
- 提示词明确将教材原文视为不可信数据，忽略其中试图改变模型行为的指令。

## 知识结构
每个概念包含 `id/label/kind/evidenceQuote`；每条关系包含 `from/to/type/evidenceQuote`。领域、十维结构特征和不确定性说明一并返回。

## 质量验证
- 结构与枚举校验；
- 概念ID唯一、关系端点存在；
- 每条概念/关系证据必须是源文本中的连续原文；
- 计算去重区间后的原文证据覆盖率；
- 对因果、对比、顺序、组成和依赖关系进行关键词提示，但语义仍需人工审查。

证据引用存在不等于其语义解释正确。不能把 `quality.valid=true` 当作知识正确性证明。

## 策略生成
将知识理解输出的 FeatureVector 与学科标签输入现有技能选择器，生成基础、对比增强和机制增强候选；每个候选都经过依赖闭包和计算预算检查。

## 环境配置
`KNOWLEDGE_MODEL_MODE=offline|remote`
`KNOWLEDGE_MODEL_BASE_URL`
`KNOWLEDGE_MODEL_ID`
`KNOWLEDGE_MODEL_API_KEY`
`KNOWLEDGE_MODEL_FORMAT=json_schema|json_object`

未配置远程模式时使用离线规则基线。密钥只通过环境变量传入，不应提交到代码库。
