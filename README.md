import React, { useState } from "react";

/* Four-tier flow EXPANDED: Finance -> ALM (split into outputs) -> downstream domains
   (each producing its own view derived from the B/S) -> per-domain metrics.
   CCAR parallel (bypass). ALCO feedback loop. Static SVG. */

const INK="#0f2238", MUTED="#5b6675", LINE="#d8dde4", PAPER="#f6f7f9";
const SERIF="Georgia,'Times New Roman',serif";
const SANS="ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO="ui-monospace,Menlo,Consolas,monospace";
const GREEN="#4f8a5b", GREY="#8b95a1", SLATE="#5b6c8f";
const FCOL="#3f6ea5";
const SPOTCOL="#2f8f8a";
const DOMC="#2563eb";

const ALM=[
  { id:"DX16", name:"Rate / Curve Forecast",    y:120 },
  { id:"DX20", name:"NII / Earnings Forecast",  y:176, base:true, stmt:"P&L · NII" },
  { id:"DX17", name:"Structural Balance Sheet", y:232, base:true, stmt:"B/S" },
  { id:"DX19", name:"BAU Cash Flows",           y:312, base:true, stmt:"CF" },
];
const almMid=(id)=>{ const a=ALM.find(x=>x.id===id); return a.y+23; };

const GROUPS=[
  { dom:"CAPITAL", head:"CAPITAL", bs:true, nodes:[
    { name:"Capital forecast — CET1 path", hz:"~36m (9q)", src:"DX16·DX17·DX20", alm:["DX16","DX17","DX20"], base:true, met:"CET1 path · SLR · TLAC", ref:"DX21" },
    { name:"Stressed capital path", hz:"9 quarters", src:"CCAR sev-adv", alm:[], ext:true, stress:true, met:"Stressed CET1 path", ref:"DX10" },
  ]},
      { dom:"LIQUIDITY", head:"LIQUIDITY", bs:false, nodes:[
    { name:"Short-term LST / survival", hz:"≤12m survival", src:"DX19 + current B/S", alm:["DX19"], stress:true, met:"Survival horizon · NCO", ref:"DX02", stmt:"CF" },
    { name:"Spot LST — daily survival", hz:"daily · spot", src:"spot positions (datamart)", alm:[], pos:true, stress:true, met:"Spot survival horizon · spot NCO", ref:"DX02", stmt:"CF" },
    { name:"Structural / long-term LST", hz:"1–3 years", src:"DX17 + current B/S", alm:["DX17"], stress:true, met:"Structural funding gap", ref:"DX03", stmt:"CF" },
    { name:"LCR — 30-day acute stress", hz:"30 days", src:"current B/S · op/non-op", alm:[], pos:true, stress:true, met:"LCR", ref:"DX05", stmt:"CF" },
    { name:"NSFR — 1-year structural", hz:"1 year", src:"current B/S · op/non-op", alm:[], pos:true, met:"NSFR", bs:"struct", ref:"DX05" },
    { name:"Intraday liquidity", hz:"intraday", src:"current B/S", alm:[], pos:true, met:"Intraday peak", gap:true, stmt:"CF" },
  ]},
  { dom:"IRRBB", head:"IRRBB", bs:false, nodes:[
    { name:"EVE — PV runoff (point-in-time)", hz:"point-in-time", src:"DX19", alm:["DX19"], stress:true, bs:"PV", met:"ΔEVE", ref:"DX11" },
    { name:"NII sensitivity (going concern)", hz:"12–24m", src:"DX19", alm:["DX19"], stress:true, met:"ΔNII · Repricing gap", ref:"DX12", stmt:"P&L · NII" },
  ]},
  { dom:"CCAR", head:"CCAR", bs:true, nodes:[
    { name:"Baseline projection", hz:"9 quarters", src:"own engine", alm:[], ext:true, base:true, met:"PPNR · CET1 (base)", ref:"CCAR-M03" },
    { name:"Adverse projection", hz:"9 quarters", src:"own engine", alm:[], ext:true, stress:true, met:"Post-stress CET1 (adv)", ref:"CCAR-M03" },
    { name:"Severely-adverse projection", hz:"9 quarters", src:"own engine", alm:[], ext:true, stress:true, met:"Post-stress CET1 · SCB", ref:"CCAR-M03" },
  ]},
];

const NX=462, NW=240, NH=46, NGAP=6, HEAD=18, GGAP=16;
let cur=30; const LAID=[];
for (const g of GROUPS){
  const headerY=cur; cur+=HEAD;
  const nodes=g.nodes.map(n=>{ const y=cur; cur+=NH+NGAP; return {...n,y}; });
  cur+=GGAP;
  LAID.push({...g,headerY,nodes});
}
const TOTAL=cur+6;
const MXX=740, MBW=160, MH2=14, MG=4;
const METMAP={
  "CET1 path · SLR · TLAC":[["CET1 path","CAP-K01"],["Tier 1 / Total","CAP-K02"],["RWA","CAP-K03"],["SLR","CAP-K04"],["TLAC","CAP-K06"]],
  "Stressed CET1 path":[["Stressed CET1 path","CCAR-K05",1]],
  "Survival horizon · NCO":[["Survival horizon","LIQ-K04"],["NCO","LIQ-K07"]],
  "Spot survival horizon · spot NCO":[["Spot survival horizon","LIQ-K11",1],["Spot NCO","LIQ-K12",1]],
  "Structural funding gap":[["Structural funding gap","LIQ-K10"]],
  "LCR":[["LCR","LIQ-K01"]],
  "NSFR":[["NSFR","LIQ-K02"]],
  "Intraday peak":[["Intraday peak","LIQ-K09",1]],
  "ΔEVE":[["ΔEVE","IRRBB-K01"]],
  "ΔNII · Repricing gap":[["ΔNII","IRRBB-K02"],["Repricing gap","IRRBB-K03"]],
  "PPNR · CET1 (base)":[["PPNR","CCAR-K02"],["CET1 (base)","CCAR-K05",1]],
  "Post-stress CET1 (adv)":[["Post-stress CET1 (adv)","CCAR-K05",1]],
  "Post-stress CET1 · SCB":[["Post-stress CET1","CCAR-K01"],["SCB","CCAR-K04"]],
};

