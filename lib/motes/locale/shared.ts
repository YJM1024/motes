/** Accurate copy for app operations in the shared demo workspace. */
export const sharedMessages = {
  '发布链接只展示所选已保存版本的标题和完整 HTML。公共工作空间中的项目、对话和其他版本也可被访客查看和修改；请勿放入私密内容。不会调用模型。': 'The publication link displays only the selected saved version’s title and full HTML. Visitors can also view and modify projects, discussions, and other versions in the public workspace; do not store private information here. No model is called.',
  '模板内容固定于来源版本。复制会创建公共演示应用，所有访客可见和修改；不会带入原应用的讨论、分享链接、应用设置或预览运行时输入。': 'Template content is fixed to its source version. Copying creates a public demo app visible and editable by all visitors; it does not copy the source app’s discussions, share links, app settings, or preview runtime input.',
  '已导入 {count} 个应用，均为公共演示副本，所有访客可见和修改。': 'Imported {count} apps as public demo copies visible and editable by all visitors.',
  'HTML 导出用于独立运行；JSON 备份保存应用与历史，恢复后会成为公共演示副本，所有访客可见和修改。不会保存账号凭据、模型密钥或分享链接。': 'HTML exports can run independently. JSON backups preserve apps and history; restored copies become public demo apps visible and editable by all visitors. Account credentials, model keys, and share links are not saved.',
  '确认导入这些应用为公共演示应用；所有访客可见和修改': 'Confirm import as public demo apps visible and editable by all visitors',
  '导入已完成，可关闭此窗口查看新的公共演示项目。所有访客可见和修改。': 'Import is complete. Close this window to view the new public demo project, visible and editable by all visitors.'
} as const;
