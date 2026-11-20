# V1.1 空间生成引擎设计

## Pipeline
`source text -> knowledge-understanding -> evidence validator -> knowledge concepts/relations -> group by concept kind -> room graph -> room arrangement -> in-room force layout -> architecture validation -> Three.js render -> palace persistence`

## Knowledge-to-Space Compiler
- 概念类型映射到空间功能：concept/gallery, formula/library, condition/threshold, procedure/corridor, mechanism/workshop, example/garden。
- 每个房间容量上限为7个知识锚点；超出后拆分。
- 按关系端点构建房间亲和权重。
- 对房间环形顺序执行确定性 pair-swap hill-climbing，最小化加权环形距离。
- 房间位置再经过带碰撞排斥、关系吸引和径向约束的迭代调整。

## Room-level objective
`J = mean_related_concept_distance + 4*object_overlap_violations + 20*room_overlap_violations + 0.15*isolated_concepts + 0.012*route_length`

该目标是工程启发式，不是经心理学实验拟合的记忆效用函数。系数需要在真实任务数据上校准。

## In-room layout
知识物体在房间局部坐标中初始化为确定性环形位置。相关节点通过弹簧吸引，所有节点通过反平方排斥保持视觉分离，最终限制在房间边界内。

## Architecture validation
检查：
- 中央中庭存在；
- 房间ID唯一、尺寸和坐标有限；
- 每个概念恰好有一个空间放置；
- 不允许未知概念或重复概念；
- 房间成员列表与放置表一致；
- 所有门和路线引用有效房间；
- 路线从中庭开始；
- 优化指标为有限数值。

## API
`POST /api/palaces/compile`
Request: `{ "source": "...", "budgetUnits": 18 }`
Response: persisted `palace`, validated `understanding`, `quality`, `provenance`, and `architectureValidation`.

## Reproducibility
`npm run spatial:smoke` runs a fixed synthetic 18-concept fixture and compares category-order baseline with relation-aware ordering. It is a deterministic algorithm smoke test, not an external benchmark.


## 40-concept upper-bound smoke case
A deterministic synthetic stress fixture with 40 concepts, three knowledge kinds and 39 dependency edges produced 7 rooms including the atrium, 15 room links, zero isolated concepts, zero object overlaps and zero room AABB overlaps. This is a geometric capacity smoke test, not evidence of learning efficacy.
