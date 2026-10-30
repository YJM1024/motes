import type {DiscussionTurn} from './discussion-types';
export const DISCUSSION_CONTEXT_LIMITS={turns:6,characters:12000,excerpt:180} as const;
export type DiscussionContextSummary={availableTurns:number;includedTurns:number;omittedTurns:number;characters:number;limit:12000;maxTurns:6;truncated:boolean;excerpts:{text:string;partial:boolean}[]};
/** The exact deterministic history selection used for the next discussion call. No summarizer or extra model. */
export function selectDiscussionContext(turns:Pick<DiscussionTurn,'status'|'prompt'|'reply'>[]):{text:string;summary:DiscussionContextSummary}{
 const completed=turns.filter(t=>t.status==='done'&&t.reply),selected=completed.slice(-DISCUSSION_CONTEXT_LIMITS.turns);let offset=0;
 const segments=selected.map(turn=>{const text='User: '+turn.prompt+'\nAssistant: '+turn.reply,start=offset;offset+=text.length+1;return {text,start,end:start+text.length};});
 const full=segments.map(s=>s.text).join('\n'),text=full.slice(-DISCUSSION_CONTEXT_LIMITS.characters),cutoff=Math.max(0,full.length-DISCUSSION_CONTEXT_LIMITS.characters),included=segments.filter(s=>s.end>cutoff);
 return {text,summary:{availableTurns:completed.length,includedTurns:included.length,omittedTurns:completed.length-included.length,characters:text.length,limit:12000,maxTurns:6,truncated:full.length>DISCUSSION_CONTEXT_LIMITS.characters,excerpts:included.map(s=>{const first=Math.max(0,cutoff-s.start),visible=s.text.slice(first);return {text:visible.slice(0,DISCUSSION_CONTEXT_LIMITS.excerpt)+(visible.length>DISCUSSION_CONTEXT_LIMITS.excerpt?'…':''),partial:first>0};})}};
}
