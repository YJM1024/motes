import { ELEMENT_PROTOCOL } from './element-selection';
export function elementBridgeScript(channel:string,targetOrigin:string):string{
 if(!/^[a-f0-9]{32}$/.test(channel)||new URL(targetOrigin).origin!==targetOrigin)throw new Error('元素选择通道无效。');
 return `(() => {
 'use strict';const protocol=${JSON.stringify(ELEMENT_PROTOCOL)},channel=${JSON.stringify(channel)},targetOrigin=${JSON.stringify(targetOrigin)};
 let enabled=false,selected=null,selectedLocator=null,overlay=null,total=0,start=0,count=0;
 const blocked=['INPUT','TEXTAREA','SELECT','OPTION','SCRIPT','STYLE','IFRAME','HTML','HEAD'];
 function emit(value){const now=Date.now();if(now-start>1000){start=now;count=0;}if(++count>4||++total>100)return;window.parent.postMessage({protocol,channel,...value},targetOrigin);}
 function hide(){if(overlay)overlay.style.display='none';}
 function draw(element){if(!element||!element.isConnected){hide();return;}if(!overlay){overlay=document.createElement('div');overlay.setAttribute('data-motes-selection-overlay','');overlay.setAttribute('aria-hidden','true');document.documentElement.appendChild(overlay);}const box=element.getBoundingClientRect();overlay.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #5b7fc8;background:#5b7fc815;box-sizing:border-box;display:block;left:'+box.left+'px;top:'+box.top+'px;width:'+Math.max(0,box.width)+'px;height:'+Math.max(0,box.height)+'px;';}
 function locator(element){if(!(element instanceof HTMLElement)||!element.isConnected||blocked.includes(element.tagName)||element.hasAttribute('data-motes-selection-overlay'))return null;const parts=[];let current=element;while(current&&current!==document.body){if(parts.length>=16)return null;const tag=current.tagName.toLowerCase();if(!/^[a-z][a-z0-9-]{0,39}$/.test(tag))return null;let ordinal=1;for(let previous=current.previousElementSibling;previous;previous=previous.previousElementSibling)if(previous.tagName===current.tagName)ordinal++;parts.unshift(tag+':nth-of-type('+ordinal+')');current=current.parentElement;}if(current!==document.body)return null;const selector='body'+(parts.length?' > '+parts.join(' > '):'');return selector.length<=800?{selector,tag:element.tagName.toLowerCase()}:null;}
 function clear(kind){selected=null;selectedLocator=null;hide();emit({kind});}
 window.addEventListener('message',event=>{const data=event.data;if(event.source!==window.parent||event.origin!==targetOrigin||!data||data.protocol!==protocol||data.channel!==channel||data.kind!=='control'||typeof data.enabled!=='boolean')return;enabled=data.enabled;if(!enabled){selected=null;hide();}});
 document.addEventListener('pointermove',event=>{if(enabled&&!selected&&locator(event.target))draw(event.target);},true);
 document.addEventListener('click',event=>{if(!enabled)return;event.preventDefault();event.stopImmediatePropagation();const target=event.target,location=locator(target);if(!location){clear('invalidated');return;}selected=target;selectedLocator=location.selector;draw(selected);emit({kind:'selected',...location});},true);
 document.addEventListener('keydown',event=>{if(enabled&&event.key==='Escape'){event.preventDefault();enabled=false;clear('cleared');}},true);
 window.addEventListener('resize',()=>draw(selected));window.addEventListener('scroll',()=>{if(selected)draw(selected);else hide();},true);
 new MutationObserver(()=>{if(!selected)return;const location=locator(selected);if(!location||location.selector!==selectedLocator||document.querySelector(location.selector)!==selected){clear('invalidated');return;}draw(selected);}).observe(document.documentElement,{subtree:true,childList:true});
 })();`;
}
