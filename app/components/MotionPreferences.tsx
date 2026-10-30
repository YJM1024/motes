"use client";

import { useMotionPreference } from './MotionPreferenceProvider';
import './motion-preferences-panel.css';

export default function MotionPreferences() {
  const { preference, setPreference, storageUnavailable } = useMotionPreference();
  return <section className="motion-preferences settings-section" aria-labelledby="motion-preferences-title">
    <h3 id="motion-preferences-title">界面动效与快捷键</h3>
    <p className="motion-description">这是本浏览器的界面偏好，只影响工作台页面，不改变你创建的应用。生成语言用于应用内容；工作台界面目前为简体中文，选择 English 只会影响新应用的默认生成语言。</p>
    <fieldset>
      <legend>动效偏好</legend>
      <label><input type="radio" name="motion-preference" value="system" checked={preference === 'system'} onChange={() => setPreference('system')}/>跟随系统</label>
      <label><input type="radio" name="motion-preference" value="reduced" checked={preference === 'reduced'} onChange={() => setPreference('reduced')}/>减少过渡</label>
    </fieldset>
    <p className="motion-description">跟随系统时遵从设备的“减少动态效果”设置。减少过渡会缩短装饰性动画与滚动过渡，不会关闭功能；系统级减少动态效果仍然生效。</p>
    {storageUnavailable && <p className="motion-storage-warning" role="status">浏览器本地存储不可用，此偏好仅在当前页面会话中生效。</p>}
    <div className="motion-shortcuts"><h4>已支持的快捷键</h4><dl>
      <dt><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></dt><dd>在创作需求框，或已连接模型时的讨论框中发送。</dd>
      <dt><kbd>Esc</kbd></dt><dd>在创作页关闭打开的源码或历史面板、收起侧栏；在源码查找框中清除查找并返回编辑器。其他面板按其当前焦点关闭。</dd>
    </dl><p>快捷键固定与当前操作一致，暂不支持自定义。</p></div>
  </section>;
}
