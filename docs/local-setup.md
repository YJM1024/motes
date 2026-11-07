# 本地启动与数据库迁移

推荐 Node.js 24 与 npm，与公开 CI 环境一致。本地使用独立 D1 数据库。

## 首次启动

在仓库根目录依次执行：

```sh
npm ci
node -e "const fs=require('node:fs'); if (!fs.existsSync('.dev.vars')) fs.copyFileSync('.dev.vars.example','.dev.vars',fs.constants.COPYFILE_EXCL)"
npm run build
npm run db:init:local
npm run dev
```

默认开发地址为 `http://127.0.0.1:5173/`，以终端输出为准。示例配置提供旅行预算、任务看板、番茄钟等本地示例。真实模型模式由服务端配置启用。

## 环境配置

本地 `.dev.vars` 由示例文件复制，已被 Git 忽略。

| 变量 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 服务端模型密钥。 |
| `OPENAI_MODEL` | 默认模型名称。 |
| `OPENAI_MODELS` | 可选的服务端模型白名单，以逗号分隔。 |
| `MOTES_WORKSPACE_VISIBILITY` | 示例为 shared，使用游客公共空间。 |

密钥仅保存在本地秘密文件或服务端。公共空间使用演示数据，访客共享其中作品和 SDK 业务数据。

## 数据库初始化

`db:init:local` 读取构建生成的 `dist/server/wrangler.json`，使用 DB 绑定、Wrangler `--local` 与 `.wrangler/state`，按顺序应用 `drizzle/` 下的 SQL 迁移。

该命令用于全新的本地数据库，检测到已有 SQLite 时会停止。已有库先备份 `.wrangler/state`、核对迁移状态，再仅应用尚未执行的迁移。

## 工程检查

```sh
npm test
npm run typecheck
npm run build
npm run verify:http
```

HTTP 检查在构建与全新本地数据库初始化后执行，使用示例模式，不调用模型。命令启动独立本地 Worker，结束后关闭自己启动的服务，输出文件位于 Git 忽略的 `outputs/`。

CI 在 Ubuntu 与 Windows 上运行安装、测试、类型检查、构建、数据库初始化和 HTTP 检查。

[项目说明](project-overview.md) · [生成流程](generation-workflow.md)
