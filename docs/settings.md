# 设置与继承

设置中心位于 `/settings`，用于工作空间默认值、项目覆盖和应用覆盖。当前实现的每项设置均有实际作用，不提供尚未连接的模型、密钥输入或账单信息。工作台界面目前为简体中文；`language` 只选择新 AI 应用的默认生成语言，不会翻译工作台。

| 字段 | 合法值 | 实际作用 |
| --- | --- | --- |
| creationMode | demo / model | 打开工作台时的默认模式，发送前可临时切换 |
| model | 服务端白名单内的模型 ID | 真实用于下一次 AI 调用；停用后回退当前默认模型，来源显示 server |
| previewDevice | desktop / mobile | 打开应用时的预览设备，手机为 390px |
| autoFollow | boolean | 新消息是否自动跟随；主动查看上文时保留位置 |
| showWaitTimer | boolean | 是否显示等待秒数，不隐藏任务状态或改变超时 |
| language | zh-CN / en | 新 AI 应用的默认语言；示例不使用此项 |
| visualStyle | minimal / soft / bold | 新 AI 应用的基础风格；示例不使用此项 |
| model | 当前服务端白名单中的 ID | 下一次构建或讨论实际采用的模型，不接收密钥或未知模型 |

优先级为应用覆盖、项目覆盖、工作空间、系统默认。服务端安全约束始终优先，不能通过设置更改。工作空间无自定义值时，有服务端模型配置则默认 AI，无配置则默认示例。保存 `creationMode=model` 前必须同时存在服务端 Key 与模型 ID；已存 AI 默认但服务端配置被移除时，有效值回退示例，来源显示服务端安全回退。

语言和风格由生成接口在服务端读取，一次调用读取一次有效配置，客户端额外提交的偏好字段不作为依据。明确的当前需求优先；修改已有应用时保留其语言和设计，只有用户提出相应修改时才用默认值补充未指定细节。改变偏好不创建版本、不翻译旧代码、不移动当前版本指针。

从管理页选定项目后创建应用，首次生成直接使用该项目有效偏好并在事务内归组；未指定目标时使用工作空间默认并归入默认项目。后续打开或修改时使用当前项目与应用覆盖，移动后继承目标项目，应用自身覆盖保留。模型配置及真实用量见[模型与用量](models-usage.md)。

## 接口

先通过 `/api/session` 建立匿名 Cookie。`GET /api/settings` 读取工作空间设置；可传 `projectId` 或 `appId`，传应用时由服务端确定所属项目。归属不符返回 404，项目与应用范围不一致返回 400。

返回 `workspaceId`、`selection`、`effective`、逐字段 `sources`、三层 `overrides`、仅含服务端实际配置模型 ID 的 `models` 和 `modelAvailable`，不含密钥。`sources` 为 system / workspace / project / app / server。

`POST /api/settings`：

```json
{
  "scope": "project",
  "projectId": "目标项目ID",
  "patch": { "language": "en", "visualStyle": "soft", "autoFollow": null }
}
```

`scope` 为 workspace / project / app；项目层必须给 `projectId`，应用层必须给 `appId`，工作空间层不接受对象 ID。`patch` 只接受上表字段，`null` 删除本层覆盖：工作空间恢复系统默认，项目/应用恢复继承。所有值先验证，再批量事务保存；失败不留下部分配置。成功直接返回新的有效值和来源，页面无需刷新。

## 数据与迁移

追加 `0002_workspace_settings.sql` 与 Drizzle 元数据，声明 `motes_settings` 表和唯一索引，不修改 0001、不执行数据回填或旧版本更新。表以工作空间、作用层、对象和字段作为唯一键。访问时逐项验证工作空间及项目/应用归属。

在独立本地库或部署环境按顺序应用 0000、0001、0002 后运行新代码。若本地库已有前两版，仅执行：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_workspace_settings.sql
```

模型配置、预览隔离、请求来源检查、超时、长度与每日额度不属于可继承设置。当前模型选项只反映实际服务端配置，不代表通过接口实时查询账号模型权限或余额。

动效偏好是单独的本浏览器界面选项：跟随系统或减少过渡，只作用于工作台宿主页面，不改变 iframe 内应用。偏好只保存一个非敏感枚举；浏览器存储不可用时降级为当前页面会话内存。支持的快捷键为创作/讨论输入框的 `Ctrl/⌘+Enter` 发送，以及创作页的 `Esc` 关闭源码/历史面板或侧栏；源码查找框中的 `Esc` 清除查找并返回编辑器。不提供自定义快捷键。

## 验证范围

```sh
node --test tests/settings.test.mjs
node tests/settings-smoke.mjs http://127.0.0.1:5173
```

SQLite 测试覆盖持久化、三层继承与恢复、跨访客隔离、非法配置原子拒绝、模型配置移除后的回退、移动后继承及旧版本不改；通过模拟模型响应检查生产生成接口实际采用服务端偏好、保留固定输出限制。模拟响应验证不等于真实模型视觉或语言效果验收。

HTTP Smoke 创建独立测试访客和示例应用，不调用模型；每次请求最多 15 秒。浏览器端仍需检查保存/取消、未保存提醒、来源展示、预览设备、对话跟随和计时显示，以及版本工具接入。完整产品的其他配置项不在本批实现范围内。
