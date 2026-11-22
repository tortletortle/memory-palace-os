# Memory Palace OS V0.8 设计说明

## 数据流
教材文本 -> Knowledge Feature Extractor -> 可审计 FeatureVector -> Strategy Discovery -> Skill Dependency Closure -> Budgeted Candidate Ranking -> User Confirmation。

## 特征抽取
`extractKnowledgeFeatures(text)` 使用显式规则提取 spatial、symbolic、causal、sequential、hierarchical、contrastive、analogical、dynamic、retrieval、semantic 十类特征。每类特征保存触发规则证据。无领域命中或特征稀疏时输出 warning，禁止将低置信度自动发布。

## 策略发现
`discoverStrategies(text, genome, budget)` 构造基础、对比增强、机制增强候选；通过现有 `selectTransferSkills` 计算预算内技能闭包，再用依赖图校验。当前是规则候选生成，不是自动发明全新技能基因。

## 负迁移
`detectNegativeTransfer(rows, minN, harmThreshold)` 只在样本量充足且目标效用显著低于源领域时标记。实际部署应对同一技能、同难度任务、同预算、同学习者群体做配对比较，并报告置信区间；不能直接比较不匹配的源/目标均值。

## 安全与产品约束
- 不执行模型生成代码。
- AI/解析器输出只作为候选，必须经过 schema、依赖、预算与用户确认。
- 原始知识不被策略发现模块修改。
- 低置信度结果必须人工确认。
