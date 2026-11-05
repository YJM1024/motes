# 验收与发布状态

## 当前 Lite 发布：v27

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

## 本轮产品与数据边界

- 生成阶段为独立简短规划、执行、检查、保存。新建应用生成完整 HTML；后续修改通过严格局部补丁；检查失败时保留原保存版本。模型模式通常为规划和执行两次上游调用，demo 计划由本地预设提供，不伪装为模型调用。细节见[生成工作流](generation-workflow.md)。
- 版本对比展示真实行级新增、删除与上下文；自动换行只影响显示，保留真实代码与行号，超预算明确提示。HTML 代码版本的还原不会回滚 SDK 业务数据。
- Lite 面向共享游客空间，内容访客可见且可修改；不要存放个人或机密数据。Lite 需要网络，不提供登录、代码流式输出或 ZIP 导出。完整离线工作台及赛马、讨论、复杂编辑等保留在完整版。
- 实体手机和真实已安装旧 Service Worker 升级仍未验收。响应式视口检查不能代替实体设备测试。
- 本记录不承诺官方评分或评分结果。

## v24 历史验收记录

以下内容只描述 v24 发布时的历史结果，不能当作当前版本的测试或生产状态。历史证据文件保留在 `D:\gpt\output\motes`；v24 说明文档已归档到 `D:\gpt\output\motes\history\release-v24`。

- v24 runtime `f7fb42db030f06e725b28075ba2664580c65e46b`，deployment `appgdep_6aecba53fef48191bcecc25484d6f484`，环境 revision 4。该轮本地 329 项检查、公开 CI run 42072397135、生产浏览器检查与零新增模型调用均为 v24 历史事实。
- v24 生产浏览器读写的是已有模型应用的 SDK 值 7→8→7，刷新后仍为 7；该历史流程没有产生新模型内容。
- v24 曾核对 12 个正常应用与 29 个历史版本 hash 未变，并归档 QA 应用且未删除记录。v27 的 13 个正常应用/32 个历史版本已逐项比对通过，当前记录见 [连续性核对](D:/gpt/output/motes/workflow/cleanup-and-continuity.json)。
- v24 验收记录和 JSON 快照见 [release manifest](release-manifest.json) 的历史字段及本地 v24 归档。旧的零模型调用结论不适用于本轮真实模型验收。
