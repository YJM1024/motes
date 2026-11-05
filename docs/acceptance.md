# 验收与发布状态

## 当前状态

| 范围 | 状态 | 记录 |
| --- | --- | --- |
| Lite 生产 | **v24 已上线** | 正式网址：[Motes Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)。runtime source `f7fb42db030f06e725b28075ba2664580c65e46b`，deployment `appgdep_6aecba53fef48191bcecc25484d6f484`，environment revision 4；saved site ID `appgprj_6ae0c67ba1908191991ab6eb2cedf783~appgver_4b5bfd5fce3c81918262d84ecee32dad`。 |
| 完整版分支 | **稳定保留** | Lite 从 `809bb58` 基线分出；完整版位于公开 [`full-product` branch](https://github.com/YJM1024/motes/tree/full-product)，当前 SHA `51a315f35554705cd34b51e7d6a7598e36f0fa3d`，原版 375 项 CI、赛马/讨论/复杂编辑/离线入口均留在那里。 |
| 本地构建与检查 | **329/329 通过；TypeScript 与 build 通过** | 与当前 runtime 同 SHA 的原生完整检查结果记录于本地 `D:\gpt\output\motes\lite-final-package.log`。 |
| 公开 CI | **Ubuntu 与 Windows 全绿** | [run 42072397135](https://github.com/YJM1024/motes/actions/runs/42072397135)：公开 SHA `71a68fda89b9a4711aa40ff5ddf42047680803f9`，其 tree 与 runtime commit `f7fb42d` 相同；两平台 Node 24 均完成 `npm ci`、329/329 测试、TypeScript 检查。逐 job 证据见本地 [lite-final-ci-check.json](D:/gpt/output/motes/lite-final-ci-check.json)。 |
| 本地浏览器 | **流程与响应式检查通过** | [实际流程证据](D:/gpt/output/motes/lite-browser-check.json)：生成/修改、保存刷新、历史预览/还原、422 后直接编辑、发布和公开页读写、单 iframe、发布暂停均通过；360/390/768/1440 视口无横溢，360×450 短屏输入可用。导出的 v3 HTML 与保存内容字节和 SHA 完全一致。模型调用为 0。 |
| 生产浏览器 | **v24 实际核验通过** | [生产 UI 证据](D:/gpt/output/motes/lite-production-browser-check.json)：原有模型应用值 7 加一并保存为 8，再减一保存为 7；v24 刷新仍为同一应用值 7。项目角标 10 与可见应用数 10 一致，单 iframe、390 宽视口无横溢，0 额外模型调用。加减操作在 v23 页面执行；v24 只更改角标显示逻辑。 |
| 生产数据保留 | **既有内容未变** | v23/v24 对比核对 12 个正常应用与 29 个历史版本 hash 保持一致；8 项 production core/demo 检查通过且 0 模型调用。临时 QA 应用只归档、不删除，发布保持暂停。见本地 `lite-production-after.json`、`lite-production-core-smoke.json` 与 `lite-production-final-cleanup.json`。 |
| 未测边界 | **已明确** | 旧 Service Worker 已有精确注销回归测试，但实际已安装 worker 升级未在浏览器模拟；实体手机未测。生产读写核验复用已有模型应用，没有产生 Lite 本轮模型调用。 |

## Lite 产品边界

- 目标流程：游客进入共享空间 → 创建项目/应用 → 用自然语言生成与修改 → 预览 → 查看版本/恢复 → 发布并复制链接。
- 无注册；访客共享空间内容并可互相查看、修改。不得存入私人或机密数据。
- 复用现有 HTML 与 API，不引入 AppSpec 或容器。业务运行数据只有应用显式调用 SDK 写入才会持久化；恢复代码版本只改变代码当前指针，不回滚 SDK 业务数据。
- 请求状态依据真实服务端回执：已发出且无响应时只显示等待，收到保存结果后才标记版本已保存；不显示虚构的多 Agent 推理阶段或假装服务端已接收。
- 无服务端模型配置时，仅提供明确标注、有限范围的示例；其他需求按不支持处理。本轮 Lite 流程与生产核查均无新增模型调用；已有模型应用只用于验证保存数据读写与刷新持久性。
- Lite 需要网络；完整离线工作台仅在完整版。隐藏赛马、讨论、元素/源码编辑、复杂设置、模板、备份和离线入口，但不删除旧数据库资料。
- 退役旧 Service Worker 时保留 IndexedDB、草稿和待处理队列。现有代码回归检查确认不会清理这些存储，但真实浏览器升级/离线恢复仍待验收；不得宣称完成数据迁移。

## 验收证据

HTML 导出与保存的 v3 字节完全一致（SHA-256 相同），没有额外模型调用或数据变更；见[导出核对记录](D:/gpt/output/motes/lite-export-verification.json)。生产浏览器也确认：已有 AI 应用 SDK 值 7 加一并保存为 8、再减一并保存为 7，v24 刷新后同一应用仍为 7；此过程未调用模型。详细结果见[生产浏览器核对](D:/gpt/output/motes/lite-production-browser-check.json)。

完整版的生产与历史验收证据见[完整版 release manifest](docs/release-manifest.json)及[完整版分支文档](https://github.com/YJM1024/motes/tree/full-product)。这些证据不计入 Lite 的本地浏览器检查。

后续若复测，保留区分真实已安装 Service Worker 升级和退役逻辑单测；实体手机与无痕模式等没有测过，不由响应式视口结果代替。

当前机器可读快照见[release manifest](docs/release-manifest.json)；本轮进度见本地 `D:\gpt\output\motes\本轮优化进展.md`。