const bslOf=(g,n)=> g.bs?"B/S":(n.bs?"B/S · "+n.bs:(n.stmt||null));

// ── statement-lineage filter ──────────────────────────────────────────────
// Bucket each node's OWN statement into B/S / P&L / CF (B/S·PV and B/S·struct fold into B/S).
const BUCKET=(s)=> !s?null : s.indexOf("B/S")===0?"B/S" : s.indexOf("P&L")===0?"P&L" : s==="CF"?"CF":null;
const OWN={};
ALM.forEach(a=> OWN[a.id]=BUCKET(a.stmt));                 // DX16 = null (rate driver, agnostic)
OWN["Plan Income"]="P&L"; OWN["DX18"]="B/S"; OWN["PB10"]="B/S"; OWN["PB11"]="P&L";
GROUPS.forEach(g=> g.nodes.forEach(n=> OWN[n.name]=BUCKET(bslOf(g,n)) ));
OWN["CIO"]=null; OWN["ODM"]=null;
OWN["DATAMART"]="B/S";                                     // Treasury Datamart — instrument-level positions (= balance sheet)
// Downstream edges  [feeder, consumer]
const _CAP=GROUPS.find(g=>g.dom==="CAPITAL"), _CCAR=GROUPS.find(g=>g.dom==="CCAR");
const EDGES=[];
["DX17","DX19","DX20"].forEach(c=>{ EDGES.push(["DX16",c]); EDGES.push(["DATAMART",c]); }); // rate parent + datamart positions seed ALM
EDGES.push(["DX18","DX17"],["Plan Income","DX20"]);                                       // variance bridges
GROUPS.forEach(g=> g.nodes.forEach(n=>{
  (n.alm||[]).forEach(aid=> EDGES.push([aid,n.name]));     // ALM output -> view
  if(n.pos) EDGES.push(["DATAMART",n.name]);               // datamart spot positions -> liquidity views
}));
EDGES.push(["CIO","DATAMART"],["ODM","DATAMART"]);         // CIO (securities) + ODM (op/non-op) enrich the mart
EDGES.push(["CIO",_CAP.nodes[0].name]);                    // CIO also sends AOCI/CECL -> Capital
_CCAR.nodes.forEach(n=> EDGES.push(["PB10",n.name],["PB11",n.name])); // Finance actuals -> CCAR (bypass)
EDGES.push([_CCAR.nodes[2].name,_CAP.nodes[1].name]);      // sev-adv -> stressed capital path
const PREDS={}; EDGES.forEach(([f,t])=> (PREDS[t]=PREDS[t]||[]).push(f));
// Lit set for a statement = its own-tagged nodes + every upstream ancestor (whatever their statement).
// Additive statement tags: a node whose lineage carries a metric of a *different* statement
// than its own bucket. PPNR (CCAR-K02) is a P&L line produced on the B/S-bucketed CCAR
// Baseline node → make Baseline a P&L target as well, so PPNR lights under the P&L filter.
// (Node-level: the node's other metric, CET1-base, rides along — accepted trade-off.)
const EXTRA={ "Baseline projection":["P&L"] };
const litSet=(S)=>{ const lit=new Set(Object.keys(OWN).filter(k=>OWN[k]===S||(EXTRA[k]||[]).includes(S))), st=[...lit];
  while(st.length){ const t=st.pop(); (PREDS[t]||[]).forEach(f=>{ if(!lit.has(f)){ lit.add(f); st.push(f); } }); }
  return lit; };
const LIT={ "B/S":litSet("B/S"), "P&L":litSet("P&L"), "CF":litSet("CF") };
const STMTS=[["All",null],["B/S","B/S"],["P&L","P&L"],["Cash Flows","CF"]];

// ── metadata registry ── keyed by element id; extend freely as data is collected.
const MATURITY={ "Manual":"#b5524a", "Automated (Ungoverned)":"#d9a93a", "Automated (Governed)":"#4f8a5b" };
const META_FIELDS=[["maturity","Maturity"],
  ["system","System"],
  ["dataObject","Data object (query / table / column / cube / file)"],
  ["duration","Technical execution duration"],
  ["manualHrs","Manual execution duration (Hrs)"],
  ["frequency","Generation frequency"],["notes","Notes"]];
