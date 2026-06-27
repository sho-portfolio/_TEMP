import React from "react";

/* Four-tier flow EXPANDED: Finance -> ALM (split into outputs) -> downstream domains
   (each split into its individual balance-sheet views) -> per-domain metrics.
   CCAR parallel (bypass). ALCO feedback loop. Static SVG. */

const INK="#0f2238", MUTED="#5b6675", LINE="#d8dde4", PAPER="#f6f7f9";
const SERIF="Georgia,'Times New Roman',serif";
const SANS="ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO="ui-monospace,Menlo,Consolas,monospace";
const GREEN="#4f8a5b", GREY="#8b95a1", SLATE="#5b6c8f";
const DCOL={ CAPITAL:"#9a6a4b", LIQUIDITY:"#2f7d8c", IRRBB:"#3f8061", CCAR:"#6f6299" };
const CIO="#b1843e";
const MK={ CAPITAL:"url(#ahCap)", LIQUIDITY:"url(#ahLiq)", IRRBB:"url(#ahIrr)", CCAR:"url(#ahCcr)" };

const ALM=[
  { id:"DX16", name:"Rate / Curve Forecast",    y:120 },
  { id:"DX20", name:"NII / Earnings Forecast",  y:162 },
  { id:"DX17", name:"Structural Balance Sheet", y:218 },
  { id:"DX19", name:"BAU Cash Flows",           y:322 },
];
const almMid=(id)=>{ const a=ALM.find(x=>x.id===id); return a.y+16; };

const GROUPS=[
  { dom:"CAPITAL", head:"Capital — 1 path on ALM's B/S (+ stressed)", metrics:"CET1 path · SLR · TLAC", bs:true, nodes:[
    { name:"Capital forecast — CET1 path", hz:"~36m (9q)", src:"DX16·DX17·DX20", alm:["DX16","DX17","DX20"] },
    { name:"Stressed capital path", hz:"9 quarters", src:"CCAR", alm:[], ext:true },
  ]},
      { dom:"LIQUIDITY", head:"Liquidity — 5 distinct stressed views", metrics:"LCR · NSFR · Survival · Struct. gap", bs:false, nodes:[
    { name:"Short-term LST / survival", hz:"≤12m survival", src:"DX19 + current B/S", alm:["DX19"] },
    { name:"Structural / long-term LST", hz:"1–3 years", src:"DX17 + current B/S", alm:["DX17"] },
    { name:"LCR — 30-day acute stress", hz:"30 days", src:"current B/S", alm:[], pos:true },
    { name:"NSFR — 1-year structural", hz:"1 year", src:"current B/S", alm:[], pos:true },
    { name:"Intraday liquidity", hz:"intraday", src:"current B/S", alm:[], pos:true },
  ]},
  { dom:"IRRBB", head:"IRRBB — no B/S: EVE (PV) + NII", metrics:"ΔEVE · ΔNII · Repricing gap", bs:false, nodes:[
    { name:"EVE — PV runoff (point-in-time)", hz:"point-in-time", src:"DX19", alm:["DX19"] },
    { name:"NII sensitivity (going concern)", hz:"12–24m", src:"DX19", alm:["DX19"] },
  ]},
  { dom:"CCAR", head:"CCAR — 3 scenarios (own engine)", metrics:"Post-stress CET1 · SCB · PPNR", bs:true, nodes:[
    { name:"Baseline projection", hz:"9 quarters", src:"own engine", alm:[], ext:true },
    { name:"Adverse projection", hz:"9 quarters", src:"own engine", alm:[], ext:true },
    { name:"Severely-adverse projection", hz:"9 quarters", src:"own engine", alm:[], ext:true },
  ]},
];

const NX=376, NW=276, NH=38, NGAP=6, HEAD=18, GGAP=16;
let cur=30; const LAID=[];
for (const g of GROUPS){
  const headerY=cur; cur+=HEAD;
  const nodes=g.nodes.map(n=>{ const y=cur; cur+=NH+NGAP; return {...n,y}; });
  const endY=cur-NGAP; const midY=(headerY+endY)/2;
  cur+=GGAP;
  LAID.push({...g,headerY,nodes,midY});
}
const TOTAL=cur+6;
const MXX=672, MW=270, MH=52;

