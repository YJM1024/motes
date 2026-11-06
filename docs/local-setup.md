# 本地启动

线上体验入口为 [Motes Lite](https://motes-yangjunmin.yjm1024.chatgpt.site/)。本地启动使用独立本地 D1，不会自动连接或修改生产库。Lite 需要网络；完整离线工作台仍在[完整版](https://github.com/YJM1024/motes/tree/full-product)。

## 环境、初始化与启动

当前项目本地启动按 Node.js 24 与 npm 编写。仓库声明的最低 Node 版本为 22.13；推荐使用 Node 24，以匹配当前依赖与构建环境。从仓库根目录运行：

```sh
npm ci
npm run build
npm run db:init:local
npm run dev
```

`db:init:local` 要求先构建出 `dist/server/wrangler.json`，并且只为全新的本地 D1 按顺序应用 `drizzle/` 下顶层 SQL 迁移。它固定使用 `DB` 绑定、Wrangler `--local` 和 `.wrangler/state`，不会连接远程数据库。若该 state 目录中已有 SQLite 数据库，命令会拒绝初始化，避免重放迁移或覆盖已有数据。

默认访问 `http://127.0.0.1:5173/`，具体地址以终端输出为准。构建预览 runtime 时处理已安装的可信 React 依赖，不会在构建期间执行生成的 App 源码；生成应用只在隔离预览 iframe 中运行。

## 已有本地数据库

已有本地库先备份 `.wrangler/state` 并核对迁移状态，只补尚未执行的迁移。不要对已有库运行 fresh 初始化，不要清空数据库，也不要重跑或改写已应用的旧迁移。若 fresh 初始化中途失败，先检查 state 和迁移进度，再手工处理未执行的迁移；再次运行初始化会因本地 SQLite 文件而拒绝。不要对生产环境执行远程迁移。数据库结构继续兼容 Motes 完整版使用的数据模型。

## 本地 HTTP 验收

完成 `npm run build` 和全新数据库的 `npm run db:init:local` 后，运行 `npm run verify:http`；已有本地库不要重新初始化。验收命令会启动自己的构建后 Worker，使用随机本地端口运行现有示例 HTTP 流程，并在结束或失败时关闭自己启动的服务，不占用已有开发端口。验收仅使用示例模式，不调用模型；报告写入忽略提交的 `outputs/` 目录。HTTP 检查通过不代表浏览器交互已经验收。

## 游客空间与模型配置

示例开发配置使用共享游客空间。同一公共空间内的访客可查看和修改彼此的项目、应用、对话，以及应用通过 Motes SDK 显式保存的业务数据。请勿存放个人或机密内容。

没有服务端模型配置时，只能使用明确标注的本地示例。真实模型模式需要在本地秘密文件 `.dev.vars` 中配置服务端 Key 和可用模型；不要把 Key 放到浏览器、生成的页面、需求文本或 Git 中。

## 数据行为

恢复历史代码版本只切换当前代码版本，不会回滚应用 SDK 业务数据。普通表单输入与页面 DOM 状态不会自动保存。公开发布链接可被访问，发布前应检查应用内容。退役旧 Service Worker 不会清除旧 IndexedDB、草稿或待处理队列；本地启动不会代替真实浏览器升级后的恢复验收。

项目范围与工作流见[项目说明](project-overview.md)和[生成工作流](generation-workflow.md)。
