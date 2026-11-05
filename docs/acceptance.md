# 验收说明

## 当前验收状态

本文把生产版本、自动检查、本地 HTTP、浏览器和真实模型证据分开记录。自动化、HTTP 与模型接口结果不能替代浏览器交互验收。

| 证据维度 | 状态 | 结果与边界 |
| --- | --- | --- |
| 生产版本与本地补丁 | **生产 v21；修复待部署** | 生产 runtime source 为 `d556cdffa878733d4542398958318eeb82a04990`，deployment `appgdep_6ae779052a3881919c273457e1cc28fc`，env revision 4。本地源码修复 `fde6e58` 解决历史版本还原后的预览重连问题；尚未部署。`a3cbe1a` 是测试可移植性变更，不是产品发布。 |
| 可移植源码检查 | **通过** | 新鲜源码副本执行 `npm ci --prefer-offline --no-audit --no-fund` 后，372 项测试通过、TypeScript 检查通过，由另一工作目录启动。记录：`D:\gpt\output\motes\stable-portable-check.json`。修复后的当前源码另有 375 项测试及 TypeScript 通过；CI 尚未运行。 |
| 本地 HTTP 核心流程 | **8/8 通过** | 本地 `http://127.0.0.1:5193`、共享模式、0 次模型调用。覆盖 QA 示例创建与幂等、修改和版本保留、访客读回、失败输入/来源拒绝、版本还原、三个版本导出、固定分享/稳定发布和 SDK 并发 revision。QA 应用已归档、发布已暂停、分享已撤销。记录：`D:\gpt\output\motes\stable-core-http.json`。 |
| 浏览器验收 | **本地 UI 流程通过** | `D:\gpt\output\motes\stable-browser-check.json` 记录 demo 创建、任务保存/刷新、修改为 v2 并保留数据、预览历史后还原且无需整页刷新重连、422 后旧成果保留、v2 发布、独立页读写、确认刷新后读回及暂停发布。360/390/768/1440 视口均无横向溢出。截图：`stable-full-desktop.png`、`stable-full-mobile.png`（均为本地视口，不是真实手机）。 |
| 真实模型接口 | **旧 v21 API 流程通过；模型 UI 未验收** | `D:\gpt\output\motes\stable-model-http.json` 对当时在线的 v21 发起 2 次 `gpt-6-luna` 调用，均成功，共 3746 tokens；保存 v1/v2、跨访客读取、还原及发布检查通过。该脚本明确未做浏览器交互，不能代表新补丁已上线或完整模型 UI 已验收。 |

## 验收边界

- **生产与源码**：生产继续运行上表所列 v21 runtime。`fde6e58` 的修复通过本地浏览器、375 项测试和类型检查，但尚未部署；不把本地通过写成线上通过。
- **本地与线上**：本地 D1 数据位于 `.wrangler/state`，与生产数据库独立。HTTP 本地结果不代表线上读写或部署成功。
- **自动与浏览器**：`npm test` 覆盖自动化测试文件；`npm run typecheck` 检查 TypeScript。两者不验证真实设备、蜂窝网络或无痕行为；本次视口检查不是实体手机测试。
- **示例与模型**：本地示例 API 不调用模型。旧 v21 的两次生产模型 API 请求及回执已记录，但没有浏览器模型交互证据，也不覆盖新补丁。
- **共享数据**：共享模式访客共同查看和修改公共内容。普通预览 DOM 状态不自动保存；只有应用显式通过 SDK 写入的键值会持久保存。

## 本地复核入口

从仓库根目录运行：

```sh
npm ci
npm test
npm run typecheck
node tests/smoke.mjs http://127.0.0.1:5173 outputs/core-http.json
```

迁移说明、共享空间副作用和 private-only 历史 Smoke 限制见[本地启动文档](local-setup.md)。模块能力与已知限制见[架构说明](architecture.md)和[非功能验收](nonfunctional-verification.md)。

## 历史记录

2026-11-05 之前的发布记录、版本表、演示步骤和既有验收详情已归档到[历史验收记录](history/acceptance-v21.md)。归档用于保留当时的证据和引用；当前状态以本页五维矩阵为准。
