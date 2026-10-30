# Motes · 微粒

用对话讨论想法，创建、预览、迭代和保存单文件网页应用的轻量工作台。

[在线体验](https://forma-junmin.warmgrove10.chatgpt.site/) · [GitHub 源码](https://github.com/YJM1024/motes) · [本地运行补充](docs/local-setup.md) · [架构与取舍](docs/architecture.md) · [验收与上线状态](docs/acceptance.md)

当前生产环境仍为 v6，真实模型核心流程与应用管理已上线；本轮其他能力已合入源码，尚待发布。

本页描述当前源码能力。线上部署与实际验证范围以[验收状态表](docs/acceptance.md#当前验收状态)为准，发布后逐项更新。项目原名 Forma，沿用原地址和存储标识以保留已有作品。

## 当前源码功能

- 对话生成和连续修改，项目与代码版本自动保存、刷新恢复、历史预览和还原、独立 HTML 导出。
- 桌面与手机预览；隔离 iframe 内运行应用，临时业务输入与代码版本分开。
- [项目与应用管理](docs/workspace-api.md)：独立测试空间、项目内多应用、改名/移动/收藏/归档恢复、标签、搜索与排序。
- [设置与继承](docs/settings.md)、[模型与真实用量](docs/models-usage.md)：空间/项目/应用偏好、实际服务端白名单、真实回执及未知用量标识。
- [源码与版本](docs/source-editor.md)：行级版本比较、历史复制为新应用、草稿编辑与运行、手工保存新版本、版本名称和重要标记。
- [固定版本分享与撤销](docs/sharing.md)、[JSON 备份与导入](docs/backup.md)、[个人需求模板](docs/templates.md)。模板选择只填入需求。
- [运行诊断与主动修复](docs/runtime-repair.md)、[原请求核对恢复](docs/task-recovery.md)：失败保留成果，恢复只核对原请求，修复由用户主动准备和发送。
- [两组方案比较](docs/candidates.md)：用户主动预留两份额度，各组独立结果，明确选用后才保存为应用版本。
- [先讨论再构建](docs/discussions.md)：纯文本回答不改预览或版本，明确采用后回填可编辑需求；工作空间隔离的构建/讨论草稿可恢复。

比较 MVP 固定两组。未来用户可选 2、3、4 组仍为未开始的规划，不提供假选项或额外隐式调用。

## 本地运行

需要 Node.js 24（最低 22.13）和 npm。以下以 PowerShell 和**全新本地库**为例：

```powershell
npm ci
npm run build
Get-ChildItem ./drizzle -Filter '*.sql' | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
}
npm run dev
```

新库按文件名顺序执行 `0000` 至 `0008`；其他终端可逐个运行同一迁移命令。已有库应核对已执行记录，仅补后续迁移，保留原库和旧迁移。打开终端输出的地址，通常为 `http://127.0.0.1:5173/`；管理、设置和比较页为 `/manage`、`/settings`、`/compare`。

本地数据在 Git 忽略的 `.wrangler/state`，与生产库独立。组织元数据按当前访客幂等补建，代码历史和归属保持。

未配置模型时可使用旅行预算计算器、任务看板和番茄钟三个明确标注的示例。示例支持深浅主题及蓝、紫、绿色调整，预算另支持修改预算上限；超出范围提示并保留旧版本，不调用模型。

需要 AI 功能时，复制 `.dev.vars.example` 为 `.dev.vars`，配置 `OPENAI_API_KEY` 和账号可用的默认 `OPENAI_MODEL`。可选 `OPENAI_MODELS` 为逗号白名单，最多八个 ID；留空兼容单模型。Key 与至少一个有效模型 ID 齐备后启用 AI，账号实际权限仍需调用验收。

## 数据、模型与安全边界

模型由服务端调用 OpenAI Responses API。构建发送保存代码与需求，最长等待 3 分钟并检查完整 HTML；讨论最长 2 分钟，只返回文字。Key 不进入客户端、浏览器存储、Git 或公开配置。

项目、需求、讨论、设置和完整代码版本存入 D1，读写检查匿名 HttpOnly Cookie 对应的归属。清除 Cookie 或换浏览器、设备后无法找回原身份，当前没有正式账号或跨设备同步。浏览器按服务器返回的 workspace ID 区分构建草稿、讨论草稿和待处理请求，不存 Cookie 或 Key。

预览费用、任务、计时等运行输入为临时状态，刷新会重置；保存、还原和 HTML 导出针对代码。JSON 备份覆盖应用代码历史与相关元数据，当前不含讨论线程、个人模板或浏览器草稿。导出 HTML 独立打开后不再具有工作台 iframe 的隔离边界。JSON 备份含需求与完整代码，应妥善保存；公开分享前须检查所选版本内容。

预览使用 `sandbox="allow-scripts allow-forms"`，允许 JavaScript 处理表单事件；CSP `form-action 'none'` 阻止真正提交。保持无同源、弹窗、顶层导航和外部网络能力，限制外部资源及嵌套框架；宿主页面使用 `frame-src 'self'`。依赖外部 API、登录或资源加载的应用不在当前支持范围，也不支持多文件工程、依赖安装或生成应用获取服务端密钥。

每访客最多 100 个应用，每应用 60 个版本；每空间 50 个项目、50 个标签，每应用 10 个标签。模板最多 50 条、需求最多 4000 字；构建前讨论最多 50 个，每线程 100 轮。分享及备份的其他限制见模块文档。

按 UTC 日计额：每访客示例 100 次、模型 10 次，全站示例 2000 次、模型 50 次。构建、讨论、候选共用模型额度；两组比较预留两次，讨论一次发送占一次，已开始的失败尝试也计额。用量未知时显示未知，不提供账户账单或余额。生产容量和长期运行仍需验证。

## 验证与部署

```sh
node --test tests/*.test.mjs app/manage/filter-apps.test.mjs
npx tsc --noEmit
node tests/smoke.mjs http://127.0.0.1:5173
node tests/management-smoke.mjs http://127.0.0.1:5173
```

自动测试使用真实 SQLite 与模拟模型；上述 Smoke 创建独立测试访客和示例应用，不调用模型。本地补充文档列出示例、管理、设置、指定项目创建、分享和候选 HTTP Smoke；无模型的检查不代替真实模型验收。新增功能的验证入口、浏览器检查及实际已通过范围见[验收说明](docs/acceptance.md)和各模块文档。

React 19、Vinext/Vite、Cloudflare Worker 与 D1，通过 Sites 构建和部署。复用 `.openai/hosting.json` 的项目，在运行时秘密变量配置模型连接，按顺序应用生产迁移。发布后检查实际地址、模式、数据恢复和真实调用，记录部署版本及证据。

仓库不包含密钥、本地数据库、原始保密材料或生成交付包；保留模板自带的第三方许可。
