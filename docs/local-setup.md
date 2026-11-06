# 本地启动

线上体验入口为 [Motes Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)。本地启动使用独立本地 D1，不会自动连接或修改生产库。Lite 需要网络；完整离线工作台仍在[完整版](https://github.com/YJM1024/motes/tree/full-product)。

## 环境与安装

当前项目本地启动按 Node.js 24 与 npm 编写。仓库声明的最低 Node 版本为 22.13；推荐使用 Node 24，以匹配当前依赖与构建环境。从仓库根目录安装依赖并构建：

```sh
npm ci
npm run build
```

开发启动命令会先构建预览所需的可信 React runtime，再启动宿主开发服务：

```sh
npm run dev
```

默认访问 `http://127.0.0.1:5173/`，具体地址以终端输出为准。构建 runtime 时处理的是已安装的可信 React 依赖；不会在构建期间执行生成的 App 源码。生成应用只在隔离预览 iframe 中运行。

## 创建并迁移本地 D1

构建会生成 `dist/server/wrangler.json`。首次启动前，新建本地 D1 并按迁移文件名顺序应用 SQL。当前仓库未提供跨平台的自动迁移入口；以下批量示例适用于 Windows PowerShell：

```powershell
Get-ChildItem -LiteralPath ./drizzle -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "本地迁移失败：$($_.Name)" }
}
```

该批量命令只适用于全新本地库。已有本地库先备份 `.wrangler/state`，核对已应用迁移后，只补未执行的迁移；不要清空数据库，也不要对生产环境使用 `--remote`。不要重跑或改写已应用的旧迁移。数据库结构继续兼容 Motes 完整版使用的数据模型。

## 游客空间与模型配置

示例开发配置使用共享游客空间。同一公共空间内的访客可查看和修改彼此的项目、应用、对话，以及应用通过 Motes SDK 显式保存的业务数据。请勿存放个人或机密内容。

没有服务端模型配置时，只能使用明确标注的本地示例。真实模型模式需要在本地秘密文件 `.dev.vars` 中配置服务端 Key 和可用模型；不要把 Key 放到浏览器、生成的页面、需求文本或 Git 中。

## 数据行为

恢复历史代码版本只切换当前代码版本，不会回滚应用 SDK 业务数据。普通表单输入与页面 DOM 状态不会自动保存。公开发布链接可被访问，发布前应检查应用内容。退役旧 Service Worker 不会清除旧 IndexedDB、草稿或待处理队列；本地启动不会代替真实浏览器升级后的恢复验收。

项目范围与工作流见[项目说明](project-overview.md)和[生成工作流](generation-workflow.md)。
