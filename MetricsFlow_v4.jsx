import React, { useState, useEffect, useRef, useReducer, useMemo } from "react";
import * as XLSX from "xlsx";

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
  { id:"DX29", name:"OCI Forecast",             y:380, stmt:"B/S" },
];
const almMid=(id)=>{ const a=ALM.find(x=>x.id===id); return a.y+23; };

const GROUPS=[
  { dom:"CAPITAL", head:"CAPITAL", bs:true, nodes:[
    { name:"Capital forecast — CET1 path", hz:"~36m (9q)", src:"DX16·DX17·DX20", alm:["DX16","DX17","DX20"], base:true, met:"CET1 path · SLR · TLAC", ref:"DX21", slot:68, dy:20, ctr:true },
    { name:"Stressed capital path", hz:"9 quarters", src:"CCAR sev-adv", alm:[], ext:true, stress:true, met:"Stressed CET1 path", ref:"DX10" },
  ]},
      { dom:"LIQUIDITY", head:"LIQUIDITY", bs:false, nodes:[
    { name:"Short-term LST / survival", hz:"≤12m survival", src:"DX19 + current B/S", alm:["DX19"], stress:true, met:"Survival horizon · NCO", ref:"DX02", stmt:"CF" },
    { name:"Spot LST — daily survival", hz:"daily · spot", src:"spot positions (datamart)", alm:[], pos:true, stress:true, met:"Spot survival horizon · spot NCO", ref:"DX27", stmt:"CF" },
    { name:"Structural / long-term LST", hz:"1–3 years", src:"DX17 + current B/S", alm:["DX17"], stress:true, met:"Structural funding gap", ref:"DX03", stmt:"CF" },
    { name:"LCR — 30-day acute stress", hz:"30 days", src:"FR 2052a", alm:[], pos:true, stress:true, met:"LCR", ref:"DX05", stmt:"CF" },
    { name:"NSFR — 1-year structural", hz:"1 year", src:"FR 2052a", alm:[], pos:true, met:"NSFR", bs:"struct", ref:"DX31" },
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
  { dom:"CIO/PORTFOLIO", head:"CIO / PORTFOLIO", bs:false, nodes:[
    { name:"CIO securities book — valuation · OCI · hedging", hz:"as-of", src:"own book (DX14 marks)", alm:[], real:"ACTUAL", stmt:"B/S", met:"CIO book metrics", ref:"CIO-M01", slot:132 },
  ]},
];

const NX=476, NW=200, NH=46, NGAP=6, HEAD=18, GGAP=16;
let cur=30; const LAID=[];
for (const g of GROUPS){
  const headerY=cur; cur+=HEAD;
  const nodes=g.nodes.map(n=>{ const slot=n.slot||NH; const y=cur+(n.dy||0); cur+=slot+NGAP; return {...n,y}; });
  cur+=GGAP;
  LAID.push({...g,headerY,nodes});
}
const TOTAL=cur+6;
const MXX=712, MBW=148, MH2=14, MG=4;
const METMAP={
  "CET1 path · SLR · TLAC":[["CET1 path","CAP-K01"],["Tier 1 / Total","CAP-K02"],["RWA","CAP-K03"],["SLR","CAP-K04"],["TLAC","CAP-K06"]],
  "Stressed CET1 path":[["Stressed CET1 path","CCAR-K05",1]],
  "Survival horizon · NCO":[["Survival horizon","LIQ-K04"],["NCO","LIQ-K07"]],
  "Spot survival horizon · spot NCO":[["Spot survival horizon","LIQ-K11"],["Spot NCO","LIQ-K12"]],
  "Structural funding gap":[["Structural funding gap","LIQ-K10"]],
  "LCR":[["LCR","LIQ-K01"]],
  "NSFR":[["NSFR","LIQ-K02"]],
  "Intraday peak":[["Intraday peak","LIQ-K09",1]],
  "ΔEVE":[["ΔEVE","IRRBB-K01"]],
  "ΔNII · Repricing gap":[["ΔNII","IRRBB-K02"],["Repricing gap","IRRBB-K03"]],
  "PPNR · CET1 (base)":[["PPNR","CCAR-K02"],["CET1 (base)","CCAR-K05",1]],
  "Post-stress CET1 (adv)":[["Post-stress CET1 (adv)","CCAR-K05",1]],
  "Post-stress CET1 · SCB":[["Post-stress CET1","CCAR-K01"],["SCB","CCAR-K04"]],
  "CIO book metrics":[["Portfolio size","CIO-K01"],["AOCI","CIO-K02"],["Duration","CIO-K03"],["DV01","CIO-K07"],["OCI-at-Risk","CIO-K04"],["Book yield","CIO-K05"],["Hedge effectiveness","CIO-K06"]],
};

const bslOf=(g,n)=> g.bs?"B/S":(n.bs?"B/S · "+n.bs:(n.stmt||null));

// ── statement-lineage filter ──────────────────────────────────────────────

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
  "DX27":{maturity:"Automated (Ungoverned)", system:"Treasury Datamart / Liquidity Monitor", duration:"~10 min", frequency:"Daily (spot)", notes:"Spot / point-in-time LST output off current positions (raw datamart positions, not the projected DX19 ladder). Produced by LIQ-M09/P09; feeds spot survival horizon (K11) and spot NCO (K12). Register v7."},
  "LIQ-K01":{maturity:"Automated (Ungoverned)", system:"Treasury Datamart", duration:"~8 min", frequency:"Daily (+ intraday refresh)", notes:"LCR = HQLA / net 30-day stressed outflows."},
  "DATAMART":{system:"Treasury Datamart", dataObject:"PB01–PB09 aggregated (+ PB12/SFT)", notes:"Single shared instrument-level position layer (an AGGREGATION, not a single register object — distinct from register PB12 = Securities Financing Transactions). Aggregates the instrument-level position sources PB01-PB09 (deposits, loans, securities, derivatives, funding, OBS, collateral, counterparty, intraday) + PB12 (SFT / repo) with full risk attribution: repricing, maturity, behavioural, HQLA eligibility, op/non-op split, encumbrance. Reconciled to the GL (PB10) as the control total. ALM reads opening positions and the spot-liquidity views (Spot LST, Intraday) read spot positions from here; LCR/NSFR are fed via the FR 2052a, not directly. CIO marks and ODM op/non-op split are enrichment inputs."},
  "CAP-K02":{notes:"Tier 1 = CET1 + AT1; Total = Tier 1 + Tier 2 — same RWA denominator as CET1, larger numerator. Produced by CAP-P01 (Quarterly Regulatory Capital Calculation & Reporting). Sub-function: Capital Ratios. System, owner and refresh cadence not yet captured in the matrix."},
  "CAP-K03":{notes:"RWA by risk type — credit / market / operational / CVA. Produced by four engines: CAP-M01 Credit RWA (Standardised & A-IRB), CAP-M03 Market RWA (incl. FRTB), CAP-M04 CVA Capital, CAP-M05 Operational Risk Capital. Shared denominator for CET1 / Tier 1 / Total; also marked off the actuals B/S and CIO. System and cadence not yet captured in the matrix."},
  "edge:ccar-bypass":{maturity:"Manual", system:"CCAR Platform", duration:"—", frequency:"Quarterly (CCAR cycle)", notes:"Finance feeds the CCAR engine directly, bypassing ALM."},
  "edge:sevadv-stressedcap":{notes:"CCAR severely-adverse run (CCAR-M03) → DX10 Projected Capital → Capital-domain stressed path. Scenario choice (severely-adverse) pending SME — see #todo."},
  "CIO":{dataObject:"Securities book (marks) · Portfolio Plan (DX26)", notes:"Upstream source — feeds ALM's balance-sheet / NII forecast via its Investment Portfolio Plan (DX26, register v5), sends AOCI + CECL into Capital, and marks the balance sheet (HQLA · RWA · repricing). It feeds ALM's forecast but does not consume ALM's output."},
};

const GRAPHDATA = {"N": {"ALM-M01": ["Rate / Curve Forecast Model", "Model"], "ALM-P01": ["Rate / Curve Forecast Production & ALCO Approval", "Process"], "ALM-M02": ["Balance Sheet Forecast / Projection Model", "Model"], "ALM-K03": ["Balance Sheet Plan Variance (Actual vs Plan)", "Metric"], "ALM-P02": ["Balance Sheet Planning / Forecasting", "Process"], "ALM-P05": ["Forecast Reconciliation & Variance Analysis", "Process"], "ALM-M03": ["Earnings / NII Forecast Model", "Model"], "ALM-K02": ["NII Forecast Accuracy (Forecast vs Actual)", "Metric"], "ALM-M04": ["Structural / Macro Hedge Model", "Model"], "ALM-K01": ["Structural Hedge Notional / Hedge Ratio", "Metric"], "ALM-P03": ["Structural Hedge Execution & Monitoring", "Process"], "ALM-P04": ["ALCO Coordination / Balance Sheet Strategy", "Process"], "LIQ-M01": ["NMD Behavioralization & Deposit Decay Model", "Model"], "LIQ-M02": ["Deposit Beta Model", "Model"], "LIQ-M06": ["HQLA Haircut & Monetization Model", "Model"], "LIQ-K01": ["LCR (Liquidity Coverage Ratio)", "Metric"], "LIQ-K02": ["NSFR (Net Stable Funding Ratio)", "Metric"], "LIQ-K03": ["HQLA Buffer", "Metric"], "LIQ-P01": ["Daily LCR / NSFR Calculation & Monitoring", "Process"], "LIQ-M03": ["LST (Liquidity Stress Testing) - Short-Term Cash-Flow Model", "Model"], "LIQ-M08": ["LST (Liquidity Stress Testing) - Long-Term / Structural Forecast Model", "Model"], "LIQ-K04": ["LST (Liquidity Stress Testing) - Survival Horizon", "Metric"], "LIQ-K07": ["LST (Liquidity Stress Testing) - Net Cumulative Outflow / Liquidity G…", "Metric"], "LIQ-K10": ["LST (Liquidity Stress Testing) - Structural / Long-Term Funding Gap", "Metric"], "LIQ-P02": ["LST (Liquidity Stress Testing) - Short-Term ILST Run", "Process"], "LIQ-P08": ["LST (Liquidity Stress Testing) - Long-Term / Structural Forecast Run", "Process"], "LIQ-M07": ["Intraday Liquidity Model", "Model"], "LIQ-K09": ["Intraday Peak Usage", "Metric"], "LIQ-P05": ["Intraday Liquidity Monitoring", "Process"], "LIQ-M04": ["Wholesale Funding Run-off / Roll Model", "Model"], "LIQ-M05": ["Contingent Outflow Model (Facility Draws)", "Model"], "LIQ-K08": ["Funding Concentration", "Metric"], "LIQ-P04": ["Contingency Funding Plan (CFP) Maintenance & Trigger Monitoring", "Process"], "LIQ-P06": ["Collateral Management & HQLA Optimization", "Process"], "LIQ-K05": ["RLAP", "Metric"], "LIQ-K06": ["RLEN", "Metric"], "LIQ-P07": ["Resolution Liquidity (RLAP/RLEN) Production", "Process"], "LIQ-P03": ["FR 2052a Data Collection, Transformation & Submission", "Process"], "CAP-M01": ["Credit RWA Engine (Standardized & Advanced/IRB)", "Model"], "CAP-M02": ["Credit Risk Parameter Models (PD / LGD / EAD)", "Model"], "CAP-M03": ["Market RWA Model (incl. FRTB where applicable)", "Model"], "CAP-M04": ["CVA Capital Model", "Model"], "CAP-M05": ["Operational Risk Capital Model", "Model"], "CAP-K03": ["RWA (by risk type)", "Metric"], "CAP-P02": ["RWA Production & Attribution", "Process"], "CAP-K01": ["CET1 Ratio", "Metric"], "CAP-K02": ["Tier 1 / Total Capital Ratio", "Metric"], "CAP-P01": ["Quarterly Regulatory Capital Calculation & Reporting", "Process"], "CAP-M07": ["SLR / Leverage Exposure Engine", "Model"], "CAP-K04": ["SLR (Supplementary Leverage Ratio)", "Metric"], "CAP-M06": ["GSIB Surcharge / Systemic Indicator Calculator", "Model"], "CAP-K05": ["GSIB Surcharge (Method 1 & 2)", "Metric"], "CAP-K06": ["TLAC", "Metric"], "CAP-K07": ["Stress Capital Buffer (SCB)", "Metric"], "CAP-P05": ["TLAC Monitoring", "Process"], "CAP-M08": ["Capital Forecast & Sensitivity Model", "Model"], "CAP-K10": ["Capital Sensitivity to Rates (dCET1)", "Metric"], "CAP-K11": ["Capital Sensitivity to Deposit Migration (dCET1)", "Metric"], "CAP-K12": ["Capital Sensitivity to Credit Spreads (dCET1)", "Metric"], "CAP-K13": ["Capital Sensitivity to RWA (dCET1)", "Metric"], "CAP-P03": ["ICAAP / Capital Adequacy Assessment", "Process"], "CAP-P04": ["Capital Planning & Distribution Governance", "Process"], "CAP-M09": ["Capital Performance: Return on Capital / RAROC Model", "Model"], "CAP-K08": ["Capital Performance: Return on Capital - Existing Portfolios (RORWA)", "Metric"], "CAP-K09": ["Capital Performance: Return on Capital - Marginal / New Business (RAR…", "Metric"], "CAP-P06": ["Capital Performance: Resource Allocation & Review", "Process"], "CAP-M10": ["Subsidiary Mgmt: Legal-Entity Capital & Liquidity Model", "Model"], "CAP-K14": ["Subsidiary Mgmt: Subsidiary Capital Surplus / Deficit (vs Local Minim…", "Metric"], "CAP-K15": ["Subsidiary Mgmt: HoldCo Double Leverage Ratio", "Metric"], "CAP-K16": ["Subsidiary Mgmt: Upstreamable Capital / Liquidity Capacity", "Metric"], "CAP-K17": ["Subsidiary Mgmt: Subsidiary Capital Limit Utilization", "Metric"], "CAP-K18": ["Subsidiary Mgmt: Upstreaming Execution (Actual vs Capacity)", "Metric"], "CAP-P07": ["Subsidiary Mgmt: Intra-Group Capital & Liquidity Up/Downstreaming", "Process"], "CAP-P08": ["Subsidiary Mgmt: Subsidiary Capital Adequacy Monitoring & Local Repor…", "Process"], "CCAR-P01": ["Scenario Design / Expansion (Supervisory + BHC)", "Process"], "CCAR-P06": ["Capital Plan Narrative & Qualitative Assessment", "Process"], "CCAR-P07": ["Management Overlay / Adjustment Governance", "Process"], "CCAR-M01": ["PPNR Models (NII, Non-Interest Income, Expense)", "Model"], "CCAR-K02": ["Projected PPNR", "Metric"], "CCAR-P02": ["PPNR Projection Process", "Process"], "CCAR-M02": ["Credit Loss Projection Models", "Model"], "CCAR-M04": ["Trading & Counterparty Loss / Global Market Shock Model", "Model"], "CCAR-M05": ["Operational Risk Loss Projection Model", "Model"], "CCAR-K03": ["Projected Losses (by portfolio)", "Metric"], "CCAR-P03": ["Loss Projection Process", "Process"], "CCAR-M03": ["Balance Sheet / RWA Projection Model", "Model"], "CCAR-M06": ["Pro-Forma Capital Projection Model", "Model"], "CCAR-K01": ["Projected Minimum CET1 (Severely Adverse)", "Metric"], "CCAR-K04": ["Stress Capital Buffer (derived)", "Metric"], "CCAR-K05": ["Post-Stress Capital Ratios", "Metric"], "CCAR-P04": ["Capital Projection & Aggregation", "Process"], "CCAR-P05": ["FR Y-14 (A/Q/M) Production & Submission", "Process"], "IRRBB-M03": ["Prepayment Model (Mortgage / Loan)", "Model"], "IRRBB-M04": ["Yield Curve / Basis Risk Model", "Model"], "IRRBB-M01": ["EVE (Economic Value of Equity) Model", "Model"], "IRRBB-M02": ["NII Simulation Model", "Model"], "IRRBB-K01": ["Delta-EVE (BCBS 6 standardized shocks)", "Metric"], "IRRBB-K02": ["Delta-NII (12-month)", "Metric"], "IRRBB-K03": ["Repricing Gap", "Metric"], "IRRBB-K04": ["Duration of Equity", "Metric"], "IRRBB-P01": ["EVE & NII Calculation / Rate-Shock Production", "Process"], "IRRBB-P02": ["Behavioral Assumption Setting & Governance", "Process"], "IRRBB-K05": ["IRRBB Limit Utilization", "Metric"], "IRRBB-P03": ["IRRBB Limit Monitoring & Breach Escalation", "Process"], "IRRBB-P04": ["IRRBB Reporting to ALCO", "Process"], "ODM-M01": ["Operational / Non-Operational Deposit Classification Model", "Model"], "ODM-K01": ["Operational Deposit Share", "Metric"], "ODM-P01": ["Op / Non-Op Classification Governance & Refresh", "Process"], "CIO-M01": ["Investment Portfolio Valuation / Mark Model", "Model"], "CIO-M02": ["OCI / AOCI Sensitivity Model", "Model"], "CIO-M04": ["Securities Prepayment / OAS Model", "Model"], "CIO-K01": ["Portfolio Size & Composition (AFS/HTM)", "Metric"], "CIO-K02": ["Unrealized Gains/Losses (AOCI)", "Metric"], "CIO-K03": ["Portfolio Duration", "Metric"], "CIO-K04": ["OCI-at-Risk", "Metric"], "CIO-K05": ["Book Yield / Portfolio Yield", "Metric"], "CIO-P01": ["Investment Portfolio Management & Rebalancing", "Process"], "CIO-P04": ["Portfolio Risk & Limit Monitoring", "Process"], "CIO-M03": ["Hedge Effectiveness Model (ASC 815)", "Model"], "CIO-K06": ["Hedge Effectiveness Ratio", "Metric"], "CIO-P02": ["Hedge Designation & Accounting", "Process"], "CIO-M05": ["HTM/AFS Impairment (CECL) Model", "Model"], "CIO-P05": ["Securities Impairment (CECL) Assessment", "Process"], "CIO-P03": ["AOCI / OCI Monitoring & Reporting", "Process"], "FTP-M01": ["FTP Curve Construction Model", "Model"], "FTP-M02": ["Liquidity Transfer Pricing (LTP) Charge Model", "Model"], "FTP-M03": ["Contingent Liquidity / Facility Pricing Model", "Model"], "FTP-K01": ["FTP Rates / Transfer Curve", "Metric"], "FTP-K04": ["Liquidity Premium / Charge", "Metric"], "FTP-P01": ["FTP Curve Construction & Publication", "Process"], "FTP-P02": ["FTP Rate Assignment to Instruments / Desks", "Process"], "FTP-P03": ["Liquidity Cost Allocation", "Process"], "FTP-K02": ["NIM by Business Unit", "Metric"], "FTP-K03": ["NII Attribution", "Metric"], "FTP-K05": ["FTP-based RAROC / Profitability", "Metric"], "FTP-P04": ["NIM / Profitability Attribution", "Process"], "FTP-P05": ["FTP Methodology Governance & Review", "Process"], "MR01": ["Market Data: Rates & Curves (Market Data Provider)", "DataObject"], "MR02": ["Market Data: FX (Market Data Provider)", "DataObject"], "MR03": ["Market Data: Credit Spreads (Market Data Provider)", "DataObject"], "MR04": ["Benchmark / Index Rates (Market Data Provider)", "DataObject"], "MR05": ["Security / Reference Master (Reference Data System)", "DataObject"], "MR06": ["Customer Segmentation (CRM / Segmentation System)", "DataObject"], "PB01": ["Deposit Balances & Rates (Deposit System of Record)", "DataObject"], "PB02": ["Loan Positions & Cash Flows (Loan System of Record)", "DataObject"], "PB03": ["Securities / Investment Positions (Investment Portfolio System)", "DataObject"], "PB04": ["Derivatives / Hedge Positions (Trading / Derivatives System)", "DataObject"], "PB05": ["Wholesale Funding & Debt (Treasury / Funding System)", "DataObject"], "PB06": ["Off-Balance-Sheet Commitments (Loan / Facility System)", "DataObject"], "PB07": ["Collateral & Encumbrance (Collateral Management System)", "DataObject"], "PB08": ["Counterparty Exposures (Counterparty Risk System)", "DataObject"], "PB09": ["Intraday Payment / Settlement Flows (Payments System)", "DataObject"], "PB10": ["GL / Balance Sheet (General Ledger)", "DataObject"], "PB11": ["Financials / Actuals (Finance / FP&A System)", "DataObject"], "AS01": ["Behavioral: NMD Decay (NMD Behavioralization Model)", "DataObject"], "AS02": ["Behavioral: Deposit Beta (Deposit Beta Model)", "DataObject"], "AS03": ["Behavioral: Prepayment (Prepayment Model)", "DataObject"], "AS04": ["Stress Scenarios: Supervisory (Fed / CCAR)", "DataObject"], "AS05": ["Stress Scenarios: Internal (Scenario Design / Risk)", "DataObject"], "AS06": ["Rate Shock Set (IRRBB Governance / BCBS)", "DataObject"], "AS07": ["Runoff / Rollover Assumptions (Liquidity Risk / ALCO)", "DataObject"], "AS08": ["Risk Parameters: PD / LGD / EAD (Credit Risk Models)", "DataObject"], "AS09": ["Haircuts / Valuation Parameters (Market / Liquidity Risk)", "DataObject"], "AS10": ["Deposit Segmentation: Op / Non-Op (Deposit Modeling / ODM)", "DataObject"], "DX01": ["Projected Cash Flows - Stressed (Liquidity Cash-Flow / Stress Engine)", "DataObject"], "DX02": ["Survival Horizon / LST Output (LST Model)", "DataObject"], "DX03": ["Stressed Funding Gap (Funding Run-off Model)", "DataObject"], "DX04": ["HQLA Monetizable Value (HQLA Model)", "DataObject"], "DX05": ["LCR Results", "DataObject"], "DX06": ["RWA Figures (RWA Engine)", "DataObject"], "DX07": ["Capital Ratios (Capital Calc Engine)", "DataObject"], "DX08": ["PPNR Projection (PPNR Model)", "DataObject"], "DX09": ["Loss Projection (Loss Projection Models)", "DataObject"], "DX10": ["Projected Capital (Capital Projection Model)", "DataObject"], "DX11": ["EVE Results (EVE Model)", "DataObject"], "DX12": ["NII Results - Rate-Shock Sensitivity (IRRBB / NII Simulation)", "DataObject"], "DX13": ["FTP Curve / Transfer Rates (FTP Curve Model)", "DataObject"], "DX14": ["Portfolio Valuations / Marks (Valuation Model)", "DataObject"], "DX15": ["Limit Utilization / Breach Signals (Limit Monitoring)", "DataObject"], "DX16": ["Rate / Curve Forecast (ALM - ALCO-approved)", "DataObject"], "DX17": ["ALM Structural Balance Sheet (ALM)", "DataObject"], "DX18": ["Financial Plan Balance Sheet (Finance / FP&A)", "DataObject"], "DX19": ["Projected Cash Flows - Enterprise / BAU (ALM / Cash-Flow Engine)", "DataObject"], "DX20": ["NII Forecast - Earnings (ALM / Earnings Forecast Model)", "DataObject"], "DX21": ["Capital Forecast / Sensitivity Path (Capital / Forecast Model)", "DataObject"], "DX22": ["Return-on-Capital / RAROC Results (Capital / RAROC Model)", "DataObject"], "DX23": ["Capital Allocation by Business (Capital / Allocation)", "DataObject"], "DX24": ["Legal-Entity Capital & Liquidity Positions / Surplus (Capital / Subsi…", "DataObject"], "DX25": ["Intra-Group Up/Downstreaming Plan (Capital / Treasury)", "DataObject"], "R01": ["ALCO Pack", "Report"], "R02": ["Board / Risk Committee Report", "DataObject"], "R03": ["Risk Appetite & Limits Dashboard", "DataObject"], "R04": ["FR 2052a (Liquidity Monitoring)", "Report"], "R05": ["LCR Disclosure", "DataObject"], "R06": ["NSFR Disclosure", "DataObject"], "R07": ["Resolution Plan - Liquidity (RLAP/RLEN)", "DataObject"], "R08": ["FR Y-9C (Consolidated Financials)", "Report"], "R09": ["FFIEC 101 (Advanced Approaches RWA)", "DataObject"], "R10": ["FR Y-15 (GSIB Surcharge)", "DataObject"], "R11": ["Pillar 3 Disclosure", "DataObject"], "R12": ["FR Y-14 (A/Q/M)", "Report"], "R13": ["CCAR Capital Plan", "DataObject"], "R14": ["DFAST Disclosure", "DataObject"], "R15": ["IRRBB EVE & NII Report", "Report"], "R16": ["Earnings-at-Risk / NII Forecast", "DataObject"], "R17": ["ICAAP / Internal Capital Adequacy", "DataObject"], "R18": ["FTP / NIM Attribution Report", "Report"], "R19": ["Investment Portfolio Report (AFS/HTM/AOCI)", "DataObject"], "R20": ["Hedge / OCI Sensitivity Report", "DataObject"], "LIQ-M09": ["LST (Liquidity Stress Testing) - Spot / Daily Point-in-Time Survival Model", "Model"], "LIQ-P09": ["LST (Liquidity Stress Testing) - Spot / Daily Survival Run", "Process"], "LIQ-K11": ["LST (Liquidity Stress Testing) - Spot Survival Horizon", "Metric"], "LIQ-K12": ["LST (Liquidity Stress Testing) - Spot Net Cumulative Outflow / Liquidity Gap", "Metric"], "DX27": ["Spot LST Output / Daily Survival", "DataObject"], "DX26": ["Investment Portfolio Plan (planned balances / reinvestment / book yield)", "DataObject"], "CIO-K07": ["DV01 (Dollar Value of a Basis Point)", "Metric"], "CAP-K19": ["Subsidiary Mgmt: Subsidiary Capital Limit Breaches", "Metric"], "DX31": ["NSFR Results", "DataObject"]}, "E": [["ALM-K01", "R20"], ["ALM-K02", "R16"], ["ALM-M01", "DX16"], ["ALM-M02", "DX17"], ["ALM-M02", "DX19"], ["ALM-M03", "DX20"], ["ALM-M03", "R16"], ["ALM-M04", "PB04"], ["ALM-P01", "DX16"], ["ALM-P02", "DX17"], ["ALM-P02", "R16"], ["ALM-P03", "DX15"], ["ALM-P03", "PB04"], ["ALM-P04", "R01"], ["ALM-P04", "R02"], ["AS01", "ALM-M02"], ["AS01", "ALM-P02"], ["AS01", "FTP-M02"], ["AS01", "IRRBB-M01"], ["AS01", "IRRBB-M02"], ["AS01", "IRRBB-P01"], ["AS01", "IRRBB-P02"], ["AS01", "LIQ-M03"], ["AS01", "LIQ-M08"], ["AS01", "LIQ-P02"], ["AS02", "ALM-M03"], ["AS02", "CAP-K11"], ["AS02", "CAP-M08"], ["AS02", "CCAR-M01"], ["AS02", "IRRBB-M02"], ["AS02", "IRRBB-P02"], ["AS03", "ALM-M02"], ["AS03", "CCAR-M01"], ["AS03", "CIO-M01"], ["AS03", "FTP-M02"], ["AS03", "IRRBB-M01"], ["AS03", "IRRBB-M02"], ["AS03", "IRRBB-P01"], ["AS03", "IRRBB-P02"], ["AS03", "LIQ-M03"], ["AS03", "LIQ-M08"], ["AS03", "LIQ-P02"], ["AS04", "CCAR-M01"], ["AS04", "CCAR-M02"], ["AS04", "CCAR-M03"], ["AS04", "CCAR-M04"], ["AS04", "CCAR-M05"], ["AS04", "CCAR-P01"], ["AS04", "CCAR-P02"], ["AS04", "CCAR-P03"], ["AS05", "CAP-P03"], ["AS05", "CCAR-M01"], ["AS05", "CCAR-M02"], ["AS05", "CCAR-M03"], ["AS05", "CCAR-P02"], ["AS05", "CCAR-P03"], ["AS05", "CIO-M05"], ["AS05", "CIO-P05"], ["AS05", "LIQ-M03"], ["AS05", "LIQ-M04"], ["AS05", "LIQ-M05"], ["AS05", "LIQ-M08"], ["AS05", "LIQ-P02"], ["AS05", "LIQ-P07"], ["AS05", "LIQ-P08"], ["AS06", "CIO-K04"], ["AS06", "CIO-M02"], ["AS06", "IRRBB-M01"], ["AS06", "IRRBB-M02"], ["AS06", "IRRBB-P01"], ["AS07", "FTP-M02"], ["AS07", "FTP-M03"], ["AS07", "FTP-P03"], ["AS07", "LIQ-M03"], ["AS07", "LIQ-M04"], ["AS07", "LIQ-M05"], ["AS07", "LIQ-M08"], ["AS07", "LIQ-P01"], ["AS07", "LIQ-P02"], ["AS07", "LIQ-P08"], ["AS08", "CAP-K09"], ["AS08", "CAP-M01"], ["AS08", "CAP-M04"], ["AS08", "CAP-M09"], ["AS08", "CAP-P02"], ["AS08", "CCAR-M02"], ["AS08", "CCAR-P03"], ["AS08", "CIO-M05"], ["AS08", "CIO-P05"], ["AS09", "CIO-M01"], ["AS09", "LIQ-M06"], ["AS09", "LIQ-P06"], ["AS10", "LIQ-P01"], ["AS10", "ODM-K01"], ["AS10", "ODM-P01"], ["CAP-K01", "DX07"], ["CAP-K01", "R02"], ["CAP-K01", "R11"], ["CAP-K02", "DX07"], ["CAP-K03", "DX06"], ["CAP-K03", "R09"], ["CAP-K03", "R11"], ["CAP-K04", "DX07"], ["CAP-K05", "R10"], ["CAP-M01", "DX06"], ["CAP-M02", "AS08"], ["CAP-M03", "DX06"], ["CAP-M04", "DX06"], ["CAP-M05", "DX06"], ["CAP-M06", "R10"], ["CAP-M07", "DX07"], ["CAP-M08", "DX21"], ["CAP-M09", "DX22"], ["CAP-M10", "DX24"], ["CAP-P01", "DX07"], ["CAP-P01", "R08"], ["CAP-P01", "R11"], ["CAP-P02", "DX06"], ["CAP-P02", "R09"], ["CAP-P03", "R17"], ["CAP-P04", "R02"], ["CAP-P04", "R13"], ["CAP-P05", "DX15"], ["CAP-P05", "R03"], ["CAP-P06", "DX23"], ["CAP-P07", "DX25"], ["CAP-P08", "DX15"], ["CCAR-K01", "DX10"], ["CCAR-K01", "R12"], ["CCAR-K01", "R13"], ["CCAR-K02", "DX08"], ["CCAR-K02", "R12"], ["CCAR-K03", "DX09"], ["CCAR-K03", "R12"], ["CCAR-K04", "R13"], ["CCAR-K05", "DX10"], ["CCAR-K05", "R14"], ["CCAR-M01", "DX08"], ["CCAR-M02", "DX09"], ["CCAR-M03", "DX06"], ["CCAR-M04", "DX09"], ["CCAR-M05", "DX09"], ["CCAR-M06", "DX10"], ["CCAR-P01", "AS05"], ["CCAR-P02", "DX08"], ["CCAR-P03", "DX09"], ["CCAR-P04", "DX10"], ["CCAR-P04", "R14"], ["CCAR-P05", "R12"], ["CCAR-P06", "R13"], ["CCAR-P07", "DX08"], ["CCAR-P07", "DX09"], ["CIO-K01", "R19"], ["CIO-K02", "R19"], ["CIO-K02", "R20"], ["CIO-K04", "R20"], ["CIO-K05", "R19"], ["CIO-K06", "R20"], ["CIO-M01", "DX14"], ["CIO-M03", "R20"], ["CIO-M04", "AS03"], ["CIO-M05", "DX09"], ["CIO-P01", "PB03"], ["CIO-P01", "R19"], ["CIO-P03", "R01"], ["CIO-P03", "R19"], ["CIO-P03", "R20"], ["CIO-P04", "DX15"], ["CIO-P04", "R03"], ["CIO-P05", "DX09"], ["DX01", "LIQ-K01"], ["DX01", "LIQ-K04"], ["DX01", "LIQ-K05"], ["DX01", "LIQ-K06"], ["DX01", "LIQ-K07"], ["DX01", "LIQ-P01"], ["DX01", "LIQ-P07"], ["DX02", "LIQ-P04"], ["DX03", "LIQ-K06"], ["DX03", "LIQ-P04"], ["DX03", "LIQ-P07"], ["DX04", "CAP-M10"], ["DX04", "LIQ-K01"], ["DX04", "LIQ-P01"], ["DX04", "LIQ-P06"], ["DX05", "ALM-P04"], ["DX05", "CAP-K16"], ["DX05", "CAP-M10"], ["DX05", "LIQ-P04"], ["DX06", "CAP-K01"], ["DX06", "CAP-K02"], ["DX06", "CAP-K06"], ["DX06", "CAP-K08"], ["DX06", "CAP-K09"], ["DX06", "CAP-K13"], ["DX06", "CAP-K14"], ["DX06", "CAP-M08"], ["DX06", "CAP-M09"], ["DX06", "CAP-M10"], ["DX06", "CAP-P01"], ["DX06", "CAP-P03"], ["DX06", "CAP-P05"], ["DX06", "CCAR-M06"], ["DX06", "CCAR-P04"], ["DX06", "FTP-K05"], ["DX06", "FTP-P04"], ["DX07", "ALM-P04"], ["DX07", "CAP-K08"], ["DX07", "CAP-K10"], ["DX07", "CAP-K11"], ["DX07", "CAP-K12"], ["DX07", "CAP-K13"], ["DX07", "CAP-K14"], ["DX07", "CAP-K16"], ["DX07", "CAP-M08"], ["DX07", "CAP-M09"], ["DX07", "CAP-M10"], ["DX07", "CAP-P03"], ["DX07", "CAP-P04"], ["DX07", "CAP-P05"], ["DX07", "CCAR-P06"], ["DX08", "CCAR-M03"], ["DX08", "CCAR-M06"], ["DX08", "CCAR-P04"], ["DX08", "CCAR-P05"], ["DX08", "CCAR-P07"], ["DX09", "CAP-P03"], ["DX09", "CCAR-M06"], ["DX09", "CCAR-P04"], ["DX09", "CCAR-P05"], ["DX09", "CCAR-P07"], ["DX10", "CAP-K07"], ["DX10", "CAP-P03"], ["DX10", "CAP-P04"], ["DX10", "CAP-P06"], ["DX10", "CCAR-K04"], ["DX10", "CCAR-P05"], ["DX10", "CCAR-P06"], ["DX11", "ALM-M04"], ["DX11", "ALM-P03"], ["DX11", "ALM-P04"], ["DX11", "IRRBB-K04"], ["DX11", "IRRBB-K05"], ["DX11", "IRRBB-P03"], ["DX11", "IRRBB-P04"], ["DX12", "IRRBB-K05"], ["DX12", "IRRBB-P03"], ["DX12", "IRRBB-P04"], ["DX13", "ALM-M03"], ["DX13", "CAP-K09"], ["DX13", "CAP-M09"], ["DX13", "FTP-K02"], ["DX13", "FTP-K03"], ["DX13", "FTP-K04"], ["DX13", "FTP-K05"], ["DX13", "FTP-M02"], ["DX13", "FTP-M03"], ["DX13", "FTP-P02"], ["DX13", "FTP-P03"], ["DX13", "FTP-P04"], ["DX13", "FTP-P05"], ["DX14", "CIO-K02"], ["DX14", "CIO-K04"], ["DX14", "CIO-M02"], ["DX14", "CIO-P01"], ["DX14", "CIO-P03"], ["DX14", "CIO-P04"], ["DX15", "IRRBB-P03"], ["DX15", "IRRBB-P04"], ["DX15", "LIQ-P04"], ["DX16", "ALM-M02"], ["DX16", "ALM-M03"], ["DX16", "ALM-M04"], ["DX16", "ALM-P02"], ["DX16", "ALM-P03"], ["DX16", "CAP-K10"], ["DX16", "CAP-M08"], ["DX17", "ALM-K03"], ["DX17", "ALM-M03"], ["DX17", "ALM-M04"], ["DX17", "ALM-P03"], ["DX17", "ALM-P04"], ["DX17", "ALM-P05"], ["DX17", "CAP-M08"], ["DX17", "LIQ-K10"], ["DX17", "LIQ-M08"], ["DX17", "LIQ-P08"], ["DX18", "ALM-P05"], ["DX18", "CAP-P03"], ["DX18", "CAP-P04"], ["DX19", "IRRBB-M01"], ["DX19", "IRRBB-M02"], ["DX19", "IRRBB-P01"], ["DX19", "LIQ-M03"], ["DX19", "LIQ-M05"], ["DX19", "LIQ-P02"], ["DX20", "ALM-K02"], ["DX20", "ALM-M04"], ["DX20", "ALM-P03"], ["DX20", "ALM-P04"], ["DX20", "ALM-P05"], ["DX20", "CAP-M08"], ["DX21", "CAP-P03"], ["DX21", "CAP-P04"], ["DX21", "CAP-P06"], ["DX22", "CAP-P06"], ["DX23", "CAP-P04"], ["DX23", "CAP-P07"], ["DX24", "CAP-K17"], ["DX24", "CAP-K18"], ["DX24", "CAP-P07"], ["DX24", "CAP-P08"], ["DX25", "CAP-P04"], ["FTP-K01", "DX13"], ["FTP-K01", "R18"], ["FTP-K02", "R18"], ["FTP-K03", "R18"], ["FTP-M01", "DX13"], ["FTP-M02", "DX13"], ["FTP-M03", "DX13"], ["FTP-P01", "DX13"], ["FTP-P04", "R18"], ["IRRBB-K01", "DX11"], ["IRRBB-K01", "R01"], ["IRRBB-K01", "R15"], ["IRRBB-K02", "DX12"], ["IRRBB-K02", "R01"], ["IRRBB-K02", "R15"], ["IRRBB-K02", "R16"], ["IRRBB-K05", "DX15"], ["IRRBB-K05", "R03"], ["IRRBB-M01", "DX11"], ["IRRBB-M02", "DX12"], ["IRRBB-M03", "AS03"], ["IRRBB-M04", "AS06"], ["IRRBB-P01", "DX11"], ["IRRBB-P01", "DX12"], ["IRRBB-P01", "R15"], ["IRRBB-P02", "AS01"], ["IRRBB-P02", "AS02"], ["IRRBB-P02", "AS03"], ["IRRBB-P03", "DX15"], ["IRRBB-P03", "R03"], ["IRRBB-P04", "R01"], ["IRRBB-P04", "R15"], ["LIQ-K01", "DX05"], ["LIQ-K01", "R01"], ["LIQ-K01", "R05"], ["LIQ-K02", "DX31"], ["LIQ-K02", "R06"], ["LIQ-K03", "DX04"], ["LIQ-K04", "DX02"], ["LIQ-K04", "R01"], ["LIQ-K05", "R07"], ["LIQ-K06", "R07"], ["LIQ-K07", "DX03"], ["LIQ-K10", "DX03"], ["LIQ-M01", "AS01"], ["LIQ-M02", "AS02"], ["LIQ-M03", "DX01"], ["LIQ-M03", "DX02"], ["LIQ-M03", "DX03"], ["LIQ-M04", "DX03"], ["LIQ-M05", "DX01"], ["LIQ-M06", "DX04"], ["LIQ-M08", "DX03"], ["LIQ-P01", "DX05"], ["LIQ-P01", "DX15"], ["LIQ-P01", "R01"], ["LIQ-P01", "R05"], ["LIQ-P01", "R06"], ["LIQ-P02", "DX01"], ["LIQ-P02", "DX02"], ["LIQ-P02", "DX03"], ["LIQ-P03", "R04"], ["LIQ-P04", "DX15"], ["LIQ-P04", "R03"], ["LIQ-P05", "DX15"], ["LIQ-P06", "DX04"], ["LIQ-P07", "R07"], ["LIQ-P08", "DX03"], ["MR01", "ALM-M01"], ["MR01", "ALM-P01"], ["MR01", "CAP-M03"], ["MR01", "CCAR-M01"], ["MR01", "CCAR-M04"], ["MR01", "CCAR-P01"], ["MR01", "CIO-K03"], ["MR01", "CIO-M01"], ["MR01", "CIO-M02"], ["MR01", "CIO-M03"], ["MR01", "CIO-M04"], ["MR01", "CIO-P01"], ["MR01", "CIO-P04"], ["MR01", "FTP-M01"], ["MR01", "FTP-P01"], ["MR01", "IRRBB-M01"], ["MR01", "IRRBB-M02"], ["MR01", "IRRBB-M03"], ["MR01", "IRRBB-M04"], ["MR01", "LIQ-M01"], ["MR01", "LIQ-M02"], ["MR01", "LIQ-M03"], ["MR01", "LIQ-M04"], ["MR01", "LIQ-M06"], ["MR01", "LIQ-M08"], ["MR01", "LIQ-P02"], ["MR02", "ALM-M01"], ["MR02", "CAP-M03"], ["MR02", "CCAR-M04"], ["MR02", "LIQ-K05"], ["MR02", "LIQ-K06"], ["MR02", "LIQ-P07"], ["MR03", "CAP-K12"], ["MR03", "CAP-M03"], ["MR03", "CAP-M04"], ["MR03", "CAP-M08"], ["MR03", "CCAR-M04"], ["MR03", "CIO-M01"], ["MR03", "CIO-M04"], ["MR03", "CIO-M05"], ["MR03", "FTP-M01"], ["MR03", "LIQ-M06"], ["MR04", "ALM-M01"], ["MR04", "ALM-P01"], ["MR04", "FTP-M01"], ["MR04", "FTP-P01"], ["MR04", "IRRBB-M03"], ["MR04", "IRRBB-M04"], ["MR04", "LIQ-M02"], ["MR06", "CAP-M02"], ["MR06", "LIQ-M01"], ["MR06", "LIQ-M02"], ["ODM-M01", "AS10"], ["PB01", "ALM-M02"], ["PB01", "ALM-P02"], ["PB01", "CCAR-M01"], ["PB01", "CCAR-P02"], ["PB01", "FTP-K02"], ["PB01", "FTP-P02"], ["PB01", "FTP-P04"], ["PB01", "IRRBB-K03"], ["PB01", "IRRBB-M01"], ["PB01", "IRRBB-M02"], ["PB01", "IRRBB-P01"], ["PB01", "IRRBB-P02"], ["PB01", "LIQ-M01"], ["PB01", "LIQ-M02"], ["PB01", "LIQ-M03"], ["PB01", "LIQ-P01"], ["PB01", "LIQ-P02"], ["PB01", "LIQ-P03"], ["PB01", "ODM-M01"], ["PB01", "ODM-P01"], ["PB02", "ALM-M02"], ["PB02", "ALM-P02"], ["PB02", "CAP-K09"], ["PB02", "CAP-M01"], ["PB02", "CAP-M02"], ["PB02", "CAP-M07"], ["PB02", "CAP-M09"], ["PB02", "CAP-P02"], ["PB02", "CCAR-M01"], ["PB02", "CCAR-M02"], ["PB02", "CCAR-P02"], ["PB02", "CCAR-P03"], ["PB02", "CCAR-P05"], ["PB02", "FTP-K02"], ["PB02", "FTP-P02"], ["PB02", "FTP-P04"], ["PB02", "IRRBB-K03"], ["PB02", "IRRBB-M01"], ["PB02", "IRRBB-M02"], ["PB02", "IRRBB-M03"], ["PB02", "IRRBB-P01"], ["PB02", "LIQ-K02"], ["PB02", "LIQ-M03"], ["PB02", "LIQ-P01"], ["PB02", "LIQ-P02"], ["PB02", "LIQ-P03"], ["PB03", "CAP-M03"], ["PB03", "CAP-P02"], ["PB03", "CIO-K01"], ["PB03", "CIO-K03"], ["PB03", "CIO-K05"], ["PB03", "CIO-M01"], ["PB03", "CIO-M02"], ["PB03", "CIO-M03"], ["PB03", "CIO-M04"], ["PB03", "CIO-M05"], ["PB03", "CIO-P01"], ["PB03", "CIO-P02"], ["PB03", "CIO-P03"], ["PB03", "CIO-P04"], ["PB03", "CIO-P05"], ["PB03", "IRRBB-M01"], ["PB03", "IRRBB-M03"], ["PB03", "LIQ-M03"], ["PB03", "LIQ-M06"], ["PB03", "LIQ-P01"], ["PB03", "LIQ-P02"], ["PB03", "LIQ-P03"], ["PB03", "LIQ-P06"], ["PB04", "ALM-K01"], ["PB04", "ALM-M04"], ["PB04", "ALM-P03"], ["PB04", "CAP-M03"], ["PB04", "CAP-M04"], ["PB04", "CAP-M06"], ["PB04", "CAP-M07"], ["PB04", "CAP-P02"], ["PB04", "CCAR-M04"], ["PB04", "CIO-K06"], ["PB04", "CIO-M03"], ["PB04", "CIO-P02"], ["PB04", "IRRBB-M01"], ["PB04", "LIQ-M03"], ["PB04", "LIQ-P02"], ["PB05", "ALM-M02"], ["PB05", "ALM-P02"], ["PB05", "CAP-K06"], ["PB05", "CAP-M06"], ["PB05", "CAP-P01"], ["PB05", "CAP-P05"], ["PB05", "FTP-M01"], ["PB05", "FTP-P01"], ["PB05", "IRRBB-K03"], ["PB05", "IRRBB-M01"], ["PB05", "IRRBB-M02"], ["PB05", "LIQ-K02"], ["PB05", "LIQ-K08"], ["PB05", "LIQ-M03"], ["PB05", "LIQ-M04"], ["PB05", "LIQ-P01"], ["PB05", "LIQ-P02"], ["PB05", "LIQ-P03"], ["PB05", "LIQ-P07"], ["PB06", "CAP-M01"], ["PB06", "CAP-M07"], ["PB06", "CAP-P02"], ["PB06", "FTP-M02"], ["PB06", "FTP-M03"], ["PB06", "FTP-P03"], ["PB06", "LIQ-M03"], ["PB06", "LIQ-M05"], ["PB06", "LIQ-P02"], ["PB07", "LIQ-K05"], ["PB07", "LIQ-M06"], ["PB07", "LIQ-M07"], ["PB07", "LIQ-P05"], ["PB07", "LIQ-P06"], ["PB07", "LIQ-P07"], ["PB08", "CAP-M01"], ["PB08", "CAP-M02"], ["PB08", "CAP-M04"], ["PB08", "CAP-M06"], ["PB08", "CAP-P02"], ["PB08", "CCAR-M02"], ["PB08", "CCAR-M04"], ["PB08", "LIQ-K08"], ["PB08", "LIQ-M03"], ["PB08", "LIQ-M04"], ["PB08", "LIQ-P02"], ["PB08", "LIQ-P03"], ["PB09", "LIQ-K09"], ["PB09", "LIQ-M07"], ["PB09", "LIQ-P03"], ["PB09", "LIQ-P05"], ["PB10", "ALM-K03"], ["PB10", "ALM-M02"], ["PB10", "ALM-P05"], ["PB10", "CAP-K01"], ["PB10", "CAP-K02"], ["PB10", "CAP-K04"], ["PB10", "CAP-K05"], ["PB10", "CAP-K15"], ["PB10", "CAP-M06"], ["PB10", "CAP-M07"], ["PB10", "CAP-M10"], ["PB10", "CAP-P01"], ["PB10", "CCAR-M03"], ["PB10", "CCAR-M06"], ["PB10", "CCAR-P05"], ["PB11", "ALM-K02"], ["PB11", "ALM-M02"], ["PB11", "ALM-P02"], ["PB11", "ALM-P05"], ["PB11", "CAP-K08"], ["PB11", "CAP-K18"], ["PB11", "CAP-M05"], ["PB11", "CAP-M09"], ["PB11", "CAP-P07"], ["PB11", "CCAR-M01"], ["PB11", "CCAR-M05"], ["PB11", "FTP-K03"], ["PB11", "FTP-K05"], ["PB11", "FTP-P04"], ["R03", "ALM-P04"], ["R12", "CCAR-P06"], ["R17", "CAP-P04"], ["LIQ-M09", "DX27"], ["LIQ-P09", "DX27"], ["DX27", "LIQ-K11"], ["DX27", "LIQ-K12"], ["MR01", "LIQ-M09"], ["MR01", "LIQ-P09"], ["PB01", "LIQ-M09"], ["PB01", "LIQ-P09"], ["PB02", "LIQ-M09"], ["PB02", "LIQ-P09"], ["PB03", "LIQ-M09"], ["PB03", "LIQ-P09"], ["PB04", "LIQ-M09"], ["PB04", "LIQ-P09"], ["PB05", "LIQ-M09"], ["PB05", "LIQ-P09"], ["PB06", "LIQ-M09"], ["PB06", "LIQ-P09"], ["PB08", "LIQ-M09"], ["PB08", "LIQ-P09"], ["AS01", "LIQ-M09"], ["AS01", "LIQ-P09"], ["AS03", "LIQ-M09"], ["AS03", "LIQ-P09"], ["AS05", "LIQ-M09"], ["AS05", "LIQ-P09"], ["AS07", "LIQ-M09"], ["AS07", "LIQ-P09"], ["CIO-P01", "DX26"], ["DX26", "ALM-M02"], ["DX26", "ALM-P02"], ["DX26", "ALM-M03"], ["DX26", "ALM-P05"], ["MR01", "CIO-K07"], ["PB03", "CIO-K07"], ["DX24", "CAP-K19"], ["LIQ-K02", "DX31"], ["LIQ-P01", "DX31"], ["DX31", "ALM-P04"], ["DX31", "LIQ-P04"], ["DX31", "CAP-M10"], ["DX31", "CAP-K16"], ["R04", "LIQ-K01"], ["R04", "LIQ-K02"], ["R04", "LIQ-P01"]]};
const DXNODES = new Set(["DX16","DX17","DX18","DX19","DX20","DX02","DX27","DX03","DX05","DX31"]);
const REGISTER_EDGES = new Set(["ALM-K01|R20", "ALM-K02|R16", "ALM-M01|DX16", "ALM-M02|DX17", "ALM-M02|DX19", "ALM-M02|DX29", "ALM-M03|DX20", "ALM-M03|R16", "ALM-M04|PB04", "ALM-P01|DX16", "ALM-P02|DX17", "ALM-P02|R16", "ALM-P03|DX15", "ALM-P03|PB04", "ALM-P04|R01", "ALM-P04|R02", "AS01|ALM-M02", "AS01|ALM-P02", "AS01|FTP-M02", "AS01|IRRBB-M01", "AS01|IRRBB-M02", "AS01|IRRBB-P01", "AS01|IRRBB-P02", "AS01|LIQ-M03", "AS01|LIQ-M08", "AS01|LIQ-M09", "AS01|LIQ-P02", "AS01|LIQ-P09", "AS02|ALM-M03", "AS02|CAP-K11", "AS02|CAP-M08", "AS02|CCAR-M01", "AS02|IRRBB-M02", "AS02|IRRBB-P02", "AS03|ALM-M02", "AS03|CCAR-M01", "AS03|CIO-M01", "AS03|FTP-M02", "AS03|IRRBB-M01", "AS03|IRRBB-M02", "AS03|IRRBB-P01", "AS03|IRRBB-P02", "AS03|LIQ-M03", "AS03|LIQ-M08", "AS03|LIQ-M09", "AS03|LIQ-P02", "AS03|LIQ-P09", "AS04|CCAR-M01", "AS04|CCAR-M02", "AS04|CCAR-M03", "AS04|CCAR-M04", "AS04|CCAR-M05", "AS04|CCAR-P01", "AS04|CCAR-P02", "AS04|CCAR-P03", "AS05|CAP-P03", "AS05|CCAR-M01", "AS05|CCAR-M02", "AS05|CCAR-M03", "AS05|CCAR-P02", "AS05|CCAR-P03", "AS05|CIO-M05", "AS05|CIO-P05", "AS05|LIQ-M03", "AS05|LIQ-M04", "AS05|LIQ-M05", "AS05|LIQ-M08", "AS05|LIQ-M09", "AS05|LIQ-P02", "AS05|LIQ-P07", "AS05|LIQ-P08", "AS05|LIQ-P09", "AS06|CIO-K04", "AS06|CIO-M02", "AS06|IRRBB-M01", "AS06|IRRBB-M02", "AS06|IRRBB-P01", "AS07|FTP-M02", "AS07|FTP-M03", "AS07|FTP-P03", "AS07|LIQ-M03", "AS07|LIQ-M04", "AS07|LIQ-M05", "AS07|LIQ-M08", "AS07|LIQ-M09", "AS07|LIQ-P01", "AS07|LIQ-P02", "AS07|LIQ-P08", "AS07|LIQ-P09", "AS08|CAP-K09", "AS08|CAP-M01", "AS08|CAP-M04", "AS08|CAP-M09", "AS08|CAP-P02", "AS08|CCAR-M02", "AS08|CCAR-P03", "AS08|CIO-M05", "AS08|CIO-P05", "AS09|CIO-M01", "AS09|LIQ-M06", "AS09|LIQ-P06", "AS10|LIQ-P01", "AS10|ODM-K01", "AS10|ODM-P01", "CAP-K01|DX07", "CAP-K01|R02", "CAP-K01|R11", "CAP-K02|DX07", "CAP-K03|DX06", "CAP-K03|R09", "CAP-K03|R11", "CAP-K04|DX07", "CAP-K05|R10", "CAP-M01|DX06", "CAP-M02|AS08", "CAP-M03|DX06", "CAP-M04|DX06", "CAP-M05|DX06", "CAP-M06|R10", "CAP-M07|DX07", "CAP-M08|DX21", "CAP-M09|DX22", "CAP-M10|DX24", "CAP-P01|DX07", "CAP-P01|R08", "CAP-P01|R11", "CAP-P02|DX06", "CAP-P02|R09", "CAP-P03|R17", "CAP-P04|R02", "CAP-P04|R13", "CAP-P05|DX15", "CAP-P05|R03", "CAP-P06|DX23", "CAP-P07|DX25", "CAP-P08|DX15", "CCAR-K01|DX10", "CCAR-K01|R12", "CCAR-K01|R13", "CCAR-K02|DX08", "CCAR-K02|R12", "CCAR-K03|DX09", "CCAR-K03|R12", "CCAR-K04|R13", "CCAR-K05|DX10", "CCAR-K05|R14", "CCAR-M01|DX08", "CCAR-M02|DX09", "CCAR-M03|DX06", "CCAR-M04|DX09", "CCAR-M05|DX09", "CCAR-M06|DX10", "CCAR-P01|AS05", "CCAR-P02|DX08", "CCAR-P03|DX09", "CCAR-P04|DX10", "CCAR-P04|R14", "CCAR-P05|R12", "CCAR-P06|R13", "CCAR-P07|DX08", "CCAR-P07|DX09", "CIO-K01|R19", "CIO-K02|R19", "CIO-K02|R20", "CIO-K04|R20", "CIO-K05|R19", "CIO-K06|R20", "CIO-M01|DX14", "CIO-M03|R20", "CIO-M04|AS03", "CIO-M05|DX09", "CIO-P01|DX26", "CIO-P01|PB03", "CIO-P01|R19", "CIO-P03|R01", "CIO-P03|R19", "CIO-P03|R20", "CIO-P04|DX15", "CIO-P04|R03", "CIO-P05|DX09", "CTRL-P01|DX28", "DX01|LIQ-K01", "DX01|LIQ-K04", "DX01|LIQ-K05", "DX01|LIQ-K06", "DX01|LIQ-K07", "DX01|LIQ-P01", "DX01|LIQ-P07", "DX02|LIQ-P04", "DX03|LIQ-K06", "DX03|LIQ-P04", "DX03|LIQ-P07", "DX04|CAP-M10", "DX04|LIQ-K01", "DX04|LIQ-P01", "DX04|LIQ-P06", "DX05|ALM-P04", "DX05|CAP-K16", "DX05|CAP-M10", "DX05|LIQ-P04", "DX06|CAP-K01", "DX06|CAP-K02", "DX06|CAP-K06", "DX06|CAP-K08", "DX06|CAP-K09", "DX06|CAP-K13", "DX06|CAP-K14", "DX06|CAP-M08", "DX06|CAP-M09", "DX06|CAP-M10", "DX06|CAP-P01", "DX06|CAP-P03", "DX06|CAP-P05", "DX06|CCAR-M06", "DX06|CCAR-P04", "DX06|FTP-K05", "DX06|FTP-P04", "DX07|ALM-P04", "DX07|CAP-K08", "DX07|CAP-K10", "DX07|CAP-K11", "DX07|CAP-K12", "DX07|CAP-K13", "DX07|CAP-K14", "DX07|CAP-K16", "DX07|CAP-M08", "DX07|CAP-M09", "DX07|CAP-M10", "DX07|CAP-P03", "DX07|CAP-P04", "DX07|CAP-P05", "DX07|CCAR-P06", "DX08|CCAR-M03", "DX08|CCAR-M06", "DX08|CCAR-P04", "DX08|CCAR-P05", "DX08|CCAR-P07", "DX09|CAP-P03", "DX09|CCAR-M06", "DX09|CCAR-P04", "DX09|CCAR-P05", "DX09|CCAR-P07", "DX10|CAP-K07", "DX10|CAP-P03", "DX10|CAP-P04", "DX10|CAP-P06", "DX10|CCAR-K04", "DX10|CCAR-P05", "DX10|CCAR-P06", "DX11|ALM-M04", "DX11|ALM-P03", "DX11|ALM-P04", "DX11|IRRBB-K04", "DX11|IRRBB-K05", "DX11|IRRBB-P03", "DX11|IRRBB-P04", "DX12|IRRBB-K05", "DX12|IRRBB-P03", "DX12|IRRBB-P04", "DX13|ALM-M03", "DX13|CAP-K09", "DX13|CAP-M09", "DX13|FTP-K02", "DX13|FTP-K03", "DX13|FTP-K04", "DX13|FTP-K05", "DX13|FTP-M02", "DX13|FTP-M03", "DX13|FTP-P02", "DX13|FTP-P03", "DX13|FTP-P04", "DX13|FTP-P05", "DX14|CIO-K02", "DX14|CIO-K04", "DX14|CIO-M02", "DX14|CIO-P01", "DX14|CIO-P03", "DX14|CIO-P04", "DX14|CTRL-P01", "DX15|IRRBB-P03", "DX15|IRRBB-P04", "DX15|LIQ-P04", "DX16|ALM-M02", "DX16|ALM-M03", "DX16|ALM-M04", "DX16|ALM-P02", "DX16|ALM-P03", "DX16|CAP-K10", "DX16|CAP-M08", "DX17|ALM-K03", "DX17|ALM-M03", "DX17|ALM-M04", "DX17|ALM-P03", "DX17|ALM-P04", "DX17|ALM-P05", "DX17|CAP-M08", "DX17|LIQ-K10", "DX17|LIQ-M08", "DX17|LIQ-P08", "DX18|ALM-P05", "DX18|CAP-P03", "DX18|CAP-P04", "DX19|IRRBB-M01", "DX19|IRRBB-M02", "DX19|IRRBB-P01", "DX19|LIQ-M03", "DX19|LIQ-M05", "DX19|LIQ-P02", "DX20|ALM-K02", "DX20|ALM-M04", "DX20|ALM-P03", "DX20|ALM-P04", "DX20|ALM-P05", "DX20|CAP-M08", "DX21|CAP-P03", "DX21|CAP-P04", "DX21|CAP-P06", "DX22|CAP-P06", "DX23|CAP-P04", "DX23|CAP-P07", "DX24|CAP-K17", "DX24|CAP-K18", "DX24|CAP-K19", "DX24|CAP-P07", "DX24|CAP-P08", "DX25|CAP-P04", "DX26|ALM-M02", "DX26|ALM-M03", "DX26|ALM-P02", "DX26|ALM-P05", "DX27|LIQ-K11", "DX27|LIQ-K12", "DX28|CAP-P01", "DX29|CAP-M08", "DX31|ALM-P04", "DX31|CAP-K16", "DX31|CAP-M10", "DX31|LIQ-P04", "FTP-K01|DX13", "FTP-K01|R18", "FTP-K02|R18", "FTP-K03|R18", "FTP-M01|DX13", "FTP-M02|DX13", "FTP-M03|DX13", "FTP-P01|DX13", "FTP-P04|R18", "IRRBB-K01|DX11", "IRRBB-K01|R01", "IRRBB-K01|R15", "IRRBB-K02|DX12", "IRRBB-K02|R01", "IRRBB-K02|R15", "IRRBB-K02|R16", "IRRBB-K05|DX15", "IRRBB-K05|R03", "IRRBB-M01|DX11", "IRRBB-M02|DX12", "IRRBB-M03|AS03", "IRRBB-M04|AS06", "IRRBB-P01|DX11", "IRRBB-P01|DX12", "IRRBB-P01|R15", "IRRBB-P02|AS01", "IRRBB-P02|AS02", "IRRBB-P02|AS03", "IRRBB-P03|DX15", "IRRBB-P03|R03", "IRRBB-P04|R01", "IRRBB-P04|R15", "LIQ-K01|DX05", "LIQ-K01|R01", "LIQ-K01|R05", "LIQ-K02|DX31", "LIQ-K02|R06", "LIQ-K03|DX04", "LIQ-K04|DX02", "LIQ-K04|R01", "LIQ-K05|R07", "LIQ-K06|R07", "LIQ-K07|DX03", "LIQ-K10|DX03", "LIQ-M01|AS01", "LIQ-M02|AS02", "LIQ-M03|DX01", "LIQ-M03|DX02", "LIQ-M03|DX03", "LIQ-M04|DX03", "LIQ-M05|DX01", "LIQ-M06|DX04", "LIQ-M08|DX03", "LIQ-M09|DX27", "LIQ-P01|DX05", "LIQ-P01|DX15", "LIQ-P01|DX31", "LIQ-P01|R01", "LIQ-P01|R05", "LIQ-P01|R06", "LIQ-P02|DX01", "LIQ-P02|DX02", "LIQ-P02|DX03", "LIQ-P03|R04", "LIQ-P04|DX15", "LIQ-P04|R03", "LIQ-P05|DX15", "LIQ-P06|DX04", "LIQ-P07|R07", "LIQ-P08|DX03", "LIQ-P09|DX27", "MR01|ALM-M01", "MR01|ALM-P01", "MR01|CAP-M03", "MR01|CCAR-M01", "MR01|CCAR-M04", "MR01|CCAR-P01", "MR01|CIO-K03", "MR01|CIO-K07", "MR01|CIO-M01", "MR01|CIO-M02", "MR01|CIO-M03", "MR01|CIO-M04", "MR01|CIO-P01", "MR01|CIO-P04", "MR01|FTP-M01", "MR01|FTP-P01", "MR01|IRRBB-M01", "MR01|IRRBB-M02", "MR01|IRRBB-M03", "MR01|IRRBB-M04", "MR01|LIQ-M01", "MR01|LIQ-M02", "MR01|LIQ-M03", "MR01|LIQ-M04", "MR01|LIQ-M06", "MR01|LIQ-M08", "MR01|LIQ-M09", "MR01|LIQ-P02", "MR01|LIQ-P09", "MR02|ALM-M01", "MR02|CAP-M03", "MR02|CCAR-M04", "MR02|LIQ-K05", "MR02|LIQ-K06", "MR02|LIQ-P07", "MR03|CAP-K12", "MR03|CAP-M03", "MR03|CAP-M04", "MR03|CAP-M08", "MR03|CCAR-M04", "MR03|CIO-M01", "MR03|CIO-M04", "MR03|CIO-M05", "MR03|FTP-M01", "MR03|LIQ-M06", "MR04|ALM-M01", "MR04|ALM-P01", "MR04|FTP-M01", "MR04|FTP-P01", "MR04|IRRBB-M03", "MR04|IRRBB-M04", "MR04|LIQ-M02", "MR06|CAP-M02", "MR06|LIQ-M01", "MR06|LIQ-M02", "ODM-M01|AS10", "PB01|ALM-M02", "PB01|ALM-P02", "PB01|CCAR-M01", "PB01|CCAR-P02", "PB01|FTP-K02", "PB01|FTP-P02", "PB01|FTP-P04", "PB01|IRRBB-K03", "PB01|IRRBB-M01", "PB01|IRRBB-M02", "PB01|IRRBB-P01", "PB01|IRRBB-P02", "PB01|LIQ-M01", "PB01|LIQ-M02", "PB01|LIQ-M03", "PB01|LIQ-M09", "PB01|LIQ-P01", "PB01|LIQ-P02", "PB01|LIQ-P03", "PB01|LIQ-P09", "PB01|ODM-M01", "PB01|ODM-P01", "PB02|ALM-M02", "PB02|ALM-P02", "PB02|CAP-K09", "PB02|CAP-M01", "PB02|CAP-M02", "PB02|CAP-M07", "PB02|CAP-M09", "PB02|CAP-P02", "PB02|CCAR-M01", "PB02|CCAR-M02", "PB02|CCAR-P02", "PB02|CCAR-P03", "PB02|CCAR-P05", "PB02|FTP-K02", "PB02|FTP-P02", "PB02|FTP-P04", "PB02|IRRBB-K03", "PB02|IRRBB-M01", "PB02|IRRBB-M02", "PB02|IRRBB-M03", "PB02|IRRBB-P01", "PB02|LIQ-K02", "PB02|LIQ-M03", "PB02|LIQ-M09", "PB02|LIQ-P01", "PB02|LIQ-P02", "PB02|LIQ-P03", "PB02|LIQ-P09", "PB03|CAP-M03", "PB03|CAP-P02", "PB03|CIO-K01", "PB03|CIO-K03", "PB03|CIO-K05", "PB03|CIO-K07", "PB03|CIO-M01", "PB03|CIO-M02", "PB03|CIO-M03", "PB03|CIO-M04", "PB03|CIO-M05", "PB03|CIO-P01", "PB03|CIO-P02", "PB03|CIO-P03", "PB03|CIO-P04", "PB03|CIO-P05", "PB03|CTRL-P01", "PB03|IRRBB-M01", "PB03|IRRBB-M03", "PB03|LIQ-M03", "PB03|LIQ-M06", "PB03|LIQ-M09", "PB03|LIQ-P01", "PB03|LIQ-P02", "PB03|LIQ-P03", "PB03|LIQ-P06", "PB03|LIQ-P09", "PB04|ALM-K01", "PB04|ALM-M04", "PB04|ALM-P03", "PB04|CAP-M03", "PB04|CAP-M04", "PB04|CAP-M06", "PB04|CAP-M07", "PB04|CAP-P02", "PB04|CCAR-M04", "PB04|CIO-K06", "PB04|CIO-M03", "PB04|CIO-P02", "PB04|CTRL-P01", "PB04|IRRBB-M01", "PB04|LIQ-M03", "PB04|LIQ-M09", "PB04|LIQ-P02", "PB04|LIQ-P09", "PB05|ALM-M02", "PB05|ALM-P02", "PB05|CAP-K06", "PB05|CAP-M06", "PB05|CAP-P01", "PB05|CAP-P05", "PB05|FTP-M01", "PB05|FTP-P01", "PB05|IRRBB-K03", "PB05|IRRBB-M01", "PB05|IRRBB-M02", "PB05|LIQ-K02", "PB05|LIQ-K08", "PB05|LIQ-M03", "PB05|LIQ-M04", "PB05|LIQ-M09", "PB05|LIQ-P01", "PB05|LIQ-P02", "PB05|LIQ-P03", "PB05|LIQ-P07", "PB05|LIQ-P09", "PB06|CAP-M01", "PB06|CAP-M07", "PB06|CAP-P02", "PB06|FTP-M02", "PB06|FTP-M03", "PB06|FTP-P03", "PB06|LIQ-M03", "PB06|LIQ-M05", "PB06|LIQ-M09", "PB06|LIQ-P02", "PB06|LIQ-P09", "PB07|LIQ-K05", "PB07|LIQ-M06", "PB07|LIQ-M07", "PB07|LIQ-P05", "PB07|LIQ-P06", "PB07|LIQ-P07", "PB08|CAP-M01", "PB08|CAP-M02", "PB08|CAP-M04", "PB08|CAP-M06", "PB08|CAP-P02", "PB08|CCAR-M02", "PB08|CCAR-M04", "PB08|LIQ-K08", "PB08|LIQ-M03", "PB08|LIQ-M04", "PB08|LIQ-M09", "PB08|LIQ-P02", "PB08|LIQ-P03", "PB08|LIQ-P09", "PB09|LIQ-K09", "PB09|LIQ-M07", "PB09|LIQ-P03", "PB09|LIQ-P05", "PB10|ALM-K03", "PB10|ALM-M02", "PB10|ALM-P05", "PB10|CAP-K01", "PB10|CAP-K02", "PB10|CAP-K04", "PB10|CAP-K05", "PB10|CAP-K15", "PB10|CAP-M06", "PB10|CAP-M07", "PB10|CAP-M10", "PB10|CAP-P01", "PB10|CCAR-M03", "PB10|CCAR-M06", "PB10|CCAR-P05", "PB11|ALM-K02", "PB11|ALM-M02", "PB11|ALM-P02", "PB11|ALM-P05", "PB11|CAP-K08", "PB11|CAP-K18", "PB11|CAP-M05", "PB11|CAP-M09", "PB11|CAP-P07", "PB11|CCAR-M01", "PB11|CCAR-M05", "PB11|FTP-K03", "PB11|FTP-K05", "PB11|FTP-P04", "PB12|ALM-M02", "PB12|ALM-P02", "PB12|CAP-K06", "PB12|CAP-M06", "PB12|CAP-P01", "PB12|CAP-P05", "PB12|FTP-M01", "PB12|FTP-P01", "PB12|IRRBB-K03", "PB12|IRRBB-M01", "PB12|IRRBB-M02", "PB12|LIQ-K02", "PB12|LIQ-K05", "PB12|LIQ-K08", "PB12|LIQ-M03", "PB12|LIQ-M04", "PB12|LIQ-M06", "PB12|LIQ-M07", "PB12|LIQ-M09", "PB12|LIQ-P01", "PB12|LIQ-P02", "PB12|LIQ-P03", "PB12|LIQ-P05", "PB12|LIQ-P06", "PB12|LIQ-P07", "PB12|LIQ-P09", "R03|ALM-P04", "R04|LIQ-K01", "R04|LIQ-K02", "R04|LIQ-P01", "R12|CCAR-P06", "R17|CAP-P04"]);
const REGISTER_NAMES = {"MR01": "Market Data: Rates & Curves (Market Data Provider)", "MR02": "Market Data: FX (Market Data Provider)", "MR03": "Market Data: Credit Spreads (Market Data Provider)", "MR04": "Benchmark / Index Rates (Market Data Provider)", "MR05": "Security / Reference Master (Reference Data System)", "MR06": "Customer Segmentation (CRM / Segmentation System)", "PB01": "Deposit Balances & Rates (Deposit System of Record)", "PB02": "Loan Positions & Cash Flows (Loan System of Record)", "PB03": "Securities / Investment Positions (Investment Portfolio System)", "PB04": "Derivatives / Hedge Positions (Trading / Derivatives System)", "PB05": "Wholesale Funding & Debt (Treasury / Funding System)", "PB06": "Off-Balance-Sheet Commitments (Loan / Facility System)", "PB07": "Collateral & Encumbrance (Collateral Management System)", "PB08": "Counterparty Exposures (Counterparty Risk System)", "PB09": "Intraday Payment / Settlement Flows (Payments System)", "PB10": "GL / Balance Sheet (General Ledger)", "PB11": "Financials / Actuals (Finance / FP&A System)", "PB12": "Securities Financing Transactions (Repo / Reverse Repo / Securities Lending)", "AS01": "Behavioral: NMD Decay (NMD Behavioralization Model)", "AS02": "Behavioral: Deposit Beta (Deposit Beta Model)", "AS03": "Behavioral: Prepayment (Prepayment Model)", "AS04": "Stress Scenarios: Supervisory (Fed / CCAR)", "AS05": "Stress Scenarios: Internal (Scenario Design / Risk)", "AS06": "Rate Shock Set (IRRBB Governance / BCBS)", "AS07": "Runoff / Rollover Assumptions (Liquidity Risk / ALCO)", "AS08": "Risk Parameters: PD / LGD / EAD (Credit Risk Models)", "AS09": "Haircuts / Valuation Parameters (Market / Liquidity Risk)", "AS10": "Deposit Segmentation: Op / Non-Op (Deposit Modeling / ODM)", "DX01": "Projected Cash Flows - Stressed (Liquidity Cash-Flow / Stress Engine)", "DX02": "Survival Horizon / LST Output (LST Model)", "DX03": "Stressed Funding Gap (Funding Run-off Model)", "DX04": "HQLA Monetizable Value (HQLA Model)", "DX05": "LCR Results", "DX06": "RWA Figures (RWA Engine)", "DX07": "Capital Ratios (Capital Calc Engine)", "DX08": "PPNR Projection (PPNR Model)", "DX09": "Loss Projection (Loss Projection Models)", "DX10": "Projected Capital (Capital Projection Model)", "DX11": "EVE Results (EVE Model)", "DX12": "NII Results - Rate-Shock Sensitivity (IRRBB / NII Simulation)", "DX13": "FTP Curve / Transfer Rates (FTP Curve Model)", "DX14": "Portfolio Valuations / Marks (Valuation Model)", "DX15": "Limit Utilization / Breach Signals (Limit Monitoring)", "DX16": "Rate / Curve Forecast (ALM - ALCO-approved)", "DX17": "ALM Structural Balance Sheet (ALM)", "DX18": "Financial Plan Balance Sheet (Finance / FP&A)", "DX19": "Projected Cash Flows - Enterprise / BAU (ALM / Cash-Flow Engine)", "DX20": "NII Forecast - Earnings (ALM / Earnings Forecast Model)", "DX21": "Capital Forecast / Sensitivity Path (Capital / Forecast Model)", "DX22": "Return-on-Capital / RAROC Results (Capital / RAROC Model)", "DX23": "Capital Allocation by Business (Capital / Allocation)", "DX24": "Legal-Entity Capital & Liquidity Positions / Surplus (Capital / Subsidiary Model)", "DX25": "Intra-Group Up/Downstreaming Plan (Capital / Treasury)", "DX26": "Investment Portfolio Plan (planned balances / reinvestment / book yield)", "DX27": "Spot LST Output / Daily Survival", "DX28": "AOCI Actual / QTD (OCI / Equity)", "DX29": "OCI Forecast (rate + spread scenarios)", "DX31": "NSFR Results", "R01": "ALCO Pack", "R02": "Board / Risk Committee Report", "R03": "Risk Appetite & Limits Dashboard", "R04": "FR 2052a (Liquidity Monitoring)", "R05": "LCR Disclosure", "R06": "NSFR Disclosure", "R07": "Resolution Plan - Liquidity (RLAP/RLEN)", "R08": "FR Y-9C (Consolidated Financials)", "R09": "FFIEC 101 (Advanced Approaches RWA)", "R10": "FR Y-15 (GSIB Surcharge)", "R11": "Pillar 3 Disclosure", "R12": "FR Y-14 (A/Q/M)", "R13": "CCAR Capital Plan", "R14": "DFAST Disclosure", "R15": "IRRBB EVE & NII Report", "R16": "Earnings-at-Risk / NII Forecast", "R17": "ICAAP / Internal Capital Adequacy", "R18": "FTP / NIM Attribution Report", "R19": "Investment Portfolio Report (AFS/HTM/AOCI)", "R20": "Hedge / OCI Sensitivity Report", "ALM-M01": "Rate / Curve Forecast Model", "ALM-P01": "Rate / Curve Forecast Production & ALCO Approval", "ALM-M02": "Balance Sheet Forecast / Projection Model", "ALM-K03": "Balance Sheet Plan Variance (Actual vs Plan)", "ALM-P02": "Balance Sheet Planning / Forecasting", "ALM-P05": "Forecast Reconciliation & Variance Analysis", "ALM-M03": "Earnings / NII Forecast Model", "ALM-K02": "NII Forecast Accuracy (Forecast vs Actual)", "ALM-M04": "Structural / Macro Hedge Model", "ALM-K01": "Structural Hedge Notional / Hedge Ratio", "ALM-P03": "Structural Hedge Execution & Monitoring", "ALM-P04": "ALCO Coordination / Balance Sheet Strategy", "LIQ-M01": "NMD Behavioralization & Deposit Decay Model", "LIQ-M02": "Deposit Beta Model", "LIQ-M06": "HQLA Haircut & Monetization Model", "LIQ-K01": "LCR (Liquidity Coverage Ratio)", "LIQ-K02": "NSFR (Net Stable Funding Ratio)", "LIQ-K03": "HQLA Buffer", "LIQ-P01": "Daily LCR / NSFR Calculation & Monitoring", "LIQ-M03": "LST (Liquidity Stress Testing) - Short-Term Cash-Flow Model", "LIQ-M08": "LST (Liquidity Stress Testing) - Long-Term / Structural Forecast Model", "LIQ-K04": "LST (Liquidity Stress Testing) - Survival Horizon", "LIQ-K07": "LST (Liquidity Stress Testing) - Net Cumulative Outflow / Liquidity Gap (Short-Term)", "LIQ-K10": "LST (Liquidity Stress Testing) - Structural / Long-Term Funding Gap", "LIQ-P02": "LST (Liquidity Stress Testing) - Short-Term ILST Run", "LIQ-P08": "LST (Liquidity Stress Testing) - Long-Term / Structural Forecast Run", "LIQ-M07": "Intraday Liquidity Model", "LIQ-K09": "Intraday Peak Usage", "LIQ-P05": "Intraday Liquidity Monitoring", "LIQ-M04": "Wholesale Funding Run-off / Roll Model", "LIQ-M05": "Contingent Outflow Model (Facility Draws)", "LIQ-K08": "Funding Concentration", "LIQ-P04": "Contingency Funding Plan (CFP) Maintenance & Trigger Monitoring", "LIQ-P06": "Collateral Management & HQLA Optimization", "LIQ-K05": "RLAP", "LIQ-K06": "RLEN", "LIQ-P07": "Resolution Liquidity (RLAP/RLEN) Production", "LIQ-P03": "FR 2052a Data Collection, Transformation & Submission", "CAP-M01": "Credit RWA Engine (Standardized & Advanced/IRB)", "CAP-M02": "Credit Risk Parameter Models (PD / LGD / EAD)", "CAP-M03": "Market RWA Model (incl. FRTB where applicable)", "CAP-M04": "CVA Capital Model", "CAP-M05": "Operational Risk Capital Model", "CAP-K03": "RWA (by risk type)", "CAP-P02": "RWA Production & Attribution", "CAP-K01": "CET1 Ratio", "CAP-K02": "Tier 1 / Total Capital Ratio", "CAP-P01": "Quarterly Regulatory Capital Calculation & Reporting", "CAP-M07": "SLR / Leverage Exposure Engine", "CAP-K04": "SLR (Supplementary Leverage Ratio)", "CAP-M06": "GSIB Surcharge / Systemic Indicator Calculator", "CAP-K05": "GSIB Surcharge (Method 1 & 2)", "CAP-K06": "TLAC", "CAP-K07": "Stress Capital Buffer (SCB)", "CAP-P05": "TLAC Monitoring", "CAP-M08": "Capital Forecast & Sensitivity Model", "CAP-K10": "Capital Sensitivity to Rates (dCET1)", "CAP-K11": "Capital Sensitivity to Deposit Migration (dCET1)", "CAP-K12": "Capital Sensitivity to Credit Spreads (dCET1)", "CAP-K13": "Capital Sensitivity to RWA (dCET1)", "CAP-P03": "ICAAP / Capital Adequacy Assessment", "CAP-P04": "Capital Planning & Distribution Governance", "CAP-M09": "Capital Performance: Return on Capital / RAROC Model", "CAP-K08": "Capital Performance: Return on Capital - Existing Portfolios (RORWA)", "CAP-K09": "Capital Performance: Return on Capital - Marginal / New Business (RAROC)", "CAP-P06": "Capital Performance: Resource Allocation & Review", "CAP-M10": "Subsidiary Mgmt: Legal-Entity Capital & Liquidity Model", "CAP-K14": "Subsidiary Mgmt: Subsidiary Capital Surplus / Deficit (vs Local Minima)", "CAP-K15": "Subsidiary Mgmt: HoldCo Double Leverage Ratio", "CAP-K16": "Subsidiary Mgmt: Upstreamable Capital / Liquidity Capacity", "CAP-K17": "Subsidiary Mgmt: Subsidiary Capital Limit Utilization", "CAP-K18": "Subsidiary Mgmt: Upstreaming Execution (Actual vs Capacity)", "CAP-P07": "Subsidiary Mgmt: Intra-Group Capital & Liquidity Up/Downstreaming", "CAP-P08": "Subsidiary Mgmt: Subsidiary Capital Adequacy Monitoring & Local Reporting", "CCAR-P01": "Scenario Design / Expansion (Supervisory + BHC)", "CCAR-P06": "Capital Plan Narrative & Qualitative Assessment", "CCAR-P07": "Management Overlay / Adjustment Governance", "CCAR-M01": "PPNR Models (NII, Non-Interest Income, Expense)", "CCAR-K02": "Projected PPNR", "CCAR-P02": "PPNR Projection Process", "CCAR-M02": "Credit Loss Projection Models", "CCAR-M04": "Trading & Counterparty Loss / Global Market Shock Model", "CCAR-M05": "Operational Risk Loss Projection Model", "CCAR-K03": "Projected Losses (by portfolio)", "CCAR-P03": "Loss Projection Process", "CCAR-M03": "Balance Sheet / RWA Projection Model", "CCAR-M06": "Pro-Forma Capital Projection Model", "CCAR-K01": "Projected Minimum CET1 (Severely Adverse)", "CCAR-K04": "Stress Capital Buffer (derived)", "CCAR-K05": "Post-Stress Capital Ratios", "CCAR-P04": "Capital Projection & Aggregation", "CCAR-P05": "FR Y-14 (A/Q/M) Production & Submission", "IRRBB-M03": "Prepayment Model (Mortgage / Loan)", "IRRBB-M04": "Yield Curve / Basis Risk Model", "IRRBB-M01": "EVE (Economic Value of Equity) Model", "IRRBB-M02": "NII Simulation Model", "IRRBB-K01": "Delta-EVE (BCBS 6 standardized shocks)", "IRRBB-K02": "Delta-NII (12-month)", "IRRBB-K03": "Repricing Gap", "IRRBB-K04": "Duration of Equity", "IRRBB-P01": "EVE & NII Calculation / Rate-Shock Production", "IRRBB-P02": "Behavioral Assumption Setting & Governance", "IRRBB-K05": "IRRBB Limit Utilization", "IRRBB-P03": "IRRBB Limit Monitoring & Breach Escalation", "IRRBB-P04": "IRRBB Reporting to ALCO", "ODM-M01": "Operational / Non-Operational Deposit Classification Model", "ODM-K01": "Operational Deposit Share", "ODM-P01": "Op / Non-Op Classification Governance & Refresh", "CIO-M01": "Investment Portfolio Valuation / Mark Model", "CIO-M02": "OCI / AOCI Sensitivity Model", "CIO-M04": "Securities Prepayment / OAS Model", "CIO-K01": "Portfolio Size & Composition (AFS/HTM)", "CIO-K02": "Unrealized Gains/Losses (AOCI)", "CIO-K03": "Portfolio Duration", "CIO-K04": "OCI-at-Risk", "CIO-K05": "Book Yield / Portfolio Yield", "CIO-P01": "Investment Portfolio Management & Rebalancing", "CIO-P04": "Portfolio Risk & Limit Monitoring", "CIO-M03": "Hedge Effectiveness Model (ASC 815)", "CIO-K06": "Hedge Effectiveness Ratio", "CIO-P02": "Hedge Designation & Accounting", "CIO-M05": "HTM/AFS Impairment (CECL) Model", "CIO-P05": "Securities Impairment (CECL) Assessment", "CIO-P03": "AOCI / OCI Monitoring & Reporting", "FTP-M01": "FTP Curve Construction Model", "FTP-M02": "Liquidity Transfer Pricing (LTP) Charge Model", "FTP-M03": "Contingent Liquidity / Facility Pricing Model", "FTP-K01": "FTP Rates / Transfer Curve", "FTP-K04": "Liquidity Premium / Charge", "FTP-P01": "FTP Curve Construction & Publication", "FTP-P02": "FTP Rate Assignment to Instruments / Desks", "FTP-P03": "Liquidity Cost Allocation", "FTP-K02": "NIM by Business Unit", "FTP-K03": "NII Attribution", "FTP-K05": "FTP-based RAROC / Profitability", "FTP-P04": "NIM / Profitability Attribution", "FTP-P05": "FTP Methodology Governance & Review", "LIQ-M09": "LST (Liquidity Stress Testing) - Spot / Daily Point-in-Time Survival Model", "LIQ-P09": "LST (Liquidity Stress Testing) - Spot / Daily Survival Run", "LIQ-K11": "LST (Liquidity Stress Testing) - Spot Survival Horizon", "LIQ-K12": "LST (Liquidity Stress Testing) - Spot Net Cumulative Outflow / Liquidity Gap", "CIO-K07": "DV01 (Dollar Value of a Basis Point)", "CAP-K19": "Subsidiary Mgmt: Subsidiary Capital Limit Breaches", "CTRL-P01": "OCI / AOCI Accounting & Reporting (QTD Actuals)"};
const REGISTER_IDS = new Set(Object.keys(REGISTER_NAMES));   // P3: derived, not hand-listed
const REALW={FCST:"forecast",PLAN:"plan",ACTUAL:"actual",SPOT:"spot",FCST_:""};
// Parse a register .xlsx (same rules as gen_register_mirror.py) -> {names, edges}. Used by the in-flow "Load register" button.
function parseRegister(sheet){
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const get=(r,c)=>{ const cell=sheet[XLSX.utils.encode_cell({r,c})]; return cell?cell.v:null; };
  const names={}, edges=new Set(), objcol=[];
  for(let j=0; 14+4*j <= range.e.c; j++){ const ci=14+4*j; const o=get(1,ci);
    if(o){ const id=String(o).trim(); if(id){ objcol.push({id,ci}); names[id]=String(get(2,ci)||"").trim(); } } }
  for(let r=6; r<=Math.min(149,range.e.r); r++){ const e=get(r,0); if(!e) continue; const eid=String(e).trim(); if(!eid) continue;
    names[eid]=String(get(r,1)||"").trim();
    for(const {id,ci} of objcol){ const v=get(r,ci);
      if(v==="Output"||v==="Both") edges.add(eid+"|"+id);
      if(v==="Input"||v==="Both") edges.add(id+"|"+eid); } }
  return {names, edges};
}

function DXGraph({ seed, total, onExit }){
  const N=GRAPHDATA.N, E=GRAPHDATA.E;
  const derive=(expanded)=>{
    let exp=new Set(expanded), reachable=new Set([seed]), revealed=[];
    for(let it=0; it<60; it++){
      revealed=E.filter(e=>exp.has(e[0])||exp.has(e[1]));
      const adj={}; revealed.forEach(([a,b])=>{(adj[a]=adj[a]||[]).push(b);(adj[b]=adj[b]||[]).push(a);});
      reachable=new Set([seed]); const q=[seed];
      while(q.length){ const u=q.shift(); (adj[u]||[]).forEach(v=>{if(!reachable.has(v)){reachable.add(v);q.push(v);}}); }
      const ne=new Set([...exp].filter(x=>reachable.has(x)));
      if(ne.size===exp.size) break; exp=ne;
    }
    return { vnodes:reachable, vedges:revealed.filter(([a,b])=>reachable.has(a)&&reachable.has(b)), exp };
  };
  const pos=useRef({}); const init=useRef(false);
  const [expanded,setExpanded]=useState(()=>new Set([seed]));
  const [ver,setVer]=useState(0); const [,pump]=useReducer(x=>x+1,0);
  const [hover,setHover]=useState(null);
  if(!init.current){
    init.current=true; pos.current[seed]={x:0,y:0,pin:true};
    const rest=[...derive(new Set([seed])).vnodes].filter(n=>n!==seed);
    rest.forEach((n,i)=>{ const a=(i/Math.max(rest.length,1))*2*Math.PI; pos.current[n]={x:Math.cos(a)*145,y:Math.sin(a)*145}; });
  }
  const {vnodes,vedges,exp}=useMemo(()=>derive(expanded),[expanded]);
  const toggle=(id)=>{
    const ne=new Set(expanded); ne.has(id)?ne.delete(id):ne.add(id);
    const d=derive(ne);
    d.vnodes.forEach(n=>{ if(!pos.current[n]){ const c=pos.current[id]||{x:0,y:0}; pos.current[n]={x:c.x+(Math.random()*160-80),y:c.y+(Math.random()*120-60)}; } });
    setExpanded(d.exp); setVer(v=>v+1);
  };
  useEffect(()=>{
    let raf, alpha=1; const K=76,GRAV=0.03,MAXD=34;
    const step=()=>{
      const ids=[...vnodes], P=pos.current, disp={}; ids.forEach(id=>disp[id]={x:0,y:0});
      for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
        const i=ids[a],j=ids[b]; let dx=P[i].x-P[j].x,dy=P[i].y-P[j].y,d=Math.hypot(dx,dy)||0.01,f=K*K/d;
        dx/=d;dy/=d;disp[i].x+=dx*f;disp[i].y+=dy*f;disp[j].x-=dx*f;disp[j].y-=dy*f; }
      vedges.forEach(([s2,t2])=>{ let dx=P[s2].x-P[t2].x,dy=P[s2].y-P[t2].y,d=Math.hypot(dx,dy)||0.01,f=d*d/K/7;
        dx/=d;dy/=d;disp[s2].x-=dx*f;disp[s2].y-=dy*f;disp[t2].x+=dx*f;disp[t2].y+=dy*f; });
      ids.forEach(id=>{disp[id].x+=-P[id].x*GRAV;disp[id].y+=-P[id].y*GRAV;});
      ids.forEach(id=>{ if(P[id].pin)return; let dl=Math.hypot(disp[id].x,disp[id].y)||0.01,mo=Math.min(dl,MAXD)*alpha; P[id].x+=disp[id].x/dl*mo;P[id].y+=disp[id].y/dl*mo; });
      alpha*=0.985; pump(); if(alpha>0.03) raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step); return ()=>cancelAnimationFrame(raf);
  },[ver]);
  const ids=[...vnodes]; let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
  ids.forEach(id=>{const p=pos.current[id]; if(!p)return; mnx=Math.min(mnx,p.x);mny=Math.min(mny,p.y);mxx=Math.max(mxx,p.x);mxy=Math.max(mxy,p.y);});
  const spx=Math.max(mxx-mnx,1),spy=Math.max(mxy-mny,1),availW=902,availH=Math.max(total-124,240);
  let sc=Math.min(availW/spx,availH/spy,1.12); sc=Math.max(sc,0.4);
  const tx=39+(availW-spx*sc)/2-mnx*sc, ty=70+(availH-spy*sc)/2-mny*sc;
  const P2=id=>({x:pos.current[id].x*sc+tx,y:pos.current[id].y*sc+ty});
  const KC={Model:"#3f6ea5",Process:"#2f8f8a",Metric:"#b7791f",DataObject:"#5b6c8f",Report:"#9c5a39"};
  const NW=78,NH=28, HW=NW/2+2, HH=NH/2+2;
  const be=(cx,cy,vx,vy)=>{const tx2=vx?HW/Math.abs(vx):1e9,ty2=vy?HH/Math.abs(vy):1e9,t=Math.min(tx2,ty2);return[cx+vx*t,cy+vy*t];};
  return (<g>
    <rect x={0} y={0} width={980} height={total} fill="#fff" opacity={0.95} onClick={(e)=>e.stopPropagation()}/>
    <text x={16} y={18} fontFamily={SANS} fontSize="11" fontWeight={800} fill="#a8641a">LINEAGE EXPLORER</text>
    <text x={158} y={18} fontFamily={SANS} fontSize="10" fill={MUTED}>{vnodes.size} nodes {"\u00b7"} click = expand / collapse {"\u00b7"} arrows point producer {"\u2192"} consumer</text>
    <text x={158} y={32} fontFamily={SANS} fontSize="10" fill={MUTED}>hover a node for its full name {"\u2014"} its <tspan fill="#3f6ea5" fontWeight={700}>inputs turn blue</tspan>, <tspan fill="#c77d3a" fontWeight={700}>outputs amber</tspan></text>
    <text x={964} y={18} textAnchor="end" fontFamily={SANS} fontSize="11" fontWeight={700} fill="#a8641a" style={{cursor:"pointer"}} onClick={onExit}>{"\u2715 exit"}</text>
    {["Model","Process","Metric","DataObject","Report"].map((kd,i)=>(<g key={kd} transform={`translate(${16+i*98},${total-14})`}><rect width={9} height={9} rx={2} fill={KC[kd]}/><text x={13} y={8} fontFamily={SANS} fontSize="8.5" fill={MUTED}>{kd}</text></g>))}
    {vedges.map(([a,b],i)=>{ const p=P2(a),q=P2(b); let dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
      const [sx,sy]=be(p.x,p.y,ux,uy), [ex,ey]=be(q.x,q.y,-ux,-uy);
      const ah=10,aw=5,bx=ex-ux*ah,by=ey-uy*ah,pxp=-uy,pyp=ux;
      const inTo=hover===b, outOf=hover===a, hot=inTo||outOf;
      const lc= inTo?"#3f6ea5":outOf?"#c77d3a":"#adb5c0";
      const ac= inTo?"#2f5988":outOf?"#a8641a":"#3a465c";
      return <g key={i}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={lc} strokeWidth={hot?2:1.25} opacity={hot?0.98:0.7}/>
        <circle cx={sx} cy={sy} r={hot?3:2.3} fill={lc}/>
        <polygon points={`${ex},${ey} ${bx+pxp*aw},${by+pyp*aw} ${bx-pxp*aw},${by-pyp*aw}`} fill={ac}/>
      </g>; })}
    {ids.map(id=>{ const p=P2(id), meta=N[id]||["","?"], isExp=exp.has(id), isSeed=id===seed, isHov=hover===id;
      return <g key={id} transform={`translate(${p.x-NW/2},${p.y-NH/2})`} onClick={(e)=>{e.stopPropagation();toggle(id);}}
          onMouseEnter={()=>setHover(id)} onMouseLeave={()=>setHover(h=>h===id?null:h)} style={{cursor:"pointer"}}>
        <rect width={NW} height={NH} rx={5} fill={isSeed?"#fff7ec":(isExp?"#eef1f6":"#fff")} stroke={isHov?"#a8641a":(isSeed?"#a8641a":(KC[meta[1]]||GREY))} strokeWidth={isHov?2:(isSeed?2.2:(isExp?1.6:1))}/>
        <rect width={5} height={NH} rx={2} fill={KC[meta[1]]||GREY}/>
        <text x={NW/2+3} y={12} textAnchor="middle" fontFamily={MONO} fontSize="9" fontWeight={700} fill={INK}>{id}</text>
        <text x={NW/2+3} y={22} textAnchor="middle" fontFamily={SANS} fontSize="6.5" fill={MUTED}>{meta[0].slice(0,18)}</text>
        <text x={NW-8} y={11} textAnchor="middle" fontFamily={SANS} fontSize="10" fontWeight={800} fill={isExp?MUTED:(KC[meta[1]]||GREY)}>{isExp?"\u2212":"+"}</text>
      </g>; })}
    {hover && N[hover] && pos.current[hover] && (()=>{
      const p=P2(hover), label=N[hover][0], w=Math.min(Math.max(label.length*5.9, (hover.length+2)*7)+18, 420);
      const bx=Math.max(6, Math.min(p.x-w/2, 980-w-6)); let by=p.y-NH/2-32; if(by<40) by=p.y+NH/2+8;
      return <g style={{pointerEvents:"none"}}>
        <rect x={bx} y={by} width={w} height={29} rx={6} fill="#0f2238" opacity={0.97}/>
        <text x={bx+10} y={by+12} fontFamily={MONO} fontSize="9" fontWeight={700} fill="#ffcf9c">{hover}</text>
        <text x={bx+10} y={by+23} fontFamily={SANS} fontSize="8.5" fill="#fff">{label}</text>
      </g>; })()}
  </g>);
}


