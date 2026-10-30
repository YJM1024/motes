# 本地启动与数据库迁移

需要 Node.js 24（最低 22.13）与 npm。以下命令在仓库根目录运行，只操作本地数据，不包含 `--remote`。本地数据库与生产 D1 独立。

## 安装与构建

```sh
npm ci
npm run build
```

构建生成 `dist/server/wrangler.json`，供下列本地数据库命令使用。依赖未变化时无需重复安装；安装或构建失败时先解决报错。

## 全新本地库

新建本地库时，按文件名顺序执行 `drizzle/` 中的全部 SQL 文件。此命令会动态读取当前文件清单，新增迁移不需要再手工更新序号范围：

```powershell
Get-ChildItem -LiteralPath ./drizzle -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
}
```

## 已有本地库

先保留 `.wrangler/state` 的本地备份，确认已执行的具体迁移文件，**只执行尚未应用的迁移**。用以下命令显式列出待补的文件名；数组默认为空，避免把全新库的命令误用于已有库：

```powershell
$pendingFiles = @(
  # 仅填写已确认尚未执行的文件名，例如 '0009_example.sql'
)
Get-ChildItem -LiteralPath ./drizzle -Filter '*.sql' -File |
  Where-Object { $pendingFiles -contains $_.Name } |
  Sort-Object Name |
  ForEach-Object {
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
  }
```

不要删除状态目录来“修复”缺表，也不要修改已应用的迁移。迁移文件按名称排序运行，新增迁移会在新库命令中自动纳入。

手动 `d1 execute --file` 不会替你建立迁移编号清单，请在项目外的本地记录中记下每个已执行文件。若不确定，可只读检查表清单并结合迁移文件与已有执行记录核对，不能从某个页面能打开推断所有表已齐全：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

新增迁移只建立结构，旧应用的工作空间元数据由管理接口按当前访客幂等补建，ID、owner、历史和当前指针保留。初始化不会将不同访客合并为共享账号。

## 启动与模型

```sh
npm run dev
```

通常打开 `http://127.0.0.1:5173/`，以终端实际地址为准。`/manage` 管理应用，`/settings` 设置与用量，`/compare` 为用户主动进入的候选比较，支持选择 2/3/4 组。保持同一项目目录和 `.wrangler/state`；更换目录或状态路径会使用另一份本地数据。

无模型配置也可使用明确标记的示例。真实生成时，复制 `.dev.vars.example` 为 `.dev.vars`，仅在本地填写已有授权的服务端 `OPENAI_API_KEY` 与账户可用的 `OPENAI_MODEL`；`OPENAI_MODELS` 是可选逗号白名单，留空仅使用默认模型。真实值不得提交 Git、传给浏览器或写入公开文档。配置、服务端 CSP 等启动配置变更后需重启本地服务；普通源码可热更新。

## 免费示例验收

这些脚本创建独立测试访客，使用示例或无模型操作，不调用真实模型。运行与本次变更有关的检查即可。

```sh
node tests/smoke.mjs http://127.0.0.1:5173
node tests/management-smoke.mjs http://127.0.0.1:5173
node tests/settings-smoke.mjs http://127.0.0.1:5173
node tests/creation-flow-smoke.mjs http://127.0.0.1:5173
node tests/sharing-smoke.mjs http://127.0.0.1:5173
node tests/candidates-smoke.mjs http://127.0.0.1:5173
```

需要保存 JSON 的脚本可按其参数约定提供本地路径。模型权限、真实输出效果及费用回执需要另行授权的真实调用，不能用示例结果代替。
