# 应用数据 SDK

Motes 为预览和托管页面提供受控共享数据接口。应用通过 `window.motes.data` 显式保存任务、预算等 JSON 数据，记录按应用隔离并写入 D1。同一应用的数据由公共空间内的访客共享。

## 读取与保存

```js
await window.motes.data.ready;
const record = await window.motes.data.get('tasks');
const tasks = record.value ?? [];

const next = [...tasks, { id: crypto.randomUUID(), title: '准备旅行', done: false }];
const saved = await window.motes.data.set('tasks', next, record.revision);
```

- `get(key)` 返回 `{ key, value, revision, updatedAt }`。
- 首次读取未保存的键时，value 为 null、revision 为 0，应用据此显示空状态。
- `set(key, value, expectedRevision)` 保存 JSON，返回新 revision 与更新时间。
- 保存使用读取到的 revision；共享写入冲突时，应用提示用户重新读取和确认。
- 界面根据实际读写结果展示保存状态。

## 数据与代码

代码与业务数据独立存储。连续修改和代码恢复保留已经保存的业务数据，应用应保持数据键与结构兼容。普通 DOM 状态和未显式保存的输入作为页面临时状态使用。

托管页提供 SDK 数据桥，独立 HTML 导出的 SDK 数据仅作临时使用。

## 接口约束

键名以英文字母开头，可包含字母、数字、点、短横线与下划线，最长 64 字符。单值 12 KiB，每应用最多 64 个键、合计 256 KiB，接受有限深度的 JSON。

iframe 与宿主使用独立随机通道。宿主核对来源、消息编号、键和值；服务端核对应用、可用版本和 revision。

[架构设计](architecture.md) · [生成流程](generation-workflow.md)