function TodoPanel(){
  return (
    <div style={{marginTop:16,background:"#fff8e6",border:"1px solid #e6cf87",borderLeft:"4px solid #d9a93a",borderRadius:8,padding:"12px 16px"}}>
          <div style={{fontFamily:SANS,fontSize:13,fontWeight:700,color:"#8a6d1f",marginBottom:8}}>#todo — confirm with SME</div>
          <div style={{display:"grid",rowGap:9}}>
          <div>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:800,letterSpacing:".07em",color:"#8a6d1f",marginBottom:3}}>LIQUIDITY</div>
            <ol style={{margin:0,paddingLeft:18,fontFamily:SANS,fontSize:12,color:INK,lineHeight:1.6}}>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-1]</b> <b>Short-term LST input</b> — does it run off DX19 (BAU cash-flow ladder) or stress current positions directly? Long-term LST uses DX17; should the two differ, and is DX19 the right source for short-term?</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-2]</b> <b>NSFR statement classification</b> — currently tagged <i>B/S · struct</i> (a structural factor transform of the whole book), the lone hybrid while the other four liquidity views are tagged CF. <b>Ask SME:</b> should NSFR sit in the cash-flow family (CF) like LCR/LST/intraday, or is its 1-year stable-funding ratio better characterized as a balance-sheet structural measure (B/S · struct)? Equivalently — is NSFR mechanically a stressed cash-flow projection, or a static factor weighting applied to current B/S positions? That answer fixes whether the liquidity domain is a clean CF family or a CF + structural split.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-3]</b> <b>Intraday liquidity — register object &amp; producer</b> — Intraday liquidity has no Data Object Register entry, and Intraday peak (LIQ-K09) is a registered metric with no producing model / object. Add the intraday object to the inventory and confirm its producer.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-4]</b> <b>Coverage gap — registered LIQ metrics not on the chart</b> — the register has 10 LIQUIDITY metrics; the chart shows 6. Missing: <b>LIQ-K05 RLAP</b> &amp; <b>LIQ-K06 RLEN</b> (Resolution sub-function, 165(d); produced by process LIQ-P07; defining axis is legal-entity positioning / liquidity mobility, a dimension this chart doesn’t yet model), <b>LIQ-K03 HQLA Buffer</b> (may be an LCR component rather than a standalone node), and <b>LIQ-K08 Funding Concentration</b> (no node at all). <b>Ask SME:</b> should the lineage’s scope include these — and if so, add RLAP/RLEN as a <i>Resolution sub-cluster</i> under LIQUIDITY (not blended with the LCR/NSFR/LST flow ratios), decide whether HQLA Buffer is its own metric or an LCR input, and place Funding Concentration. Register already classifies all four as LIQUIDITY metrics; open question is chart scope + placement, not their existence.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-5]</b> <b>LCR vs NSFR consumer split (DX05 / DX31)</b> — after the DX05 → DX31 split, all four downstream consumers (<i>ALM-P04, LIQ-P04, CAP-M10, CAP-K16</i>) still consume <b>both</b> DX05 (LCR Results) and DX31 (NSFR Results) — a safe default that preserved the old bundled behaviour. <b>Ask SME:</b> which of these actually need the LCR result, the NSFR result, or both? Splitting the consumption removes the over-linkage introduced by the original single DX05 object.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[LIQ-6]</b> <b>FR 2052a — calc input, or datamart-derived?</b> — the LCR/NSFR calcs now read <b>R04 (FR 2052a)</b>, produced by LIQ-P03 (FR 2052a Data Collection) from positions incl. PB12/SFT. <b>Ask SME:</b> is the 2052a itself the calc input, or is there an internal liquidity datamart <i>derived from</i> the 2052a that the engine actually reads? If the latter, R04 sits one step upstream of the true input and a derived-datamart object belongs between them.</li>
            </ol>
          </div>
          <div>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:800,letterSpacing:".07em",color:"#8a6d1f",marginBottom:3}}>IRRBB</div>
            <ol style={{margin:0,paddingLeft:18,fontFamily:SANS,fontSize:12,color:INK,lineHeight:1.6}}>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[IRRBB-1]</b> <b>DX20 ↔ DX12 tie</b> — does IRRBB-M02's base-NII leg consume the FP&amp;A / Treasury base forecast (DX20), or run its own base scenario? And is ΔNII reported as a level or as a % of base NII (DX20 = denominator)? If either holds, DX20 becomes a real input to DX12; otherwise they're siblings sharing parents (DX16/17/19, AS02), with at most a dashed "reconciles-to" tie. Not a computational feed by default.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[IRRBB-2]</b> <b>Decay / beta ownership</b> — keep split across Liquidity (LIQ-M01 / M02) &amp; IRRBB, or consolidate under ODM alongside op/non-op?</li>
            </ol>
          </div>
          <div>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:800,letterSpacing:".07em",color:"#8a6d1f",marginBottom:3}}>CCAR &amp; CAPITAL</div>
            <ol style={{margin:0,paddingLeft:18,fontFamily:SANS,fontSize:12,color:INK,lineHeight:1.6}}>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[CAPCCAR-1]</b> <b>CCAR-M03 decomposition (overloaded id)</b> — one id is doing three jobs and needs SME breakdown before the chart can model it faithfully: <b>(a) one id → three scenario nodes</b> — Baseline / Adverse / Severely-adverse all carry ref CCAR-M03; are these three runs of one engine (engine should be one node) or distinct registered models (need distinct ids)? <b>(b) engine vs node</b> — CCAR-M03 is the aggregation engine (PPNR + losses + RWA → projected capital) but appears only as a ref, never as its own node, so its producer is invisible and its three outputs borrow its id; should an explicit CCAR-M03 engine node be added upstream with edges fanning to the three runs? <b>(c) one id → many metrics, under-resolved</b> — PPNR, projected/post-stress CET1, SCB etc. all trace to CCAR-M03, but the register only has CCAR-K01 (sev-adv minimum) and CCAR-K05 (scenario-agnostic), so per-scenario metrics collapse. Ties directly to the <i>Metric-ID resolution</i> and <i>Stressed capital path</i> items in this group — resolve together.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[CAPCCAR-2]</b> <b>Metric-ID resolution — CCAR CET1 by scenario</b> (three of the four “?” boxes) — register under-resolves CCAR CET1 by scenario: only CCAR-K01 (severe-adverse <i>minimum</i>) and CCAR-K05 (post-stress ratios, scenario-agnostic) exist, so baseline CET1, adverse CET1, and the capital-domain "stressed path" all fall back to K05 — whose label says "post-stress," which doesn't fit the baseline run. Either register distinct baseline/adverse projected-CET1 metrics, or accept K05 as scenario-spanning and relabel.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[CAPCCAR-3]</b> <b>Stressed capital path — CCAR source scenario</b> — drawn node-to-node from the <i>Severely-adverse</i> projection (the run SCB derives from, and the binding case for capital). <b>Ask SME:</b> is severely-adverse the correct/only scenario feeding the Capital-domain stressed path (via DX10 / CCAR-M03), or should it also reconcile to the adverse run or an aggregate? Ties to the CCAR-CET1 scenario under-resolution in the metric-ID item above.</li>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[CAPCCAR-4]</b> <b>Metric → node mappings</b> — confirm SCB → severely-adverse and PPNR → baseline (CCAR), and repricing gap → NII-sensitivity (IRRBB).</li>
            </ol>
          </div>
          <div>
            <div style={{fontFamily:SANS,fontSize:11,fontWeight:800,letterSpacing:".07em",color:"#8a6d1f",marginBottom:3}}>CROSS-CUTTING — UPSTREAM &amp; REGISTER</div>
            <ol style={{margin:0,paddingLeft:18,fontFamily:SANS,fontSize:12,color:INK,lineHeight:1.6}}>
            <li><b style={{fontFamily:MONO,fontSize:10,color:"#8a6d1f"}}>[XCUT-1]</b> <b>Register gap — Plan Income</b> — Plan Income has no Data Object Register entry; add it to the inventory.</li>
            </ol>
          </div>
          </div>
        </div>
  );
}