const META={
  "DX16":{maturity:"Automated (Governed)", system:"QRM — Rate Engine", duration:"~25 min", frequency:"Daily (BD+1, 06:00)", notes:"Forward curve + rate paths; parent input to DX17 / DX19 / DX20."},
  "DX19":{maturity:"Automated (Governed)", system:"QRM — Cash-flow Engine", duration:"~40 min", frequency:"Daily", notes:"Behaviourally-bucketed BAU cash-flow ladder; feeds LST + EVE/NII."},
  "LIQ-K01":{maturity:"Automated (Ungoverned)", system:"Treasury Datamart", duration:"~8 min", frequency:"Daily (+ intraday refresh)", notes:"LCR = HQLA / net 30-day stressed outflows."},
  "DATAMART":{system:"Treasury Datamart", dataObject:"PB12", notes:"Single shared instrument-level position layer. Aggregates source systems PB01-PB09 (deposits, loans, securities, derivatives, funding, OBS, collateral, counterparty, intraday) with full risk attribution: repricing, maturity, behavioural, HQLA eligibility, op/non-op split, encumbrance. Reconciled to the GL (PB10) as the control total. Both ALM (opening positions) and Liquidity (spot positions) read from here; CIO marks and ODM op/non-op split are enrichment inputs."},
  "CAP-K02":{notes:"Tier 1 = CET1 + AT1; Total = Tier 1 + Tier 2 — same RWA denominator as CET1, larger numerator. Produced by CAP-P01 (Quarterly Regulatory Capital Calculation & Reporting). Sub-function: Capital Ratios. System, owner and refresh cadence not yet captured in the matrix."},
  "CAP-K03":{notes:"RWA by risk type — credit / market / operational / CVA. Produced by four engines: CAP-M01 Credit RWA (Standardised & A-IRB), CAP-M03 Market RWA (incl. FRTB), CAP-M04 CVA Capital, CAP-M05 Operational Risk Capital. Shared denominator for CET1 / Tier 1 / Total; also marked off the actuals B/S and CIO. System and cadence not yet captured in the matrix."},
  "edge:ccar-bypass":{maturity:"Manual", system:"CCAR Platform", duration:"—", frequency:"Quarterly (CCAR cycle)", notes:"Finance feeds the CCAR engine directly, bypassing ALM."},
  "edge:sevadv-stressedcap":{notes:"CCAR severely-adverse run (CCAR-M03) → DX10 Projected Capital → Capital-domain stressed path. Scenario choice (severely-adverse) pending SME — see #todo."},
  "CIO":{dataObject:"Securities book (marks)", notes:"Upstream source — marks & feeds the balance sheet (HQLA · RWA · repricing) and sends AOCI + CECL into Capital. Not an ALM consumer. Domain placement tentative — pending SME (#todo 6)."},
  "ODM":{dataObject:"AS10 (op/non-op) · model ODM-M01", notes:"Owns the operational / non-operational deposit split (AS10), feeding LCR & NSFR outflow treatment. Upstream source; domain placement tentative — pending SME (#todo 6)."},
};

