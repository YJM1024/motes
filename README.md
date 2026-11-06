# Motes Lite · 微粒轻量版

Motes Lite 是面向游客共享空间的轻量网页应用工作台。新应用默认采用 React 19 + Tailwind CSS 4；已有单文件 HTML 应用继续使用原有预览、修改和导出路径。应用可在隔离预览区操作、保存版本并按需发布。

访问[正式站点](https://motes-yangjunmin.yjm1024.chatgpt.site/)体验当前 Lite。此前各次发布的验收结果和适用边界保留在[历史验收记录](docs/acceptance.md)。

完整功能仍保留在稳定的 [`full-product` 分支](https://github.com/YJM1024/motes/tree/full-product)（`51a315f`）；本地归档包位于 `D:\gpt\output\motes\motes-full-product.zip`。Lite 从 full-product 稳定基线 `809bb58` 精简，两个版本继续共享数据模型与 API。

## Lite 核心路线

1. 无需注册，进入公共游客空间；访客共享其中的作品和 SDK 业务数据。
2. 创建或选择项目，再创建或打开应用。
3. 用自然语言描述要做的网页。
4. 查看请求与保存状态：发送后等待服务端回执，收到成功响应后显示版本已保存。
5. 在大预览区操作当前应用。React 源码由纯 JavaScript 编译器转换为自包含页面，使用实际 Tailwind CSS 编译结果，不依赖 CDN。
6. 继续对话修改，查看只读源码和版本历史；React 修改采用针对 `src/App.jsx`、`src/index.css` 的精确补丁。恢复历史代码不会回滚 SDK 业务数据。
7. 发布选定版本，复制稳定公开链接并在独立页面使用。

模型生成本轮采用“简短规划、执行、检查、保存”四步状态流程；新建 React 应用时生成两个可编辑源码文件，后续修改使用严格文件补丁。明确标注的 demo 使用本地固定 React 示例，不调用 AI。旧 HTML 应用仍按原 HTML 修改流程运行。流程细节、demo 与模型模式的区别及限制见[生成工作流](docs/generation-workflow.md)。

## 保留范围

- 新 React 工程采用固定 Vite 7.3.7 scaffold，用户可编辑 `src/App.jsx` 与 `src/index.css`；源码面板显示包括这两份源码在内的 7 个工程文件。宿主仍使用现有 Vinext/Vite 8 构建，不受独立工程的 Vite 版本影响。
- React 预览、公开发布、分享和 HTML 导出都使用纯 JavaScript 编译后的 React runtime 与实际 Tailwind CSS，不加载 CDN，也不执行生成源码。已有 HTML 应用继续原样运行和编辑；其 HTML 导出内容保持原样。
- 应用显式通过 Motes SDK 写入的键值数据才会持久保存。工作台预览和公开页面由宿主提供 SDK 桥；下载的独立 HTML 没有此桥，会明确显示临时使用状态，不会声称数据已保存。
- 固定 scaffold 不支持任意 npm 依赖、容器、任意多文件源码、登录流程或 ZIP 项目包。
- 手机界面可在聊天与预览间切换。Lite 使用网络；完整离线工作台仅在[完整版](https://github.com/YJM1024/motes/tree/full-product)提供。
- 状态依据真实服务端回执和 iframe load 更新；生成阶段展示简短规划、执行、检查与保存，不展示隐藏推理或代码流。
- 服务端无模型配置时，只提供标注明确、范围有限的示例；其他需求按不支持处理。模型模式通常进行规划与执行两次上游调用，需服务端配置及额度；demo 使用本地预设计划，不调用模型。

## 完整版保留的功能

Lite 不显示赛马、独立讨论、元素编辑、源码编辑器、复杂设置、模板、备份或离线工作台入口。这些功能和对应历史数据仍保留在 full-product 分支；切换界面不会主动删除旧版本、讨论、模板、运行数据或浏览器 IndexedDB 中的草稿与待处理队列。

## 本地启动与验收

本地依赖、数据库迁移和安全边界见[本地启动说明](docs/local-setup.md)。独立 React 工程的正常 `npm install` 与 `npm run build` 验证记录见[构建记录](../../output/motes/react/scaffold-build-check.json)。发布验收、恢复/数据检查及未测范围见[验收记录](docs/acceptance.md)，其中保留历史发布事实。

## 数据与安全

公共游客空间中的项目、HTML、对话和 SDK 数据对访客可见并可修改；不要存放个人或机密内容。模型 Key 只存在服务端秘密配置，不进入浏览器、生成 HTML 或 Git。退役旧 Service Worker 时保留原 IndexedDB、草稿和队列；不会把它们当作 lite 已迁移或已恢复的数据。
