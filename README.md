# Motes · 微粒

AI 应用工作台 · 从一个想法，构建可用应用。

用对话创建、预览、迭代和保存单文件网页应用。

在线体验：https://forma-junmin.warmgrove10.chatgpt.site/

源码仓库（待首次上传完成后可访问）：https://github.com/YJM1024/motes

原 Forma 项目现更名为 Motes。沿用现有地址与存储标识，保留已保存项目；历史代码版本保持原貌。

## 当前交付

当前为明确标注的**示例模式**：旅行预算计算器、任务看板、番茄钟。不调用 AI，不冒充理解任意需求。支持深浅主题、蓝/紫/绿色，预算示例另支持调整预算上限。不支持的修改会提示并保留旧版本。

已实现项目自动保存、刷新恢复、对话修改、历史预览与还原、HTML 导出、桌面/手机预览。界面采用白色与中性浅灰，清晰排版、少量强调色与克制过渡，支持减少动态效果偏好。

2026-10-29 已在本地使用现有密钥与 gpt-6-luna 完成真实生成、对话修改、两版持久保存与还原验证。线上仍为示例模式，尚未配置线上密钥。

## 本地运行

需要 Node.js 24（至少 22.13）与 npm。首次运行：

    npm ci
    npm run build
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_great_roland_deschain.sql
    npm run dev

以终端输出的地址为准，通常为 http://127.0.0.1:5173/。本地数据库位于被 Git 忽略的 .wrangler/state。迁移首次执行一次，本地库与线上库独立。

## 模型配置

本地复制 .dev.vars.example 为 .dev.vars；线上在 Sites 运行时秘密变量中设置 OPENAI_API_KEY 和 OPENAI_MODEL，再发布。必须显式指定账号可用的模型 ID，避免昂贵默认模型。两项齐备后才显示 AI 模式。

使用 OpenAI Responses API（https://api.openai.com/v1/responses），将当前 HTML 与新需求提交服务端生成。3 分钟超时、低推理强度，限制输出长度，拒绝未完成输出。Key 不进入客户端、浏览器存储、Git 或 hosting.json。本地真实生成及连续修改已通过；线上真实调用仍待配置与验收。

## 架构与数据边界

React 19 + Vinext/Vite + Cloudflare Worker + D1。app/page.tsx 为工作台；app/api 与 lib/forma 为接口和引擎；db/schema.ts 与 drizzle 为数据库结构和迁移。

项目、对话需求、完整代码与版本保存到 D1。匿名 HttpOnly Cookie 标识访客，所有项目读写均检查归属。无需注册；清除 Cookie 或换设备后不能恢复原匿名身份。localStorage 只记录当前项目选择。预览内填写的费用、任务、计时状态为临时运行状态，刷新预览重置；保存的是应用代码版本。

生成代码以 sandbox="allow-scripts" iframe 运行，不授予同源、弹窗、表单提交或顶层导航能力。CSP 禁用外部网络及资源，移除自动跳转元标签。原始 HTML 仅作为文本展示或由用户导出。

服务端检查请求来源、长度和归属；请求编号幂等、项目生成锁、D1 原子批量写入保护版本。单项目最多60版；每日（UTC）每访客示例100/模型10次，全站示例2000/模型50次，失败尝试也占额度。

## 验证

    node --test tests/server.test.mjs
    npx tsc --noEmit
    node tests/smoke.mjs http://127.0.0.1:5173

检查创建、持久读取、重复请求、修改、还原、访客隔离、来源限制、示例边界和失败保护。Smoke 会为独立测试访客创建示例项目，不调用模型。

## 发布

复用 .openai/hosting.json 的现有 Sites 项目。该文件只包含部署绑定与公开站点项目标识，不含凭证；派生项目部署到自己的站点前，应替换为自己的 Sites 项目标识。通过 Sites 构建、推送、保存版本和部署，生产迁移随发布执行；验证实际部署结果及线上流程，预期域名不代表上线。

源码不包含原始笔试题、API Key、本地数据库或交付包。保留模板所附第三方许可。


## 对话体验

发送后消息立即进入对话，清空输入框；处理期间可起草下一条，发送按钮禁用。消息下方显示等待计时；失败保留原消息并提供圆形重试和编辑需求。网络中断重试沿用请求编号，避免重复保存。当前标签页刷新后保留待处理消息；重试会先核对原请求状态。成功、还原和导出提供反馈；浏览历史时不强制滚到底部，支持减少动态效果和 Esc 关闭面板。

模型请求区分超时、额度、限流、权限和输出不完整；日志仅记录状态和耗时，不记录密钥或需求内容。线上仍为示例模式，本地已完成真实生成与修改验证。
