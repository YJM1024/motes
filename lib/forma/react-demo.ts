import {createReactProject, parseReactProject} from '../motes/react-project';

const marker = /\/\* forma-react-demo:kind=(budget|tasks|timer);theme=(light|dark);color=(purple|blue|green);amount=(\d+) \*\//;
const supported = /旅行|预算|budget|travel|番茄|计时|pomodoro|timer|任务|看板|todo|kanban/i;
const themeOrBudget = /深色|暗色|dark|浅色|亮色|light|紫|purple|绿|green|蓝|blue|预算|上限|budget/i;

function makeApp(kind: string, theme: string, color: string, amount: string): string {
  const accent = color === 'blue' ? 'blue' : color === 'green' ? 'emerald' : 'violet';
  const root = theme === 'dark' ? 'min-h-screen bg-slate-950 text-slate-100' : 'min-h-screen bg-violet-50 text-slate-800';
  const card = theme === 'dark' ? 'rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm' : 'rounded-2xl border border-violet-100 bg-white p-5 shadow-sm';
  const button = `rounded-xl bg-${accent}-600 px-4 py-2.5 font-semibold text-white transition hover:bg-${accent}-700 disabled:opacity-50`;
  const input = `w-full rounded-xl border border-violet-200 bg-transparent px-3 py-2.5 outline-none focus:border-${accent}-500 focus:ring-2 focus:ring-${accent}-200`;
  const metadata = `/* forma-react-demo:kind=${kind};theme=${theme};color=${color};amount=${amount} */`;
  const initial = kind === 'budget' ? `{limit:${Number(amount)},expenses:[800,1200,600,400]}` : kind === 'tasks' ? "[{text:'整理本周灵感',status:0},{text:'完成首页草图',status:1},{text:'喝一杯水',status:2}]" : '{duration:1500,remaining:1500,running:false,endsAt:null}';
  const validator = kind === 'budget' ? "v=>v&&Number.isFinite(v.limit)&&v.limit>0&&Array.isArray(v.expenses)&&v.expenses.length===4&&v.expenses.every(n=>Number.isFinite(n)&&n>=0)" : kind === 'tasks' ? "v=>Array.isArray(v)&&v.every(t=>t&&typeof t.text==='string'&&[0,1,2].includes(t.status))" : "v=>v&&Number.isInteger(v.duration)&&v.duration>=60&&Number.isFinite(v.remaining)&&v.remaining>=0&&typeof v.running==='boolean'&&(!v.running||Number.isFinite(v.endsAt))";
  const common = `const key = ${JSON.stringify(kind === 'budget' ? 'demo.budget.v1' : kind === 'tasks' ? 'demo.tasks.v1' : 'demo.timer.v1')};
  const state=window.motes.usePersistentState(key,${initial},${validator});
  const ready=!state.blocked,busy=state.saving,locked=['error','conflict'].includes(state.phase),message=state.message;
  const shell = '${root}'; const panel = '${card}'; const action = '${button}'; const field = '${input}';`;
  let component = '';
  if (kind === 'budget') component = `const [draft,setDraft]=useState(null),{limit,expenses}=draft??state.value;
  const setLimit=limit=>setDraft({...draft??state.value,limit}),setExpenses=expenses=>setDraft({...draft??state.value,expenses});
  function save(value){if(state.update(value))setDraft(null)}
  function reload(){setDraft(null);void state.reload()}
  const total=expenses.reduce((a,b)=>a+b,0),remaining=limit-total;
  return <main className={shell}><div className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><header className="mb-8"><p className="text-sm font-bold tracking-widest text-violet-500">MOTES · 本地固定 React 示例 · 不调用 AI</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">下一站，心之所向</h1><p className="mt-2 text-slate-500">旅行预算计算器 · 调整金额后实时计算并显式保存</p></header><section className={panel}><label className="block text-sm font-semibold">旅行预算上限（元）<input disabled={!ready} className={field+" mt-2"} type="number" min="1" value={limit} onChange={e=>setLimit(Math.max(1,Number(e.target.value)||1))}/></label><div className="mt-5 grid gap-4 sm:grid-cols-2">{['交通','住宿','餐饮','玩乐'].map((name,i)=><label key={name} className="text-sm font-medium">{name}（元）<input disabled={!ready} className={field+" mt-2"} type="number" min="0" value={expenses[i]} onChange={e=>setExpenses(expenses.map((n,j)=>j===i?Math.max(0,Number(e.target.value)||0):n))}/></label>)}</div><div className="mt-6 rounded-xl bg-violet-50 p-4"><p className="text-sm text-slate-500">已计划</p><p className="text-3xl font-bold text-violet-700">¥ {total.toLocaleString()}</p><p className="mt-1 text-sm">{remaining>=0?'剩余预算':'超出预算'} ¥ {Math.abs(remaining).toLocaleString()}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-200"><div className="h-full bg-violet-600" style={{width:Math.min(100,total/limit*100)+'%'}}/></div></div><button className={action+" mt-5"} disabled={!ready||busy||locked} onClick={()=>save({limit,expenses})}>保存预算</button></section><Status message={message} onReload={locked?reload:undefined}/></div></main>`;
  else if (kind === 'tasks') component = `const tasks=state.value,[draft,setDraft]=useState('');
  function update(next){return state.update(next)}
  function reload(){void state.reload()}
  const labels=['待开始','进行中','已完成'];
  return <main className={shell}><div className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><header className="mb-8"><p className="text-sm font-bold tracking-widest text-violet-500">MOTES · 本地固定 React 示例 · 不调用 AI</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">让每一件小事，向前一步</h1><p className="mt-2 text-slate-500">任务看板 · 添加任务、推进进度或删除已完成事项</p></header><form className={panel+" mb-5 flex flex-col gap-3 sm:flex-row"} onSubmit={e=>{e.preventDefault();const text=draft.trim();if(text&&update([...tasks,{text,status:0}]))setDraft('')}}><input disabled={!ready} className={field} maxLength={120} placeholder="添加一个新任务…" value={draft} onChange={e=>setDraft(e.target.value)}/><button disabled={!ready} className={action}>添加任务 +</button></form><div className="grid gap-4 md:grid-cols-3">{labels.map((label,status)=><section className={panel} key={label}><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">{label}</h2><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700">{tasks.filter(t=>t.status===status).length}</span></div><div className="space-y-3">{tasks.map((task,index)=>task.status===status&&<article className="rounded-xl border border-violet-100 p-3" key={index}><p className="font-medium">{task.text}</p><button disabled={!ready} className="mt-3 text-sm font-semibold text-violet-700" onClick={()=>update(status===2?tasks.filter((_,i)=>i!==index):tasks.map((t,i)=>i===index?{...t,status:status+1}:t))}>{status===2?'删除':'下一步 →'}</button></article>)}</div></section>)}</div><Status message={message} onReload={locked?reload:undefined}/></div></main>`;
  else component = `const {duration,running:storedRunning,endsAt}=state.value,[now,setNow]=useState(Date.now());
  const remaining=storedRunning?Math.max(0,Math.ceil((endsAt-now)/1000)):state.value.remaining,running=storedRunning&&remaining>0;
  useEffect(()=>{if(!storedRunning)return;const id=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(id)},[storedRunning,endsAt]);
  function persist(nextDuration,nextRemaining,nextRunning=false,nextEnd=0){setNow(Date.now());state.update({duration:nextDuration,remaining:nextRemaining,running:nextRunning,endsAt:nextRunning?nextEnd:null})}
  function reload(){void state.reload()}
  const clock=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
  return <main className={shell}><div className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><header className="mb-8"><p className="text-sm font-bold tracking-widest text-violet-500">MOTES · 本地固定 React 示例 · 不调用 AI</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">专注，从这一刻开始</h1><p className="mt-2 text-slate-500">番茄钟 · 为重要的事情留出时间</p></header><section className={panel+" text-center"}><div className="flex justify-center gap-3"><button disabled={!ready} className={action} onClick={()=>{persist(1500,1500)}}>专注 25 分钟</button><button disabled={!ready} className="rounded-xl border border-violet-200 px-4 py-2.5 font-semibold" onClick={()=>{persist(300,300)}}>休息 5 分钟</button></div><div role="timer" className="my-8 text-7xl font-bold tracking-tight text-violet-700 sm:text-8xl">{clock}</div><p className="mb-5 text-slate-500">{running?'保持专注，你做得很好':remaining===0?'这一段已完成，给自己一点掌声！':'准备好，开始一段专注'}</p><button className={action+" mr-2"} disabled={!ready||busy||locked} onClick={()=>{if(running){const left=Math.max(0,Math.ceil((endsAt-Date.now())/1000));persist(duration,left)}else{const left=remaining||duration,next=Date.now()+left*1000;persist(duration,left,true,next)}}}>{running?'暂停':'开始专注'}</button><button disabled={!ready} className="rounded-xl border border-violet-200 px-4 py-2.5 font-semibold" onClick={()=>{persist(duration,duration)}}>重置</button></section><Status message={message} onReload={locked?reload:undefined}/></div></main>`;
  return `/* ${metadata.slice(3,-3)} */\nimport React,{useState,useEffect} from 'react';\nfunction Status({message,onReload}){return <div><p role="status" aria-live="polite" className="mt-5 rounded-xl bg-white/80 px-4 py-3 text-sm text-slate-600">{message}</p>{onReload&&<button onClick={onReload}>重新读取（替换本页内容）</button>}</div>}\nexport default function App(){\n  ${common}\n  ${component}\n}\n`;
}

