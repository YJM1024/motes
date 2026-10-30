# 工作空间管理基础

此增量提供数据与接口，管理页面由独立界面批次接入。它不改变生成、版本、还原、模型调用或预览逻辑，不提供正式登录、共享空间和永久删除应用。

## 初始化与兼容

先调用现有 `GET /api/session` 建立匿名浏览器 Cookie，再调用 `GET /api/workspace`。不同访客获得各自的测试资料、默认工作空间和默认项目；响应明确使用 `profile.kind: "test"`，不把测试资料当成正式账户。

旧 `forma_projects` 继续作为应用表，ID、owner、current_version_id 和所有版本保持原样。`0001_first_wind_dancer.sql` 仅建立表与索引，不执行数据回填或种子写入。访客首次读取管理接口时，运行时初始化按当前 owner 幂等创建测试资料、默认工作空间与默认项目，并补建其原应用元数据；同一入口也补建旧生成接口中新建应用的元数据。重复初始化不覆盖已整理的资料，因此新应用先归默认项目，再按需调用移动操作。

发布前按现有 D1 流程备份数据库并应用迁移；本批不部署、不读取线上库。Drizzle 的 schema、SQL、snapshot 和 journal 一并提交。原 Sites project ID 保留不变。

## 接口契约

精确请求与响应类型位于 `lib/motes/types.ts`。所有响应包含测试资料、当前空间、项目、标签、应用元数据、过滤条件与数量上限；不包含代码、版本正文、Cookie、owner 哈希或服务端配置。

`GET /api/workspace` 支持：

| 参数 | 值及语义 |
| --- | --- |
| workspaceId | 可省略，默认当前访客空间；传入其他空间返回 404 |
| projectId / tagId | 可选，必须属于当前空间 |
| q | 最长 100 字，搜索应用名、简介和标签，按字面匹配 |
| archived | active（默认）/ archived / all；归档项目内应用也在 archived 范围 |
| starred | true / false，按应用收藏状态过滤 |
| sort | updated（默认）/ created / name；名称排序不区分 ASCII 大小写 |
| listOnly | true 只取项目/标签导航元数据，apps 为空；默认 false |

过滤只作用于 apps，项目与标签列表始终完整，方便显示导航和恢复归档项目。应用上限沿用原接口的每访客 100 个；项目上限 50（含默认与归档），标签上限 50，每应用最多 10 个标签。名称最长 80 字（标签与显示名称 40），简介最长 1000 字。

`POST /api/workspace` 使用 JSON，必须有本站 Origin 和已有会话。可传 workspaceId 作显式作用域校验。动作如下：

```json
{"action":"project.create","name":"常用工具","description":"个人工具集"}
{"action":"project.update","projectId":"...","name":"新项目名","starred":true,"archived":false}
{"action":"app.update","appId":"原应用ID","projectId":"目标项目ID","name":"新应用名","description":"...","starred":true,"archived":false,"tagIds":["标签ID"]}
{"action":"tag.create","name":"效率","color":"#7895B2"}
{"action":"tag.update","tagId":"...","name":"重要","color":"#123456"}
{"action":"tag.delete","tagId":"..."}
{"action":"profile.update","displayName":"测试创作者"}
```

更新字段可部分提供；空更新、未知字段、非法颜色和重复标签会返回 400。标签名在工作空间内唯一，同名返回 409。数量限制在插入 SQL 中执行，达到限制返回 429。跨访客应用与跨空间项目/标签引用返回 404。所有复合写入使用 D1 原子 batch，验证失败不会部分改名或部分分配标签。

POST 返回 `archived: "all"` 的完整 snapshot，界面按当前过滤条件重新筛选。默认项目用于接收旧接口的新应用，可改名与收藏，不能归档。归档项目保留子应用和全部版本，默认 active 列表隐藏其中应用；恢复后重现。向已归档项目移动应用会返回 409。删除标签只解除标记，应用始终保留。应用改名同步原应用标题，旧侧栏仍可正常显示。

## 验证

运行 `node --test tests/server.test.mjs tests/management.test.mjs` 和 `node node_modules/typescript/bin/tsc --noEmit`。管理测试使用真实内存 SQLite、外键与事务执行生产 SQL，覆盖迁移重复执行、历史与当前指针完整、幂等补建、资料与管理操作、筛选排序、归档恢复、越权拒绝、输入约束与并发容量边界。它不调用模型，也不替代整合后的浏览器与线上 D1 验收。
