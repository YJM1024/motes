# 共享运行数据

本文记录共享工作空间中应用显式保存的业务键值数据。所有访客都可查看和修改公共工作空间中的项目、对话、版本及其运行数据；这不是个人私有存储。不要在共享空间写入秘密或个人资料。

## 状态

共享运行数据 SDK 与工作空间备份选项已随 v15 部署（source `18e5653fe3a2f5cea4d64d23ffee412bca8fadfa`）。生产迁移已通过：4 个应用、10 个旧版本完成哈希核对，4 个适配版本写入公共空间；独立访客验证可读，原私人库中的同 ID 数据保持不变。线上 UI 读写复核仍在进行；本轮没有新模型调用。测试与生产核验状态见[验收记录](acceptance.md)。

## SDK 用法

工作台只在服务端 session 明确为 `visibility: "shared"` 时，才通过隔离 iframe 与可信宿主消息桥接注入 SDK。应用通过以下接口读取和保存 JSON 值：

```js
const status = await window.motes.data.ready;
if (!status.available) {
  // 当前没有共享存储连接；只能在本页临时运行。
  return;
}

const saved = await window.motes.data.get('counterValue');
let value = saved.revision === 0 ? 0 : saved.value;

const result = await window.motes.data.set('counterValue', value + 1, saved.revision);
// result.revision 是下一次 set 必须携带的新版本号。
```

- `ready` 解析为 `{ available: boolean, error?: string }`。
- `get(key)` 返回 `{ key, value, revision, updatedAt }`；没有记录时 `value` 为 `null`、`revision` 为 `0`。
- `set(key, value, expectedRevision)` 使用 revision 比较并交换（CAS）。成功时返回新 revision；若其他访客先写入，会以 `code: "conflict"` 拒绝，不覆盖新值。界面应提示用户重新载入最新值后再操作。
- 键名为 1–64 个 ASCII 字母、数字、点、下划线或连字符，且必须以字母开头。
- 单个 JSON 值最多 12 KiB；每个应用最多 64 个键、总计最多 256 KiB。值只接受受限深度和大小的 JSON 数据。

数据按应用 ID 与键名隔离，不自动保存任意 DOM、表单、未发送输入、页面状态或计时器。只有成功 `set` 的值会持久保存。历史版本不会自动获得未曾调用 SDK 保存的数据。

## 隔离与故障处理

应用运行在没有同源权限的 `sandbox="allow-scripts allow-forms"` iframe 中。应用不能直接访问工作台 API；可信父页校验 iframe 来源、消息协议、通道与当前公共空间 session，再代为调用服务端 API。不要给 iframe 添加 `allow-same-origin` 来“修复”存储。

如果 SDK 不可用，应用可选择提供本页临时模式并明确提示刷新后不会保留。加载完成前应禁用写操作。CAS 冲突时不应用旧值重试或静默覆盖；保存失败时保留当前画面，并说明数据结果未确认。

旧计数器和其他历史 HTML 不会自动改写。只有明确选择并保存适配后的新版本，才会使用 SDK。离线 HTML 导出也没有工作台消息桥，SDK 数据不可用；示例可降级为临时交互，但不应显示“已保存”。

## 工作空间备份

工作空间 v2 JSON 备份提供独立的“应用业务数据”选项，界面默认勾选；下载 API 只有收到 `runtimeData=true` 才会包含记录，未传参数时仍默认为不包含。服务端预检和导入回执提供实际 `runtimeDataCount`。旧 v2 备份缺少 `sections.runtimeData` 或 `runtimeData` 数组时，按未选择、零条记录处理，并明确说明不会恢复这些数据。

恢复会创建新的项目和应用 ID，再将备份内数据映射到新应用；不会覆盖原应用。运行数据 revision 在新 ID 下从 1 开始。导入继续进行服务端预检、容量及所有权校验；文件上限为 2 MiB，每份最多 10 个应用、200 个版本。超过容量时用户需减少应用范围或关闭部分备份内容；服务不会静默截断数据。

旧版 [`/api/backup`](backup.md) v1 文件仍只备份代码与历史，不含工作空间讨论、模板或运行数据。浏览器语言、主题、动效、收藏、布局和本地草稿也不属于服务端备份。
