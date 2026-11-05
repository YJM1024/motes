# Motes · 微粒

Motes 是一个通过对话创建、预览、迭代和保存单文件网页应用的轻量工作台。

[在线体验](https://motes-yangjunmin.warmgrove10.chatgpt.site/) · [GitHub 源码](https://github.com/YJM1024/motes) · [本地启动与迁移](docs/local-setup.md) · [架构](docs/architecture.md) · [当前验收状态](docs/acceptance.md#当前验收状态)

当前生产仍为 **v21**（2026-11-02），运行源码 `d556cdffa878733d4542398958318eeb82a04990`。本地源码修复 `fde6e58` 已解决历史版本还原后的预览重连问题，375 项测试与 TypeScript 检查通过，但补丁尚未部署；`a3cbe1a` 仅改进测试可移植性。生产版本与本轮证据分层见[验收说明](docs/acceptance.md)。

## 七步核心体验

1. 用自然语言描述一个小网页，创建应用。
2. 在隔离预览区实际操作生成结果。
3. 继续对话修改，逐轮保存代码版本。
4. 刷新后回到项目和已保存版本。
5. 查看历史版本，预览或还原指定版本。
6. 按需分享固定版本或更新稳定发布链接。
7. 导出独立 HTML，或备份后导入为新应用。

## 能力与边界

- 创建、讨论、候选比较、源码编辑、版本历史、运行诊断与主动修复。详细入口见[候选赛马](docs/candidates.md)、[源码与版本](docs/source-editor.md)、[讨论](docs/discussions.md)及[运行修复](docs/runtime-repair.md)。
- 项目和应用管理、偏好继承、分享、模板与备份；参见[管理](docs/workspace-api.md)、[设置](docs/settings.md)、[分享](docs/sharing.md)、[模板](docs/templates.md)和[备份](docs/backup.md)。
- 离线工作台可处理已缓存内容及有限示例；待同步内容由用户联网后手动同步，详见[离线工作台](docs/offline-workspace.md)。
- 示例模式使用固定预设，不代表真实模型生成。真实 AI 能力需要服务端模型配置和可用额度；自动与 HTTP Smoke 默认不调用模型。
- 应用是单文件 HTML。预览 iframe 不提供同源、弹窗、顶层导航或外部网络能力；不支持多文件工程、安装依赖或让生成应用读取服务端密钥。独立导出的 HTML 不再处于工作台 iframe 隔离范围内。

## 本地运行与验证

要求 Node.js 24（最低 22.13）和 npm。在仓库根目录干净安装：

```sh
npm ci
npm run build
npm test
npm run typecheck
```

新库迁移命令见[全新本地库步骤](docs/local-setup.md#全新本地库)；已有库只补未执行的迁移。HTTP Smoke 和数据安全边界见[本地启动说明](docs/local-setup.md)。

## 验证

自动测试、类型检查、HTTP 检查、浏览器操作和真实模型调用属于不同证据。测试通过不代表浏览器验收；示例 API 结果不代表真实模型质量。当前各项范围、结果和未完成检查见[验收说明](docs/acceptance.md#当前验收状态)。

## 数据与保密

共享模式中的访客共同查看和修改公共空间内容；不要在共享空间保存私人信息。只有应用显式通过运行数据 SDK 写入的键值会持久保存，普通 DOM 状态、表单输入和计时器不会自动保存。身份与数据模型见[共享运行数据](docs/shared-runtime.md)。

模型 Key 仅配置在服务端本地秘密文件或部署秘密变量中，不提交 Git、不写入公开报告或客户端。工作空间备份可能包含需求和源码；分享或公开前请检查标题与版本内容。
