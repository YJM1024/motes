"use client";
import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {RaceController} from '@/lib/motes/race-controller';
export function useInlineRace(scope:string){
  const controller=useMemo(()=>{let storage:Storage|undefined;try{if(typeof window!=='undefined')storage=window.sessionStorage}catch{}return new RaceController('motes-inline-race:'+scope,storage)},[scope]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{controller.activate();void controller.restore();return()=>controller.dispose()},[controller]);
  const needsPoll=!!state.pending||!!state.retry||!!state.group?.candidates.some(c=>c.status==='running');
  useEffect(()=>{if(state.paused||!needsPoll||state.restoring)return;let checks=0;let inFlight=false;const timer=setInterval(()=>{if(inFlight)return;if(checks++>=80){clearInterval(timer);controller.stop();return}inFlight=true;void controller.check().finally(()=>{inFlight=false})},2500);return()=>clearInterval(timer)},[controller,needsPoll,state.paused,state.restoring]);
  return {controller,state,blocked:controller.blocked};
}
