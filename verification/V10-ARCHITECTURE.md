# V1.0 架构说明

## 运行结构
- Node.js 22.16 HTTP server：保留现有 API，并新增静态资源托管。
- Frontend：原生 ES module + Three.js + OrbitControls。
- Persistence：复用 `Store` 的原子 JSON 文件事务。
- Knowledge ingestion：浏览器文本输入 -> `/api/knowledge/understand` -> 证据验证 -> 记忆锚点映射。
- Recall：前端从当前场景选取一个锚点，展示原文线索，用户点击空间中的目标物体。

## 3D 场景
场景包含圆形基座、网格地面、环形标记、12根柱廊、顶部环形结构、方向光/环境光和雾效。知识物体被映射到不同的几何原型：
- concept: dodecahedron
- formula: torus knot
- condition: octahedron
- procedure: octagonal cylinder
- mechanism: torus
- example: icosahedron

物体由 Three.js Group 封装，包含基座、知识形体、光环和 CanvasTexture 标签。Raycaster负责拾取。

## API
- `GET /api/palaces` 列表
- `GET /api/palaces/:id` 读取
- `POST /api/palaces` 创建
- `PUT /api/palaces/:id` 更新
- `POST /api/knowledge/understand` 复用 V0.9 知识解析管线

服务只监听 loopback，并保留原有 Host/Origin 限制。前端与API同源，无需开放CORS。

## 启动
`npm start`，浏览器访问 `http://127.0.0.1:8787`。浏览器需要支持 WebGL2/WebGL，并允许访问 jsDelivr CDN 以加载 Three.js。

## 后续
- 将 Three.js 固定版本安装到本地依赖并引入构建流程，移除运行时CDN依赖。
- 使用知识图谱布局和房间语义生成空间拓扑。
- 为回忆事件增加后端持久化、间隔重复和遗忘模型联动。
- 增加拖拽放置、路线编辑和场景模板。
- 增加PDF解析、OCR、公式/图表结构提取。
