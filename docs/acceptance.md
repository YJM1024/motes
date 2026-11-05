# 验收与发布状态

## 当前状态

| 范围 | 状态 | 记录 |
| --- | --- | --- |
| 完整版生产 | **v22 已上线** | [正式站点](https://motes-yangjunmin.yjm1024.chatgpt.site/)；runtime source `7491413ef0b138ebf73e87ed2842df617e336be2`，deployment `appgdep_6aeca50dcbfc8191b6f45e9983cf144b`，env revision 4。完整源码位于 [`full-product` branch](https://github.com/YJM1024/motes/tree/full-product)，本地归档 `D:\gpt\output\motes\motes-full-product.zip`。 |
| Lite 分支 | **本地验收完成，未部署** | `exam-lite` 从完整版稳定基线 `809bb58` 分出。当前浏览器验收代码检查点 `d00dd77458564e6f9b5da30be8aebd56d05435cf`；当前线上仍是完整版 v22。 |
| Lite 自动检查 | **329/329（基线 `2153061`）；TypeScript 通过** | 完整测试记录：[lite-final-tests.log](D:/gpt/output/motes/lite-final-tests.log)。之后的 Lite UI 小改没有重跑整套测试，按主线记录执行了定向测试及 TypeScript 检查。文件级并发限制为 2，测试内并发断言保留。 |
| Lite 本地浏览器 | **通过** | [实际流程证据](D:/gpt/output/motes/lite-browser-check.json)：生成与修改、保存刷新、历史预览与还原、拒绝需求后继续编辑、公开页读取/写入、发布暂停及真实 HTML 导出校验均通过；模型调用为 0。 |
| Lite 发布与未测项 | **尚未部署** | 360/390/768/1440 四个浏览器视口均无横向溢出且只有一个 iframe；360×450 短屏输入可用。实体手机未测，旧 Service Worker 在线浏览器升级未模拟，Lite 尚未部署。 |

## Lite 产品边界

- 目标流程：游客进入共享空间 → 创建项目/应用 → 用自然语言生成与修改 → 预览 → 查看版本/恢复 → 发布并复制链接。
- 无注册；访客共享空间内容并可互相查看、修改。不得存入私人或机密数据。
- 复用现有 HTML 与 API，不引入 AppSpec 或容器。业务运行数据只有应用显式调用 SDK 写入才会持久化；恢复代码版本只改变代码当前指针，不回滚 SDK 业务数据。
- 请求状态依据真实服务端回执：已发出且无响应时只显示等待，收到保存结果后才标记版本已保存；不显示虚构的多 Agent 推理阶段或假装服务端已接收。
- 无服务端模型配置时，仅提供明确标注、有限范围的示例；其他需求按不支持处理。本轮已使用完两次预算模型调用，不再新增调用；Lite 验收使用 demo 与已存在的完整版证据。
- Lite 需要网络；完整离线工作台仅在完整版。隐藏赛马、讨论、元素/源码编辑、复杂设置、模板、备份和离线入口，但不删除旧数据库资料。
- 退役旧 Service Worker 时保留 IndexedDB、草稿和待处理队列。现有代码回归检查确认不会清理这些存储，但真实浏览器升级/离线恢复仍待验收；不得宣称完成数据迁移。

## 验收证据

HTML 导出与保存的 v3 字节完全一致（SHA-256 相同），没有额外模型调用或数据变更；见[导出核对记录](D:/gpt/output/motes/lite-export-verification.json)。旧 Service Worker 的退役代码有回归测试，但实际已安装 Worker 升级仍未在浏览器中测；本地视口不代表实体手机。当前 Lite 未上线，正式站点仍运行 full-product v22。

完整版的生产与历史验收证据见[完整版 release manifest](docs/release-manifest.json)及[完整版分支文档](https://github.com/YJM1024/motes/tree/full-product)。这些证据不计入 Lite 的本地浏览器检查。

Lite 发布前须记录：实际分支 SHA、`npm ci`/测试/typecheck/build 结果、恢复与 SDK 数据检查、旧 Service Worker 浏览器升级结果、桌面/手机浏览器流程、Sites 部署版本和最终网址。实体手机、无痕模式等未测项目要单独列出。

当前机器可读快照见[release manifest](docs/release-manifest.json)；本轮进度见本地 `D:\gpt\output\motes\本轮优化进展.md`。
