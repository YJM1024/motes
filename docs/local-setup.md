# 本地启动与数据库迁移

本文针对当前源码工作树。生产版本和本地证据分别见[验收说明](acceptance.md#当前验收状态)；本地命令不会连接或修改生产数据库。

需要 Node.js 24（最低 22.13）与 npm。以下命令从仓库根目录运行。状态保存在 Git 忽略的 `.wrangler/state`；保留该目录可复用本地数据库。

## 干净安装与构建

```sh
npm ci
npm run build
```

构建生成 `dist/server/wrangler.json`，供本地 D1 命令使用。

## 全新本地库

仅用于新建的本地数据库。按文件名顺序执行 `drizzle/` 中全部 SQL 迁移：

```powershell
Get-ChildItem -LiteralPath ./drizzle -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
}
```

## 已有本地库

先备份 `.wrangler/state`，再根据本地记录只执行尚未应用的迁移。不要删除状态目录或重复执行已有迁移；手动 `d1 execute --file` 不会自动记录迁移历史。若不确定已有哪些表，可只读检查：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

新增迁移只建立结构。已有应用的工作空间元数据由管理接口按当前空间归属幂等补建，保留应用 ID、版本历史和当前指针。切换到共享模式不会自动合并或公开原有访客数据；导入备份会创建新 ID 的副本。共享空间内的应用、讨论、版本和 SDK 运行数据对访客可见并可修改，不要在其中放入私密信息。

## 启动与模型配置

```sh
npm run dev
```

通常打开 `http://127.0.0.1:5173/`，以终端显示地址为准。管理、设置和候选比较页面分别为 `/manage`、`/settings`、`/compare`。

未配置模型也可使用标注明确的固定示例。需要真实生成时，复制 `.dev.vars.example` 为 `.dev.vars`，在本地填写已获授权的 `OPENAI_API_KEY` 和账户可用的 `OPENAI_MODEL`。真实凭据不得提交 Git、放入浏览器或写入验收报告；真实模型验收会发起请求并可能产生费用。

## 自动检查

```sh
npm test
npm run typecheck
```

`npm test` 从 `tests/`、`lib/motes/` 与 `app/manage/` 收集并排序 `*.test.mjs`。类型检查使用项目本地 TypeScript。

## HTTP Smoke

推荐先运行不调用模型的核心 Smoke：

```sh
node tests/smoke.mjs http://127.0.0.1:5173 outputs/core-http.json
```

该脚本使用示例 API，创建一个命名 QA 应用并在结束时归档自己的应用。共享模式下 QA 应用会短暂出现在所有访客可见的公共空间；报告路径默认相对当前目录。从仓库根目录运行时，报告位于被 Git 忽略的 `outputs/` 下。

`tests/shared-runtime-smoke.mjs` 适用于专门的共享模式检查。它会创建 QA 应用且不删除已有数据；通过 `--verify-existing` 检查重启持久性。不要对含重要数据的环境运行。

其余历史 Smoke（例如 `creation-flow-smoke.mjs`、`management-smoke.mjs`、`settings-smoke.mjs`、`sharing-smoke.mjs`）要求 disposable private workspace。它们会先读取 `/api/session` 并拒绝 shared 模式，拒绝时不发送写请求；仅在独立本地库且 `MOTES_WORKSPACE_VISIBILITY=private` 时运行。不要在生产站点或共享演示空间运行这些私有模式脚本。

HTTP 示例和自动测试不替代浏览器验收；真实模型输出、模型权限与费用回执需单独记录，不能从 demo 结果推断。
