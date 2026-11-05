# 验收说明

## 当前验收状态

以下记录把生产发布、CI、HTTP、浏览器和模型 API 分开。通过一类检查不代表其他类别也已通过。

| 证据维度 | 状态 | 结果与边界 |
| --- | --- | --- |
| 生产版本与入口 | **v22 已上线** | runtime source `7491413ef0b138ebf73e87ed2842df617e336be2`；native deployment `appgdep_6aeca50dcbfc8191b6f45e9983cf144b`，env revision 4。当前网址为[https://motes-yangjunmin.yjm1024.chatgpt.site/](https://motes-yangjunmin.yjm1024.chatgpt.site/)；平台未改变 project/slug。 |
| CI 与可移植性 | **已通过** | [GitHub Actions run 42059022920](https://github.com/YJM1024/motes/actions/runs/42059022920)：Ubuntu、Windows 均全新 `npm ci`，375/375 测试、TypeScript 检查通过。较早 run `42057778521` 暴露候选并发测试的调度敏感等待；在 `7bb1c83` 修正后，`2debd2e`（本地 `7bb1c83`）的后续 run 通过，原失败记录仍保留。之后只有模型验收脚本目标域名与文档更新，不据此声称每个后续 SHA 都单独跑过 CI。此前独立清洁副本/异地启动的 372 项证据见 `D:\gpt\output\motes\stable-portable-check.json`。 |
| 本地 HTTP 核心流程 | **8/8 通过** | 本地共享模式、0 次模型调用；覆盖示例创建/幂等、修改、跨访客读回、拒绝路径、历史还原、三版导出、分享/发布及 SDK revision 冲突。QA 应用归档、发布暂停、分享撤销。记录：`D:\gpt\output\motes\stable-core-http.json`。 |
| 浏览器与线上数据连续性 | **v22 生产 UI 通过** | 生产中读取已存在的模型 v2，计数 7；加一保存 8、减一保存 7；预览 v1 后还原，无整页刷新即读回 7；再还原 v2 后读回 7，两个版本仍保留。新增模型调用为 0。证据：`D:\gpt\output\motes\stable-v22-browser-check.json`；截图 `D:\gpt\output\motes\stable-v22-live.png`。新旧正式域名读回同一应用、两个版本与 SDK 数据通过，0 写入、0 模型调用：`D:\gpt\output\motes\stable-v22-domain-readback.json`。旧域名仅保留作迁移来源，当前入口以新域名为准。 |
| 真实模型 | **历史 API 流程通过；v22 未新增模型调用** | 旧 v21 生产 API 验收使用 `gpt-6-luna` 两次调用，共 3746 tokens，v1/v2、读回、还原和发布检查通过，证据见 `D:\gpt\output\motes\stable-model-http.json`。这不是 v22 新模型生成验收；v22 浏览器使用既存 v2，未证明完整模型 UI/生成链路在 v22 再次调用。 |

## 已知边界

- v22 已部署历史版本还原后的预览重连修复；本地和生产浏览器检查均确认恢复流程。前序 v21 状态与旧域名作为[历史验收记录](history/acceptance-v21.md)保留。
- 360、390、768、1440 像素宽度下的浏览器视口检查均无横向溢出，截图和原始记录见 `D:\gpt\output\motes\stable-browser-check.json`。这不是实体手机检查；蜂窝网络和无痕模式仍未核实。
- CI run 42059022920 在修复测试调度等待的提交上成功；run 后的模型验收主机名和文档提交没有单独 CI run。CI 结果链接见上表。
- 共享模式下访客共同查看和修改公共内容。普通预览 DOM 状态不会自动保存；SDK 只持久化应用显式写入的键值。
- 本地数据库 `.wrangler/state` 与生产 D1 独立。HTTP Smoke、生产只读回访和真实模型 API 调用属于不同范围。

## 本地复核入口

```sh
npm ci
npm test
npm run typecheck
node tests/smoke.mjs http://127.0.0.1:5173 outputs/core-http.json
```

本地迁移、共享空间副作用及 private-only 历史 Smoke 的运行条件见[本地启动文档](local-setup.md)。完整发布字段见[机器可读 release manifest](release-manifest.json)。
