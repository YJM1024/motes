# Motes Lite · 微粒

面向游客共享空间的网页应用工作台，用自然语言创建、预览、修改、恢复并发布小型应用。

[线上体验](https://motes-yangjunmin.yjm1024.chatgpt.site/) · [GitHub 源码](https://github.com/YJM1024/motes) · [项目说明](docs/project-overview.md)

[![CI](https://github.com/YJM1024/motes/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/YJM1024/motes/actions/workflows/checks.yml?query=branch%3Amain)

新应用使用固定的 React 19 + Tailwind CSS 4 工程；已存在的单文件 HTML 应用继续使用原有流程。Lite 采用共享游客空间：访客能查看并修改项目、应用、对话及应用通过 Motes SDK 显式保存的业务数据，请勿存放个人或机密内容。

## 三分钟上手

1. 打开[线上 Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)，选择或新建项目和应用。
2. 描述想做的页面并发送。服务端配置可用模型时默认使用真实模型，一轮通常先规划、再执行生成或修改，共两次上游模型调用；没有模型配置时，可选择明确标注的本地 demo。
3. 在隔离预览中操作页面，再用自然语言提出修改需求。
4. 打开源码面板查看工程文件，或进入版本历史比较并恢复代码。
5. 发布当前选定版本并复制公开链接，或导出单文件 HTML。

## 已实现能力

| 能力 | 当前行为 |
| --- | --- |
| 生成流程 | 展示规划、执行、检查、保存四个阶段；四阶段是进度状态，模型模式仍是计划和执行两次调用。生成源码在编译阶段不执行，检查失败时不会替换已保存版本。 |
| React 工程 | 新应用采用固定 React 19 + Tailwind CSS 4 scaffold。模型可以创建或修改 `src/App.jsx` 与 `src/index.css`；源码面板只读，可查看 7 个工程文件。 |
| 精确修改 | 后续改动使用文件补丁，搜索片段须在原文件唯一匹配；仅两个应用源码文件可修改，整批校验后应用，避免意外覆盖其他文件。 |
| 隔离预览 | 编译后的应用在 sandbox iframe 中运行；React 编译器只解析 JSX 和受限模块并从静态 Tailwind 类名生成 CSS。检查结果不等于页面行为正确。 |
| 项目与版本 | 工作台保存项目、对话和代码版本。版本差异显示实际增删行；可恢复历史代码版本，恢复不会回滚 SDK 业务数据。 |
| 共享业务数据 | 只有应用明确通过 Motes SDK 写入的键值会持久保存。游客共享同一空间；各访客能看到同一应用数据。普通表单输入和 DOM 状态不会自动保存。 |
| 发布与导出 | 公开链接由 Motes 托管所选版本。React 工程和旧 HTML 应用都可导出单文件 HTML；独立文件不提供宿主 SDK 桥，React 导出会附带不持久化提示，旧 HTML 导出保留原源码行为。 |
| 移动界面 | 小屏可在聊天与预览间切换；Lite 需要网络，完整离线工作台未包含在本版本。 |

## 架构与关键取舍

工作台宿主使用 React、TypeScript 和 Vinext，部署在 Cloudflare Workers；API 与 D1 保存游客项目、对话、版本、发布信息及 SDK 应用数据。模型密钥只在服务端配置。生成的 React 工程与宿主分开：工作台提供固定 scaffold，编译静态应用源码和 Tailwind CSS 后，把结果放进隔离 iframe 预览。

| 取舍 | 收益 | 代价 |
| --- | --- | --- |
| 固定 React/Tailwind 工程 | 编译、预览、分享和 HTML 导出使用一致的运行时与样式；修改范围明确。 | 模型仅能修改两个源码文件，不支持任意依赖、任意多文件工程或容器构建。 |
| 游客共享空间 | 无需注册即可体验，方便评审直接验证应用及共享数据。 | 内容与 SDK 业务数据对所有访客共享，不提供个人私有空间、账号找回或权限隔离。 |
| 精确补丁与完整版本快照 | 只提交指定源码差异；每次保存留下完整代码版本，支持比较和恢复。 | 结构约束较严格；版本恢复只切换代码，不撤销已经写入的业务数据。 |
| 托管链接与独立 HTML 并存 | 托管页面可连接共享 SDK；HTML 文件可脱离工作台单独打开。 | 独立文件没有宿主 SDK 桥，相关业务数据不能写回工作台。 |

## 验证范围与限制

v33 已部署到[线上站点](https://motes-yangjunmin.yjm1024.chatgpt.site/)。公开 CI 的 Ubuntu 与 Windows job 各有 386 项测试通过、0 失败、0 跳过，typecheck、build、本地 D1 初始化及 HTTP smoke 通过。HTTP smoke 共 8 项，使用共享游客配置，不调用模型。详见[验收记录](docs/acceptance.md)与[CI 明细](docs/verification/v33-ci-check.json)。

真实模型案例共 6 个请求、12 次上游调用（前 4 个运行于 v32，后 2 个运行于 v33），结果是混合的：2048 游戏的游玩、蓝色按钮补丁和版本恢复在观察范围内通过，但保存失败，得分到 16 时 SDK 最高分仍为 4；任务清单首版因把 SDK 初始 `null` 误判为错误而失败，第二版观察到创建、完成、删除和刷新恢复通过；小费计算器创建和功能补丁在观察范围内通过，120 元账单、10% 小费、3 人对应小费 12、合计 132、人均 44，共享刷新与公开页面读回也已观察。上述结果不能概括成所有案例通过；v33 的提示约束变化不会修复已经保存的游戏版本。完整范围见[真实模型记录](docs/verification/v33-real-model-check.json)和[生产清理摘要](docs/verification/v33-production-cleanup.json)。

当前不提供账号认证、代码流式输出、ZIP 工程包、容器、任意 npm 依赖安装、任意多文件工程或完整离线工作台。静态检查和有限案例观察都不能保证新需求生成后无需人工检查。

## 后续优先级

- **P0：生成可靠性与业务回归。** 覆盖空数据初始化、异步保存、连续修改和版本恢复，核对实际操作与数据读回，降低“代码保存成功但应用不可用”的概率。这直接影响核心体验，优先于扩大功能数量。
- **P1：错误定位与恢复。** 在现有阶段状态上补充可操作的错误位置、冲突处理指引，再评估受限次数的自动修复和明确的服务端取消语义，帮助用户恢复任务并控制重试成本。
- **P2：按需求扩展工程能力。** 再考虑受控多文件工程、独立工程导出与隔离构建；账号及个人空间仅在确认需求后评估。这些能力涉及依赖、安全和数据迁移，投入较大，当前游客演示闭环不以此为前提。

## 本地快速运行

需要 Node.js 24 与 npm。首次克隆按顺序运行；数据库初始化命令只适用于全新本地 D1，检测到已有 SQLite 数据库会拒绝执行。

```sh
npm ci
node -e "const fs=require('node:fs'); if (!fs.existsSync('.dev.vars')) fs.copyFileSync('.dev.vars.example','.dev.vars',fs.constants.COPYFILE_EXCL)"
npm run build
npm run db:init:local
npm run dev
```

示例 `.dev.vars.example` 不含模型 Key，可运行标注明确的 demo；需要真实模型时再在本地 `.dev.vars` 配置服务端密钥和模型，不要提交该文件。CI 的 `npm test`、`npm run typecheck` 与 `npm run verify:http` 不调用模型；HTTP 验证在 build 和 fresh D1 初始化后运行，使用 demo：

```sh
npm test
npm run typecheck
npm run verify:http
```

`npm run verify:http` 会启动独立本地 Worker 并在结束时关闭。已有数据库不要重复运行 `db:init:local`；迁移细节见[本地启动说明](docs/local-setup.md)。

## 文档索引

- [项目概览与取舍](docs/project-overview.md)
- [生成、预览与版本工作流](docs/generation-workflow.md)
- [本地启动与 D1 迁移](docs/local-setup.md)
- [v33 发布与验收记录](docs/acceptance.md)
- [公开 CI 明细](docs/verification/v33-ci-check.json)
- [真实模型案例明细](docs/verification/v33-real-model-check.json)
- [生产数据清理摘要](docs/verification/v33-production-cleanup.json)
- [完整产品历史源码](https://github.com/YJM1024/motes/tree/full-product)
