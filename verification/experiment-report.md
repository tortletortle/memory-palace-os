# V0.3 模拟对照实验报告

## 结果性质
初轮 432 次模拟；新种子 576 次模拟；共 1008 个策略×种子×情景运行（并非1008位真人）。每个运行 336 次训练，固定训练日程。新种子主要终点为28天无提示回忆。

## 新种子：各策略表现

| 情景 | 策略 | 7天提示 | 7天无提示 | 28天提示 | 28天无提示 | 平均替换 | Brier（训练预测） |
|---|---|---:|---:|---:|---:|---:|---:|
| visual_interference | fixed | 43.14% | 80.99% | 36.02% | 62.07% | 0.00 | 0.2783 |
| visual_interference | miss_only | 52.78% | 83.16% | 42.10% | 65.02% | 5.00 | 0.2720 |
| visual_interference | matrix_adaptive | 53.73% | 83.07% | 43.84% | 64.76% | 5.00 | 0.2685 |
| visual_interference | guarded_matrix | 54.08% | 83.33% | 44.01% | 64.84% | 4.98 | 0.2687 |
| weak_interference | fixed | 90.10% | 92.10% | 82.38% | 81.34% | 0.00 | 0.1451 |
| weak_interference | miss_only | 90.10% | 91.58% | 81.94% | 80.99% | 4.56 | 0.1459 |
| weak_interference | matrix_adaptive | 90.19% | 91.58% | 81.68% | 80.99% | 4.48 | 0.1459 |
| weak_interference | guarded_matrix | 90.10% | 92.10% | 82.47% | 81.16% | 0.50 | 0.1453 |
| replacement_cost | fixed | 80.21% | 90.02% | 67.97% | 76.39% | 0.00 | 0.1946 |
| replacement_cost | miss_only | 80.82% | 89.06% | 67.53% | 74.48% | 5.00 | 0.1942 |
| replacement_cost | matrix_adaptive | 81.51% | 88.54% | 68.14% | 74.48% | 5.00 | 0.1937 |
| replacement_cost | guarded_matrix | 80.47% | 89.76% | 68.06% | 76.13% | 0.75 | 0.1945 |

## 28天无提示：配对差值及95%区间（百分点）

| 情景 | 比较 | 差值 | 区间 |
|---|---|---:|---:|
| visual_interference | miss_only − fixed | +2.95 | [+2.02, +3.88] |
| visual_interference | matrix_adaptive − fixed | +2.69 | [+1.81, +3.57] |
| visual_interference | matrix_adaptive − miss_only | -0.26 | [-1.07, +0.54] |
| visual_interference | guarded_matrix − fixed | +2.78 | [+1.83, +3.72] |
| visual_interference | guarded_matrix − miss_only | -0.17 | [-1.00, +0.65] |
| visual_interference | guarded_matrix − matrix_adaptive | +0.09 | [-0.31, +0.48] |
| weak_interference | miss_only − fixed | -0.35 | [-0.84, +0.14] |
| weak_interference | matrix_adaptive − fixed | -0.35 | [-0.84, +0.14] |
| weak_interference | matrix_adaptive − miss_only | +0.00 | [-0.25, +0.25] |
| weak_interference | guarded_matrix − fixed | -0.17 | [-0.52, +0.18] |
| weak_interference | guarded_matrix − miss_only | +0.17 | [-0.32, +0.67] |
| weak_interference | guarded_matrix − matrix_adaptive | +0.17 | [-0.32, +0.67] |
| replacement_cost | miss_only − fixed | -1.91 | [-2.66, -1.16] |
| replacement_cost | matrix_adaptive − fixed | -1.91 | [-2.84, -0.98] |
| replacement_cost | matrix_adaptive − miss_only | +0.00 | [-0.75, +0.75] |
| replacement_cost | guarded_matrix − fixed | -0.26 | [-0.56, +0.04] |
| replacement_cost | guarded_matrix − miss_only | +1.65 | [+0.83, +2.47] |
| replacement_cost | guarded_matrix − matrix_adaptive | +1.65 | [+0.72, +2.57] |

## 初轮发现与后续修正
初始未加门槛的矩阵策略在强视觉干扰下改善回忆，但在弱干扰和高替换成本下过度修改。增加两次不同时间的明确混淆记录作为门槛，对新种子完整复跑。
新种子结果显示，高干扰场景相对固定策略有改善；保守矩阵相对单纯按失败次数替换的28天无提示回忆没有明确优势。弱干扰与高成本场景相对固定策略仍有小幅负点估计，区间跨零；不能宣称无损或等效。高成本场景相对无门槛矩阵改善，且替换次数明显下降。

## 限制
1. 虚拟用户对干扰的敏感性、复习增益和替换损失都是人为设定，种子持出不等于真实泛化。
2. 估计器与模拟器采用不同遗忘函数，但共享人工构造的视觉特征；没有独立真人或独立机制评测。
3. 复习次数相同，未测实际墙钟时间、额外学习时间或认知负担。Brier是训练期间预估误差，不代表真实预测校准。
4. FSRS、动态复习排期以及人工批准后版本发布尚未实现；该设计隔离联想优化变量。
5. 两次明确混淆记录门槛基于初轮结果设定，需要真实学习数据重新校准。区间未多重校正，次要结果仅探索性解释。
6. 未额外接入真实LLM和3D前端。
