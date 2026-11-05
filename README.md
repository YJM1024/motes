# Motes Lite · 微粒轻量版

Motes Lite 是面向游客共享空间的轻量网页应用工作台：通过对话生成单文件 HTML，在隔离预览区操作、保存版本并按需发布。

**状态：Motes Lite v24 已上线。** [正式站点](https://motes-yangjunmin.yjm1024.chatgpt.site/)当前运行 runtime source `f7fb42db030f06e725b28075ba2664580c65e46b`。本地完整浏览器流程、CI 双平台 329 项测试、TypeScript 和原生 build 均通过。实体手机与已安装旧 Service Worker 升级尚未测试；完整证据和边界见[验收记录](docs/acceptance.md)。

完整功能仍保留在稳定的 [`full-product` 分支](https://github.com/YJM1024/motes/tree/full-product)（`51a315f`）；本地归档包位于 `D:\gpt\output\motes\motes-full-product.zip`。Lite 从 full-product 稳定基线 `809bb58` 精简，两个版本继续共享数据模型与 API。

## Lite 核心路线

1. 无需注册，进入公共游客空间；访客共享其中的作品和数据。
2. 创建或选择项目，再创建或打开应用。
3. 用自然语言描述要做的网页。
4. 查看请求与保存状态：发送后等待服务端回执，收到成功响应后显示版本已保存。
5. 在大预览区操作当前 HTML。
6. 继续对话修改，查看只读源码和版本历史；恢复历史代码不会回滚 SDK 业务数据。
7. 发布选定版本，复制稳定公开链接并在独立页面使用。

## 保留范围

- 复用现有 D1/API 和 iframe 预览，生成物仍是完整的单文件 HTML；不引入 AppSpec 或容器。
- 应用显式通过 Motes SDK 写入的键值数据才会持久保存。普通表单输入、DOM 状态和计时器不会自动保存。
- 手机界面可在聊天与预览间切换。Lite 使用网络；完整离线工作台仅在[完整版](https://github.com/YJM1024/motes/tree/full-product)提供。
- 状态依据真实服务端回执和 iframe load 更新，不展示虚构的多 Agent 推理阶段，也不把请求发送说成服务端已接收。
- 服务端无模型配置时，只提供标注明确、范围有限的三个示例；其他需求按不支持处理。真实模型调用需要服务端配置及额度，Lite 本轮验收不再增加模型调用。

## 完整版保留的功能

Lite 不显示赛马、独立讨论、元素编辑、源码编辑器、复杂设置、模板、备份或离线工作台入口。这些功能和对应历史数据仍保留在 full-product 分支；切换界面不会主动删除旧版本、讨论、模板、运行数据或浏览器 IndexedDB 中的草稿与待处理队列。

## 本地启动与验收

本地依赖、数据库迁移和安全边界见[本地启动说明](docs/local-setup.md)。当前产品状态、恢复/数据检查及未测范围见[验收说明](docs/acceptance.md)。自动测试与类型检查已通过；浏览器与发布结论以验收记录为准。

## 数据与安全

公共游客空间中的项目、HTML、对话和 SDK 数据对访客可见并可修改；不要存放个人或机密内容。模型 Key 只存在服务端秘密配置，不进入浏览器、生成 HTML 或 Git。退役旧 Service Worker 时保留原 IndexedDB、草稿和队列；不会把它们当作 lite 已迁移或已恢复的数据。
