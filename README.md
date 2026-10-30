# Motes · 微粒

用对话创建、预览、迭代和保存单文件网页应用的轻量工作台。

[在线体验](https://forma-junmin.warmgrove10.chatgpt.site/) · [GitHub 源码](https://github.com/YJM1024/motes) · [架构与取舍](docs/architecture.md) · [5 分钟验收](docs/acceptance.md)

## 当前状态

在线站点已启用**真实 AI 模式**。2026-10-30 在部署 v4、环境修订 1 上，使用 gpt-6-luna 完成两次真实请求，验证计数器生成、交互、对话增加功能、刷新恢复、历史还原、390px 手机预览和 HTML 导出。

当前部署 v6 已上线管理增量：本地 19 项自动测试、TypeScript、9 组管理 API Smoke 和浏览器验收通过，线上另通过 9 组管理 API Smoke，全部使用示例应用，无模型调用。完整产品仍在分批实施，设置与版本工具的独立开发不代表已集成或上线。

本地真实模型链路已于 2026-10-29 验证。线上另通过 9 项示例接口检查，包括访客隔离、来源保护、幂等重试和失败保护；该检查不调用模型。真实模型 UI 验收使用已有匿名浏览器身份，不等同于全新访客真实模型验收。

未配置模型的环境仍可使用明确标注的示例模式：旅行预算计算器、任务看板和番茄钟，支持深浅主题和蓝、紫、绿色调整，预算示例另支持修改预算上限。超出范围的请求会提示并保留已有版本。

项目原名 Forma，更名后沿用现有地址和存储标识，以保留已保存项目。

## 功能

- 对话生成和连续修改，发送状态、等待计时、失败重试与编辑需求。
- 自动保存项目与代码版本，刷新恢复，浏览历史并还原。
- 桌面、手机宽度预览，查看源码，导出当前预览版本的独立 HTML。
- 无需注册的匿名项目空间；预览在受限 iframe 中运行。
- 管理页 `/manage`：独立测试资料与工作空间、项目内多应用、改名/移动/收藏/归档恢复、标签管理和搜索排序。

## 本地运行

需要 Node.js 24（最低 22.13）和 npm。在项目目录执行：

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_great_roland_deschain.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_first_wind_dancer.sql
npm run dev
```

打开终端输出的地址，通常为 `http://127.0.0.1:5173/`，管理页为 `/manage`。新本地库按顺序执行以上两份迁移；已有 `0000` 的本地库只需补执行 `0001`，勿重新执行 `0000`。`0001` 只建表与索引，首次访问管理接口时按当前访客幂等补建元数据。本地数据位于已被 Git 忽略的 `.wrangler/state`，与生产数据库独立。

未配置模型时可直接使用示例模式。需要真实生成时，复制 `.dev.vars.example` 为 `.dev.vars`，填写 `OPENAI_API_KEY` 和账号可用的 `OPENAI_MODEL`。两项齐备后启用 AI 模式；模型必须显式指定。

## 数据与模型边界

模型请求由服务端调用 OpenAI Responses API。生成时发送当前 HTML 与修改需求；Key 仅用于服务端认证，不进入客户端或浏览器存储，不应提交到 Git 或写入公开配置。模型调用最长等待 3 分钟，并检查返回内容是否为完整 HTML。失败时保留已有版本。

项目、需求和完整代码版本保存到 D1。匿名 HttpOnly Cookie 标识访客，每次项目读写均检查归属。清除 Cookie 或更换浏览器、设备后不能找回原匿名身份；当前没有账号同步。浏览器 localStorage 记录当前项目选择，sessionStorage 暂存当前标签页的待处理消息。

预览内输入的费用、任务和计时状态属于临时运行状态，刷新预览会重置；保存与还原的是应用代码。HTML 导出包含代码，不包含预览运行时数据。导出文件在浏览器中独立打开时，不再具有工作台提供的 iframe 隔离边界。

预览使用 `sandbox="allow-scripts allow-forms"`，允许 JavaScript 响应表单事件；CSP `form-action 'none'` 阻止真正的表单提交，不授予同源、弹窗或顶层导航权限，并限制外部网络与资源。这也意味着需要外部 API、登录或资源加载的应用不在当前支持范围内。

每个应用最多 60 个版本，每个匿名访客最多 100 个应用。管理组织层每个空间最多 50 个项目、50 个标签，每个应用最多 10 个标签；默认项目计入数量，归档保留数据。每日按 UTC 计额：每访客示例 100 次、模型 10 次；全站示例 2000 次、模型 50 次。进入生成流程后的失败尝试也占额度。当前为原型交付，尚未完成公开生产环境的容量与长期运行验证。

## 验证

```sh
node --test tests/server.test.mjs tests/management.test.mjs app/manage/filter-apps.test.mjs
npx tsc --noEmit
node tests/smoke.mjs http://127.0.0.1:5173
node tests/management-smoke.mjs http://127.0.0.1:5173
```

Smoke 会创建独立测试访客和示例项目，不调用模型。检查范围包括生成、读取、幂等重试、修改、还原、访客隔离、请求来源、示例边界及失败保护。实际交互步骤与已验证范围见[验收说明](docs/acceptance.md)。

管理 Smoke 另覆盖项目/应用/标签管理、搜索、收藏、归档恢复、测试资料、越权拒绝，以及管理操作前后版本与当前指针保持不变。可在命令末尾添加本地 JSON 路径保存结果，结果不含 Cookie。

## 部署

项目使用 React 19、Vinext/Vite、Cloudflare Worker 和 D1，通过 Sites 构建与部署。复用 `.openai/hosting.json` 的现有项目配置，完成构建、推送、保存版本与部署；生产迁移随发布执行。

在新环境启用 AI 前，在 Sites 运行时秘密变量中配置 `OPENAI_API_KEY` 和 `OPENAI_MODEL`，再发布。部署后需验证实际地址、模式标识、真实生成、连续修改、刷新恢复及还原；构建成功或出现域名均不能替代线上验收。

仓库不包含密钥、本地数据库或生成交付包。模板自带的第三方许可保留在对应源文件及许可文件中。
