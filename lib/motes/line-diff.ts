export type DiffLine = { kind:'same'|'added'|'removed'; text:string; left?:number; right?:number };
export type LineDiff = { lines:DiffLine[]; limited:boolean; coarse:boolean; added:number; removed:number };
const MAX_CHARS = 100000, MAX_LINES = 1400, MAX_CELLS = 350000;

/** Bounded LCS; large edits use an explicit coarse replacement, never O(n*m). */
export function compareLines(before:string, after:string):LineDiff {
  const split = (value:string) => value.slice(0,MAX_CHARS).split(/\r?\n/).slice(0,MAX_LINES);
  const a=split(before), b=split(after), lines:DiffLine[]=[];
  const limited=before.length>MAX_CHARS||after.length>MAX_CHARS||before.split(/\r?\n/).length>MAX_LINES||after.split(/\r?\n/).length>MAX_LINES;
  let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start]){lines.push({kind:'same',text:a[start],left:start+1,right:start+1});start++;}
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
  const n=endA-start,m=endB-start,coarse=(n+1)*(m+1)>MAX_CELLS;
  if(coarse){for(let i=start;i<endA;i++)lines.push({kind:'removed',text:a[i],left:i+1});for(let j=start;j<endB;j++)lines.push({kind:'added',text:b[j],right:j+1});}
  else {
    const width=m+1,table=new Uint16Array((n+1)*width);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i*width+j]=a[start+i]===b[start+j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
    let i=0,j=0;while(i<n||j<m){
      if(i<n&&j<m&&a[start+i]===b[start+j]){lines.push({kind:'same',text:a[start+i],left:start+i+1,right:start+j+1});i++;j++;}
      else if(i<n&&(j===m||table[(i+1)*width+j]>=table[i*width+j+1])){lines.push({kind:'removed',text:a[start+i],left:start+i+1});i++;}
      else{lines.push({kind:'added',text:b[start+j],right:start+j+1});j++;}
    }
  }
  for(let i=endA,j=endB;i<a.length&&j<b.length;i++,j++)lines.push({kind:'same',text:a[i],left:i+1,right:j+1});
  return {lines,limited,coarse,added:lines.filter(l=>l.kind==='added').length,removed:lines.filter(l=>l.kind==='removed').length};
}
