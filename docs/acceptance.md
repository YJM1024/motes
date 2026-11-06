# 验收与发布状态

## 当前 Lite 发布：v29

| 范围 | 结果 | 记录 |
| --- | --- | --- |
| 生产发布 | **v29 已部署** | [Motes Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)；精确公开部署源 SHA `2c0257945e80bc2fa4b1735855f905e0a5be0cc1`；对应本地部署提交 `3a8a28583391e051d111ba258f6ac0bda0d3d891`、tree `2f965fe8100488a92b334fc7ace694a9cbc31b28`；saved site version `appgprj_6ae0c67ba1908191991ab6eb2cedf783~appgver_f32ddf54b7688191bef6d0a0fd00eb21`；deployment `appgdep_6aed45d2ff1881918d4d35a34a0ea90f`；environment revision 4。 |
| 公开 CI | **Ubuntu 与 Windows 均通过** | GitHub Actions run [42156106740](https://github.com/YJM1024/motes/actions/runs/42156106740)：两个 job 的 `npm ci`、365/365 tests（无 skip）、typecheck 均 success。测试对应公开 SHA `c96dd62bf553a29a64c988c34748439f58288309`，本地对应 `20f4dea`（仅测试 loader 变化）；它不是部署代码 SHA。记录：[ci-check.json](D:/gpt/output/motes/react/ci-check.json)。 |
| 本地自动化 | **365/365 通过** | 本地测试通过，证据：[tests-final.log](D:/gpt/output/motes/react/tests-final.log)。TypeScript 检查见 [ci-check.json](D:/gpt/output/motes/react/ci-check.json)；原生最终 build 与部署证据见 [deployment-check.json](D:/gpt/output/motes/react/deployment-check.json)。 |
| 生产 React 新建与补丁 | **真实请求成功；窄范围数据连续性已核实** | QA app `bf3a552e-ef35-48b5-ac9d-bf71d02b4d8c`；saved site version 见上方生产行。请求 ID：`e76b6db0-bc58-473d-b3e1-0377a7b78e30`、`87c2f2ca-f6a3-4727-88a8-25999860eb13`。`src/App.jsx` 补丁仅删除一行、增加一行；SDK count 为 1，跨补丁保留。两次请求共 4 次 provider 调用、5308 tokens，usage_complete=1；记录：[real-model-check.json](D:/gpt/output/motes/react/real-model-check.json)。这不代替完整数据连续性检查。 |
| 独立 React 工程 | **正常安装与生产构建通过** | React 19.2.6、Tailwind CSS 4.2.1、独立 Vite 7.3.7；固定 7 文件工程按其 `package.json` 执行 `npm install` 和 `npm run build` 成功。证据：[scaffold-build-check.json](D:/gpt/output/motes/react/scaffold-build-check.json) 和同目录日志。固定工程不支持任意 npm 依赖。 |
| React HTML 导出 | **本地独立浏览器交互已验** | 同一导出函数生成的自包含 HTML 为 214080 字节，并在本地独立浏览器完成交互验证。没有观察到 IAB 物理下载，不将下载动作记为已验。记录：[export-evidence.json](D:/gpt/output/motes/react/export-evidence.json)。 |
| 生产 React 公开页面 | **v2 页面运行，SDK 共享数据可读** | 公开 React v2 页面读到共享 SDK count=1。QA publication 已暂停。 |
| 版本还原与移动视口 | **已通过** | 生产 React v2→v1→v2 及手机端最后一次 v2→v1→v2 均完成，两次均读回 iframe count=1。390×844 工作台、React 源码选择和版本差异均无页面横向溢出；三个选择控件 right≤364px，源码文件选择 right=189px；生产移动端保持单 iframe。记录：[browser-check.json](D:/gpt/output/motes/react/browser-check.json)；截图：[工作台](D:/gpt/output/motes/react/production-react-mobile.png)、[源码](D:/gpt/output/motes/react/production-react-source-mobile.png)、[版本差异](D:/gpt/output/motes/react/production-react-diff-mobile.png)。 |
| 数据清理与连续性 | **通过，无删除或额外模型调用** | 生产只归档 QA app `bf3a552e-ef35-48b5-ac9d-bf71d02b4d8c` 与其 group；原 13 个应用、32 个历史版本与清理前快照逐版 ID/hash/currentVersionId 一致，QA 两版、SDK count=1/revision=1 保留。本地 `localhost:5186` 只归档已知 QA app/group，活跃应用 21→20、版本 48→46，其余 hash 不变；QA 两版与任务数据 revision 2 保留。无记录删除、无额外模型调用。证据：[cleanup-and-continuity.json](D:/gpt/output/motes/react/cleanup-and-continuity.json)。 |


## v27 历史验收记录

| 范围 | 结果 | 记录 |
| --- | --- | --- |
| 生产发布 | **v27 已部署** | [Motes Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)；runtime `81a84e76d7fa25d6635668dfd3615c9c1bd91c18`；saved app `appgprj_6ae0c67ba1908191991ab6eb2cedf783~appgver_cd6ea61e396481918f62afa072161f56`；deployment `appgdep_6aecccb8c5c08191b6565e9c75c1ef34`；environment revision 4。 |
| 公开运行代码 | **v27 runtime SHA 已知** | `5cca8498f601e7d028f9afba036034089f951f2a`。完整版仍在 [`full-product`](https://github.com/YJM1024/motes/tree/full-product)，public SHA `51a315f35554705cd34b51e7d6a7598e36f0fa3d`。 |
| 本地自动化 | **349/349 通过，0 skip** | 最终主体结果基于 `1b9111e`；随后聊天滚动小修另有 12 项专项通过。TypeScript 检查及原生最终 build 通过。证据：[tests.log](D:/gpt/output/motes/workflow/tests.log)。 |
| 公开 CI | **精确 runtime 双平台通过** | [GitHub Actions run 42085802534](https://github.com/YJM1024/motes/actions/runs/42085802534)：ubuntu-latest 与 windows-latest 的 `npm ci`、test、typecheck 均 success；公开 runtime SHA `5cca8498f601e7d028f9afba036034089f951f2a`。记录：[ci-check.json](D:/gpt/output/motes/workflow/ci-check.json)。 |
| 本地浏览器 | **目标流程通过** | 已验收步骤可见、发送清空与 422 恢复、版本差异/同版空态/自动换行、390px 无横向溢出、360×450 输入框底部位置 403.84px、patch/restore 保留用户任务，以及单 iframe。截图：[steps](D:/gpt/output/motes/workflow/local-steps-mobile.png)、[diff](D:/gpt/output/motes/workflow/local-diff-mobile.png)。 |
| 生产核心 HTTP | **8 项通过，0 模型调用** | 核心 smoke 在 v26 上执行；v27 只含聊天 UI 变化。记录：[production-core-smoke.json](D:/gpt/output/motes/workflow/production-core-smoke.json)。 |
| 生产浏览器 | **v27 counter 与移动端验收通过** | 计数器 v2→还原 v1→恢复 v2，SDK count 始终为 1，单 iframe；390px 生产预览与版本差异均无横向溢出，两个版本选择框位于 x=26..182、x=207..364；发送 demo 后欢迎区收起且完成步骤可见。[最终浏览器记录](D:/gpt/output/motes/workflow/browser-check.json)；截图：[counter](D:/gpt/output/motes/workflow/production-counter-mobile.png)、[diff](D:/gpt/output/motes/workflow/production-diff-mobile.png)、[steps](D:/gpt/output/motes/workflow/production-final-steps.png)。 |
| 数据完整性与 QA 清理 | **已通过，无删除** | 生产 QA 两个应用及其组已归档并保留全部数据；本地 QA 组与应用也已归档，任务及两版 HTML 保留。生产正常列表 13 个应用、32 个历史版本与基线逐项核对，ID、当前版本、版本号及 HTML hash 均一致。证据：[cleanup-and-continuity.json](D:/gpt/output/motes/workflow/cleanup-and-continuity.json)，`passed: true`。 |
| 真实模型浏览器 | **两轮生成与补丁成功** | 实测在 v26 runtime；最终 v27 runtime 仅有聊天 UI 变化。两轮请求共 4 次 provider 调用、4769 tokens。修改仅将按钮背景色 `#6941c6` 改为 `#2563eb`，其余 script 字节完全相同；SDK 计数为 1、revision 1，跨代码修改后保留。记录：[real-model-check.json](D:/gpt/output/motes/workflow/real-model-check.json)、[native usage](D:/gpt/output/motes/workflow/real-model-native-usage.json)。usage 的 callCount 来自本机原生 D1 实读；HTTP 回执未逐条公开 callCount。 |

## 交付归档

最终源码包路径、归档版本与 SHA-256 统一记录在[交付清单](D:/gpt/output/motes/delivery.json)，避免在仓库发布清单中重复保存归档摘要。文件路径为 `D:\gpt\output\motes\motes-source.zip`。

## 当前产品与数据边界

- 生成阶段为规划、执行、检查、保存。新 React 应用只提供 `src/App.jsx` 与 `src/index.css` 两个可修改文件；旧 HTML 应用保留原有 HTML 创建、编辑和导出路径。React 修改使用精确文件补丁，检查失败时保留原保存版本。固定 React scaffold 采用 React 19.2.6、Tailwind CSS 4.2.1 和 Vite 7.3.7；宿主仍使用 Vinext/Vite 8。详情见[生成工作流](generation-workflow.md)。
- React 编译检查使用纯 JavaScript 处理 JSX/模块并生成实际 Tailwind CSS，不依赖 CDN；编译阶段不会执行生成的 App。预览和公开页面在隔离 iframe 中运行编译结果，独立 HTML 打开时也会运行导出的应用。SDK 桥由工作台预览和公开页面宿主提供；独立 HTML 会显示 SDK 不可用和临时使用状态。旧 HTML 导出保持原内容。
- 版本对比显示真实行级新增、删除与上下文；React 版本可选择源码文件。自动换行只影响显示，超预算明确提示。代码版本还原不会回滚 SDK 业务数据。
- Lite 面向共享游客空间，内容访客可见且可修改；不要存放个人或机密数据。Lite 需要网络，不提供登录、代码流式输出或 ZIP 导出。完整离线工作台及赛马、讨论、复杂编辑等保留在完整版。
- 实体手机和真实已安装旧 Service Worker 升级仍未验收。响应式视口检查不能代替实体设备测试。
- 本记录不承诺官方评分或评分结果。

## v24 历史验收记录

以下内容只描述 v24 发布时的历史结果，不能当作当前版本的测试或生产状态。历史证据文件保留在 `D:\gpt\output\motes`；v24 说明文档已归档到 `D:\gpt\output\motes\history\release-v24`。

- v24 runtime `f7fb42db030f06e725b28075ba2664580c65e46b`，deployment `appgdep_6aecba53fef48191bcecc25484d6f484`，环境 revision 4。该轮本地 329 项检查、公开 CI run 42072397135、生产浏览器检查与零新增模型调用均为 v24 历史事实。
- v24 生产浏览器读写的是已有模型应用的 SDK 值 7→8→7，刷新后仍为 7；该历史流程没有产生新模型内容。
- v24 曾核对 12 个正常应用与 29 个历史版本 hash 未变，并归档 QA 应用且未删除记录。v27 的 13 个正常应用/32 个历史版本逐项比对通过，是 v27 历史结论，不代表 v29 的当前数据清理状态。
- v24 验收记录和 JSON 快照见 [release manifest](release-manifest.json) 的历史字段及本地 v24 归档。旧的零模型调用结论不适用于本轮真实模型验收。
