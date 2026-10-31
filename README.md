# Motes · 微粒

用对话讨论想法，创建、预览、迭代和保存单文件网页应用的轻量工作台。

[在线体验](https://forma-junmin.warmgrove10.chatgpt.site/) · [GitHub 源码](https://github.com/YJM1024/motes) · [本地运行补充](docs/local-setup.md) · [架构与取舍](docs/architecture.md) · [验收与上线状态](docs/acceptance.md)

当前生产为 v15（2026-10-31，source 与 deployment ID 见[验收记录](docs/acceptance.md)）；native 部署和生产迁移已通过，线上 UI 读写复核仍在进行。v15 延续 v14 的 UI4 全站配色与中英文界面，并启用共享运行数据 SDK 和可选运行数据备份。生产复核状态以验收记录为准；本地与自动测试不代表长期负载或 SLA 验证。

本轮已在本地验证运行数据写入、冲突处理和备份恢复；v15 生产迁移已通过，线上 UI 读写复核仍在进行。285 项测试、TypeScript 与构建通过；本轮未进行额外模型调用。详见[共享运行数据](docs/shared-runtime.md)与[非功能验收](docs/nonfunctional-verification.md)。

本页描述当前源码能力。线上部署与实际验证范围以[验收状态表](docs/acceptance.md#当前验收状态)为准。项目原名 Forma，沿用原地址和存储标识以保留已有作品。

## 当前源码功能

- 对话生成和连续修改，项目与代码版本自动保存、刷新恢复、历史预览和还原、独立 HTML 导出。
- 桌面与手机预览；隔离 iframe 内运行应用，临时业务输入与代码版本分开。
- [项目与应用管理](docs/workspace-api.md)：独立测试空间、项目内多应用、改名/移动/收藏/归档恢复、标签、搜索与排序。
- [设置与继承](docs/settings.md)、[模型与真实用量](docs/models-usage.md)：空间/项目/应用偏好、实际服务端白名单、真实回执及未知用量标识。
- [源码与版本](docs/source-editor.md)：行级版本比较、历史复制为新应用、草稿编辑与运行、手工保存新版本、版本名称和重要标记。
- [固定版本分享与撤销](docs/sharing.md)、[JSON 备份与导入](docs/backup.md)、[个人需求模板](docs/templates.md)。模板选择只填入需求。
- 共享模式下，示例网页可通过隔离的 `window.motes.data` SDK 显式保存公共键值数据；未调用 SDK 保存的页面状态仍是临时输入。SDK 接口与容量限制见[共享运行数据](docs/shared-runtime.md)。
- [运行诊断与主动修复](docs/runtime-repair.md)、[原请求核对恢复](docs/task-recovery.md)：失败保留成果，恢复只核对原请求，修复由用户主动准备和发送。
- [候选方案比较](docs/candidates.md)：用户可选择 2/3/4 组。候选分别保存，明确采用才改写或新建应用；失败候选按单路原请求核对/重试，结果待保存时仅重试保存，不再次调用模型。
- [先讨论再构建](docs/discussions.md)：纯文本回答不改预览或版本，明确采用后回填可编辑需求；工作空间隔离的构建/讨论草稿可恢复。

示例模式为固定预设，不会冒充真实模型生成。

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

新库按文件名顺序执行当前 `drizzle/` 下全部 `*.sql`；迁移增加后此循环会自动包含新文件。已有库须根据自己的已执行记录，只补未执行的迁移；命令本身不会追踪执行记录。打开终端输出的地址，通常为 `http://127.0.0.1:5173/`；管理、设置和比较页为 `/manage`、`/settings`、`/compare`。

本地数据在 Git 忽略的 `.wrangler/state`，与生产库独立。组织元数据按当前访客幂等补建，代码历史和归属保持。

未配置模型时可使用旅行预算计算器、任务看板和番茄钟三个明确标注的示例。示例支持深浅主题及蓝、紫、绿色调整，预算另支持修改预算上限；超出范围提示并保留旧版本，不调用模型。

需要 AI 功能时，复制 `.dev.vars.example` 为 `.dev.vars`，配置 `OPENAI_API_KEY` 和账号可用的默认 `OPENAI_MODEL`。可选 `OPENAI_MODELS` 为逗号白名单，最多八个 ID；留空兼容单模型。Key 与至少一个有效模型 ID 齐备后启用 AI，账号实际权限仍需调用验收。

## 数据、模型与安全边界

模型由服务端调用 OpenAI Responses API。构建发送保存代码与需求，最长等待 3 分钟并检查完整 HTML；讨论最长 2 分钟，只返回文字。Key 不进入客户端、浏览器存储、Git 或公开配置。

项目、需求、讨论、设置和完整代码版本存入 D1。部署设置 `MOTES_WORKSPACE_VISIBILITY=shared` 后，所有访客共同查看、运行和修改同一个公共演示空间；匿名 HttpOnly Cookie 仅用于访客限额追踪，不提供业务数据隔离。历史私有空间保持原归属，不自动汇总或公开，须显式导入共享空间。未设置此开关时保留按访客隔离的旧空间行为。浏览器按服务器返回的 workspace ID 区分构建草稿、讨论草稿和待处理请求，不存 Cookie 或 Key。界面语言、主题、动效、模板收藏等浏览器偏好仅存本浏览器，不属于服务端设置或备份内容。

未通过 SDK 保存的预览 DOM 状态、表单输入和计时器仍是临时状态；只有应用显式调用 SDK 写入的键值记录会在共享模式下持久保存。保存、还原和 HTML 导出针对代码。v15 工作空间备份提供默认勾选的可选运行数据导出、预检计数和导入到新应用 ID 的恢复；旧备份缺字段时按未包含处理。备份不包含凭据或浏览器本地偏好。固定版本分享是创建时所选版本的快照；稳定发布可在同一链接上更新或暂停，两者互不替代。导出 HTML 独立打开后不再具有工作台 iframe 的隔离边界。备份含需求与代码，应妥善保存；公开前须检查所选标题和版本内容。

预览使用 `sandbox="allow-scripts allow-forms"`，允许 JavaScript 处理表单事件；CSP `form-action 'none'` 阻止真正提交。保持无同源、弹窗、顶层导航和外部网络能力，限制外部资源及嵌套框架；宿主页面使用 `frame-src 'self'`。依赖外部 API、登录或资源加载的应用不在当前支持范围，也不支持多文件工程、依赖安装或生成应用获取服务端密钥。

旧隔离模式每访客最多 100 个应用；共享模式的应用容量按公共空间归属共同计算。每空间 50 个项目、50 个标签，每应用 10 个标签、60 个版本。模板最多 50 条、需求最多 4000 字；构建前讨论最多 50 个，每线程 100 轮。分享及备份的其他限制见模块文档。

按 UTC 日计额：每访客示例 100 次、模型 10 次，全站示例 2000 次、模型 50 次；公共演示空间另共用示例 100 次、模型 10 次上限，实际可用量取访客、共享空间和全站剩余额度最小值，更换 Cookie 不会重置共享空间额度。构建、讨论、候选共用模型额度；候选比较按实际选择的组数计额，讨论一次发送占一次，已开始的失败尝试也计额。用量未知时显示未知，不提供账户账单或余额。生产容量和长期运行仍需验证。

## 验证与部署

```sh
node --test tests/*.test.mjs lib/motes/*.test.mjs app/manage/filter-apps.test.mjs
npx tsc --noEmit
node tests/smoke.mjs http://127.0.0.1:5173
node tests/management-smoke.mjs http://127.0.0.1:5173
```

自动测试使用真实 SQLite 与模拟模型；上述 Smoke 创建独立测试访客和示例应用，不调用模型。本地补充文档列出示例、管理、设置、指定项目创建、分享和候选 HTTP Smoke；无模型的检查不代替真实模型验收。新增功能的验证入口、浏览器检查及实际已通过范围见[验收说明](docs/acceptance.md)和各模块文档。

React 19、Vinext/Vite、Cloudflare Worker 与 D1，通过 Sites 构建和部署。复用 `.openai/hosting.json` 的项目，在运行时秘密变量配置模型连接，按顺序应用生产迁移。发布后检查实际地址、模式、数据恢复和真实调用，记录部署版本及证据。

仓库不包含密钥、本地数据库、原始保密材料或生成交付包；保留模板自带的第三方许可。