function FBox({y,t,s}){return(<g>
  <rect x={14} y={y} width={108} height={36} rx={6} fill="#0f2238"/>
  <text x={68} y={y+16} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill="#fff">{t}</text>
  <text x={68} y={y+28} textAnchor="middle" fontFamily={SANS} fontSize="7.5" fill="rgba(255,255,255,.7)">{s}</text>
</g>);}

export default function App(){
  return (
    <div style={{background:PAPER,minHeight:"100%",padding:"24px",fontFamily:SANS,color:INK}}>
      <div style={{maxWidth:1020,margin:"0 auto"}}>
        <h1 style={{fontFamily:SERIF,fontWeight:600,fontSize:22,margin:"0 0 4px"}}>Finance → ALM outputs → each domain{"\u2019"}s balance sheets → metrics</h1>
        <p style={{color:MUTED,fontSize:13,margin:"0 0 14px",lineHeight:1.5,maxWidth:860}}>
          The four-tier flow, now with each downstream domain split into the individual views it builds. Liquidity is five, not one — and only
          two take an ALM input. Colored node = fed by an ALM output (arrow shows which); dashed node = the current balance sheet (actuals) or an own engine — LCR/NSFR/intraday start from today{"\u2019"}s B/S, not ALM{"\u2019"}s forecast. CIO/Portfolio (gold) sits upstream — it marks and feeds the balance sheet and sends AOCI/CECL into Capital, rather than consuming ALM{"\u2019"}s forecast.
        </p>

        <div style={{background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:"12px 14px"}}>
          <svg viewBox={`0 0 980 ${TOTAL}`} style={{width:"100%",height:"auto",display:"block"}}>
            <defs>
              <marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={MUTED}/></marker>
              <marker id="ahg" markerWidth="10" markerHeight="10" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 Z" fill={GREEN}/></marker>
              <marker id="ahgS" markerWidth="10" markerHeight="10" refX="1" refY="3.2" orient="auto"><path d="M7,0 L0,3.2 L7,6.4 Z" fill={GREEN}/></marker>
              <marker id="ahCap" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={DCOL.CAPITAL}/></marker>
              <marker id="ahLiq" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={DCOL.LIQUIDITY}/></marker>
              <marker id="ahIrr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={DCOL.IRRBB}/></marker>
              <marker id="ahCcr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={DCOL.CCAR}/></marker>
              <marker id="ahCio" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={CIO}/></marker>
            </defs>

            <text x={68} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>FINANCE</text>
            <text x={228} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>ALM OUTPUTS</text>
            <text x={NX+NW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>DOMAIN BALANCE SHEETS</text>
            <text x={MXX+MW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>METRICS</text>

            {/* Finance */}
            <text x={14} y={108} fontFamily={SANS} fontSize="8.5" fontWeight={700} fill={GREEN}>PLAN</text>
            <FBox y={114} t="Plan Balance Sheet" s="projected"/>
            <FBox y={156} t="Plan Income" s="projected"/>
            <text x={14} y={384} fontFamily={SANS} fontSize="8.5" fontWeight={700} fill={GREY}>BASE</text>
            <FBox y={390} t="Actuals Balance Sheet" s="reported"/>
            <FBox y={432} t="Actuals Income" s="reported"/>

            {/* ALM container */}
            {ALM.map(o=>(
              <g key={o.id}>
                <rect x={160} y={o.y} width={140} height={32} rx={6} fill="#fff" stroke={LINE}/>
                <text x={170} y={o.y+13} fontFamily={MONO} fontSize="8.5" fontWeight={700} fill={SLATE}>{o.id}</text>
                <text x={170} y={o.y+25} fontFamily={SANS} fontSize="8.5" fill={INK}>{o.name}</text>
              </g>
            ))}

            {/* Finance -> ALM */}
            {/* variance bridge: Plan B/S and Plan Income BOTH reconcile to ALM (B/S + NII) */}
            <path d="M122,138 C142,150 150,212 160,234" fill="none" stroke={GREEN} strokeWidth={2} markerStart="url(#ahgS)" markerEnd="url(#ahg)"/>
            <path d="M122,174 C140,176 150,178 160,178" fill="none" stroke={GREEN} strokeWidth={2} markerStart="url(#ahgS)" markerEnd="url(#ahg)"/>
            <text x={52} y={102} fontFamily={SANS} fontSize="8" fontWeight={700} fill={GREEN}>variance → plan (B/S + NII)</text>
            <path d="M122,408 L150,408 L150,178" fill="none" stroke={GREY} strokeWidth={1.4} strokeDasharray="4 3"/>
            <line x1={150} y1={178} x2={160} y2={178} stroke={GREY} strokeWidth={1.4} strokeDasharray="4 3" markerEnd="url(#ah)"/>
            <line x1={150} y1={234} x2={160} y2={234} stroke={GREY} strokeWidth={1.4} strokeDasharray="4 3" markerEnd="url(#ah)"/>
            <line x1={150} y1={338} x2={160} y2={338} stroke={GREY} strokeWidth={1.4} strokeDasharray="4 3" markerEnd="url(#ah)"/>
            <text x={126} y={400} fontFamily={SANS} fontSize="8" fontWeight={600} fill={GREY}>opening tie</text>

            {/* ALM output -> specific sub-node */}
            {LAID.flatMap(g=>g.nodes.flatMap(n=>(n.alm||[]).map(aid=>{
              const x1=300, y1=almMid(aid), x2=NX, y2=n.y+19, mx=(x1+x2)/2;
              return <path key={aid+n.name} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none"
                stroke={DCOL[g.dom]} strokeWidth={1.6} opacity={0.8} markerEnd={MK[g.dom]}/>;
            })))}

            {/* CCAR bypass */}
            {(()=>{ const g=LAID.find(x=>x.dom==="CCAR"); const ty=g.nodes[0].y+15;
              return <g>
                <path d={`M122,450 C240,${ty} 300,${ty} ${NX},${ty}`} fill="none" stroke={DCOL.CCAR} strokeWidth={1.8} strokeDasharray="6 4" markerEnd="url(#ahCcr)"/>
                <text x={150} y={g.headerY-4} fontFamily={SANS} fontSize="8" fontWeight={600} fill={DCOL.CCAR}>Finance → CCAR (bypasses ALM)</text>
              </g>; })()}


            {/* groups + sub-nodes */}
            {LAID.map(g=>(
              <g key={g.dom}>
                <text x={NX} y={g.headerY+12} fontFamily={SANS} fontSize="10" fontWeight={700} fill={DCOL[g.dom]}>{g.head}</text>
                {g.nodes.map(n=>{
                  const fed=(n.alm||[]).length>0;
                  return (
                    <g key={n.name}>
                      <rect x={NX} y={n.y} width={NW} height={NH} rx={6} fill="#fff" stroke={fed?DCOL[g.dom]:GREY} strokeWidth={fed?1.5:1} strokeDasharray={fed?"0":"4 3"}/>
                      <rect x={NX} y={n.y} width={4} height={NH} rx={2} fill={fed?DCOL[g.dom]:GREY}/>
                      <text x={NX+12} y={n.y+16} fontFamily={SANS} fontSize="9.5" fontWeight={fed?600:500} fill={INK}>{n.name}</text>
                      <rect x={NX+12} y={n.y+22} width={n.hz.length*4.7+12} height={13} rx={6.5} fill="#eef1f4"/>
                      <text x={NX+18} y={n.y+31} fontFamily={SANS} fontSize="8" fontWeight={600} fill={MUTED}>{n.hz}</text>
                      <text x={NX+NW-8} y={n.y+31} textAnchor="end" fontFamily={SANS} fontSize="7.5" fontStyle="italic" fill={fed?DCOL[g.dom]:MUTED}>{"\u2190"+n.src}</text>
                    </g>
                  );
                })}
                {/* group -> metrics */}
                <line x1={NX+NW} y1={g.midY} x2={MXX} y2={g.midY} stroke={DCOL[g.dom]} strokeWidth={1.8} strokeDasharray={g.bs?"0":"5 4"} markerEnd={MK[g.dom]}/>
                <rect x={MXX} y={g.midY-MH/2} width={MW} height={MH} rx={8} fill="#fff" stroke={LINE}/>
                <rect x={MXX} y={g.midY-MH/2} width={5} height={MH} rx={2} fill={DCOL[g.dom]}/>
                <text x={MXX+13} y={g.midY-6} fontFamily={SANS} fontSize="11" fontWeight={700} fill={DCOL[g.dom]}>{g.dom==="CAPITAL"?"Capital":g.dom==="LIQUIDITY"?"Liquidity":g.dom}</text>
                <rect x={MXX+MW-58} y={g.midY-MH/2+7} width={46} height={14} rx={7} fill={g.bs?"#e9f3ec":"#fff"} stroke={g.bs?"none":GREY} strokeDasharray={g.bs?"0":"2 2"}/>
                <text x={MXX+MW-35} y={g.midY-MH/2+17} textAnchor="middle" fontFamily={SANS} fontSize="8" fontWeight={700} fill={g.bs?GREEN:GREY}>{g.bs?"B/S":"no B/S"}</text>
                <text x={MXX+13} y={g.midY+12} fontFamily={SANS} fontSize="9.5" fill={INK}>{g.metrics}</text>
              </g>
            ))}
            {/* CIO / Portfolio — upstream source (not an ALM consumer) */}
            <rect x={14} y={44} width={292} height={50} rx={8} fill="#f4f5f6" stroke={GREY} strokeWidth={1} strokeDasharray="4 3"/>
            <rect x={14} y={44} width={5} height={50} rx={2} fill={GREY}/>
            <text x={26} y={60} fontFamily={SANS} fontSize="10.5" fontWeight={700} fill={MUTED}>CIO / Portfolio (securities book)  ·  tentative — pending SME</text>
            <text x={26} y={73} fontFamily={SANS} fontSize="8.5" fill={MUTED}>Upstream source — marks & feeds the B/S; not an ALM consumer</text>
            <text x={26} y={87} fontFamily={SANS} fontSize="8.5" fontWeight={600} fill={MUTED}>→ B/S · HQLA · RWA · repricing   ·   → Capital (AOCI + CECL)</text>
            <path d="M110,94 C120,102 138,104 152,107" fill="none" stroke={GREY} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6} markerEnd="url(#ah)"/>
            <path d="M306,69 C332,69 352,68 374,68" fill="none" stroke={GREY} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.6} markerEnd="url(#ah)"/>
            {(()=>{ const g=LAID.find(x=>x.dom==="LIQUIDITY"); const sp=g.nodes.filter(n=>n.pos);
              const TKX=320, AY=408, topY=Math.min(...sp.map(n=>n.y+NH/2));
              return <g>
                <path d={`M122,${AY} L${TKX},${AY} L${TKX},${topY}`} fill="none" stroke={GREY} strokeWidth={1.3} strokeDasharray="3 3"/>
                {sp.map((n,i)=><line key={i} x1={TKX} y1={n.y+NH/2} x2={NX} y2={n.y+NH/2} stroke={GREY} strokeWidth={1.3} strokeDasharray="3 3" markerEnd="url(#ah)"/>)}
                <text x={TKX+6} y={topY-6} fontFamily={SANS} fontSize="8" fontWeight={600} fill={MUTED}>current B/S = actuals</text>
              </g>; })()}
          </svg>
        </div>

        <div style={{display:"flex",flexWrap:"wrap",gap:14,marginTop:14,alignItems:"center"}}>
          {[[DCOL.CAPITAL,"Capital"],[DCOL.LIQUIDITY,"Liquidity"],[DCOL.IRRBB,"IRRBB"],[DCOL.CCAR,"CCAR"],[GREY,"CIO / Portfolio (tentative — pending SME)"]].map(([c,l])=>(
            <span key={l} style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:SANS,fontSize:11,color:MUTED}}>
              <span style={{width:12,height:12,borderRadius:3,background:c}}/>{l}</span>
          ))}
          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:SANS,fontSize:11,color:MUTED}}>
            <span style={{width:12,height:12,borderRadius:3,border:`1.5px dashed ${GREY}`,boxSizing:"border-box"}}/>built from current B/S (actuals) / own engine
          </span>
          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:SANS,fontSize:11,color:MUTED}}>
            <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke={INK} strokeWidth="2" strokeDasharray="5 4"/></svg>metric not B/S-based
          </span>
        </div>
      </div>
    </div>
  );
}