export default function App(){
  const [sel,setSel]=useState(null);
  const [filter,setFilter]=useState("All");
  const litNow = filter==="All" ? null : LIT[filter];
  const DIMOP=0.18;
  const litN=(k)=> !litNow || litNow.has(k);
  const opN=(k)=> litN(k) ? 1 : DIMOP;
  const opE=(a,b)=> (!litNow || (litNow.has(a)&&litNow.has(b))) ? 1 : DIMOP;
  const domLit=(g)=> !litNow || g.nodes.some(n=>litNow.has(n.name));
  const pick=(id,label,kind)=>(e)=>{ e.stopPropagation(); setSel({id,label,kind}); };
  const hi=(id)=> !!sel && sel.id===id;
  const Hit=(d,id,label,kind)=><path d={d} fill="none" stroke={hi(id)?"#d9a93a":"transparent"} strokeWidth={hi(id)?3.5:12} opacity={hi(id)?0.75:1} strokeLinecap="round" style={{cursor:"pointer"}} onClick={pick(id,label,kind)}/>;
  const mk=(base,id)=> hi(id) ? `url(#${base}-hi)` : `url(#${base})`;
  // ── unified node card: one grammar for FINANCE + ALM + DOMAIN ──
  // line1: ref (mono, top-left) + horizon (top-right) · line2: name + ←src · line3: [stmt][scenario][realization]
  // o.dark = navy "source" tier (Finance): light text, white stmt chip
  const card=(o)=>{
    const H=NH, dk=!!o.dark, chips=[]; let cx=o.x+10;
    const refCol=dk?"#9fb2c4":SLATE, nameCol=dk?"#fff":INK, dimCol=dk?"rgba(255,255,255,.55)":MUTED;
    const realBg=(r)=> r==="SPOT"?SPOTCOL : FCOL;  // PLAN/FCST/ACTUAL are siblings -> one colour
    if(o.stmt) chips.push({t:o.stmt,bd:true});
    if(o.scenario) chips.push({t:o.scenario,bg:INK});  // BASE/STRESS siblings on the scenario axis -> one colour
    if(o.realization) chips.push({t:o.realization,bg:realBg(o.realization)});
    return (<g key={o.key} opacity={o.op??1} onClick={pick(o.id,o.label,o.kind)} style={{cursor:"pointer"}}>
      <rect x={o.x} y={o.y} width={o.w} height={H} rx={6} fill={dk?"#0f2238":"#fff"} stroke={hi(o.id)?"#d9a93a":(dk?"#0f2238":GREY)} strokeWidth={hi(o.id)?2.5:1}/>
      {o.gap
        ? <text x={o.x+10} y={o.y+13} fontFamily={SANS} fontSize="7" fontStyle="italic" fill={dk?"#e0a39c":"#b5524a"}>{"\u26a0 not in matrix"}</text>
        : (o.ref && <text x={o.x+10} y={o.y+13} fontFamily={MONO} fontSize="8" fontWeight={700} fill={refCol}>{o.ref}</text>)}
      {o.horizon && <text x={o.x+o.w-8} y={o.y+13} textAnchor="end" fontFamily={SANS} fontSize="7" fontWeight={600} fill={dimCol}>{o.horizon}</text>}
      <text x={o.x+10} y={o.y+27} fontFamily={SANS} fontSize="8.5" fontWeight={600} fill={nameCol}>{o.name}</text>
      {o.src && <text x={o.x+o.w-8} y={o.y+27} textAnchor="end" fontFamily={SANS} fontSize="7" fontStyle="italic" fill={dimCol}>{"\u2190"+o.src}</text>}
      {chips.map((c,i)=>{ const w=c.t.length*4.4+10, el=(
        <g key={i}>
          <rect x={cx} y={o.y+32} width={w} height={11} rx={5.5} fill={c.bd?"#fff":c.bg} stroke={c.bd&&!dk?LINE:"none"} strokeWidth={c.bd&&!dk?1:0}/>
          <text x={cx+w/2} y={o.y+40} textAnchor="middle" fontFamily={SANS} fontSize="6.5" fontWeight={700} fill={c.bd?INK:"#fff"}>{c.t}</text>
        </g>); cx+=w+3; return el; })}
    </g>);
  };
  return (
    <div style={{background:PAPER,minHeight:"100%",padding:"24px",fontFamily:SANS,color:INK}}>
      <div style={{maxWidth:1020,margin:"0 auto"}}>
        <h1 style={{fontFamily:SERIF,fontWeight:600,fontSize:22,margin:"0 0 4px"}}>Finance → ALM outputs → each domain{"\u2019"}s views → metrics</h1>
        <div style={{fontFamily:MONO,fontSize:10,color:MUTED,margin:"0 0 8px"}}>v3 · introduces Treasury Datamart (PB12) · v2 frozen</div>
        <p style={{color:MUTED,fontSize:13,margin:"0 0 14px",lineHeight:1.5,maxWidth:860}}>
          The four-tier flow, now with each downstream domain split into the individual views it builds. Liquidity is five, not one — and only
          two take an ALM input. Each view names its source with a ← label: an ALM output (the arrow shows which), the current balance sheet (actuals), or an own engine — LCR/NSFR/intraday start from today{"\u2019"}s B/S, not ALM{"\u2019"}s forecast. CIO/Portfolio sits upstream — it marks and feeds the balance sheet and sends AOCI/CECL into Capital, rather than consuming ALM{"\u2019"}s forecast.
        </p>

        <div style={{display:"flex",alignItems:"center",gap:7,margin:"0 0 12px",flexWrap:"wrap"}}>
          <span style={{fontSize:10.5,fontWeight:700,color:MUTED,letterSpacing:".6px"}}>STATEMENT</span>
          {STMTS.map(([lbl,key])=>{ const on=filter===(key||"All");
            return <button key={lbl} onClick={()=>{ setFilter(key||"All"); setSel(null); }}
              style={{cursor:"pointer",fontFamily:SANS,fontSize:12,fontWeight:on?700:500,padding:"5px 13px",
                borderRadius:7,border:`1px solid ${on?DOMC:LINE}`,background:on?DOMC:"#fff",color:on?"#fff":INK,transition:"all .12s"}}>{lbl}</button>; })}
          {filter!=="All" && <span style={{fontSize:11,color:MUTED,fontStyle:"italic",marginLeft:4}}>lineage view — upstream sources stay lit, even cross-statement</span>}
        </div>

        <div style={{background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:"12px 14px"}}>
          <svg viewBox={`0 0 980 ${TOTAL}`} style={{width:"100%",height:"auto",display:"block"}} onClick={()=>setSel(null)}>
            <defs>
              <marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill={MUTED}/></marker>
              <marker id="ahg" markerWidth="10" markerHeight="10" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 Z" fill={GREEN}/></marker>
              <marker id="ahgS" markerWidth="10" markerHeight="10" refX="1" refY="3.2" orient="auto"><path d="M7,0 L0,3.2 L7,6.4 Z" fill={GREEN}/></marker>
              <marker id="ahR" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#3f5ea8"/></marker>
              <marker id="ahCC" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#8a6d9e"/></marker>
              <marker id="ah-hi" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#d9a93a"/></marker>
              <marker id="ahg-hi" markerWidth="10" markerHeight="10" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 Z" fill="#d9a93a"/></marker>
              <marker id="ahgS-hi" markerWidth="10" markerHeight="10" refX="1" refY="3.2" orient="auto"><path d="M7,0 L0,3.2 L7,6.4 Z" fill="#d9a93a"/></marker>
              <marker id="ahR-hi" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#d9a93a"/></marker>
              <marker id="ahCC-hi" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#d9a93a"/></marker>
            </defs>

            <text x={68} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>FINANCE</text>
            <text x={278} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>ALM OUTPUTS</text>
            <text x={NX+NW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>DOMAIN VIEWS</text>
            <text x={MXX+MBW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>METRICS</text>

            {/* Finance — same card grammar, dark "source" tier (PLAN/ACTUAL realization) */}
            <text x={14} y={108} fontFamily={SANS} fontSize="8.5" fontWeight={700} fill={FCOL}>PLAN</text>
            {card({key:"f-pinc", x:14, y:114, w:108, dark:true, gap:true, horizon:"~36m", name:"Plan Income", stmt:"P&L", realization:"PLAN", op:opN("Plan Income"), id:"Plan Income", label:"Plan Income", kind:"Finance source"})}
            {card({key:"f-pbs", x:14, y:168, w:108, dark:true, ref:"DX18", horizon:"~36m", name:"Plan Balance Sheet", stmt:"B/S", realization:"PLAN", op:opN("DX18"), id:"DX18", label:"Plan Balance Sheet", kind:"Finance source"})}
            <text x={14} y={384} fontFamily={SANS} fontSize="8.5" fontWeight={700} fill={FCOL}>ACTUAL</text>
            {card({key:"f-abs", x:14, y:390, w:108, dark:true, ref:"PB10", horizon:"as-of", name:"Actuals Balance Sheet", stmt:"B/S", realization:"ACTUAL", op:opN("PB10"), id:"PB10", label:"Actuals Balance Sheet", kind:"Finance source"})}
            {card({key:"f-ainc", x:14, y:444, w:108, dark:true, ref:"PB11", horizon:"as-of", name:"Actuals Income", stmt:"P&L", realization:"ACTUAL", op:opN("PB11"), id:"PB11", label:"Actuals Income", kind:"Finance source"})}

            {/* planning-cycle reconciliation: Plan block ↔ Actual block (budget variance) */}
            {(()=>{ const op=Math.max(opN("DX18"),opN("PB10"),opN("Plan Income"),opN("PB11"));
              return <g opacity={op}>
                <path d="M20,218 L20,382" fill="none" stroke={GREEN} strokeWidth={2} markerStart={mk("ahgS","edge:budget-variance")} markerEnd={mk("ahg","edge:budget-variance")}/>
                {Hit("M20,218 L20,382","edge:budget-variance","Plan ↔ Actual (budget variance)","Reconciliation tie · planning cycle")}
                <text x={26} y={303} fontFamily={SANS} fontSize="8" fontWeight={700} fill={GREEN}>budget variance</text>
              </g>; })()}

            {/* ALM container */}
            {ALM.map(o=>{
              const nx = o.id==="DX16"?246:264, nw = o.id==="DX16"?140:122;
              return card({key:o.id, x:nx, y:o.y, w:nw, ref:o.id, horizon:"~36m", name:o.name,
                scenario:o.base?"BASE":null, realization:"FCST", stmt:o.stmt||null,
                op:opN(o.id), id:o.id, label:o.name, kind:"ALM output"});
            })}

            {/* Finance -> ALM */}
            {/* variance bridge: Plan B/S and Plan Income BOTH reconcile to ALM (B/S + NII) */}
            <g opacity={opE("DX18","DX17")}>
              <path d="M122,191 C160,205 236,250 264,255" fill="none" stroke={GREEN} strokeWidth={2} markerStart={mk("ahgS","edge:variance-bs")} markerEnd={mk("ahg","edge:variance-bs")}/>
              {Hit("M122,191 C160,205 236,250 264,255","edge:variance-bs","Plan B/S \u2194 ALM structural B/S","Variance / reconciliation tie")}
            </g>
            <g opacity={opE("Plan Income","DX20")}>
              <path d="M122,137 C160,150 236,195 264,199" fill="none" stroke={GREEN} strokeWidth={2} markerStart={mk("ahgS","edge:variance-nii")} markerEnd={mk("ahg","edge:variance-nii")}/>
              {Hit("M122,137 C160,150 236,195 264,199","edge:variance-nii","Plan Income \u2194 ALM NII","Variance / reconciliation tie")}
            </g>
            <text x={52} y={102} opacity={Math.max(opE("DX18","DX17"),opE("Plan Income","DX20"))} fontFamily={SANS} fontSize="8" fontWeight={700} fill={GREEN}>variance → plan (B/S + NII)</text>
            <g opacity={opN("DATAMART")}>
              <path d="M198,285 L214,285 M214,199 L214,335" fill="none" stroke={GREY} strokeWidth={1.4}/>
              {Hit("M198,285 L214,285 M214,199 L214,335 M214,199 L264,199 M214,255 L264,255 M214,335 L264,335","edge:opening-tie","Treasury Datamart \u2192 ALM (opening positions)","Position feed / opening seed")}
            </g>
            <line x1={214} y1={199} x2={264} y2={199} opacity={opE("DATAMART","DX20")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>
            <line x1={214} y1={255} x2={264} y2={255} opacity={opE("DATAMART","DX17")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>
            <line x1={214} y1={335} x2={264} y2={335} opacity={opE("DATAMART","DX19")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>

            {/* ALM output -> specific sub-node */}
            {LAID.flatMap(g=>g.nodes.flatMap(n=>(n.alm||[]).map(aid=>{
              const x1=386, y1=almMid(aid), x2=NX, y2=n.y+NH/2, mx=(x1+x2)/2;
              const d=`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
              const eid="edge:"+aid+"\u2192"+(n.ref||n.name);
              return <g key={aid+n.name} opacity={opE(aid,n.name)}>
                <path d={d} fill="none" stroke={MUTED} strokeWidth={1.4} opacity={0.7} markerEnd={mk("ah",eid)}/>
                {Hit(d,eid,aid+" \u2192 "+n.name,"Lineage edge · ALM \u2192 view")}
              </g>;
            })))}

            {/* DX16 feeds the other three — left tree into the indented children */}
            {(()=>{ const RT="#3f5ea8"; const tl=Math.max(opE("DX16","DX17"),opE("DX16","DX19"),opE("DX16","DX20"));
              return <g onClick={pick("edge:dx16-feeds","DX16 feeds DX17 / DX19 / DX20","Dependency (rate driver)")} style={{cursor:"pointer"}}>
              {Hit("M252,166 L252,327 M252,191 L264,191 M252,247 L264,247 M252,327 L264,327","edge:dx16-feeds","DX16 feeds DX17 / DX19 / DX20","Dependency (rate driver)")}
              <path d="M252,166 L252,327" fill="none" stroke={RT} strokeWidth={1.6} opacity={0.92*tl}/>
              <line x1={252} y1={191} x2={264} y2={191} opacity={opE("DX16","DX20")} stroke={RT} strokeWidth={1.6} markerEnd={mk("ahR","edge:dx16-feeds")}/>
              <line x1={252} y1={247} x2={264} y2={247} opacity={opE("DX16","DX17")} stroke={RT} strokeWidth={1.6} markerEnd={mk("ahR","edge:dx16-feeds")}/>
              <line x1={252} y1={327} x2={264} y2={327} opacity={opE("DX16","DX19")} stroke={RT} strokeWidth={1.6} markerEnd={mk("ahR","edge:dx16-feeds")}/>
            </g>; })()}

            {/* CCAR bypass */}
            {(()=>{ const g=LAID.find(x=>x.dom==="CCAR"); const ty=g.nodes[0].y+NH/2; const op=g.nodes.some(n=>litN(n.name))?1:DIMOP;
              return <g opacity={op}>
                {Hit(`M122,467 C326,${ty} 386,${ty} ${NX},${ty}`,"edge:ccar-bypass","Finance \u2192 CCAR (bypasses ALM)","Lineage edge · bypass")}
                <path d={`M122,467 C326,${ty} 386,${ty} ${NX},${ty}`} fill="none" stroke={MUTED} strokeWidth={1.6} markerEnd={mk("ah","edge:ccar-bypass")}/>
              </g>; })()}

            {/* node-to-node: CCAR Severely-adverse projection -> Stressed capital path (scenario that binds capital) */}
            {(()=>{ const sev=LAID.find(x=>x.dom==="CCAR").nodes[2]; const stp=LAID.find(x=>x.dom==="CAPITAL").nodes[1];
              const y1=sev.y+NH/2, y2=stp.y+NH/2, gx=444, my=(y1+y2)/2;
              const d=`M${NX},${y1} L${gx},${y1} L${gx},${y2} L${NX},${y2}`;
              return <g opacity={opE(sev.name,stp.name)}>
                {Hit(d,"edge:sevadv-stressedcap","Severely-adverse projection → Stressed capital path","Lineage edge · CCAR scenario")}
                <path d={d} fill="none" stroke="#8a6d9e" strokeWidth={1.6} markerEnd={mk("ahCC","edge:sevadv-stressedcap")}/>
              </g>; })()}


            {/* groups + sub-nodes */}
            {LAID.map(g=>(
              <g key={g.dom}>
                <text x={NX} y={g.headerY+12} opacity={domLit(g)?1:DIMOP} fontFamily={SANS} fontSize="10" fontWeight={700} fill={DOMC}>{g.head}</text>
                {g.nodes.map(n=>{
                  return (
                    <g key={n.name} opacity={opN(n.name)}>
                      {card({key:n.name, x:NX, y:n.y, w:NW, ref:n.ref, gap:n.gap, horizon:n.hz, name:n.name, src:n.src,
                        scenario:n.base?"BASE":(n.stress?"STRESS":null), realization:n.pos?"SPOT":"FCST", stmt:bslOf(g,n),
                        id:n.name, label:n.name, kind:"Domain view · "+g.dom})}
                      {(()=>{ const ms=METMAP[n.met]||[[n.met,null]]; const k=ms.length;
                        const sh=k*MH2+(k-1)*MG, mid=n.y+NH/2, top=mid-sh/2, tx=MXX-14;
                        const metSel=ms.some(m=>hi(m[1]||m[0]));
                        return <g>
                          <line x1={NX+NW} y1={mid} x2={tx} y2={mid} stroke={metSel?"#d9a93a":MUTED} strokeWidth={metSel?2:1.5}/>
                          {k>1 && <line x1={tx} y1={top+MH2/2} x2={tx} y2={top+sh-MH2/2} stroke={metSel?"#d9a93a":MUTED} strokeWidth={metSel?2:1.5}/>}
                          {ms.map((m,i)=>{ const by=top+i*(MH2+MG), bm=by+MH2/2; const mid2=m[1]||m[0]; return <g key={i} onClick={pick(mid2,m[0],"Metric")} style={{cursor:"pointer"}}>
                            <path d={`M${NX+NW},${mid} L${tx},${mid} L${tx},${bm} L${MXX},${bm}`} fill="none" stroke="transparent" strokeWidth={11}/>
                            <line x1={tx} y1={bm} x2={MXX} y2={bm} stroke={hi(mid2)?"#d9a93a":MUTED} strokeWidth={hi(mid2)?2.5:1.5} markerEnd={mk("ah",mid2)}/>
                            <rect x={MXX} y={by} width={MBW} height={MH2} rx={4} fill="#fff" stroke={hi(mid2)?"#d9a93a":LINE} strokeWidth={hi(mid2)?2:1}/>
                            <text x={MXX+8} y={bm+3} fontFamily={SANS} fontSize="8" fontWeight={600} fill={INK}>{m[0]}</text>
                            {m[1] && <text x={MXX+MBW-8} y={bm+3} textAnchor="end" fontFamily={MONO} fontSize="7" fontWeight={700} fill={m[2]?"#b5524a":MUTED}>{m[1]}{m[2]?" ?":""}</text>}
                          </g>; })}
                        </g>; })()}
                    </g>
                  );
                })}
              </g>
            ))}
            {/* CIO / Portfolio — upstream source (not an ALM consumer) */}
            <g opacity={opN("CIO")}>
              <rect x={14} y={44} width={210} height={24} rx={8} fill="#f4f5f6" stroke={GREY} strokeWidth={1} strokeDasharray="4 3"/>
              <rect x={14} y={44} width={5} height={24} rx={2} fill={GREY}/>
              <text x={26} y={59} fontFamily={SANS} fontSize="10.5" fontWeight={700} fill={MUTED}>CIO / Portfolio (securities book)</text>
            </g>
            <rect x={14} y={44} width={210} height={24} rx={8} fill="transparent" style={{cursor:"pointer"}} onClick={pick("CIO","CIO / Portfolio (securities book)","Upstream source")}/>
            {hi("CIO") && <rect x={14} y={44} width={210} height={24} rx={8} fill="none" stroke="#d9a93a" strokeWidth={2.5}/>}
            <g opacity={opE("CIO",_CAP.nodes[0].name)}>
              <path d="M224,56 C336,56 432,57 459,57" fill="none" stroke={GREY} strokeWidth={1.4} opacity={0.6} markerEnd={mk("ah","edge:cio-capital")}/>
              {Hit("M224,56 C336,56 432,57 459,57","edge:cio-capital","CIO \u2192 Capital (AOCI + CECL)","Upstream feed")}
            </g>
            {/* ODM — deposit-behaviour source (upstream, tentative) */}
            <g opacity={opN("ODM")}>
              <rect x={14} y={228} width={154} height={24} rx={8} fill="#f4f5f6" stroke={GREY} strokeWidth={1} strokeDasharray="4 3"/>
              <rect x={14} y={228} width={5} height={24} rx={2} fill={GREY}/>
              <text x={26} y={243} fontFamily={SANS} fontSize="9.5" fontWeight={700} fill={MUTED}>Deposit op/non-op · ODM</text>
            </g>
            <rect x={14} y={228} width={154} height={24} rx={8} fill="transparent" style={{cursor:"pointer"}} onClick={pick("ODM","Deposit op/non-op · ODM","Upstream source")}/>
            {hi("ODM") && <rect x={14} y={228} width={154} height={24} rx={8} fill="none" stroke="#d9a93a" strokeWidth={2.5}/>}
            {/* Treasury Datamart (PB12) — single shared instrument-level position layer */}
            <g opacity={opN("DATAMART")}>
              <rect x={124} y={264} width={74} height={54} rx={7} fill="#eef2f7" stroke={SLATE} strokeWidth={1.4}/>
              <text x={134} y={277} fontFamily={MONO} fontSize="8" fontWeight={700} fill={SLATE}>PB12</text>
              <text x={161} y={291} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={INK}>Treasury</text>
              <text x={161} y={302} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={INK}>Datamart</text>
              <text x={161} y={312} textAnchor="middle" fontFamily={MONO} fontSize="6" fontWeight={600} fill={MUTED}>(instrument level)</text>
            </g>
            <rect x={124} y={264} width={74} height={54} rx={7} fill="transparent" style={{cursor:"pointer"}} onClick={pick("DATAMART","Treasury Datamart (PB12)","Shared data layer")}/>
            {hi("DATAMART") && <rect x={124} y={264} width={74} height={54} rx={7} fill="none" stroke="#d9a93a" strokeWidth={2.5}/>}
            <g opacity={opE("ODM","DATAMART")}>
              <path d="M92,252 L148,266" fill="none" stroke={GREY} strokeWidth={1.2} markerEnd={mk("ah","edge:odm-feed")}/>
              {Hit("M92,252 L148,266","edge:odm-feed","ODM op/non-op \u2192 Treasury Datamart","Enrichment input \u00b7 AS10")}
            </g>
            <g opacity={opE("CIO","DATAMART")}>
              <path d="M186,68 L186,264" fill="none" stroke={GREY} strokeWidth={1.1} opacity={0.55} markerEnd={mk("ah","edge:cio-datamart")}/>
              {Hit("M186,68 L186,264","edge:cio-datamart","CIO securities marks \u2192 Treasury Datamart","Enrichment input")}
            </g>
            <g opacity={opE("PB10","DATAMART")}>
              <path d="M122,400 L124,316" fill="none" stroke={GREEN} strokeWidth={2} markerStart={mk("ahgS","edge:datamart-recon")} markerEnd={mk("ahg","edge:datamart-recon")}/>
              {Hit("M122,400 L124,316","edge:datamart-recon","Treasury Datamart \u2194 GL (reconciliation)","Control / reconciliation tie")}
            </g>
            {(()=>{ const g=LAID.find(x=>x.dom==="LIQUIDITY"); const sp=g.nodes.filter(n=>n.pos);
              const TKX=406, mids=sp.map(n=>n.y+NH/2), topY=Math.min(...mids), botY=Math.max(...mids);
              const entryY=Math.min(Math.max(413,topY),botY);
              const dd=`M160,318 L160,413 L${TKX},413 M${TKX},${topY} L${TKX},${botY}`;
              const ddH=dd+sp.map(n=>` M${TKX},${n.y+NH/2} L${NX},${n.y+NH/2}`).join("");
              const spineOp=sp.some(n=>litN(n.name))?1:DIMOP;
              return <g>
                {Hit(ddH,"edge:current-bs-bus","Treasury Datamart \u2192 liquidity (spot positions)","Spot-balance feed")}
                <path d={dd} fill="none" stroke={GREY} strokeWidth={1.3} opacity={spineOp}/>
                {sp.map((n,i)=><line key={i} x1={TKX} y1={n.y+NH/2} x2={NX} y2={n.y+NH/2} opacity={opE("DATAMART",n.name)} stroke={GREY} strokeWidth={1.3} markerEnd={mk("ah","edge:current-bs-bus")}/>)}
              </g>; })()}
          </svg>
        </div>

        <div style={{marginTop:16,background:"#fff8e6",border:"1px solid #e6cf87",borderLeft:"4px solid #d9a93a",borderRadius:8,padding:"12px 16px"}}>
          <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,color:"#8a6d1f",marginBottom:8}}>#todo — confirm with SME</div>
          <ol style={{margin:0,paddingLeft:18,fontFamily:SANS,fontSize:12,color:INK,lineHeight:1.6}}>
            <li><b>Short-term LST input</b> — does it run off DX19 (BAU cash-flow ladder) or stress current positions directly? Long-term LST uses DX17; should the two differ, and is DX19 the right source for short-term?</li>
            <li><b>Decay / beta ownership</b> — keep split across Liquidity (LIQ-M01 / M02) &amp; IRRBB, or consolidate under ODM alongside op/non-op?</li>
            <li><b>Matrix gaps</b> — Intraday liquidity and Plan Income have no Data Object Register entry; add them to the inventory?</li>
            <li><b>Metric → node mappings</b> — confirm SCB → severely-adverse, PPNR → baseline, repricing gap → NII-sensitivity.</li>
            <li><b>DX05</b> — LCR and NSFR both map to it; does the register split them into separate objects?</li>
            <li><b>Upstream placement</b> — CIO / Portfolio and ODM are shown as tentative; confirm domain placement.</li>
            <li><b>DX20 ↔ DX12 tie</b> — does IRRBB-M02's base-NII leg consume the FP&amp;A / Treasury base forecast (DX20), or run its own base scenario? And is ΔNII reported as a level or as a % of base NII (DX20 = denominator)? If either holds, DX20 becomes a real input to DX12; otherwise they're siblings sharing parents (DX16/17/19, AS02), with at most a dashed "reconciles-to" tie. Not a computational feed by default.</li>
            <li><b>Metric-ID mappings (the four "?" boxes)</b> — register under-resolves CCAR CET1 by scenario: only CCAR-K01 (severe-adverse <i>minimum</i>) and CCAR-K05 (post-stress ratios, scenario-agnostic) exist, so baseline CET1, adverse CET1, and the capital-domain "stressed path" all fall back to K05 — whose label says "post-stress," which doesn't fit the baseline run. Either register distinct baseline/adverse projected-CET1 metrics, or accept K05 as scenario-spanning and relabel. Separately, Intraday peak (LIQ-K09) is a registered metric but has no producing model/object — confirm its producer (ties to the intraday matrix gap above).</li>
            <li><b>NSFR statement classification</b> — currently tagged <i>B/S · struct</i> (a structural factor transform of the whole book), the lone hybrid while the other four liquidity views are tagged CF. <b>Ask SME:</b> should NSFR sit in the cash-flow family (CF) like LCR/LST/intraday, or is its 1-year stable-funding ratio better characterized as a balance-sheet structural measure (B/S · struct)? Equivalently — is NSFR mechanically a stressed cash-flow projection, or a static factor weighting applied to current B/S positions? That answer fixes whether the liquidity domain is a clean CF family or a CF + structural split.</li>
            <li><b>CCAR-M03 decomposition (overloaded id)</b> — one id is doing three jobs and needs SME breakdown before the chart can model it faithfully: <b>(a) one id → three scenario nodes</b> — Baseline / Adverse / Severely-adverse all carry ref CCAR-M03; are these three runs of one engine (engine should be one node) or distinct registered models (need distinct ids)? <b>(b) engine vs node</b> — CCAR-M03 is the aggregation engine (PPNR + losses + RWA → projected capital) but appears only as a ref, never as its own node, so its producer is invisible and its three outputs borrow its id; should an explicit CCAR-M03 engine node be added upstream with edges fanning to the three runs? <b>(c) one id → many metrics, under-resolved</b> — PPNR, projected/post-stress CET1, SCB etc. all trace to CCAR-M03, but the register only has CCAR-K01 (sev-adv minimum) and CCAR-K05 (scenario-agnostic), so per-scenario metrics collapse. Ties directly to items 8 (metric-ID mappings) and 10 (stressed-capital scenario) — resolve together.</li>
            <li><b>Stressed capital path — CCAR source scenario</b> — drawn node-to-node from the <i>Severely-adverse</i> projection (the run SCB derives from, and the binding case for capital). <b>Ask SME:</b> is severely-adverse the correct/only scenario feeding the Capital-domain stressed path (via DX10 / CCAR-M03), or should it also reconcile to the adverse run or an aggregate? Ties to the CCAR-CET1 scenario under-resolution in the metric-ID item above.</li>
            <li><b>Spot LST (new node)</b> — added under LIQUIDITY, producing DX02 (survival horizon), drawn spot-basis (datamart-fed, SPOT pill) per the name; confirmed distinct from Short-term LST. Input wiring is a placeholder. <b>Ask SME:</b> (a) survival horizon — intraday / few-day vs ≤30-day? (b) internal assumptions or regulatory (i.e. is it distinct from LCR)? (c) separate engine / cadence from the projected LSTs? (d) does it consume spot positions off the datamart (PB12) as drawn, or another position source?</li>
            <li><b>Spot vs forecast LST metrics</b> — the daily-spot and short-term (forecast) LSTs produce survival-horizon / NCO on different bases, so Spot LST is now drawn on its own <i>proposed</i> metrics (LIQ-K11 spot survival horizon, LIQ-K12 spot NCO — both shown provisional, red “?”). <b>Ask SME / register:</b> are daily-spot survival horizon and NCO distinct KPIs with their own limits (→ register LIQ-K11 / K12), or is survival horizon one metric definition applied to two bases (→ revert to LIQ-K04 / K07, differentiated only by the SPOT vs FCST basis pill)?</li>
          </ol>
        </div>
      </div>
      {sel && (
        <div style={{position:"fixed",top:0,right:0,bottom:0,width:330,background:"#fff",borderLeft:`1px solid ${LINE}`,boxShadow:"-10px 0 30px rgba(15,34,56,.14)",padding:"20px 22px",overflowY:"auto",zIndex:60,boxSizing:"border-box"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
            <div>
              <div style={{fontFamily:SERIF,fontSize:16,fontWeight:600,color:INK,lineHeight:1.25}}>{sel.label}</div>
              <div style={{fontSize:11,color:MUTED,marginTop:4}}>{sel.kind}<span style={{fontFamily:MONO,marginLeft:7,color:SLATE}}>{sel.id}</span></div>
            </div>
            <button onClick={()=>setSel(null)} style={{border:"none",background:"none",fontSize:22,lineHeight:1,cursor:"pointer",color:MUTED,padding:0,marginTop:-2}}>×</button>
          </div>
          <div style={{height:1,background:LINE,margin:"15px 0"}}/>
          {META_FIELDS.map(([k,lbl])=>{ const m=META[sel.id]; const v=m&&m[k]; return (
            <div key={k} style={{marginBottom:13}}>
              <div style={{fontSize:9.5,fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",color:MUTED}}>{lbl}</div>
              {k==="maturity" && v
                ? <div style={{marginTop:4}}><span style={{display:"inline-block",padding:"3px 11px",borderRadius:11,fontSize:11.5,fontWeight:700,color:"#fff",background:MATURITY[v]||MUTED}}>{v}</span></div>
                : <div style={{fontSize:13,color:v?INK:"#aeb6c0",marginTop:3,lineHeight:1.45,fontStyle:v?"normal":"italic"}}>{v||"not captured yet"}</div>}
            </div>); })}
          {!META[sel.id] && <div style={{marginTop:10,fontSize:11,color:MUTED,fontStyle:"italic",lineHeight:1.4}}>No metadata recorded for this element yet — tell me the values and I{"\u2019"}ll add them to the registry.</div>}
        </div>
      )}
    </div>
  );
}