export function generateReactDemo(prompt: string, baseHtml?: string): {html:string;title:string;summary:string} {
  const project = baseHtml ? parseReactProject(baseHtml) : null;
  const previous = project?.files['src/App.jsx'].match(marker);
  const kind = previous?.[1] ?? (/番茄|计时|pomodoro|timer/i.test(prompt) ? 'timer' : /任务|看板|todo|kanban/i.test(prompt) ? 'tasks' : 'budget');
  if (!previous && !supported.test(prompt)) throw new Error('示例模式只支持旅行预算计算器、任务看板和番茄钟。请选择一个示例；自由需求需要连接模型。');
  if (previous && !themeOrBudget.test(prompt)) throw new Error('这项修改超出示例模式能力。当前可切换深浅主题、紫/蓝/绿色；预算示例还可修改预算上限。自由修改请连接模型。');
  const theme = /深色|暗色|dark/i.test(prompt) ? 'dark' : /浅色|亮色|light/i.test(prompt) ? 'light' : previous?.[2] ?? 'light';
  const color = /蓝|blue/i.test(prompt) ? 'blue' : /绿|green/i.test(prompt) ? 'green' : /紫|purple/i.test(prompt) ? 'purple' : previous?.[3] ?? 'purple';
  const amount = prompt.match(/(?:预算|上限|budget)[^\d]{0,8}(\d{1,7})/i)?.[1] ?? previous?.[4] ?? '5000';
  const title = kind === 'budget' ? '旅行预算计算器' : kind === 'tasks' ? '我的任务看板' : '专注番茄钟';
  const files = {'src/App.jsx':makeApp(kind,theme,color,amount),'src/index.css':"@import 'tailwindcss';\n"};
  return {html:createReactProject(files),title,summary:previous?'已应用示例支持的主题或预算设置；其他自由需求需要连接模型。':'已创建可操作的本地固定 React 示例；此模式不调用 AI。'};
}