function Controls({search,setSearch,isolate,setIsolate,focusDX,setFocusDX,drift,setDrift,setSel,edgeOK,onLoadRegister,reg,regErr}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:7,margin:"0 0 12px",flexWrap:"wrap"}}>
          <span style={{width:1,height:20,background:LINE,margin:"0 3px"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search id / name\u2026" style={{fontFamily:SANS,fontSize:12,padding:"5px 10px",borderRadius:7,border:`1px solid ${search.trim()?"#16a34a":LINE}`,outline:"none",width:170,color:INK}}/>
          {search.trim() && <span style={{fontSize:11,color:"#16a34a",fontWeight:600,marginRight:2}}>{"\u25cf"} matches in green</span>}
          <span style={{width:1,height:20,background:LINE,margin:"0 3px"}}/>
          <button onClick={()=>{ setIsolate(v=>!v); setFocusDX(null); setSel(null); }} style={{cursor:"pointer",fontFamily:SANS,fontSize:12,fontWeight:isolate?700:500,padding:"5px 13px",borderRadius:7,border:`1px solid ${isolate?"#a8641a":LINE}`,background:isolate?"#a8641a":"#fff",color:isolate?"#fff":INK}}>{isolate?"◉ Isolate DX":"○ Isolate DX"}</button>
          <button onClick={()=>setDrift(v=>!v)} style={{cursor:"pointer",fontFamily:SANS,fontSize:12,fontWeight:drift?700:500,padding:"5px 13px",borderRadius:7,border:`1px solid ${drift?"#e11d48":LINE}`,background:drift?"#e11d48":"#fff",color:drift?"#fff":INK}}>{drift?"◉ Drift vs register":"○ Check drift vs register"}</button>
          {drift && (()=>{ const ed=GRAPHDATA.E.filter(e=>!edgeOK(e[0],e[1])); return (
            <span style={{fontSize:10.5,fontWeight:600,marginLeft:2,display:"inline-flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{color:"#e11d48"}}>● ID not in register</span>
              <span style={{color:"#ea8c00"}}>● name / realization conflict</span>
              <span style={{color:ed.length?"#e11d48":"#4f8a5b"}}>{ed.length?`\u26a0 ${ed.length} connector(s) not backed by register: `+ed.slice(0,4).map(e=>e[0]+"\u2192"+e[1]).join(", "):"\u2713 all connectors match register"}</span>
            </span>); })()}
          <span style={{width:1,height:20,background:LINE,margin:"0 3px"}}/>
          <label style={{cursor:"pointer",fontFamily:SANS,fontSize:12,fontWeight:500,padding:"5px 13px",borderRadius:7,border:`1px solid ${reg?"#16a34a":LINE}`,background:reg?"#eaf7ee":"#fff",color:reg?"#16a34a":INK,display:"inline-flex",alignItems:"center",gap:5}}>
            {reg ? `\u2713 register: ${reg.fname}` : "\u2913 Load register (.xlsx)"}
            <input type="file" accept=".xlsx" style={{display:"none"}} onChange={e=>{ const fl=e.target.files&&e.target.files[0]; if(fl) onLoadRegister(fl); e.target.value=""; }}/>
          </label>
          {reg && <span style={{fontSize:10.5,color:"#4f8a5b",fontWeight:600}}>drift checks vs this file · {reg.ncount} obj/ent · {reg.ecount} edges</span>}
          {!reg && <span style={{fontSize:10.5,color:MUTED,fontStyle:"italic"}}>drift baseline: baked-in v12</span>}
          {regErr && <span style={{fontSize:11,color:"#e11d48",fontWeight:600}}>{"\u26a0"} {regErr}</span>}
          {isolate && !focusDX && <span style={{fontSize:11,color:"#a8641a",fontStyle:"italic",marginLeft:2}}>click a DX box or metric, then click nodes to expand / collapse the lineage</span>}
        </div>
  );
}


function SelectedPanel({sel,setSel}){
  if(!sel) return null;
  return (
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
  );
}

export default function App(){
  const [sel,setSel]=useState(null);
  const [isolate,setIsolate]=useState(false);
  const [focusDX,setFocusDX]=useState(null);
  const [drift,setDrift]=useState(false);
  const [search,setSearch]=useState("");
  const [reg,setReg]=useState(null);       // loaded register (null => baked-in baseline)
  const [regErr,setRegErr]=useState(null);
  const opN=(k)=> 1;
  const opE=(a,b)=> 1;
  const domLit=(g)=> true;
  const pick=(id,label,kind,iso)=>(e)=>{ e.stopPropagation(); const t=(iso&&DXNODES.has(iso))?iso:id; if(isolate && (DXNODES.has(t) || (GRAPHDATA.N[t] && GRAPHDATA.N[t][1]==="Metric"))){ setFocusDX(t); return; } setSel({id,label,kind}); };
  const hi=(id)=> !!sel && sel.id===id;
  const matchS=(...xs)=>!!search.trim() && xs.some(x=>x&&String(x).toLowerCase().includes(search.trim().toLowerCase()));
  const Hit=(d,id,label,kind)=><path d={d} fill="none" stroke={hi(id)?"#d9a93a":"transparent"} strokeWidth={hi(id)?3.5:12} opacity={hi(id)?0.75:1} strokeLinecap="round" style={{cursor:"pointer"}} onClick={pick(id,label,kind)}/>;
  const mk=(base,id)=> hi(id) ? `url(#${base}-hi)` : `url(#${base})`;
  // active drift baseline: loaded register if present, else the baked-in snapshot
  const RN = reg ? reg.names : REGISTER_NAMES;
  const RE = reg ? reg.edges : REGISTER_EDGES;
  const RI = reg ? reg.ids   : REGISTER_IDS;
  const inReg=(id)=>!!id && RI.has(id);
  const edgeOK=(a,b)=>RE.has(a+"|"+b);
  const nameConflict=(ref,realz)=>{ if(!ref||!RN[ref]||!realz) return false; const rn=RN[ref].toLowerCase(); const mine=REALW[realz]; if(!mine) return false; for(const w of ["forecast","plan","actual"]){ if(rn.includes(w) && w!==mine) return true; } return false; };
  const onLoadRegister=(file)=>{ const rd=new FileReader(); rd.onload=()=>{ try{ const wb=XLSX.read(rd.result,{type:"array"}); const sheet=wb.Sheets["Lineage & Migration Heatmap"]; if(!sheet) throw new Error("sheet 'Lineage & Migration Heatmap' not found"); const {names,edges}=parseRegister(sheet); if(Object.keys(names).length<50) throw new Error("only "+Object.keys(names).length+" entries parsed \u2014 unexpected layout"); setReg({names,edges,ids:new Set(Object.keys(names)),fname:file.name,ncount:Object.keys(names).length,ecount:edges.size}); setRegErr(null); }catch(err){ setReg(null); setRegErr(String(err.message||err)); } }; rd.readAsArrayBuffer(file); };
  // ── unified node card: one grammar for FINANCE + ALM + DOMAIN ──
  // line1: ref (mono, top-left) + horizon (top-right) · line2: name + ←src · line3: [stmt][scenario][realization]
  // o.dark = navy "source" tier (Finance): light text, white stmt chip
  const card=(o)=>{
    const H=NH, dk=!!o.dark, chips=[]; let cx=o.x+10;
    const notInReg = o.gap || (o.ref && !inReg(o.ref));
    const nameDrift = o.ref && inReg(o.ref) && nameConflict(o.ref, o.realization);
    const smatch = matchS(o.ref,o.id,o.name);
    const refCol=dk?"#9fb2c4":SLATE, nameCol=dk?"#fff":INK, dimCol=dk?"rgba(255,255,255,.55)":MUTED;
    const realBg=(r)=> r==="SPOT"?SPOTCOL : FCOL;  // PLAN/FCST/ACTUAL are siblings -> one colour
    if(o.stmt) chips.push({t:o.stmt,bd:true});
    if(o.scenario) chips.push({t:o.scenario,bg:INK});  // BASE/STRESS siblings on the scenario axis -> one colour
    if(o.realization) chips.push({t:o.realization,bg:realBg(o.realization)});
    return (<g key={o.key} opacity={o.op??1} onClick={pick(o.id,o.label,o.kind,o.ref)} style={{cursor:"pointer"}}>
      <rect x={o.x} y={o.y} width={o.w} height={H} rx={6} fill={dk?"#0f2238":"#fff"} stroke={smatch?"#16a34a":((drift&&notInReg)?"#e11d48":(drift&&nameDrift)?"#ea8c00":(hi(o.id)?"#d9a93a":(dk?"#0f2238":GREY)))} strokeWidth={smatch?3.5:((drift&&(notInReg||nameDrift))?3:(hi(o.id)?2.5:1))}/>
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

        <Controls search={search} setSearch={setSearch} isolate={isolate} setIsolate={setIsolate} focusDX={focusDX} setFocusDX={setFocusDX} drift={drift} setDrift={setDrift} setSel={setSel} edgeOK={edgeOK} onLoadRegister={onLoadRegister} reg={reg} regErr={regErr}/>

        <div style={{background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:"12px 14px"}}>
          <svg viewBox={`0 0 878 ${TOTAL}`} style={{width:"100%",height:"auto",display:"block"}} onClick={()=>setSel(null)}>
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
            <text x={161} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>DATAMART</text>
            <text x={14} y={194} fontFamily={SANS} fontSize="10" fontWeight={700} fill={DOMC}>TREASURY-CFO</text>
            <text x={278} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>ALM OUTPUTS</text>
            <text x={NX+NW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>DOMAIN OUTPUTS</text>
            <text x={MXX+MBW/2} y={14} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={MUTED} style={{letterSpacing:".8px"}}>METRICS</text>

            {/* Finance — same card grammar, dark "source" tier (PLAN/ACTUAL realization) */}
            {card({key:"f-pinc", x:14, y:200, w:108, dark:true, gap:true, horizon:"~36m", name:"Plan Income", stmt:"P&L", realization:"PLAN", op:opN("Plan Income"), id:"Plan Income", label:"Plan Income", kind:"Finance source"})}
            {card({key:"f-pbs", x:14, y:254, w:108, dark:true, ref:"DX18", horizon:"~36m", name:"Plan Balance Sheet", stmt:"B/S", realization:"PLAN", op:opN("DX18"), id:"DX18", label:"Plan Balance Sheet", kind:"Finance source"})}
            {card({key:"f-abs", x:14, y:310, w:108, dark:true, ref:"PB10", horizon:"as-of", name:"Actuals Balance Sheet", stmt:"B/S", realization:"ACTUAL", op:opN("PB10"), id:"PB10", label:"Actuals Balance Sheet", kind:"Finance source"})}
            {card({key:"f-ainc", x:14, y:364, w:108, dark:true, ref:"PB11", horizon:"as-of", name:"Actuals Income", stmt:"P&L", realization:"ACTUAL", op:opN("PB11"), id:"PB11", label:"Actuals Income", kind:"Finance source"})}


            {/* ALM container */}
            {ALM.map(o=>{
              const nx = o.id==="DX16"?246:264, nw = o.id==="DX16"?140:122;
              return card({key:o.id, x:nx, y:o.y, w:nw, ref:o.id, horizon:"~36m", name:o.name,
                scenario:o.base?"BASE":null, realization:"FCST", stmt:o.stmt||null,
                op:opN(o.id), id:o.id, label:o.name, kind:"ALM output"});
            })}

            {/* Finance -> ALM */}
            <g opacity={opN("DATAMART")}>
              <path d="M212,285 L228,285 M228,199 L228,335" fill="none" stroke={GREY} strokeWidth={1.4}/>
              {Hit("M212,285 L228,285 M228,199 L228,335 M228,199 L264,199 M228,255 L264,255 M228,335 L264,335","edge:opening-tie","Treasury Datamart \u2192 ALM (opening positions)","Position feed / opening seed")}
            </g>
            <line x1={228} y1={199} x2={264} y2={199} opacity={opE("DATAMART","DX20")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>
            <line x1={228} y1={255} x2={264} y2={255} opacity={opE("DATAMART","DX17")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>
            <line x1={228} y1={335} x2={264} y2={335} opacity={opE("DATAMART","DX19")} stroke={GREY} strokeWidth={1.4} markerEnd={mk("ah","edge:opening-tie")}/>

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
            {(()=>{ const g=LAID.find(x=>x.dom==="CCAR"); const ty=g.nodes[0].y+NH/2; const op=1;
              return <g opacity={op}>
                {Hit(`M122,387 C326,${ty} 386,${ty} ${NX},${ty}`,"edge:ccar-bypass","Finance \u2192 CCAR (bypasses ALM)","Lineage edge · bypass")}
                <path d={`M122,387 C326,${ty} 386,${ty} ${NX},${ty}`} fill="none" stroke={MUTED} strokeWidth={1.6} markerEnd={mk("ah","edge:ccar-bypass")}/>
              </g>; })()}

            {/* node-to-node: CCAR Severely-adverse projection -> Stressed capital path (scenario that binds capital) */}
            {(()=>{ const sev=LAID.find(x=>x.dom==="CCAR").nodes[2]; const stp=LAID.find(x=>x.dom==="CAPITAL").nodes[1];
              const y1=sev.y+NH/2, y2=stp.y+NH/2, gx=458, my=(y1+y2)/2;
              const d=`M${NX},${y1} L${gx},${y1} L${gx},${y2} L${NX},${y2}`;
              return <g opacity={opE(sev.name,stp.name)}>
                {Hit(d,"edge:sevadv-stressedcap","Severely-adverse projection → Stressed capital path","Lineage edge · CCAR scenario")}
                <path d={d} fill="none" stroke="#8a6d9e" strokeWidth={1.6} markerEnd={mk("ahCC","edge:sevadv-stressedcap")}/>
              </g>; })()}


            {/* groups + sub-nodes */}
            {LAID.map(g=>(
              <g key={g.dom}>
                <text x={NX} y={g.headerY+12+(g.nodes[0]&&g.nodes[0].dy||0)} opacity={domLit(g)?1:DIMOP} fontFamily={SANS} fontSize="10" fontWeight={700} fill={DOMC}>{g.head}</text>
                {g.nodes.map(n=>{
                  return (
                    <g key={n.name} opacity={opN(n.name)}>
                      {card({key:n.name, x:NX, y:n.y, w:NW, ref:n.ref, gap:n.gap, horizon:n.hz, name:n.name,
                        scenario:n.base?"BASE":(n.stress?"STRESS":null), realization:n.real||(n.pos?"SPOT":"FCST"), stmt:bslOf(g,n),
                        id:n.name, label:n.name, kind:"Domain view · "+g.dom})}
                      {(()=>{ const ms=METMAP[n.met]||[[n.met,null]]; const k=ms.length;
                        const sh=k*MH2+(k-1)*MG, mid=n.y+NH/2, tx=MXX-14, top=(n.ctr?(mid-sh/2):(k>=5?n.y:mid-sh/2));
                        const metSel=ms.some(m=>hi(m[1]||m[0]));
                        return <g>
                          <line x1={NX+NW} y1={mid} x2={tx} y2={mid} stroke={metSel?"#d9a93a":MUTED} strokeWidth={metSel?2:1.5}/>
                          {k>1 && <line x1={tx} y1={top+MH2/2} x2={tx} y2={top+sh-MH2/2} stroke={metSel?"#d9a93a":MUTED} strokeWidth={metSel?2:1.5}/>}
                          {ms.map((m,i)=>{ const by=top+i*(MH2+MG), bm=by+MH2/2; const mid2=m[1]||m[0]; return <g key={i} onClick={pick(mid2,m[0],"Metric")} style={{cursor:"pointer"}}>
                            <path d={`M${NX+NW},${mid} L${tx},${mid} L${tx},${bm} L${MXX},${bm}`} fill="none" stroke="transparent" strokeWidth={11}/>
                            <line x1={tx} y1={bm} x2={MXX} y2={bm} stroke={hi(mid2)?"#d9a93a":MUTED} strokeWidth={hi(mid2)?2.5:1.5} markerEnd={mk("ah",mid2)}/>
                            <rect x={MXX} y={by} width={MBW} height={MH2} rx={4} fill="#fff" stroke={matchS(m[1],m[0])?"#16a34a":((drift&&!(m[1]&&inReg(m[1])))?"#e11d48":(hi(mid2)?"#d9a93a":LINE))} strokeWidth={matchS(m[1],m[0])?3:((drift&&!(m[1]&&inReg(m[1])))?2.5:(hi(mid2)?2:1))}/>
                            <text x={MXX+8} y={bm+3} fontFamily={SANS} fontSize="8" fontWeight={600} fill={INK}>{m[0]}</text>
                            {m[1] && <text x={MXX+MBW-8} y={bm+3} textAnchor="end" fontFamily={MONO} fontSize="7" fontWeight={700} fill={m[2]?"#b5524a":MUTED}>{m[1]}{m[2]?" ?":""}</text>}
                          </g>; })}
                        </g>; })()}
                    </g>
                  );
                })}
              </g>
            ))}
            {/* CIO / Portfolio — upstream SOURCE (DX26): same dark card grammar as the Finance sources */}
            {card({key:"cio-src", x:14, y:44, w:108, dark:true, ref:"DX26", horizon:"~36m", name:"CIO Portfolio Plan", stmt:"B/S", realization:"PLAN", op:opN("CIO"), id:"CIO", label:"CIO Portfolio Plan (DX26)", kind:"Upstream source — feeds ALM + Capital"})}
            {/* CIO -> ALM : Investment Portfolio Plan (DX26) feeds the balance-sheet / NII forecast */}
            <g opacity={opN("CIO")}>
              <path d="M122,78 C185,100 235,178 264,200" fill="none" stroke={SLATE} strokeWidth={1.4} opacity={0.7} markerEnd={mk("ah","edge:cio-alm")}/>
              {Hit("M122,78 C185,100 235,178 264,200","edge:cio-alm","CIO \u2192 ALM (Portfolio Plan DX26 \u2192 balance-sheet / NII forecast)","Upstream feed")}
            </g>
            {/* CIO -> Capital (AOCI + CECL) */}
            <g opacity={1}>
              <path d="M122,55 C280,50 444,70 473,74" fill="none" stroke={GREY} strokeWidth={1.4} opacity={0.6} markerEnd={mk("ah","edge:cio-capital")}/>
              {Hit("M122,55 C280,50 444,70 473,74","edge:cio-capital","CIO \u2192 Capital (AOCI + CECL)","Upstream feed")}
            </g>
            {/* Treasury Datamart — aggregated position layer (aggregates PB01–PB09 + PB12/SFT; NOT the register PB12=SFT object) */}
            <g opacity={opN("DATAMART")}>
              <rect x={138} y={264} width={74} height={54} rx={7} fill="#eef2f7" stroke={matchS("DATAMART","Treasury Datamart","PB01","PB12")?"#16a34a":SLATE} strokeWidth={matchS("DATAMART","Treasury Datamart","PB01","PB12")?3.5:1.4}/>
              <text x={175} y={277} textAnchor="middle" fontFamily={MONO} fontSize="7" fontWeight={700} fill={SLATE}>PB01-09 + PB12</text>
              <text x={175} y={291} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={INK}>Treasury</text>
              <text x={175} y={302} textAnchor="middle" fontFamily={SANS} fontSize="9" fontWeight={700} fill={INK}>Datamart</text>
              <text x={175} y={312} textAnchor="middle" fontFamily={MONO} fontSize="6" fontWeight={600} fill={MUTED}>(instrument level)</text>
            </g>
            <rect x={138} y={264} width={74} height={54} rx={7} fill="transparent" style={{cursor:"pointer"}} onClick={pick("DATAMART","Treasury Datamart — aggregated position layer (PB01–PB09 + PB12/SFT)","Shared data layer · aggregation, not a single register object")}/>
            {hi("DATAMART") && <rect x={138} y={264} width={74} height={54} rx={7} fill="none" stroke="#d9a93a" strokeWidth={2.5}/>}
            {/* FR 2052a — built from the datamart, feeds LCR + NSFR (register v11: DX30) */}
            <rect x={138} y={420} width={74} height={54} rx={7} fill="#eef2f7" stroke={matchS("R04","FR 2052a","2052")?"#16a34a":SLATE} strokeWidth={matchS("R04","FR 2052a","2052")?3.5:1.4}/>
            <text x={175} y={434} textAnchor="middle" fontFamily={MONO} fontSize="7" fontWeight={700} fill={SLATE}>R04</text>
            <text x={175} y={451} textAnchor="middle" fontFamily={SANS} fontSize="8.5" fontWeight={700} fill={INK}>FR 2052a</text>
            <text x={175} y={465} textAnchor="middle" fontFamily={SANS} fontSize="6" fill={MUTED}>{"\u2192"} LCR + NSFR</text>
            <rect x={138} y={420} width={74} height={54} rx={7} fill="transparent" style={{cursor:"pointer"}} onClick={pick("R04","FR 2052a (Liquidity Monitoring) \u2014 filed report; feeds the LCR + NSFR calcs","Report \u00b7 FR 2052a")}/>
            {hi("R04") && <rect x={138} y={420} width={74} height={54} rx={7} fill="none" stroke="#d9a93a" strokeWidth={2.5}/>}
            <g>
              <path d="M175,318 L175,420" fill="none" stroke={GREY} strokeWidth={1.3} markerEnd={mk("ah","edge:datamart-2052a")}/>
              {Hit("M175,318 L175,420","edge:datamart-2052a","Treasury Datamart \u2192 FR 2052a","Positions \u2192 regulatory liquidity report")}
            </g>
            {/* FR 2052a -> LCR + NSFR calcs (DX30 -> DX05 / DX31), routed below the ALM outputs */}
            <g>
              <path d="M212,440 C320,450 410,445 476,388" fill="none" stroke={SLATE} strokeWidth={1.3} opacity={0.6} markerEnd={mk("ah","edge:2052a-lcr")}/>
              {Hit("M212,440 C320,450 410,445 476,388","edge:2052a-lcr","FR 2052a \u2192 LCR calc (R04 \u2192 DX05)","Liquidity calc input")}
            </g>
            <g>
              <path d="M212,458 C310,460 410,452 476,440" fill="none" stroke={SLATE} strokeWidth={1.3} opacity={0.6} markerEnd={mk("ah","edge:2052a-nsfr")}/>
              {Hit("M212,458 C310,460 410,452 476,440","edge:2052a-nsfr","FR 2052a \u2192 NSFR calc (R04 \u2192 DX31)","Liquidity calc input")}
            </g>
            {(()=>{ const g=LAID.find(x=>x.dom==="LIQUIDITY"); const sp=g.nodes.filter(n=>n.pos && n.ref!=="DX05" && n.ref!=="DX31");
              const TKX=406, mids=sp.map(n=>n.y+NH/2), topY=Math.min(...mids), botY=Math.max(...mids);
              const entryY=Math.min(Math.max(413,topY),botY);
              const dd=`M175,318 L175,413 L${TKX},413 M${TKX},${topY} L${TKX},${botY}`;
              const ddH=dd+sp.map(n=>` M${TKX},${n.y+NH/2} L${NX},${n.y+NH/2}`).join("");
              const spineOp=1;
              return <g>
                {Hit(ddH,"edge:current-bs-bus","Treasury Datamart \u2192 liquidity (spot positions)","Spot-balance feed")}
                <path d={dd} fill="none" stroke={GREY} strokeWidth={1.3} opacity={spineOp}/>
                {sp.map((n,i)=><line key={i} x1={TKX} y1={n.y+NH/2} x2={NX} y2={n.y+NH/2} opacity={opE("DATAMART",n.name)} stroke={GREY} strokeWidth={1.3} markerEnd={mk("ah","edge:current-bs-bus")}/>)}
              </g>; })()}
            {/* ===== AOCI ownership: Controllers/ALM (DOMAINS) produce DX28/DX29 objects -> Capital (register v10) ===== */}
            <text x={14} y={108} fontFamily={SANS} fontSize="10" fontWeight={700} fill={DOMC}>CONTROLLERS</text>
            {card({key:"dx28", x:14, y:114, w:108, dark:true, ref:"DX28", horizon:"QTD", name:"AOCI Actual", realization:"ACTUAL", op:1, id:"DX28", label:"AOCI Actual / QTD \u2014 produced by the Controllers domain", kind:"Object (Derived)"})}
            {/* DX28 (AOCI actual) -> Capital / CET1 */}
            <g>
              <path d="M122,137 C280,125 430,102 472,84" fill="none" stroke="#0d9488" strokeWidth={1.5} opacity={0.72} markerEnd={mk("ah","edge:aoci-actual")}/>
              {Hit("M122,137 C280,125 430,102 472,84","edge:aoci-actual","DX28 AOCI actual/QTD (Controllers) \u2192 Capital \u00b7 CET1","Accounting \u2192 regulatory capital")}
            </g>
            {/* DX29 (OCI forecast) -> Capital / planning */}
            <g>
              <path d="M386,403 C446,398 466,158 472,92" fill="none" stroke="#2563eb" strokeWidth={1.5} opacity={0.68} markerEnd={mk("ah","edge:oci-forecast")}/>
              {Hit("M386,403 C446,398 466,158 472,92","edge:oci-forecast","DX29 OCI forecast rate+spread (ALM) \u2192 Capital \u00b7 planning","Forecast \u2192 capital planning")}
            </g>
            {/* ===== reconciliation / variance ties — grey grid (bottom-left) ===== */}
            <g transform={`translate(0, ${TOTAL-574})`}>
              <rect x={14} y={440} width={316} height={118} rx={8} fill="#fafbfc" stroke={GREY} strokeWidth={1}/>
              <text x={24} y={457} fontFamily={SANS} fontSize="9.5" fontWeight={800} fill={GREY} style={{letterSpacing:".04em"}}>RECONCILIATION / VARIANCE TIES</text>
              <text x={24} y={468} fontFamily={SANS} fontSize="6.8" fill={GREY}>node {"\u2194"} node pairs that reconcile</text>
              <line x1={20} y1={474} x2={324} y2={474} stroke={GREY} strokeWidth={0.6} opacity={0.5}/>
              {[["PB10","Datamart","GL \u2194 Treasury Datamart (recon control)"],
                ["DX18","DX17","Plan B/S \u2194 ALM structural B/S"],
                ["Plan Income","DX20","Plan Income \u2194 ALM NII"],
                ["DX18","PB10","Plan B/S \u2194 Actual B/S (budget)"],
                ["Plan Income","PB11","Plan Income \u2194 Actual Income (budget)"]
              ].map((r,i)=>{ const yy=474+i*16; return <g key={i}>
                <text x={24} y={yy+11} fontFamily={MONO} fontSize="7.5" fontWeight={700} fill={INK}>{r[0]}</text>
                <text x={100} y={yy+11} fontFamily={SANS} fontSize="8" fill={GREY}>{"\u2194"}</text>
                <text x={112} y={yy+11} fontFamily={MONO} fontSize="7.5" fontWeight={700} fill={INK}>{r[1]}</text>
                <text x={188} y={yy+11} fontFamily={SANS} fontSize="6.8" fill={GREY}>{r[2]}</text>
                {i<4 && <line x1={20} y1={yy+16} x2={324} y2={yy+16} stroke={GREY} strokeWidth={0.4} opacity={0.35}/>}
              </g>; })}
            </g>
            {focusDX && <DXGraph key={focusDX} seed={focusDX} total={TOTAL} onExit={()=>setFocusDX(null)}/>}
          </svg>
        </div>

        <TodoPanel/>
      </div>
      <SelectedPanel sel={sel} setSel={setSel}/>
    </div>
  );
}
