# Lite 本地启动与验收

访问[正式站点](https://motes-yangjunmin.yjm1024.chatgpt.site/)。本地运行不会修改生产 D1。Lite 需要网络，不提供完整版的完整离线工作台；完整版源码仍在[`full-product` branch](https://github.com/YJM1024/motes/tree/full-product)（`51a315f`）。历史发布验收信息见[验收记录](acceptance.md)。

## 安装与本地数据库

需要 Node.js 24（最低 22.13）和 npm。从仓库根目录运行：

```sh
npm ci
npm run build
```

构建生成本地 Wrangler 配置 `dist/server/wrangler.json`。仅对新建的本地 D1 按文件名顺序应用全部迁移：

```powershell
Get-ChildItem -LiteralPath ./drizzle -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
}
```

此命令只用于全新本地库。已有库先备份 `.wrangler/state`，只补尚未执行的迁移；不要清空数据库或对生产执行 `--remote`。数据库 schema/API 与完整版兼容，lite 是界面缩减，不是新数据模型。

本轮新增迁移为 `0017_stale_millenium_guard.sql` 和 `0018_strong_leech.sql`。若已有本地库已应用至 `0016`，按顺序只应用 `0017`、`0018` 及其后的尚未执行迁移；不要覆盖、重跑或改写已应用的旧迁移。确认迁移状态后再启动服务。

## 启动

```sh
npm run dev
```

通常打开 `http://127.0.0.1:5173/`，以终端显示地址为准。示例 `.dev.vars.example` 默认使用共享游客空间；同一工作区中的访问者能看到和修改彼此内容。请勿放入私人数据。没有服务端模型 Key 时只能使用标注明确的有限 demo；真实模型功能需在本地秘密文件 `.dev.vars` 中配置服务端 Key 和可用模型，不能把 Key 交给游客或提交 Git。

## 自动检查

```sh
npm test
npm run typecheck
```

测试发现以根目录 `tests/` 为必需入口，只收集该目录的顶层 `*.test.mjs`。完整版专属 UI 测试仍保留在 `full-product` 分支，已从 Lite 测试树移除，因此不会误运行。共享逻辑目录 `lib/motes/` 和纯管理筛选测试目录 `app/manage/` 若存在则纳入，Lite 移除管理 UI 后可没有 `app/manage/`。可选目录只有在不存在（`ENOENT`）时跳过，其他读取错误仍会失败；零测试文件也会失败。当前 62 个测试文件以最多 2 个并行文件进程执行；测试内的 Promise 并发、锁和幂等断言不变。Lite 保留适用的 API、数据恢复、SDK、安全边界和纯筛选测试。公开 CI 的 329 项结果以及 v24 同 SHA 原生测试、typecheck、build 见[验收记录](acceptance.md#当前状态)。旧 Service Worker 真实浏览器升级和实体手机测试尚未完成。

## 浏览器数据与 Service Worker

退役旧 Service Worker 时只解除旧 Worker 的拦截，不清除旧 IndexedDB、草稿或待处理队列。不要用“清除站点数据”排除兼容问题；真实浏览器更新后保留与恢复仍需单独验收。完整离线工作台仅在[完整版分支](https://github.com/YJM1024/motes/tree/full-product)提供。

版本恢复只切换当前 HTML 版本，不回滚应用通过 SDK 显式写入的业务数据。普通输入和页面 DOM 状态不会自动持久化；发布链接公开可访问，发布前应检查内容。
