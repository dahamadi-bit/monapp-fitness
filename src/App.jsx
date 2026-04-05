import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const C = {
  bg:"#F4F6FF", card:"#FFFFFF", card2:"#EEF1FA",
  gold:"#F59E0B", red:"#EF4444", green:"#22C55E", blue:"#3B82F6", purple:"#A855F7",
  teal:"#06B6D4", orange:"#F97316",
  text:"#1E1B4B", muted:"#94A3B8", border:"#E2E8F0"
};

// ── STORAGE ROBUSTE ───────────────────────────────
const KEYS = {
  workouts: "gend_v2_workouts",
  runs: "gend_v2_runs",
  measures: "gend_v2_measures",
  meals: "gend_v2_meals",
  reminders: "gend_v2_reminders",
  tapis: "gend_v2_tapis",
  evals: "gend_v2_evals",
  wellness: "gend_v2_wellness",
};

// ── INDEXEDDB (stockage persistant mobile + desktop) ──
const IDB_NAME = "monapp_fitness";
const IDB_STORE = "kv";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("IDB timeout")), 1500);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => { clearTimeout(timer); resolve(e.target.result); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
    } catch(e) { clearTimeout(timer); reject(e); }
  });
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbLoad(key, def) {
  // Essai 1 : IndexedDB (persistant mobile)
  try {
    const val = await idbGet(key);
    if (val !== null) {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : def;
    }
  } catch {}
  // Essai 2 : window.storage (API native webview)
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const r = await window.storage.get(key);
      if (r && r.value != null) {
        const parsed = JSON.parse(r.value);
        if (Array.isArray(parsed)) {
          // Migrer vers IndexedDB
          idbSet(key, r.value).catch(() => {});
          return parsed;
        }
      }
    }
  } catch {}
  // Essai 3 : localStorage (fallback)
  try {
    const val = localStorage.getItem(key);
    if (val) {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        // Migrer vers IndexedDB
        idbSet(key, val).catch(() => {});
        return parsed;
      }
    }
  } catch {}
  return def;
}

async function dbSave(key, val) {
  const str = JSON.stringify(val);
  let saved = false;
  // Essai 1 : IndexedDB (persistant)
  try {
    await idbSet(key, str);
    saved = true;
  } catch {}
  // Essai 2 : window.storage (webview natif)
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set(key, str);
      saved = true;
    }
  } catch {}
  // Essai 3 : localStorage
  try {
    localStorage.setItem(key, str);
    saved = true;
  } catch {}
  return saved;
}

// ── UTILS ─────────────────────────────────────────
const localDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const today = () => localDateStr(new Date());
const fmt = (d) => { try { return new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"}); } catch { return d; }};
const fmtShort = (d) => { try { return new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"numeric"}); } catch { return d; }};
const fmtPace = (km,min) => { if(!km||!min||isNaN(km)||isNaN(min)) return "--"; const p=min/km; return `${Math.floor(p)}'${Math.round((p%1)*60).toString().padStart(2,"0")}"`; };
const fmtTime = (sec) => { const m=Math.floor(sec/60); const s=sec%60; return `${m}:${s.toString().padStart(2,"0")}`; };
const fmtDuration = (min) => { if(!min) return "--"; const h=Math.floor(min/60); const m=Math.round(min%60); return h>0?`${h}h${m.toString().padStart(2,"0")}`:`${m} min`; };

// ── DONNÉES TAPIS ─────────────────────────────────
const TAPIS_SESSIONS = [
  { id:1, bloc:1, label:"Séance 1", sublabel:"Bloc 1 · Reprise", duree:"28 min", niveau:"Débutant", color:C.red,
    description:"Course légère alternée avec marche inclinée. Tu dois pouvoir parler pendant les courses.",
    phases:[
      {nom:"Échauffement",   type:"warmup",   duree:5*60, vitesse:5.0, inclinaison:2, couleur:C.gold,  description:"Marche normale, respiration calme"},
      {nom:"Course 1",       type:"run",      duree:2*60, vitesse:8.0, inclinaison:1, couleur:C.red,   description:"Course légère, tu peux parler"},
      {nom:"Récup active 1", type:"recovery", duree:2*60, vitesse:5.5, inclinaison:3, couleur:C.green, description:"Marche rapide inclinée"},
      {nom:"Course 2",       type:"run",      duree:2*60, vitesse:8.5, inclinaison:1, couleur:C.red,   description:"Légèrement plus soutenu"},
      {nom:"Récup active 2", type:"recovery", duree:2*60, vitesse:5.5, inclinaison:3, couleur:C.green, description:"Marche rapide inclinée"},
      {nom:"Course 3",       type:"run",      duree:2*60, vitesse:9.0, inclinaison:1, couleur:C.red,   description:"Rythme confortable"},
      {nom:"Récup active 3", type:"recovery", duree:2*60, vitesse:5.5, inclinaison:3, couleur:C.green, description:"Marche rapide inclinée"},
      {nom:"Course 4",       type:"run",      duree:2*60, vitesse:9.0, inclinaison:1, couleur:C.red,   description:"Maintiens le rythme"},
      {nom:"Récup active 4", type:"recovery", duree:2*60, vitesse:5.5, inclinaison:3, couleur:C.green, description:"Marche rapide inclinée"},
      {nom:"Retour calme",   type:"cooldown", duree:5*60, vitesse:4.5, inclinaison:1, couleur:C.blue,  description:"Marche lente, récupération"},
    ]
  },
  { id:2, bloc:2, label:"Séance 2", sublabel:"Bloc 2 · Construction", duree:"30 min", niveau:"Intermédiaire", color:C.gold,
    description:"Effort progressif avec récupération active inclinée. Respiration rapide mais rythmée.",
    phases:[
      {nom:"Échauffement",   type:"warmup",   duree:4*60, vitesse:5.5, inclinaison:2, couleur:C.gold,    description:"Marche active"},
      {nom:"Course 1",       type:"run",      duree:3*60, vitesse:9.0, inclinaison:1, couleur:C.red,     description:"Rythme modéré"},
      {nom:"Récup active 1", type:"recovery", duree:90,   vitesse:6.0, inclinaison:4, couleur:C.green,   description:"Marche inclinée soutenue"},
      {nom:"Course 2",       type:"run",      duree:3*60, vitesse:9.5, inclinaison:1, couleur:C.red,     description:"Légère accélération"},
      {nom:"Récup active 2", type:"recovery", duree:90,   vitesse:6.0, inclinaison:4, couleur:C.green,   description:"Marche inclinée soutenue"},
      {nom:"Course 3",       type:"run",      duree:3*60, vitesse:10.0,inclinaison:1, couleur:C.red,     description:"Effort perceptible"},
      {nom:"Récup active 3", type:"recovery", duree:90,   vitesse:6.0, inclinaison:4, couleur:C.green,   description:"Marche inclinée soutenue"},
      {nom:"Course 4",       type:"run",      duree:3*60, vitesse:10.5,inclinaison:1, couleur:C.red,     description:"Pousse un peu"},
      {nom:"Récup active 4", type:"recovery", duree:90,   vitesse:6.0, inclinaison:4, couleur:C.green,   description:"Marche inclinée soutenue"},
      {nom:"Sprint",         type:"run",      duree:2*60, vitesse:11.0,inclinaison:1, couleur:"#FF4444", description:"Sprint contrôlé"},
      {nom:"Retour calme",   type:"cooldown", duree:5*60, vitesse:5.0, inclinaison:1, couleur:C.blue,    description:"Marche récupération"},
    ]
  },
  { id:3, bloc:3, label:"Séance 3", sublabel:"Bloc 3 · Performance", duree:"30 min", niveau:"Avancé", color:C.green,
    description:"Haute intensité. Tu ne peux plus parler pendant les courses — c'est normal et voulu.",
    phases:[
      {nom:"Échauffement",   type:"warmup",   duree:3*60, vitesse:6.0, inclinaison:2, couleur:C.gold,    description:"Marche rapide"},
      {nom:"Course 1",       type:"run",      duree:3*60, vitesse:10.0,inclinaison:1, couleur:C.red,     description:"Mise en régime"},
      {nom:"Récup active 1", type:"recovery", duree:75,   vitesse:6.5, inclinaison:5, couleur:C.green,   description:"Marche très inclinée"},
      {nom:"Course 2",       type:"run",      duree:3*60, vitesse:11.0,inclinaison:1, couleur:C.red,     description:"Allure soutenue"},
      {nom:"Récup active 2", type:"recovery", duree:75,   vitesse:6.5, inclinaison:5, couleur:C.green,   description:"Marche très inclinée"},
      {nom:"Course 3",       type:"run",      duree:3*60, vitesse:11.5,inclinaison:1, couleur:C.red,     description:"Effort marqué"},
      {nom:"Récup active 3", type:"recovery", duree:75,   vitesse:6.5, inclinaison:5, couleur:C.green,   description:"Marche très inclinée"},
      {nom:"Course 4",       type:"run",      duree:3*60, vitesse:12.0,inclinaison:1, couleur:C.red,     description:"Proche du max"},
      {nom:"Récup active 4", type:"recovery", duree:75,   vitesse:6.5, inclinaison:5, couleur:C.green,   description:"Marche très inclinée"},
      {nom:"Sprint final",   type:"run",      duree:2*60, vitesse:13.0,inclinaison:0, couleur:"#FF2222", description:"Tout donner"},
      {nom:"Retour calme",   type:"cooldown", duree:5*60, vitesse:4.5, inclinaison:1, couleur:C.blue,    description:"Récupération complète"},
    ]
  }
];

const EVAL_TYPES = [
  { id:"3km",  label:"Test 3 km",  icon:"🎯", color:C.blue,
    freq:"Toutes les 1-2 semaines", objectif:"< 14 min",  objectifMin:14,
    description:"Ton test de référence principal. Court et intense — mesure ta progression directe vers l'objectif juin 2026.",
    conseil:"Échauffement 5 min marche rapide avant. Cours à fond. Note l'heure exacte." },
  { id:"6km",  label:"Test 6 km",  icon:"💪", color:C.purple,
    freq:"1 fois par mois", objectif:"< 35 min", objectifMin:35,
    description:"Test endurance intermédiaire. Développe ta capacité cardio au-delà de l'objectif principal.",
    conseil:"Allure régulière — ne pars pas trop vite. Vise 5'45\"/km pour commencer." },
  { id:"10km", label:"Test 10 km", icon:"🏆", color:C.orange,
    freq:"1 fois par mois", objectif:"< 60 min", objectifMin:60,
    description:"Le défi long. Évalue ton endurance globale et ta progression sur la durée.",
    conseil:"Allure conservatrice — 6'00\"/km. L'objectif est de finir, pas de sprinter." },
];

const CIRCUITS = {
  15:[{name:"Pompes classiques",detail:"3×max",muscle:"Pecs"},{name:"Squats poids du corps",detail:"3×20",muscle:"Jambes"},{name:"Planche",detail:"3×30sec",muscle:"Abdos"}],
  30:[{name:"Pompes larges",detail:"4×12",muscle:"Pecs"},{name:"Curl haltères",detail:"4×12",muscle:"Biceps"},{name:"Rowing haltères",detail:"4×12",muscle:"Dos"},{name:"Dips entre 2 chaises",detail:"3×max",muscle:"Triceps"},{name:"Crunch",detail:"3×15",muscle:"Abdos"},{name:"Relevés de jambes",detail:"3×15",muscle:"Abdos bas"}],
  45:[{name:"Course légère",detail:"15 min",muscle:"Cardio"},{name:"Pompes larges",detail:"4×12",muscle:"Pecs"},{name:"Curl haltères",detail:"4×12",muscle:"Biceps"},{name:"Rowing haltères",detail:"4×12",muscle:"Dos"},{name:"Dips entre 2 chaises",detail:"3×max",muscle:"Triceps"},{name:"Crunch + Relevés jambes",detail:"3×15 chacun",muscle:"Abdos"},{name:"HIIT sprint/marche",detail:"6×30sec",muscle:"Cardio"},{name:"Stretching",detail:"5 min",muscle:"Récup"}]
};

const MEAL_TYPES=["Déjeuner","Dîner","Nuit","Collation","Petit-déj"];
const NUTRITION_RULES=["Protéines en PREMIER à chaque repas","1 paume = protéine · 2 poings = riz","Après minuit → protéines uniquement, SANS riz","Œufs durs préparés la veille (arme n°1)","1 repas libre par semaine — sans culpabilité","Minimum 2L d'eau par jour"];
const MEAL_PRESETS=["1 paume poulet grillé + 2 poings riz + eau","3 œufs brouillés + riz 80g","4 œufs durs (transport brigade)","Viande froide + légumes (sans riz)","2 œufs + viande froide (repas nuit)","Bœuf grillé + riz 100g + eau"];

// ── HELPERS UI ────────────────────────────────────
const Card=({children,style={}})=><div style={{background:C.card,borderRadius:12,padding:16,marginBottom:10,...style}}>{children}</div>;
const Btn=({children,onClick,color=C.gold,textColor=C.bg,style={},disabled=false})=><button onClick={onClick} disabled={disabled} style={{background:disabled?"#E2E8F0":color,color:disabled?"#94A3B8":textColor,border:"none",borderRadius:10,padding:"12px 20px",fontSize:14,fontWeight:700,fontFamily:"Arial",cursor:disabled?"default":"pointer",...style}}>{children}</button>;
const GhostBtn=({children,onClick,color=C.gold,style={}})=><button onClick={onClick} style={{background:"transparent",color,border:`1px solid ${color}55`,borderRadius:8,padding:"8px 14px",fontSize:12,fontFamily:"Arial",cursor:"pointer",...style}}>{children}</button>;
const SHdr=({children,color=C.gold})=><div style={{fontSize:10,letterSpacing:3,color,fontFamily:"Arial",marginBottom:8}}>{children}</div>;
const Badge=({text,color=C.gold})=><span style={{background:`${color}22`,color,fontSize:9,borderRadius:4,padding:"3px 8px",fontFamily:"Arial",fontWeight:700,letterSpacing:1,whiteSpace:"nowrap"}}>{text}</span>;
const ProgBar=({value,max,color=C.gold,label="",sub=""})=>{const pct=Math.min(100,Math.max(0,Math.round((value/max)*100)));return<div style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:C.text,fontFamily:"Arial"}}>{label}</span><span style={{fontSize:12,color,fontFamily:"Arial",fontWeight:700}}>{sub}</span></div><div style={{background:C.card2,borderRadius:4,height:7,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.8s ease"}}/></div></div>;};
const InputField=({label,value,onChange,type="text",placeholder="",unit="",color=C.gold})=><div style={{marginBottom:10}}>{label&&<div style={{fontSize:10,color,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>{label}</div>}<div style={{display:"flex",alignItems:"center",background:C.card2,borderRadius:8,border:"1px solid #E2E8F0",overflow:"hidden"}}><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,padding:"10px 12px",fontFamily:"Arial"}}/>{unit&&<span style={{color:C.muted,fontSize:12,paddingRight:12,fontFamily:"Arial"}}>{unit}</span>}</div></div>;
const BackBar=({title,onBack,right=null,color=C.gold})=><div style={{background:C.card,padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}><button onClick={onBack} style={{background:"none",border:"none",color,fontSize:20,cursor:"pointer",padding:0}}>←</button><div style={{flex:1,fontSize:15,fontWeight:700,color:C.text,fontFamily:"Arial"}}>{title}</div>{right}</div>;
const CTooltip=({active,payload,label,unit=""})=>{if(!active||!payload?.length)return null;return<div style={{background:C.card2,border:"1px solid #333",borderRadius:8,padding:"8px 12px"}}><div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{fontSize:13,color:p.color,fontFamily:"Arial",fontWeight:700}}>{p.value}{unit}</div>)}</div>;};

// ═══════════════════════════════════════════════════
//  MODULE ÉVALUATIONS
// ═══════════════════════════════════════════════════
function Evaluations({evals, onSave}) {
  const [view, setView] = useState("main");
  const [selType, setSelType] = useState(null);
  const [form, setForm] = useState({date:today(), duree:"", support:"tapis", notes:""});
  const [showDetail, setShowDetail] = useState(null);

  const saveEval = () => {
    if(!form.duree || !selType) return;
    const dureeMin = parseFloat(form.duree);
    const et = EVAL_TYPES.find(e=>e.id===selType);
    onSave({
      id: Date.now(),
      type: selType,
      label: et.label,
      date: form.date,
      duree: dureeMin,
      support: form.support,
      notes: form.notes,
      objectifMin: et.objectifMin,
      reussi: dureeMin < et.objectifMin,
    });
    setForm({date:today(), duree:"", support:"tapis", notes:""});
    setView("main");
    setSelType(null);
  };

  const getEvalsForType = (typeId) => evals.filter(e=>e.type===typeId).sort((a,b)=>a.date.localeCompare(b.date));
  const getLastEval = (typeId) => { const arr=getEvalsForType(typeId); return arr[arr.length-1]||null; };
  const getBest = (typeId) => { const arr=getEvalsForType(typeId); return arr.length?arr.reduce((b,e)=>e.duree<b.duree?e:b):null; };
  const getProgression = (typeId) => {
    const arr=getEvalsForType(typeId);
    if(arr.length<2) return null;
    const diff=arr[arr.length-1].duree - arr[arr.length-2].duree;
    return diff;
  };

  // Prochaine date recommandée
  const getNextRecom = (typeId, freq) => {
    const last = getLastEval(typeId);
    if(!last) return "Dès maintenant !";
    const d = new Date(last.date+"T12:00:00");
    if(freq.includes("semaine")) {
      const weeks = freq.includes("2") ? 2 : 1;
      d.setDate(d.getDate() + weeks*7);
    } else if(freq.includes("mois")) {
      d.setMonth(d.getMonth()+1);
    }
    const now = new Date();
    if(d <= now) return "C'est le moment !";
    return `À partir du ${fmt(localDateStr(d))}`;
  };

  if(view==="log") {
    const et = EVAL_TYPES.find(e=>e.id===selType);
    const dureeMin = parseFloat(form.duree)||0;
    const reussi = dureeMin > 0 && dureeMin < et.objectifMin;
    const pct = dureeMin > 0 ? Math.round((et.objectifMin/dureeMin)*100) : 0;
    return(
      <div>
        <BackBar title={`Enregistrer — ${et.label}`} onBack={()=>setView("main")} color={et.color}/>
        <div style={{padding:"16px 16px 80px"}}>
          <Card style={{background:`${et.color}11`, border:`1px solid ${et.color}33`, textAlign:"center", marginBottom:16}}>
            <div style={{fontSize:24}}>{et.icon}</div>
            <div style={{fontSize:16,fontWeight:700,color:et.color,fontFamily:"Arial"}}>{et.label}</div>
            <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginTop:4,fontStyle:"italic"}}>{et.conseil}</div>
          </Card>

          <InputField label="DATE" type="date" value={form.date} onChange={v=>setForm({...form,date:v})} color={et.color}/>
          <InputField label="TEMPS RÉALISÉ" type="number" value={form.duree} onChange={v=>setForm({...form,duree:v})} placeholder="Ex: 13.5 pour 13min30" unit="min" color={et.color}/>

          {/* Convertisseur mm:ss → minutes */}
          <div style={{background:C.card2,borderRadius:8,padding:"10px 14px",marginBottom:12}}>
            <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:6}}>CONVERTISSEUR — entre mm et ss pour obtenir les minutes décimales</div>
            <MiniConverter onResult={v=>setForm({...form,duree:v})} color={et.color}/>
          </div>

          {dureeMin>0 && (
            <Card style={{background:reussi?"#DCFCE7":"#FEE2E2", border:`1px solid ${reussi?C.green:C.red}44`, textAlign:"center", marginBottom:12}}>
              <div style={{fontSize:28,fontWeight:700,color:reussi?C.green:C.red,fontFamily:"Arial"}}>{fmtDuration(dureeMin)}</div>
              <div style={{fontSize:12,color:reussi?C.green:C.muted,fontFamily:"Arial",marginTop:4}}>
                {reussi?`✅ Objectif atteint ! (${et.objectif})`:`Objectif : ${et.objectif} — Écart : ${(dureeMin-et.objectifMin).toFixed(1)} min`}
              </div>
              <div style={{marginTop:8}}>
                <ProgBar value={Math.min(pct,100)} max={100} color={reussi?C.green:et.color}
                  label="Niveau atteint" sub={`${Math.min(pct,100)}%`}/>
              </div>
            </Card>
          )}

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:et.color,marginBottom:6,fontFamily:"Arial",letterSpacing:2}}>SUPPORT</div>
            <div style={{display:"flex",gap:8}}>
              {["tapis","extérieur"].map(s=>(
                <button key={s} onClick={()=>setForm({...form,support:s})} style={{flex:1,padding:"10px",borderRadius:8,background:form.support===s?`${et.color}33`:C.card2,border:`1px solid ${form.support===s?et.color:"#E2E8F0"}`,color:form.support===s?et.color:C.muted,fontSize:12,fontFamily:"Arial",cursor:"pointer"}}>
                  {s==="tapis"?"⚡ Tapis":"🌿 Extérieur"}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:et.color,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>RESSENTI / NOTES</div>
            <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Conditions, ressenti, météo..."
              style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box"}}/>
          </div>

          <Btn onClick={saveEval} color={et.color} textColor={selType==="3km"?"#fff":C.bg} style={{width:"100%"}} disabled={!form.duree}>
            💾 Enregistrer ce test
          </Btn>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>🏆 Évaluations</div>
        <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>Tests de progression · 3km · 6km · 10km</div>
      </div>
      <div style={{padding:"12px 16px 80px"}}>

        <Card style={{background:"#EEF1FA",border:`1px solid ${C.blue}33`}}>
          <SHdr color={C.blue}>💡 POURQUOI CES TESTS ?</SHdr>
          <div style={{fontSize:13,color:"#3B82F6",fontFamily:"Arial",lineHeight:1.8}}>
            ✓ <strong style={{color:C.text}}>3 km</strong> — toutes les 1-2 semaines → objectif juin 2026<br/>
            ✓ <strong style={{color:C.text}}>6 km</strong> — 1 fois/mois → endurance intermédiaire<br/>
            ✓ <strong style={{color:C.text}}>10 km</strong> — 1 fois/mois → défi et mental<br/>
            <span style={{fontSize:11,color:C.muted}}>Tapis ou extérieur — note toujours le support utilisé</span>
          </div>
        </Card>

        {EVAL_TYPES.map((et,i)=>{
          const lastE = getLastEval(et.id);
          const bestE = getBest(et.id);
          const prog = getProgression(et.id);
          const typeEvals = getEvalsForType(et.id);
          const chartData = typeEvals.map(e=>({date:fmtShort(e.date),val:parseFloat(e.duree.toFixed(1)),label:fmt(e.date)}));
          const isOpen = showDetail===et.id;

          return(
            <div key={i} style={{background:C.card,borderRadius:14,marginBottom:12,border:`1px solid ${et.color}33`,overflow:"hidden"}}>
              {/* Header */}
              <div style={{background:`${et.color}18`,padding:"14px 16px",borderBottom:`1px solid ${et.color}22`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Arial"}}>{et.icon} {et.label}</div>
                    <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginTop:2}}>{et.freq} · Objectif : <strong style={{color:et.color}}>{et.objectif}</strong></div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{typeEvals.length} test{typeEvals.length>1?"s":""}</div>
                    {lastE && <Badge text={lastE.reussi?"✅ Objectif !":"En progression"} color={lastE.reussi?C.green:et.color}/>}
                  </div>
                </div>
              </div>

              <div style={{padding:"12px 16px"}}>
                {/* Stats rapides */}
                {lastE && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                    {[
                      {label:"Dernier", val:fmtDuration(lastE.duree), c:et.color},
                      {label:"Meilleur", val:bestE?fmtDuration(bestE.duree):"--", c:C.green},
                      {label:"Évolution", val:prog!==null?(prog<0?`-${Math.abs(prog).toFixed(1)}min`:`+${prog.toFixed(1)}min`):"--", c:prog!==null&&prog<0?C.green:C.red},
                    ].map((s,si)=>(
                      <div key={si} style={{background:C.card2,borderRadius:8,padding:"8px",textAlign:"center"}}>
                        <div style={{fontSize:12,fontWeight:700,color:s.c,fontFamily:"Arial"}}>{s.val}</div>
                        <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Prochaine séance recommandée */}
                <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:12,fontStyle:"italic"}}>
                  🗓️ Prochain test recommandé : <strong style={{color:et.color}}>{getNextRecom(et.id, et.freq)}</strong>
                </div>

                {/* Mini graphique */}
                {chartData.length>=2 && (
                  <div style={{marginBottom:12}} onClick={()=>setShowDetail(isOpen?null:et.id)}>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:4}}>PROGRESSION (cliquer pour agrandir)</div>
                    <ResponsiveContainer width="100%" height={isOpen?160:80}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id={`g${et.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={et.color} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={et.color} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        {isOpen&&<CartesianGrid strokeDasharray="3 3" stroke={C.border}/>}
                        {isOpen&&<XAxis dataKey="date" tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false}/>}
                        {isOpen&&<YAxis reversed domain={["dataMin - 1","dataMax + 1"]} tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false} width={28} tickFormatter={v=>`${Math.floor(v)}'`}/>}
                        {isOpen&&<Tooltip content={<CTooltip unit=" min"/>}/>}
                        <ReferenceLine y={et.objectifMin} stroke={C.green} strokeDasharray="3 3"/>
                        <Area type="monotone" dataKey="val" stroke={et.color} fill={`url(#g${et.id})`} strokeWidth={2} dot={isOpen?{fill:et.color,r:4}:false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                    {isOpen&&<div style={{fontSize:10,color:C.muted,fontFamily:"Arial",textAlign:"center",marginTop:4}}>Axe inversé — plus bas = plus rapide</div>}
                  </div>
                )}

                {/* Historique détaillé si ouvert */}
                {isOpen && typeEvals.length>0 && (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:6}}>HISTORIQUE COMPLET</div>
                    {[...typeEvals].reverse().map((e,ei)=>(
                      <div key={ei} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:ei<typeEvals.length-1?`1px solid ${C.border}`:"none"}}>
                        <div>
                          <div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>{fmtDuration(e.duree)}</div>
                          <div style={{fontSize:10,color:C.muted,fontFamily:"Arial"}}>{fmt(e.date)} · {e.support}</div>
                          {e.notes&&<div style={{fontSize:10,color:C.muted,fontFamily:"Arial",fontStyle:"italic"}}>"{e.notes}"</div>}
                        </div>
                        <Badge text={e.reussi?"✅ Objectif":"En cours"} color={e.reussi?C.green:et.color}/>
                      </div>
                    ))}
                  </div>
                )}

                <Btn onClick={()=>{setSelType(et.id);setView("log");}} color={et.color}
                  textColor={et.id==="3km"?"#fff":C.bg} style={{width:"100%",fontSize:13}}>
                  + Enregistrer un test {et.label}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mini convertisseur mm:ss → minutes décimales
function MiniConverter({onResult, color}) {
  const [mm, setMm] = useState("");
  const [ss, setSs] = useState("");
  const result = mm||ss ? (parseInt(mm||0) + parseInt(ss||0)/60).toFixed(2) : null;
  return(
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <input type="number" value={mm} onChange={e=>setMm(e.target.value)} placeholder="min"
        style={{width:60,background:"#E2E8F0",border:`1px solid ${color}55`,borderRadius:6,color:C.text,padding:"6px 8px",fontSize:13,fontFamily:"Arial",outline:"none",textAlign:"center"}}/>
      <span style={{color:C.muted,fontFamily:"Arial"}}>:</span>
      <input type="number" value={ss} onChange={e=>setSs(e.target.value)} placeholder="sec"
        style={{width:60,background:"#E2E8F0",border:`1px solid ${color}55`,borderRadius:6,color:C.text,padding:"6px 8px",fontSize:13,fontFamily:"Arial",outline:"none",textAlign:"center"}}/>
      {result&&(
        <>
          <span style={{fontSize:12,color:C.muted,fontFamily:"Arial"}}>= <strong style={{color}}>{result} min</strong></span>
          <button onClick={()=>onResult(result)} style={{background:color,border:"none",borderRadius:6,color:C.bg,padding:"5px 10px",fontSize:11,fontFamily:"Arial",fontWeight:700,cursor:"pointer"}}>Utiliser</button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  ÉTIREMENTS & RESSENTI
// ═══════════════════════════════════════════════════
const ETIREMENTS = [
  {nom:"Quadriceps debout", duree:60, desc:"30s chaque jambe"},
  {nom:"Ischio-jambiers assis", duree:30, desc:"En avant, jambes tendues"},
  {nom:"Mollets contre mur", duree:30, desc:"Talon au sol, appui sur mur"},
  {nom:"Épaules croisées", duree:30, desc:"Bras tendu passé devant la poitrine"},
  {nom:"Cou latéral", duree:60, desc:"30s chaque côté, doucement"},
  {nom:"Respiration profonde", duree:60, desc:"Inspire 4s · Expire 6s"},
];
const ETIREMENTS_TOTAL = ETIREMENTS.reduce((a,e)=>a+e.duree,0); // 270s = 4min30

function EtirementsScreen({onDone}) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const intervalRef = useRef(null);

  useEffect(()=>{
    intervalRef.current = setInterval(()=>{
      setElapsed(e=>{
        if(e+1>=ETIREMENTS_TOTAL){clearInterval(intervalRef.current);setDone(true);return ETIREMENTS_TOTAL;}
        return e+1;
      });
    },1000);
    return()=>clearInterval(intervalRef.current);
  },[]);

  // Quel étirement en cours ?
  let cumul=0;
  let curIdx=0;
  let curLeft=0;
  for(let i=0;i<ETIREMENTS.length;i++){
    if(elapsed<cumul+ETIREMENTS[i].duree){curIdx=i;curLeft=ETIREMENTS[i].duree-(elapsed-cumul);break;}
    cumul+=ETIREMENTS[i].duree;
    if(i===ETIREMENTS.length-1){curIdx=i;curLeft=0;}
  }
  const cur=ETIREMENTS[curIdx];
  const pct=Math.round((elapsed/ETIREMENTS_TOTAL)*100);

  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{fontSize:60,marginBottom:8}}>🧘</div>
      <div style={{fontSize:22,fontWeight:700,color:C.teal,fontFamily:"Arial",marginBottom:4}}>ÉTIREMENTS</div>
      <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:20}}>5 minutes de récupération</div>

      <div style={{background:C.card,borderRadius:16,padding:20,width:"100%",maxWidth:360,marginBottom:16}}>
        <div style={{fontSize:10,letterSpacing:3,color:C.teal,fontFamily:"Arial",marginBottom:4}}>{`${curIdx+1}/${ETIREMENTS.length}`}</div>
        <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Arial",marginBottom:4}}>{done?"Terminé !":cur.nom}</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:12}}>{done?"Bravo ! Tu peux maintenant te reposer":cur.desc}</div>
        {!done&&<div style={{fontSize:48,fontWeight:700,color:C.teal,fontFamily:"'Courier New',monospace",marginBottom:12}}>{fmtTime(curLeft)}</div>}
      </div>

      <div style={{width:"100%",maxWidth:360,marginBottom:12}}>
        <ProgBar value={elapsed} max={ETIREMENTS_TOTAL} color={C.teal} label="Progression" sub={`${pct}%`}/>
      </div>

      <div style={{display:"flex",gap:12,width:"100%",maxWidth:360}}>
        <GhostBtn onClick={onDone} color={C.muted} style={{flex:1}}>⏭ Passer</GhostBtn>
        {done&&<Btn onClick={onDone} color={C.teal} textColor={C.bg} style={{flex:1}}>✅ Terminé</Btn>}
      </div>

      <div style={{marginTop:16,width:"100%",maxWidth:360}}>
        <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
          {ETIREMENTS.map((_,i)=>(
            <div key={i} style={{width:12,height:12,borderRadius:"50%",background:i<curIdx?C.teal:i===curIdx?"#0891B2":"#E2E8F0"}}/>
          ))}
        </div>
      </div>
    </div>
  );
}

const DOULEURS_OPTIONS = ["Aucune","Genou","Dos","Épaule","Mollet","Autre"];

function RessentisScreen({onSave, onSkip}) {
  const [stars, setStars] = useState(0);
  const [douleurs, setDouleurs] = useState([]);
  const [notes, setNotes] = useState("");

  const toggleDouleur = (d) => {
    if(d==="Aucune"){setDouleurs(["Aucune"]);return;}
    setDouleurs(prev=>{
      const without=prev.filter(x=>x!=="Aucune");
      return without.includes(d)?without.filter(x=>x!==d):[...without,d];
    });
  };

  const handleSave = () => {
    onSave({id:Date.now(),date:today(),stars,douleurs,notes});
  };

  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:50,marginBottom:8}}>💬</div>
      <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Arial",marginBottom:4,textAlign:"center"}}>Comment tu te sens ?</div>
      <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:24,textAlign:"center"}}>Optionnel — aide à suivre ta récupération</div>

      <div style={{width:"100%",maxWidth:360}}>
        <Card>
          <SHdr>RESSENTI GLOBAL</SHdr>
          <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:4}}>
            {[1,2,3,4,5].map(s=>(
              <button key={s} onClick={()=>setStars(s)} style={{background:"none",border:"none",fontSize:32,cursor:"pointer",opacity:s<=stars?1:0.3}}>⭐</button>
            ))}
          </div>
          <div style={{textAlign:"center",fontSize:12,color:C.muted,fontFamily:"Arial"}}>{["","Très difficile","Difficile","Correct","Bien","Excellent"][stars]||"Touche une étoile"}</div>
        </Card>

        <Card>
          <SHdr>DOULEURS / GÊNES</SHdr>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {DOULEURS_OPTIONS.map(d=>(
              <button key={d} onClick={()=>toggleDouleur(d)} style={{
                background:douleurs.includes(d)?`${C.red}22`:C.card2,
                border:`1px solid ${douleurs.includes(d)?C.red:"#E2E8F0"}`,
                borderRadius:8,padding:"8px 12px",fontSize:12,color:douleurs.includes(d)?C.red:C.muted,
                fontFamily:"Arial",cursor:"pointer"
              }}>{d}</button>
            ))}
          </div>
        </Card>

        <Card>
          <SHdr>NOTES (optionnel)</SHdr>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ressenti, douleur particulière..."
            style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box"}}/>
        </Card>

        <div style={{display:"flex",gap:12}}>
          <GhostBtn onClick={onSkip} color={C.muted} style={{flex:1}}>Passer</GhostBtn>
          <Btn onClick={handleSave} color={C.green} textColor="#fff" style={{flex:1}}>Valider</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAPIS — SÉANCE GUIDÉE
// ═══════════════════════════════════════════════════
function TapisSession({session, onFinish, onSaveTapis, onSaveWellness}) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(session.phases[0].duree);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showEtirements, setShowEtirements] = useState(false);
  const [showRessenti, setShowRessenti] = useState(false);
  const intervalRef = useRef(null);
  const totalDuree = session.phases.reduce((a,p)=>a+p.duree,0);
  const doneTime = session.phases.slice(0,phaseIdx).reduce((a,p)=>a+p.duree,0);
  const globalPct = Math.round(((doneTime+(session.phases[phaseIdx].duree-timeLeft))/totalDuree)*100);
  const phase = session.phases[phaseIdx];
  const nextPhase = session.phases[phaseIdx+1]||null;

  useEffect(()=>{
    if(running&&!done){
      intervalRef.current=setInterval(()=>{
        setTimeLeft(t=>{
          if(t<=1){
            setPhaseIdx(idx=>{
              const next=idx+1;
              if(next>=session.phases.length){setDone(true);setRunning(false);return idx;}
              setTimeLeft(session.phases[next].duree);
              return next;
            });
            return 0;
          }
          return t-1;
        });
        setElapsed(e=>e+1);
      },1000);
    }
    return()=>clearInterval(intervalRef.current);
  },[running,done]);

  const doSave=(completed)=>{
    onSaveTapis({id:Date.now(),date:today(),sessionId:session.id,sessionLabel:session.label,bloc:session.bloc,niveau:session.niveau,dureeReelle:Math.round(elapsed/60),completed,phases:session.phases.length});
  };

  const handleFinish=()=>{
    doSave(done);
    onFinish();
  };

  const typeEmoji={warmup:"🔥",run:"🏃",recovery:"🚶",cooldown:"❄️"};

  // Étirements → Ressenti → Retour
  if(showRessenti) return(
    <RessentisScreen
      onSave={(w)=>{if(onSaveWellness)onSaveWellness(w);handleFinish();}}
      onSkip={handleFinish}
    />
  );
  if(showEtirements) return(
    <EtirementsScreen onDone={()=>setShowRessenti(true)}/>
  );

  if(done) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{fontSize:80,marginBottom:16}}>🎉</div>
      <div style={{fontSize:28,fontWeight:700,color:C.green,fontFamily:"Arial",marginBottom:8,textAlign:"center"}}>Séance terminée !</div>
      <div style={{fontSize:14,color:C.muted,fontFamily:"Arial",marginBottom:32,textAlign:"center"}}>{session.label} · {Math.round(elapsed/60)} min</div>
      <Card style={{width:"100%",maxWidth:380,textAlign:"left",background:"#DCFCE7",border:`1px solid ${C.green}44`}}>
        <div style={{fontSize:13,color:C.green,fontFamily:"Arial",marginBottom:10,fontWeight:700}}>✅ Après la séance</div>
        {["Manger dans 30 min : 1 paume de protéine","Pas de riz après cette séance","Étire mollets, quadriceps, hanches 5 min","Bois 500 ml d'eau"].map((t,i)=><div key={i} style={{fontSize:13,color:"#16A34A",fontFamily:"Arial",marginBottom:6}}>✓ {t}</div>)}
      </Card>
      <Btn onClick={()=>{doSave(true);setShowEtirements(true);}} color={C.teal} textColor={C.bg} style={{marginTop:16,width:"100%",maxWidth:380}}>🧘 Étirements (5 min)</Btn>
      <Btn onClick={()=>{doSave(true);setShowRessenti(true);}} color={C.green} textColor="#fff" style={{marginTop:8,width:"100%",maxWidth:380}}>💾 Sauvegarder + Ressenti</Btn>
      <GhostBtn onClick={handleFinish} color={C.muted} style={{marginTop:8,width:"100%",maxWidth:380}}>Retour sans ressenti</GhostBtn>
    </div>
  );

  // Modal confirmation quitter
  if(showQuitModal) return(
    <div style={{background:"rgba(0,0,0,0.7)",position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:24}}>
      <Card style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{fontSize:24,marginBottom:8}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial",marginBottom:4}}>Quitter la séance ?</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:16}}>Phase {phaseIdx+1}/{session.phases.length} · {Math.round(elapsed/60)} min</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <Btn onClick={()=>{doSave(false);onFinish();}} color={C.gold} style={{width:"100%"}}>💾 Sauvegarder en partielle</Btn>
          <GhostBtn onClick={()=>onFinish()} color={C.red} style={{width:"100%"}}>Abandonner sans sauver</GhostBtn>
          <GhostBtn onClick={()=>setShowQuitModal(false)} color={C.muted} style={{width:"100%"}}>↩ Continuer</GhostBtn>
        </div>
      </Card>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:C.card,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setShowQuitModal(true)} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer"}}>✕</button>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"Arial"}}>{session.label}</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>Phase {phaseIdx+1}/{session.phases.length}</div></div>
        <div style={{fontSize:13,color:C.gold,fontFamily:"Arial",fontWeight:700}}>{Math.round(elapsed/60)}'/{session.duree.replace(" min","")}'</div>
      </div>
      <div style={{height:4,background:C.card2}}><div style={{height:"100%",width:`${globalPct}%`,background:phase.couleur,transition:"width 1s linear"}}/></div>
      <div style={{flex:1,padding:"16px 16px 80px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:`linear-gradient(135deg,${phase.couleur}22 0%,#F8FAFF 100%)`,border:`2px solid ${phase.couleur}66`,borderRadius:16,padding:20,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:4}}>{typeEmoji[phase.type]}</div>
          <div style={{fontSize:12,letterSpacing:3,color:phase.couleur,fontFamily:"Arial",marginBottom:4}}>{phase.nom.toUpperCase()}</div>
          <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginBottom:16,fontStyle:"italic"}}>{phase.description}</div>
          <div style={{fontSize:72,fontWeight:700,fontFamily:"'Courier New',monospace",color:timeLeft<=10?C.red:C.text,lineHeight:1,marginBottom:16,textShadow:timeLeft<=10?`0 0 20px ${C.red}66`:"none"}}>
            {fmtTime(timeLeft)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            {[{label:"VITESSE",val:phase.vitesse,unit:"km/h"},{label:"INCLINAISON",val:phase.inclinaison,unit:"%"}].map((s,i)=>(
              <div key={i} style={{background:C.card2,borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
                <div style={{fontSize:10,letterSpacing:2,color:C.muted,fontFamily:"Arial",marginBottom:4}}>{s.label}</div>
                <div style={{fontSize:36,fontWeight:700,color:phase.couleur,fontFamily:"Arial",lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{s.unit}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>setRunning(r=>!r)} style={{width:72,height:72,borderRadius:"50%",background:running?`${C.red}22`:phase.couleur,border:`2px solid ${running?C.red:phase.couleur}`,fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>
            {running?"⏸":"▶️"}
          </button>
        </div>
        {nextPhase&&(
          <div style={{background:C.card2,borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.border}`}}>
            <div><div style={{fontSize:10,letterSpacing:2,color:C.muted,fontFamily:"Arial",marginBottom:2}}>PROCHAINE PHASE</div><div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>{typeEmoji[nextPhase.type]} {nextPhase.nom}</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{nextPhase.description}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:700,color:nextPhase.couleur,fontFamily:"Arial"}}>{nextPhase.vitesse}<span style={{fontSize:11}}> km/h</span></div><div style={{fontSize:12,color:C.muted,fontFamily:"Arial"}}>{nextPhase.inclinaison}% · {fmtTime(nextPhase.duree)}</div></div>
          </div>
        )}
        <Card><SHdr>PROGRESSION</SHdr><div style={{display:"flex",gap:2}}>{session.phases.map((p,i)=>{const isDone=i<phaseIdx;const isCur=i===phaseIdx;return<div key={i} style={{flex:p.duree,height:8,borderRadius:2,background:isDone?p.couleur:isCur?p.couleur:`${p.couleur}33`}} title={p.nom}/>;})} </div><div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:C.muted,fontFamily:"Arial"}}><span>0 min</span><span>{session.duree}</span></div></Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAPIS — ÉCRAN PRINCIPAL
// ═══════════════════════════════════════════════════
function Tapis({tapisHistory, onSaveTapis, onSaveWellness}) {
  const [activeSession, setActiveSession] = useState(null);
  const [tab, setTab] = useState("seances");
  const [showLibre, setShowLibre] = useState(false);
  const [libreForm, setLibreForm] = useState({duree:"",type:"course",niveau:3,notes:""});

  const saveLibre = () => {
    if(!libreForm.duree) return;
    onSaveTapis({id:Date.now(),date:today(),sessionId:0,sessionLabel:"Séance libre",bloc:0,niveau:"Libre",dureeReelle:parseFloat(libreForm.duree),completed:true,type:libreForm.type,niveauRessenti:libreForm.niveau,notes:libreForm.notes});
    setLibreForm({duree:"",type:"course",niveau:3,notes:""});
    setShowLibre(false);
  };

  if(activeSession) return <TapisSession session={activeSession} onFinish={()=>setActiveSession(null)} onSaveTapis={onSaveTapis} onSaveWellness={onSaveWellness}/>;

  if(showLibre) return(
    <div>
      <BackBar title="⚡ Séance libre tapis" onBack={()=>setShowLibre(false)} color={C.teal}/>
      <div style={{padding:"16px 16px 80px"}}>
        <InputField label="DURÉE" type="number" value={libreForm.duree} onChange={v=>setLibreForm(f=>({...f,duree:v}))} placeholder="30" unit="min" color={C.teal}/>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.teal,marginBottom:6,fontFamily:"Arial",letterSpacing:2}}>TYPE</div>
          <div style={{display:"flex",gap:8}}>
            {["course","marche","mixte"].map(t=>(
              <button key={t} onClick={()=>setLibreForm(f=>({...f,type:t}))} style={{flex:1,padding:"10px",borderRadius:8,background:libreForm.type===t?`${C.teal}22`:C.card2,border:`1px solid ${libreForm.type===t?C.teal:"#E2E8F0"}`,color:libreForm.type===t?C.teal:C.muted,fontSize:12,fontFamily:"Arial",cursor:"pointer",textTransform:"capitalize"}}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.teal,marginBottom:6,fontFamily:"Arial",letterSpacing:2}}>NIVEAU RESSENTI (1-5)</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>setLibreForm(f=>({...f,niveau:n}))} style={{width:44,height:44,borderRadius:"50%",background:n<=libreForm.niveau?C.teal:C.card2,border:`2px solid ${n<=libreForm.niveau?C.teal:"#E2E8F0"}`,color:n<=libreForm.niveau?C.bg:C.muted,fontSize:16,fontFamily:"Arial",cursor:"pointer",fontWeight:700}}>{n}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:C.teal,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>NOTES (optionnel)</div>
          <textarea value={libreForm.notes} onChange={e=>setLibreForm(f=>({...f,notes:e.target.value}))} placeholder="Ressenti, conditions..."
            style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box"}}/>
        </div>
        <Btn onClick={saveLibre} color={C.teal} textColor={C.bg} style={{width:"100%"}} disabled={!libreForm.duree}>💾 Sauvegarder</Btn>
      </div>
    </div>
  );

  const totalTapis = tapisHistory.length;
  const seancesParBloc = [1,2,3].map(b=>tapisHistory.filter(h=>h.bloc===b).length);
  const chartData = [...tapisHistory].sort((a,b)=>a.date.localeCompare(b.date)).map((h,i)=>({date:fmtShort(h.date),val:h.dureeReelle,label:fmt(h.date),session:h.sessionLabel}));

  return(
    <div>
      <div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>⚡ Tapis de course</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{totalTapis} séance{totalTapis>1?"s":""} enregistrée{totalTapis>1?"s":""}</div></div>
      </div>
      <div style={{display:"flex",background:C.card,borderBottom:`1px solid ${C.border}`}}>
        {[{id:"seances",label:"Séances"},{id:"suivi",label:"Suivi"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px",background:"none",border:"none",borderBottom:`2px solid ${tab===t.id?C.teal:"transparent"}`,color:tab===t.id?C.teal:"#94A3B8",fontSize:12,fontFamily:"Arial",cursor:"pointer"}}>{t.label}</button>
        ))}
      </div>
      <div style={{padding:"12px 16px 80px"}}>
        {tab==="seances"&&(
          <>
            <Card style={{background:"#E8FBF8",border:`1px solid ${C.teal}33`}}>
              <SHdr color={C.teal}>🎯 OBJECTIF TAPIS</SHdr>
              <div style={{fontSize:13,color:"#0891B2",fontFamily:"Arial",lineHeight:1.9}}>
                ✓ Perte de graisse abdominale · Cardio · Endurance<br/>
                ✓ Séances guidées ≤ 30 min · Récupération active incluse<br/>
                <span style={{fontSize:11,color:C.muted}}>Courir avant 7h ou après 18h à Mayotte</span>
              </div>
            </Card>
            {TAPIS_SESSIONS.map((s,i)=>{
              const done=tapisHistory.filter(h=>h.sessionId===s.id).length;
              const last=tapisHistory.filter(h=>h.sessionId===s.id).slice(-1)[0];
              return(
                <div key={i} style={{background:C.card,borderRadius:14,marginBottom:12,border:`1px solid ${s.color}33`,overflow:"hidden"}}>
                  <div style={{background:`${s.color}18`,padding:"14px 16px",borderBottom:`1px solid ${s.color}22`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:10,letterSpacing:3,color:s.color,fontFamily:"Arial",marginBottom:2}}>{s.sublabel.toUpperCase()}</div>
                        <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Arial"}}>{s.label}</div>
                        <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginTop:2}}>{s.duree} · {s.niveau}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        {done>0&&<Badge text={`${done}× fait`} color={C.green}/>}
                        {last&&<div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginTop:4}}>Dernier : {fmt(last.date)}</div>}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginTop:8,fontStyle:"italic"}}>{s.description}</div>
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <div style={{display:"flex",gap:2,marginBottom:8,height:6}}>{s.phases.map((p,pi)=><div key={pi} style={{flex:p.duree,background:`${p.couleur}88`,borderRadius:2}} title={p.nom}/>)}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
                      {[{l:"Phases",v:s.phases.length},{l:"Vitesse max",v:`${Math.max(...s.phases.map(p=>p.vitesse))} km/h`},{l:"Incl. max",v:`${Math.max(...s.phases.map(p=>p.inclinaison))}%`}].map((st,si)=>(
                        <div key={si} style={{background:C.card2,borderRadius:8,padding:"8px",textAlign:"center"}}>
                          <div style={{fontSize:14,fontWeight:700,color:s.color,fontFamily:"Arial"}}>{st.v}</div>
                          <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{st.l}</div>
                        </div>
                      ))}
                    </div>
                    <Btn onClick={()=>setActiveSession(s)} color={s.color} textColor={s.color===C.gold?C.bg:"#fff"} style={{width:"100%"}}>▶ Lancer la séance</Btn>
                  </div>
                </div>
              );
            })}
            {/* Séance libre */}
            <div style={{background:C.card,borderRadius:14,marginBottom:12,border:`1px solid ${C.teal}33`,overflow:"hidden"}}>
              <div style={{background:`${C.teal}18`,padding:"14px 16px",borderBottom:`1px solid ${C.teal}22`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,letterSpacing:3,color:C.teal,fontFamily:"Arial",marginBottom:2}}>LIBRE</div>
                  <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:"Arial"}}>Séance libre</div>
                  <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginTop:2}}>Course / Marche / Mixte à ton rythme</div>
                </div>
              </div>
              <div style={{padding:"12px 16px"}}>
                <Btn onClick={()=>setShowLibre(true)} color={C.teal} textColor={C.bg} style={{width:"100%"}}>▶ Enregistrer une séance libre</Btn>
              </div>
            </div>
            <Card style={{background:`${C.teal}11`,border:`1px solid ${C.teal}33`,marginTop:8}}>
              <SHdr color={C.teal}>💡 RÉCUPÉRATION</SHdr>
              <div style={{fontSize:12,color:C.text,fontFamily:"Arial",lineHeight:1.8}}>
                Refroidissement 5 min · Bois 500ml d'eau · Étire quadriceps et mollets
              </div>
            </Card>
          </>
        )}

        {tab==="suivi"&&(
          <>
            {/* Stats globales */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              {[{icon:"⚡",val:totalTapis,label:"Total séances",c:C.teal},{icon:"🟡",val:seancesParBloc[0],label:"Bloc 1",c:C.red},{icon:"🟡",val:seancesParBloc[1],label:"Bloc 2",c:C.gold},{icon:"🟢",val:seancesParBloc[2],label:"Bloc 3",c:C.green}].slice(0,3).map((s,i)=>(
                <div key={i} style={{background:C.card,borderRadius:10,padding:"12px 8px",textAlign:"center",border:`1px solid ${s.c}22`}}>
                  <div style={{fontSize:20}}>{s.icon}</div>
                  <div style={{fontSize:22,fontWeight:700,color:s.c,fontFamily:"Arial"}}>{s.val}</div>
                  <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Répartition par bloc */}
            <Card>
              <SHdr>SÉANCES PAR BLOC</SHdr>
              {[{b:1,label:"Bloc 1 · Reprise",c:C.red,max:8},{b:2,label:"Bloc 2 · Construction",c:C.gold,max:12},{b:3,label:"Bloc 3 · Performance",c:C.green,max:12}].map((bl,i)=>(
                <ProgBar key={i} value={seancesParBloc[bl.b-1]} max={bl.max} color={bl.c} label={bl.label} sub={`${seancesParBloc[bl.b-1]}/${bl.max}`}/>
              ))}
            </Card>

            {/* Graphique durées */}
            {chartData.length>=2&&(
              <Card>
                <SHdr color={C.teal}>DURÉES DES SÉANCES</SHdr>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="date" tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false} width={24}/>
                    <Tooltip content={<CTooltip unit=" min"/>}/>
                    <Bar dataKey="val" fill={C.teal} radius={[3,3,0,0]} name="min"/>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Historique complet */}
            <SHdr>HISTORIQUE COMPLET ({totalTapis} séances)</SHdr>
            {totalTapis===0?(
              <div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontFamily:"Arial"}}>
                <div style={{fontSize:44,marginBottom:8}}>⚡</div>
                <div>Lance ta première séance tapis !</div>
              </div>
            ):(
              [...tapisHistory].reverse().map((h,i)=>(
                <Card key={i} style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:"Arial"}}>⚡ {h.sessionLabel}</div>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(h.date)} · {h.dureeReelle} min · Bloc {h.bloc}</div>
                    </div>
                    <Badge text={h.completed?"✓ Complète":"Partielle"} color={h.completed?C.green:C.gold}/>
                  </div>
                </Card>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  AUTRES MODULES
// ═══════════════════════════════════════════════════

function Dashboard({workouts,runs,measures,meals,tapisHistory,evals,onNav,waistGoal,onSetWaistGoal}) {
  const lastW=workouts[workouts.length-1],lastR=runs[runs.length-1];
  const lastM=measures.filter(m=>m.waist||m.weight).slice(-1)[0];
  const prevM=measures.filter(m=>m.waist||m.weight).slice(-2,-1)[0];
  const streak=(()=>{let n=0,d=new Date();for(let i=0;i<30;i++){const ds=localDateStr(d);if(workouts.some(w=>w.date===ds)||runs.some(r=>r.date===ds)||tapisHistory.some(t=>t.date===ds))n++;else if(i>0)break;d.setDate(d.getDate()-1);}return n;})();
  const waistCur=parseFloat(lastM?.waist)||95;
  const waistStart=parseFloat(measures.filter(m=>m.waist)[0]?.waist)||95;
  const last3km=evals.filter(e=>e.type==="3km").slice(-1)[0];
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(waistGoal));

  // Calories brûlées
  const sevenDaysAgo=(()=>{const d=new Date();d.setDate(d.getDate()-7);return localDateStr(d);})();
  const calcCalMuscu=(w)=>{
    const m=(w.type||"").match(/(\d+)\s*min/);
    const dur=m?parseInt(m[1]):(w.duree||30);
    if(dur<=15)return 120;if(dur<=30)return 220;return 320;
  };
  const calcCalRun=(r)=>((parseFloat(r.distance)||0)*70);
  const calcCalTapis=(t)=>((parseFloat(t.dureeReelle)||0)*8);
  const calWeekMuscu=workouts.filter(w=>w.date>=sevenDaysAgo).reduce((a,w)=>a+calcCalMuscu(w),0);
  const calWeekRun=runs.filter(r=>r.date>=sevenDaysAgo).reduce((a,r)=>a+calcCalRun(r),0);
  const calWeekTapis=tapisHistory.filter(t=>t.date>=sevenDaysAgo).reduce((a,t)=>a+calcCalTapis(t),0);
  const calWeek=Math.round(calWeekMuscu+calWeekRun+calWeekTapis);
  const calTotalMuscu=workouts.reduce((a,w)=>a+calcCalMuscu(w),0);
  const calTotalRun=runs.reduce((a,r)=>a+calcCalRun(r),0);
  const calTotalTapis=tapisHistory.reduce((a,t)=>a+calcCalTapis(t),0);
  const calTotal=Math.round(calTotalMuscu+calTotalRun+calTotalTapis);
  const CAL_OBJ=3000;

  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#6366F1 0%,#3B82F6 50%,#06B6D4 100%)",padding:"24px 16px 16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:C.teal,letterSpacing:4,fontFamily:"Arial",fontWeight:700}}>PROGRAMME MAYOTTE 2025–2026</div>
        <div style={{fontSize:26,color:C.text,fontWeight:700,fontFamily:"Arial",marginTop:4}}>Bonjour 👋</div>
        <div style={{fontSize:12,color:"#64748B",fontFamily:"Arial",marginTop:2}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>
      <div style={{padding:"12px 16px 80px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
          {[{icon:"🔥",val:streak,label:"Streak",c:C.gold},{icon:"💪",val:workouts.length,label:"Muscu",c:C.green},{icon:"🏃",val:runs.length+tapisHistory.length,label:"Course",c:C.blue},{icon:"🏆",val:evals.length,label:"Tests",c:C.orange}].map(s=>(
            <div key={s.label} style={{background:C.card,borderRadius:10,padding:"10px 4px",textAlign:"center"}}>
              <div style={{fontSize:18}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:700,color:s.c,fontFamily:"Arial",lineHeight:1.2}}>{s.val}</div>
              <div style={{fontSize:9,color:C.muted,fontFamily:"Arial",marginTop:1}}>{s.label}</div>
            </div>
          ))}
        </div>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <SHdr style={{margin:0}}>🎯 OBJECTIFS PRINCIPAUX</SHdr>
            <button onClick={()=>setEditingGoal(g=>!g)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,padding:"2px 8px",cursor:"pointer",fontFamily:"Arial"}}>{editingGoal?"✕ Fermer":"✏️ Modifier"}</button>
          </div>
          {editingGoal&&(
            <div style={{background:C.card2,borderRadius:8,padding:"10px 12px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.text,fontFamily:"Arial"}}>Objectif ventre :</span>
              <input type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)}
                style={{width:60,background:C.card,border:`1px solid ${C.gold}`,borderRadius:6,color:C.text,padding:"5px 8px",fontSize:14,fontFamily:"Arial",outline:"none",textAlign:"center"}}/>
              <span style={{fontSize:12,color:C.muted,fontFamily:"Arial"}}>cm</span>
              <Btn onClick={()=>{const g=parseFloat(goalInput);if(g>0&&g<200){onSetWaistGoal(g);setEditingGoal(false);} }} color={C.gold} style={{padding:"5px 12px",fontSize:12}}>OK</Btn>
            </div>
          )}
          {/* Progression ventre : de la mesure de départ vers l'objectif */}
          {(()=>{
            const start=waistStart>waistGoal?waistStart:95;
            const total=Math.max(1,start-waistGoal);
            const done=Math.max(0,start-waistCur);
            const pct=Math.round((done/total)*100);
            return<ProgBar value={done} max={total} color={waistCur<=waistGoal?C.green:C.gold}
              label={`Ventre : ${waistCur} cm → objectif ${waistGoal} cm`}
              sub={waistCur<=waistGoal?"✅ ATTEINT !":pct+"%"}/>;
          })()}
          {last3km&&<ProgBar value={Math.max(0,14-last3km.duree)} max={14-8} color={last3km.reussi?C.green:C.blue} label={`3 km : ${fmtDuration(last3km.duree)}`} sub={last3km.reussi?"✅ Objectif !":"→ 14 min"}/>}
        </Card>
        <Card style={{background:"#EEF1FA",border:`1px solid ${C.blue}33`}}>
          <SHdr color={C.blue}>🏃 OBJECTIF COURSE — JUIN 2026</SHdr>
          {(()=>{
            const tests3km = evals.filter(e=>e.type==="3km").sort((a,b)=>a.date.localeCompare(b.date));
            const best = tests3km.length ? tests3km.reduce((b,e)=>e.duree<b.duree?e:b) : null;
            const first = tests3km[0] || null;
            const OBJ = 14; // objectif en minutes
            const START = first ? Math.max(first.duree, OBJ + 0.1) : 20; // point de départ
            // Barre : de START vers OBJ (plus c'est bas, mieux c'est → axe inversé)
            const curVal = last3km ? last3km.duree : START;
            const total = Math.max(0.1, START - OBJ);
            const done  = Math.max(0, START - curVal);
            const pct   = Math.min(100, Math.round((done / total) * 100));
            // Évolution entre le dernier et l'avant-dernier test
            const prev3km = tests3km.length >= 2 ? tests3km[tests3km.length - 2] : null;
            const diff = prev3km && last3km ? (last3km.duree - prev3km.duree) : null;
            return (
              <>
                {/* Titre + objectif */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:22,fontWeight:700,color:C.blue,fontFamily:"Arial"}}>3 km &lt; 14 min</div>
                  {last3km && (
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:20,fontWeight:700,color:last3km.reussi?C.green:C.blue,fontFamily:"Arial"}}>{fmtDuration(last3km.duree)}</div>
                      <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>dernier test · {fmt(last3km.date)}</div>
                    </div>
                  )}
                </div>

                {/* Barre de progression vers 14 min */}
                {last3km ? (
                  <>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:4}}>
                      <span>Départ : {fmtDuration(START)}</span>
                      <span style={{color:last3km.reussi?C.green:C.blue,fontWeight:700}}>{pct}%</span>
                      <span>Objectif : 14 min</span>
                    </div>
                    <div style={{background:"#D1D9F0",borderRadius:6,height:10,overflow:"hidden",marginBottom:10,position:"relative"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:last3km.reussi?C.green:C.blue,borderRadius:6,transition:"width 0.8s ease"}}/>
                      {/* Ligne objectif */}
                      <div style={{position:"absolute",right:0,top:0,height:"100%",width:2,background:C.green,borderRadius:2}}/>
                    </div>

                    {/* Évolution vs test précédent */}
                    {diff !== null && (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,background:diff<0?"#DCFCE7":"#FEE2E2",borderRadius:8,padding:"6px 10px"}}>
                        <span style={{fontSize:18}}>{diff<0?"📈":"📉"}</span>
                        <div>
                          <span style={{fontSize:13,fontWeight:700,color:diff<0?C.green:C.red,fontFamily:"Arial"}}>
                            {diff<0?"":"+"}{ diff.toFixed(1)} min
                          </span>
                          <span style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}> vs test précédent ({fmtDuration(prev3km.duree)})</span>
                        </div>
                      </div>
                    )}

                    {/* Historique mini graphique */}
                    {tests3km.length >= 2 && (
                      <>
                        <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:6}}>HISTORIQUE DES TESTS</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <AreaChart data={tests3km.map(e=>({date:fmtShort(e.date),val:parseFloat(e.duree.toFixed(1))}))}>
                            <defs>
                              <linearGradient id="gCourse" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={C.blue} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={C.blue} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                            <XAxis dataKey="date" tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false}/>
                            <YAxis reversed domain={["dataMin - 0.5","dataMax + 0.5"]} tick={{fill:C.muted,fontSize:9,fontFamily:"Arial"}} axisLine={false} tickLine={false} width={26} tickFormatter={v=>`${Math.floor(v)}'`}/>
                            <Tooltip content={<CTooltip unit=" min"/>}/>
                            <ReferenceLine y={OBJ} stroke={C.green} strokeDasharray="4 3" label={{value:"14'",fill:C.green,fontSize:9}}/>
                            <Area type="monotone" dataKey="val" stroke={C.blue} fill="url(#gCourse)" strokeWidth={2} dot={{fill:C.blue,r:4}}/>
                          </AreaChart>
                        </ResponsiveContainer>
                        <div style={{fontSize:9,color:C.muted,fontFamily:"Arial",textAlign:"center",marginTop:2}}>↑ axe inversé — plus bas = plus rapide</div>
                      </>
                    )}

                    {/* Stats meilleur / nbre de tests */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8}}>
                      {[
                        {l:"Tests",v:tests3km.length,c:C.blue},
                        {l:"Meilleur",v:best?fmtDuration(best.duree):"--",c:C.green},
                        {l:"Objectif",v:"14 min",c:last3km.reussi?C.green:C.muted},
                      ].map((s,i)=>(
                        <div key={i} style={{background:C.card,borderRadius:8,padding:"7px",textAlign:"center"}}>
                          <div style={{fontSize:13,fontWeight:700,color:s.c,fontFamily:"Arial"}}>{s.v}</div>
                          <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>
                    Aucun test 3 km enregistré — lance-toi ! 🚀
                  </div>
                )}
              </>
            );
          })()}
        </Card>

        {/* Calories brûlées */}
        {(()=>{
          const fourteenDaysAgo=(()=>{const d=new Date();d.setDate(d.getDate()-14);return localDateStr(d);})();
          const calPrevMuscu=workouts.filter(w=>w.date>=fourteenDaysAgo&&w.date<sevenDaysAgo).reduce((a,w)=>a+calcCalMuscu(w),0);
          const calPrevRun=runs.filter(r=>r.date>=fourteenDaysAgo&&r.date<sevenDaysAgo).reduce((a,r)=>a+calcCalRun(r),0);
          const calPrevTapis=tapisHistory.filter(t=>t.date>=fourteenDaysAgo&&t.date<sevenDaysAgo).reduce((a,t)=>a+calcCalTapis(t),0);
          const calPrev=Math.round(calPrevMuscu+calPrevRun+calPrevTapis);
          const diff=calPrev>0?calWeek-calPrev:null;
          const pct=calPrev>0?Math.round(((calWeek-calPrev)/calPrev)*100):null;
          const trend=diff===null?null:(diff>=0?"↑":"↓");
          const trendColor=diff===null?C.muted:(diff>=0?C.green:C.red);
          return(
            <Card style={{background:"#FFF7ED",border:`1px solid ${C.orange}33`}}>
              <SHdr color={C.orange}>🔥 CALORIES BRÛLÉES</SHdr>
              {/* Semaine en cours vs précédente */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
                <div>
                  <div style={{fontSize:34,fontWeight:700,color:C.orange,fontFamily:"Arial",lineHeight:1}}>{calWeek.toLocaleString()}</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginTop:2}}>kcal cette semaine</div>
                </div>
                {diff!==null&&(
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:20,fontWeight:700,color:trendColor,fontFamily:"Arial"}}>{trend} {Math.abs(diff).toLocaleString()} kcal</div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"Arial"}}>vs semaine précédente ({pct>0?"+":""}{pct}%)</div>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"Arial"}}>{calPrev.toLocaleString()} kcal sem. passée</div>
                  </div>
                )}
              </div>
              {/* Barre objectif semaine */}
              <ProgBar value={calWeek} max={CAL_OBJ} color={calWeek>=CAL_OBJ?C.green:C.orange} label="Objectif semaine" sub={`${calWeek} / ${CAL_OBJ} kcal`}/>
              {/* Détail par sport */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:4}}>
                {[
                  {icon:"💪",l:"Muscu",v:Math.round(calWeekMuscu),vt:Math.round(calTotalMuscu),c:C.gold},
                  {icon:"🏃",l:"Course",v:Math.round(calWeekRun),vt:Math.round(calTotalRun),c:C.blue},
                  {icon:"⚡",l:"Tapis",v:Math.round(calWeekTapis),vt:Math.round(calTotalTapis),c:C.teal},
                ].map((s,i)=>(
                  <div key={i} style={{background:C.card,borderRadius:8,padding:"8px 6px",textAlign:"center",border:`1px solid ${s.c}22`}}>
                    <div style={{fontSize:14}}>{s.icon}</div>
                    <div style={{fontSize:15,fontWeight:700,color:s.c,fontFamily:"Arial"}}>{s.v}</div>
                    <div style={{fontSize:8,color:C.muted,fontFamily:"Arial"}}>{s.l} / sem.</div>
                    <div style={{fontSize:8,color:C.muted,fontFamily:"Arial",marginTop:2}}>Total : {s.vt.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginTop:8,textAlign:"center",borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                🏅 Total cumulé : <strong style={{color:C.orange,fontSize:13}}>{calTotal.toLocaleString()} kcal</strong>
              </div>
            </Card>
          );
        })()}

        {/* Mensurations */}
        {lastM&&(
          <Card style={{background:"#F5F3FF",border:`1px solid ${C.purple}33`}}>
            <SHdr color={C.purple}>📏 DERNIÈRES MENSURATIONS</SHdr>
            <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:8}}>{lastM.date?fmt(lastM.date):""}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {l:"Poids",v:lastM.weight,pv:prevM?.weight,u:"kg",lower:true},
                {l:"Ventre",v:lastM.waist,pv:prevM?.waist,u:"cm",lower:true},
                {l:"Bras",v:lastM.arm,pv:prevM?.arm,u:"cm",lower:false},
                {l:"Poitrine",v:lastM.chest,pv:prevM?.chest,u:"cm",lower:false},
              ].filter(m=>m.v).map((m,i)=>{
                const cur=parseFloat(m.v),prev=parseFloat(m.pv);
                const diff=m.pv?cur-prev:null;
                const arrow=diff===null?"":(diff>0?"↑":"↓");
                const good=diff===null?null:(m.lower?diff<0:diff>0);
                const arrowColor=diff===null?C.muted:(good?C.green:C.red);
                return(
                  <div key={i} style={{background:C.card,borderRadius:10,padding:"10px",textAlign:"center",border:`1px solid ${C.purple}22`}}>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"Arial",marginBottom:2}}>{m.l.toUpperCase()}</div>
                    <div style={{fontSize:22,fontWeight:700,color:C.text,fontFamily:"Arial",lineHeight:1}}>{m.v}<span style={{fontSize:11}}> {m.u}</span></div>
                    {arrow&&<div style={{fontSize:14,color:arrowColor,fontFamily:"Arial",marginTop:2}}>{arrow} {Math.abs(diff).toFixed(1)}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card>
          <SHdr>⚡ DERNIÈRES ACTIVITÉS</SHdr>
          {lastW&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}`}}><div><div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>💪 {lastW.type}</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(lastW.date)}</div></div><Badge text="MUSCU" color={C.gold}/></div>}
          {lastR&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}`}}><div><div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>🏃 {lastR.distance}km · {lastR.duration}min</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(lastR.date)} · {fmtPace(lastR.distance,lastR.duration)}/km</div></div><Badge text="COURSE" color={C.blue}/></div>}
          {tapisHistory.length>0&&(()=>{const lt=tapisHistory[tapisHistory.length-1];return<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>⚡ {lt.sessionLabel}</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(lt.date)} · {lt.dureeReelle} min</div></div><Badge text="TAPIS" color={C.teal}/></div>;})()}
          {!lastW&&!lastR&&tapisHistory.length===0&&<div style={{fontSize:13,color:C.muted,fontFamily:"Arial",fontStyle:"italic"}}>Aucune activité — lance ta première séance !</div>}
        </Card>
        {/* Repas et mémo nutrition masqués */}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  SÉANCE MUSCU GUIDÉE — ANIMÉE
// ═══════════════════════════════════════════════════
function CircuitSession({circuit, onSave, onBack, onSaveWellness}) {
  const parseSets = (detail) => {
    const m = (detail||"").match(/^(\d+)[×x]/);
    if(m) return parseInt(m[1]);
    if((detail||"").includes("min")) return 1;
    return 3;
  };

  const initExos = CIRCUITS[circuit].map(e => ({
    ...e,
    sets: Array(parseSets(e.detail)).fill(null).map(() => ({reps:"", weight:""}))
  }));

  const [exoIdx, setExoIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [results, setResults] = useState(initExos);
  // Refs toujours à jour pour éviter les closures périmées dans les useEffect
  const exoIdxRef = useRef(0);
  const setIdxRef = useRef(0);
  const resultsRef = useRef(initExos);
  useEffect(()=>{ exoIdxRef.current = exoIdx; }, [exoIdx]);
  useEffect(()=>{ setIdxRef.current = setIdx; }, [setIdx]);
  useEffect(()=>{ resultsRef.current = results; }, [results]);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [exoOpacity, setExoOpacity] = useState(1);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [showEtirements, setShowEtirements] = useState(false);
  const [showRessenti, setShowRessenti] = useState(false);
  // Pause entre séries
  const [resting, setResting] = useState(false);
  const [restTime, setRestTime] = useState(60);
  // Planche timer
  const [plancheRunning, setPlancheRunning] = useState(false);
  const [plancheTime, setPlancheTime] = useState(null); // null = not started
  const [plancheResting, setPlancheResting] = useState(false);
  const [plancheRestTime, setPlancheRestTime] = useState(30);
  const [planCheBlink, setPlanCheBlink] = useState(false);

  const intervalRef = useRef(null);
  const restRef = useRef(null);
  const plancheRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Pause countdown
  useEffect(()=>{
    if(resting){
      restRef.current=setInterval(()=>{
        setRestTime(t=>{
          if(t<=1){clearInterval(restRef.current);setResting(false);setRestTime(60);return 0;}
          return t-1;
        });
      },1000);
    }
    return()=>clearInterval(restRef.current);
  },[resting]);

  // Planche timer
  const parsePlancheDuree = (detail) => {
    const m = (detail||"").match(/(\d+)sec/);
    return m?parseInt(m[1]):30;
  };

  useEffect(()=>{
    if(plancheRunning&&plancheTime!==null&&!plancheResting){
      plancheRef.current=setInterval(()=>{
        setPlancheTime(t=>{
          if(t<=1){
            clearInterval(plancheRef.current);
            setPlancheRunning(false);
            setPlanCheBlink(true);
            setTimeout(()=>setPlanCheBlink(false),2000);
            setPlancheResting(true);
            setPlancheRestTime(30);
            return 0;
          }
          return t-1;
        });
      },1000);
    }
    return()=>clearInterval(plancheRef.current);
  },[plancheRunning,plancheResting]);

  const [plancheDone, setPlancheDone] = useState(false);

  // Planche rest countdown
  useEffect(()=>{
    if(plancheResting){
      const iv=setInterval(()=>{
        setPlancheRestTime(t=>{
          if(t<=1){clearInterval(iv);setPlancheResting(false);setPlancheDone(true);return 0;}
          return t-1;
        });
      },1000);
      return()=>clearInterval(iv);
    }
  },[plancheResting]);

  const curExo = results[exoIdx] || results[results.length - 1];
  if(!curExo) return null;
  const numSets = curExo.sets.length;
  const isLastSet = setIdx >= numSets - 1;
  const isLastExo = exoIdx >= results.length - 1;
  const globalPct = Math.round(((exoIdx + (setIdx + 1) / numSets) / results.length) * 100);
  const color = {15: C.red, 30: C.gold, 45: C.green}[circuit] || C.gold;
  const textColor = circuit === 30 ? C.bg : "#fff";
  const nextExo = results[exoIdx + 1] || null;
  const isPlanche = curExo && curExo.name.toLowerCase().includes("planche");
  const plancheCible = curExo ? parsePlancheDuree(curExo.detail) : 30;

  // Utilise les refs pour éviter toute closure périmée
  useEffect(()=>{
    if(!plancheDone) return;
    setPlancheDone(false);
    const ei = exoIdxRef.current;
    const si = setIdxRef.current;
    const curResults = resultsRef.current;
    const cExo = curResults[ei];
    const dur = cExo ? parsePlancheDuree(cExo.detail) : 30;
    const heldStr = String(dur);
    const newResults2 = curResults.map((e, idx) =>
      idx === ei ? {...e, sets: e.sets.map((s, sidx) => sidx === si ? {reps:heldStr, weight:""} : s)} : e
    );
    setResults(newResults2);
    resultsRef.current = newResults2;
    setReps(""); setWeight("");
    setPlancheTime(null); setPlancheRestTime(30);
    const numS = cExo ? cExo.sets.length : 1;
    const lastSet = si >= numS - 1;
    const lastExo = ei >= curResults.length - 1;
    if(lastExo && lastSet){
      clearInterval(intervalRef.current);
      onSave({id:Date.now(),date:today(),type:`Circuit ${circuit} min`,duree:Math.max(1,Math.round(elapsed/60)),completed:true,exercises:newResults2.map(e=>({name:e.name,muscle:e.muscle,sets:e.sets}))});
      setDone(true);
    } else if(lastSet){
      setExoOpacity(0);
      setTimeout(()=>{setExoIdx(i=>i+1);setSetIdx(0);exoIdxRef.current=ei+1;setIdxRef.current=0;setExoOpacity(1);},280);
    } else {
      setResting(true);setRestTime(60);setSetIdx(s=>s+1);setIdxRef.current=si+1;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[plancheDone]);

  const doSave = (newResults, completed) => {
    clearInterval(intervalRef.current);
    onSave({
      id: Date.now(), date: today(),
      type: `Circuit ${circuit} min`,
      duree: Math.max(1, Math.round(elapsed / 60)),
      completed,
      exercises: newResults.map(e => ({name:e.name, muscle:e.muscle, sets:e.sets}))
    });
  };

  const advanceSerie = (r, w) => {
    const newResults = results.map((e, ei) =>
      ei === exoIdx
        ? {...e, sets: e.sets.map((s, si) => si === setIdx ? {reps:r, weight:w} : s)}
        : e
    );
    setResults(newResults);
    setReps("");
    setWeight("");

    if(isLastExo && isLastSet) {
      doSave(newResults, true);
      setDone(true);
    } else if(isLastSet) {
      setExoOpacity(0);
      setTimeout(() => { setExoIdx(i => i + 1); setSetIdx(0); setExoOpacity(1); }, 280);
    } else {
      // Pause avant série suivante
      setResting(true);
      setRestTime(60);
      setSetIdx(s => s + 1);
    }
  };

  const handleNext = () => {
    if(isPlanche){
      const held = plancheTime!==null ? plancheCible - plancheTime : 0;
      advanceSerie(String(held),"");
    } else {
      advanceSerie(reps, weight);
    }
  };

  // Étirements → Ressenti → Retour
  if(showRessenti) return(
    <RessentisScreen
      onSave={(w)=>{if(onSaveWellness)onSaveWellness(w);onBack();}}
      onSkip={onBack}
    />
  );
  if(showEtirements) return(
    <EtirementsScreen onDone={()=>setShowRessenti(true)}/>
  );

  if(done) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{fontSize:90,marginBottom:12}}>🎉</div>
      <div style={{fontSize:28,fontWeight:700,color:C.green,fontFamily:"Arial",marginBottom:8}}>Circuit terminé !</div>
      <div style={{fontSize:15,color:C.muted,fontFamily:"Arial",marginBottom:4}}>Circuit {circuit} min · ⏱ {fmtTime(elapsed)}</div>
      <div style={{fontSize:12,color:C.green,fontFamily:"Arial",marginBottom:16}}>✅ Séance enregistrée automatiquement</div>
      <Card style={{width:"100%",maxWidth:380,textAlign:"left",background:"#DCFCE7",border:`1px solid ${C.green}44`}}>
        <div style={{fontSize:13,color:C.green,fontFamily:"Arial",marginBottom:10,fontWeight:700}}>✅ Après la séance</div>
        {["Mange dans 30 min : 1 paume de protéine","Étire les muscles travaillés 5 min","Bois 500 ml d'eau"].map((t,i) => (
          <div key={i} style={{fontSize:13,color:"#16A34A",fontFamily:"Arial",marginBottom:6}}>✓ {t}</div>
        ))}
      </Card>
      <Btn onClick={()=>setShowEtirements(true)} color={C.teal} textColor={C.bg} style={{marginTop:16,width:"100%",maxWidth:380}}>🧘 Étirements (5 min)</Btn>
      <Btn onClick={()=>setShowRessenti(true)} color={C.green} textColor="#fff" style={{marginTop:8,width:"100%",maxWidth:380}}>💬 Mon ressenti</Btn>
      <GhostBtn onClick={onBack} color={C.muted} style={{marginTop:8,width:"100%",maxWidth:380}}>← Retour sans ressenti</GhostBtn>
    </div>
  );

  // Écran de pause
  if(resting) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{fontSize:50,marginBottom:8}}>😮‍💨</div>
      <div style={{fontSize:18,fontWeight:700,color:color,fontFamily:"Arial",marginBottom:4}}>REPOS</div>
      <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginBottom:16}}>Prépare-toi pour la série suivante</div>
      <div style={{fontSize:80,fontWeight:700,fontFamily:"'Courier New',monospace",color:restTime<=10?C.red:C.text,lineHeight:1,marginBottom:24}}>{restTime}</div>
      <Btn onClick={()=>{setResting(false);clearInterval(restRef.current);}} color={color} textColor={textColor} style={{width:"100%",maxWidth:340}}>⏭ Passer la pause</Btn>
    </div>
  );

  // Planche repos
  if(plancheResting) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <div style={{fontSize:50,marginBottom:8}}>💪</div>
      <div style={{fontSize:18,fontWeight:700,color:C.teal,fontFamily:"Arial",marginBottom:4}}>REPOS 30s</div>
      <div style={{fontSize:80,fontWeight:700,fontFamily:"'Courier New',monospace",color:plancheRestTime<=5?C.red:C.text,lineHeight:1,marginBottom:24}}>{plancheRestTime}</div>
    </div>
  );

  // Modal quitter
  if(showQuitModal) return(
    <div style={{background:"rgba(0,0,0,0.7)",position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:24}}>
      <Card style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{fontSize:24,marginBottom:8}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial",marginBottom:4}}>Circuit interrompu à {globalPct}%</div>
        <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:16}}>Exercices validés : {exoIdx * numSets + setIdx}/{results.reduce((a,e)=>a+e.sets.length,0)}</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <Btn onClick={()=>{doSave(results,false);onBack();}} color={C.gold} style={{width:"100%"}}>💾 Sauvegarder partielle</Btn>
          <GhostBtn onClick={onBack} color={C.red} style={{width:"100%"}}>Abandonner</GhostBtn>
          <GhostBtn onClick={()=>setShowQuitModal(false)} color={C.muted} style={{width:"100%"}}>↩ Continuer</GhostBtn>
        </div>
      </Card>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:C.card,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setShowQuitModal(true)} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer"}}>✕</button>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"Arial"}}>Circuit {circuit} min</div>
          <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>Exercice {exoIdx+1}/{results.length} · ⏱ {fmtTime(elapsed)}</div>
        </div>
        <div style={{fontSize:13,color,fontFamily:"Arial",fontWeight:700}}>{globalPct}%</div>
      </div>
      {/* Barre de progression globale */}
      <div style={{height:4,background:C.card2}}>
        <div style={{height:"100%",width:`${globalPct}%`,background:color,transition:"width 0.5s ease"}}/>
      </div>

      <div style={{flex:1,padding:"16px 16px 80px",display:"flex",flexDirection:"column",gap:12}}>
        {/* Carte exercice — fade entre exercices */}
        <div style={{background:`linear-gradient(135deg,${color}22 0%,#F8FAFF 100%)`,border:`2px solid ${color}66`,borderRadius:16,padding:20,textAlign:"center",opacity:exoOpacity,transition:"opacity 0.28s ease"}}>
          <div style={{fontSize:10,letterSpacing:3,color,fontFamily:"Arial",marginBottom:4}}>{curExo.muscle.toUpperCase()}</div>
          <div style={{fontSize:26,fontWeight:700,color:C.text,fontFamily:"Arial",marginBottom:4}}>{curExo.name}</div>
          <div style={{fontSize:13,color:C.muted,fontFamily:"Arial",marginBottom:20}}>{curExo.detail}</div>
          {/* Bulles séries */}
          <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:14}}>
            {curExo.sets.map((_,i) => (
              <div key={i} style={{width:36,height:36,borderRadius:"50%",background:i<setIdx?color:i===setIdx?`${color}33`:C.card2,border:`2px solid ${i<=setIdx?color:"#D1D9F0"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,fontFamily:"Arial",color:i<setIdx?textColor:i===setIdx?color:C.muted}}>
                {i < setIdx ? "✓" : i+1}
              </div>
            ))}
          </div>
          <div style={{fontSize:16,fontWeight:700,color,fontFamily:"Arial"}}>Série {setIdx+1} / {numSets}</div>
        </div>

        {/* Inputs reps / poids ou timer planche */}
        <Card style={planCheBlink?{background:"#FEE2E2",transition:"background 0.3s"}:{}}>
          <SHdr color={color}>{isPlanche?"TIMER MAINTIEN":"ENREGISTRE TES PERFS"}</SHdr>
          {isPlanche?(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginBottom:8}}>Objectif : {plancheCible}s · Tiens la position !</div>
              <div style={{fontSize:72,fontWeight:700,fontFamily:"'Courier New',monospace",color:plancheTime===0?C.red:plancheTime!==null&&plancheTime<=5?C.red:C.text,lineHeight:1,marginBottom:16}}>
                {plancheTime===null?plancheCible:plancheTime}
              </div>
              {plancheTime===null&&(
                <Btn onClick={()=>{setPlancheTime(plancheCible);setPlancheRunning(true);}} color={color} textColor={textColor} style={{width:"100%"}}>▶ Démarrer</Btn>
              )}
              {plancheTime!==null&&plancheTime>0&&(
                <div style={{fontSize:12,color:C.muted,fontFamily:"Arial"}}>En cours... tiens !</div>
              )}
              {plancheTime===0&&!plancheResting&&(
                <div style={{fontSize:14,fontWeight:700,color:C.green,fontFamily:"Arial"}}>✅ Maintenu ! Repos en cours...</div>
              )}
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[{label:"REPS",val:reps,set:setReps},{label:"POIDS (kg)",val:weight,set:setWeight}].map((f,fi) => (
                <div key={fi}>
                  <div style={{fontSize:10,color,marginBottom:6,fontFamily:"Arial",letterSpacing:2}}>{f.label}</div>
                  <input type="number" value={f.val} onChange={e=>f.set(e.target.value)} placeholder="0"
                    style={{width:"100%",background:C.card2,border:`1px solid ${color}55`,borderRadius:10,color:C.text,padding:"14px",fontSize:28,textAlign:"center",fontFamily:"Arial",outline:"none",boxSizing:"border-box",fontWeight:700}}/>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bouton action */}
        {(!isPlanche || plancheTime===0) && (
          <Btn onClick={handleNext} color={color} textColor={textColor} style={{width:"100%",fontSize:16,padding:"16px"}}>
            {isLastExo && isLastSet ? "🎉 Terminer le circuit !" : isLastSet ? "💪 Exercice suivant →" : `✓ Série ${setIdx+2} →`}
          </Btn>
        )}

        {/* Aperçu suivant */}
        {!(isLastExo && isLastSet) && (
          <div style={{background:C.card2,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:2}}>{isLastSet?"PROCHAIN EXERCICE":`SÉRIE ${setIdx+2}/${numSets}`}</div>
              <div style={{fontSize:13,color:C.text,fontFamily:"Arial",fontWeight:700}}>{isLastSet?nextExo?.name:curExo.name}</div>
              {isLastSet&&<div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{nextExo?.muscle} · {nextExo?.detail}</div>}
            </div>
            <span style={{color,fontSize:20}}>›</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Seances({workouts,onSave,onSaveWellness}) {
  const [view, setView] = useState("main");
  const [circuit, setCircuit] = useState(30);
  const [libreForm, setLibreForm] = useState({description:"",duree:"",ressenti:0});

  const saveLibre = () => {
    if(!libreForm.description&&!libreForm.duree) return;
    onSave({id:Date.now(),date:today(),type:"Séance libre",duree:parseFloat(libreForm.duree)||0,description:libreForm.description,ressenti:libreForm.ressenti,exercises:[]});
    setLibreForm({description:"",duree:"",ressenti:0});
    setView("main");
  };

  if(view === "session") return (
    <CircuitSession circuit={circuit} onSave={w=>{onSave(w);}} onBack={()=>setView("main")} onSaveWellness={onSaveWellness}/>
  );

  if(view === "libre") return (
    <div>
      <BackBar title="💪 Séance libre" onBack={()=>setView("main")} color={C.purple}/>
      <div style={{padding:"16px 16px 80px"}}>
        <Card style={{background:`${C.purple}11`,border:`1px solid ${C.purple}33`}}>
          <SHdr color={C.purple}>SÉANCE LIBRE — EXERCICES AU CHOIX</SHdr>
          <div style={{fontSize:12,color:C.muted,fontFamily:"Arial"}}>Note ce que tu as fait, même brièvement</div>
        </Card>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.purple,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>DESCRIPTION</div>
          <textarea value={libreForm.description} onChange={e=>setLibreForm(f=>({...f,description:e.target.value}))}
            placeholder="Ex: Pompes, squats, abdos... décris ce que tu as fait"
            style={{width:"100%",background:C.card2,border:`1px solid ${C.purple}55`,borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:80,resize:"none",boxSizing:"border-box"}}/>
        </div>
        <InputField label="DURÉE" type="number" value={libreForm.duree} onChange={v=>setLibreForm(f=>({...f,duree:v}))} placeholder="30" unit="min" color={C.purple}/>
        <Card>
          <SHdr color={C.purple}>RESSENTI</SHdr>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {[1,2,3,4,5].map(s=>(
              <button key={s} onClick={()=>setLibreForm(f=>({...f,ressenti:s}))} style={{background:"none",border:"none",fontSize:28,cursor:"pointer",opacity:s<=libreForm.ressenti?1:0.3}}>⭐</button>
            ))}
          </div>
        </Card>
        <Btn onClick={saveLibre} color={C.purple} textColor="#fff" style={{width:"100%"}} disabled={!libreForm.description&&!libreForm.duree}>💾 Sauvegarder</Btn>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>💪 Séances muscu</div>
        <GhostBtn onClick={()=>setView(view==="history"?"main":"history")}>Historique ({workouts.length})</GhostBtn>
      </div>
      <div style={{padding:"12px 16px 80px"}}>
        {view==="main" ? (
          <>
            {[{min:15,label:"15 min",sub:"Garde chargée / épuisé",c:C.red},{min:30,label:"30 min",sub:"Journée normale · LE CŒUR DU PROGRAMME",c:C.gold},{min:45,label:"45 min+",sub:"Jour off · Complet",c:C.green}].map(ci=>(
              <div key={ci.min} onClick={()=>{setCircuit(ci.min);setView("session");}} style={{background:C.card,borderRadius:12,padding:"18px 16px",marginBottom:10,borderLeft:`3px solid ${ci.c}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:20,fontWeight:700,color:ci.c,fontFamily:"Arial"}}>{ci.label}</div>
                  <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",fontStyle:"italic",marginTop:2}}>{ci.sub}</div>
                </div>
                <span style={{fontSize:22,color:ci.c}}>▶</span>
              </div>
            ))}
            <div onClick={()=>setView("libre")} style={{background:C.card,borderRadius:12,padding:"18px 16px",marginBottom:10,borderLeft:`3px solid ${C.purple}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:20,fontWeight:700,color:C.purple,fontFamily:"Arial"}}>Séance libre</div>
                <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",fontStyle:"italic",marginTop:2}}>Exercices au choix · Notes libres</div>
              </div>
              <span style={{fontSize:22,color:C.purple}}>▶</span>
            </div>
            <Card style={{background:`${C.teal}11`,border:`1px solid ${C.teal}33`,marginTop:8}}>
              <SHdr color={C.teal}>💡 RÉCUPÉRATION</SHdr>
              <div style={{fontSize:12,color:C.text,fontFamily:"Arial",lineHeight:1.8}}>
                Protéines dans 30 min · Étire les muscles travaillés · 48h de repos par groupe musculaire
              </div>
            </Card>
          </>
        ) : (
          [...workouts].reverse().map((w,i) => (
            <Card key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"Arial"}}>💪 {w.type}</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(w.date)}{w.duree?` · ${w.duree} min réelles`:""}</div>
                  {w.description&&<div style={{fontSize:11,color:C.muted,fontFamily:"Arial",fontStyle:"italic",marginTop:2}}>{w.description}</div>}
                </div>
                <Badge text="MUSCU" color={C.gold}/>
              </div>
              {w.exercises?.map((ex,ei) => (
                <div key={ei} style={{borderTop:ei===0?`1px solid ${C.border}`:"none",paddingTop:6}}>
                  <div style={{fontSize:12,color:C.gold,fontFamily:"Arial"}}>{ex.name}</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{ex.sets?.filter(s=>s.reps).map((s,si)=>`S${si+1}:${s.reps}r${s.weight?`×${s.weight}kg`:""}`).join(" · ")}</div>
                </div>
              ))}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Course({runs,onSave}) {
  const [view,setView]=useState("main");
  const [form,setForm]=useState({date:today(),distance:"",duration:"",type:"course à pied",notes:""});
  const saveRun=()=>{if(!form.distance||!form.duration)return;onSave({id:Date.now(),...form,distance:parseFloat(form.distance),duration:parseFloat(form.duration)});setForm({date:today(),distance:"",duration:"",type:"course à pied",notes:""});setView("main");};
  const targetPace=14/3;
  if(view==="log") return(
    <div>
      <BackBar title="Séance libre" onBack={()=>setView("main")} color={C.blue}/>
      <div style={{padding:"16px 16px 80px"}}>
        <InputField label="DATE" type="date" value={form.date} onChange={v=>setForm({...form,date:v})} color={C.blue}/>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.blue,marginBottom:6,fontFamily:"Arial",letterSpacing:2}}>TYPE ACTIVITÉ</div>
          <div style={{display:"flex",gap:8}}>
            {["course à pied","marche rapide","trail"].map(t=>(
              <button key={t} onClick={()=>setForm({...form,type:t})} style={{flex:1,padding:"10px 4px",borderRadius:8,background:form.type===t?`${C.blue}22`:C.card2,border:`1px solid ${form.type===t?C.blue:"#E2E8F0"}`,color:form.type===t?C.blue:C.muted,fontSize:11,fontFamily:"Arial",cursor:"pointer"}}>{t}</button>
            ))}
          </div>
        </div>
        <InputField label="DISTANCE" type="number" value={form.distance} onChange={v=>setForm({...form,distance:v})} placeholder="3.0" unit="km" color={C.blue}/>
        <InputField label="DURÉE" type="number" value={form.duration} onChange={v=>setForm({...form,duration:v})} placeholder="20" unit="min" color={C.blue}/>
        {form.distance&&form.duration&&(
          <Card style={{background:"#EEF1FA",border:`1px solid ${C.blue}44`,textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:32,fontWeight:700,color:C.blue,fontFamily:"Arial"}}>{fmtPace(parseFloat(form.distance),parseFloat(form.duration))}<span style={{fontSize:14}}>/km</span></div>
          </Card>
        )}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:C.blue,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>NOTES</div>
          <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Ressenti, conditions..."
            style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box"}}/>
        </div>
        <Btn onClick={saveRun} color={C.blue} textColor="#fff" style={{width:"100%"}} disabled={!form.distance||!form.duration}>💾 Sauvegarder</Btn>
      </div>
    </div>
  );
  return(
    <div>
      <div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>🏃 Course extérieure</div>
        <Btn onClick={()=>setView("log")} color={C.blue} textColor="#fff" style={{padding:"8px 14px",fontSize:12}}>Séance libre</Btn>
      </div>
      <div style={{padding:"12px 16px 80px"}}>
        <Card style={{background:"#EEF1FA",border:`1px solid ${C.blue}33`}}>
          <SHdr color={C.blue}>🎯 OBJECTIF JUIN 2026</SHdr>
          <div style={{fontSize:22,fontWeight:700,color:C.blue,fontFamily:"Arial"}}>3 km en &lt; 14 min · 4'40"/km</div>
        </Card>
        {[...runs].reverse().slice(0,8).map((r,i)=>(
          <Card key={i}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"Arial"}}>🏃 {r.distance}km · {r.duration}min</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{fmt(r.date)}{r.type?` · ${r.type}`:""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:r.duration/r.distance<=targetPace?C.green:C.blue,fontFamily:"Arial"}}>{fmtPace(r.distance,r.duration)}</div>
                <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>/km</div>
              </div>
            </div>
            {r.notes&&<div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginTop:6,fontStyle:"italic"}}>"{r.notes}"</div>}
          </Card>
        ))}
        {runs.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontFamily:"Arial"}}><div style={{fontSize:44,marginBottom:8}}>🏃</div><div>Aucune course enregistrée</div></div>}
        <Card style={{background:`${C.teal}11`,border:`1px solid ${C.teal}33`,marginTop:8}}>
          <SHdr color={C.teal}>💡 RÉCUPÉRATION</SHdr>
          <div style={{fontSize:12,color:C.text,fontFamily:"Arial",lineHeight:1.8}}>
            Marche 5 min après l'effort · Hydrate-toi · Étire mollets et ischio-jambiers
          </div>
        </Card>
      </div>
    </div>
  );
}

function Mesures({measures,onSave}) {
  const [form,setForm]=useState({date:today(),weight:"",waist:"",arm:"",chest:""});
  const last=measures[measures.length-1]||{};
  const saveMeasure=()=>{if(!form.weight&&!form.waist)return;onSave({id:Date.now(),...form});setForm({date:today(),weight:"",waist:"",arm:"",chest:""});};
  return(<div><div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>📏 Mensurations</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>Toutes les 2 semaines · Le matin à jeun</div></div><div style={{padding:"12px 16px 80px"}}>{measures.length>0&&<Card><SHdr>DERNIÈRES MESURES — {fmt(last.date)}</SHdr><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>{[{l:"Poids",v:last.weight,u:"kg",goal:72},{l:"Ventre",v:last.waist,u:"cm",goal:85},{l:"Bras",v:last.arm,u:"cm",goal:34},{l:"Poitrine",v:last.chest,u:"cm",goal:null}].map((m,i)=><div key={i} style={{background:C.card2,borderRadius:10,padding:"12px",textAlign:"center"}}><div style={{fontSize:10,color:C.muted,fontFamily:"Arial",marginBottom:4}}>{m.l.toUpperCase()}</div><div style={{fontSize:24,fontWeight:700,fontFamily:"Arial",color:m.v?C.text:C.muted}}>{m.v||"—"}</div><div style={{fontSize:10,color:C.muted,fontFamily:"Arial"}}>{m.u}</div>{m.goal&&<div style={{fontSize:9,color:C.muted,fontFamily:"Arial",marginTop:2}}>Obj: {m.goal}{m.u}</div>}</div>)}</div>{last.waist&&<ProgBar value={95-parseFloat(last.waist)} max={10} color={parseFloat(last.waist)<=85?C.green:C.gold} label={`Ventre ${last.waist}cm`} sub={parseFloat(last.waist)<=85?"✅ Objectif !":Math.round(((95-parseFloat(last.waist))/10)*100)+"%"}/>}</Card>}<Card style={{border:"1px solid #E2E8F0"}}><SHdr>+ NOUVELLE MENSURATION</SHdr><InputField label="DATE" type="date" value={form.date} onChange={v=>setForm({...form,date:v})}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><InputField label="POIDS" type="number" value={form.weight} onChange={v=>setForm({...form,weight:v})} placeholder="78" unit="kg"/><InputField label="VENTRE" type="number" value={form.waist} onChange={v=>setForm({...form,waist:v})} placeholder="95" unit="cm"/><InputField label="BRAS" type="number" value={form.arm} onChange={v=>setForm({...form,arm:v})} placeholder="31" unit="cm"/><InputField label="POITRINE" type="number" value={form.chest} onChange={v=>setForm({...form,chest:v})} placeholder="95" unit="cm"/></div><Btn onClick={saveMeasure} style={{width:"100%"}} disabled={!form.weight&&!form.waist}>💾 Sauvegarder</Btn></Card>{measures.length>1&&<><SHdr style={{marginTop:8}}>HISTORIQUE</SHdr>{[...measures].reverse().map((m,i)=><Card key={i} style={{marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><span style={{fontSize:12,color:C.gold,fontFamily:"Arial",fontWeight:700}}>{fmt(m.date)}</span><div style={{display:"flex",gap:12}}>{m.weight&&<span style={{fontSize:12,color:C.text,fontFamily:"Arial"}}>⚖️ {m.weight}kg</span>}{m.waist&&<span style={{fontSize:12,color:C.gold,fontFamily:"Arial"}}>🔵 {m.waist}cm</span>}{m.arm&&<span style={{fontSize:12,color:C.green,fontFamily:"Arial"}}>💪 {m.arm}cm</span>}</div></div></Card>)}</> }</div></div>);
}

function Repas({meals,onSave}) {
  const [form,setForm]=useState({date:today(),time:new Date().toTimeString().slice(0,5),type:"Déjeuner",description:""});
  const [selDay,setSelDay]=useState(today());const [showRules,setShowRules]=useState(false);
  const saveMeal=()=>{if(!form.description.trim())return;onSave({id:Date.now(),...form});setForm(p=>({...p,description:""}));};
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return localDateStr(d);});
  const dayMeals=meals.filter(m=>m.date===selDay).sort((a,b)=>a.time.localeCompare(b.time));
  return(<div><div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>🍳 Nutrition & Repas</div></div><div style={{padding:"12px 16px 80px"}}><div onClick={()=>setShowRules(!showRules)} style={{background:"#FFFBEB",border:`1px solid ${C.gold}33`,borderRadius:12,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontSize:13,fontWeight:700,color:C.gold,fontFamily:"Arial"}}>📌 Les 6 règles</span><span style={{color:C.gold}}>{showRules?"▲":"▼"}</span></div>{showRules&&<Card style={{background:"#FFFBEB",border:`1px solid ${C.gold}22`,marginTop:-6,marginBottom:10}}>{NUTRITION_RULES.map((r,i)=><div key={i} style={{fontSize:13,color:"#B45309",fontFamily:"Arial",marginBottom:6,display:"flex",gap:8}}><span style={{color:C.gold,minWidth:16}}>{i+1}.</span>{r}</div>)}</Card>}<div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:10,paddingBottom:4}}>{days.map(d=><button key={d} onClick={()=>setSelDay(d)} style={{background:selDay===d?C.gold:C.card,color:selDay===d?C.bg:C.muted,border:`1px solid ${selDay===d?C.gold:"#E2E8F0"}`,borderRadius:8,padding:"6px 10px",fontSize:11,fontFamily:"Arial",cursor:"pointer",whiteSpace:"nowrap",fontWeight:selDay===d?700:400}}>{d===today()?"Aujourd'hui":new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"})}</button>)}</div><Card><SHdr>{new Date(selDay+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}).toUpperCase()}</SHdr>{dayMeals.length===0?<div style={{fontSize:13,color:C.muted,fontFamily:"Arial",fontStyle:"italic"}}>Aucun repas saisi</div>:dayMeals.map((m,i)=><div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:i<dayMeals.length-1?`1px solid ${C.border}`:"none"}}><div style={{textAlign:"center",minWidth:50}}><div style={{fontSize:11,color:C.gold,fontFamily:"Arial",fontWeight:700}}>{m.time}</div><div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{m.type}</div></div><div style={{fontSize:13,color:C.text,fontFamily:"Arial",lineHeight:1.5}}>{m.description}</div></div>)}</Card><Card style={{border:"1px solid #E2E8F0"}}><SHdr>+ SAISIR UN REPAS</SHdr><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}><div><div style={{fontSize:10,color:C.gold,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>HEURE</div><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"9px",fontSize:13,fontFamily:"Arial",outline:"none",boxSizing:"border-box"}}/></div><div><div style={{fontSize:10,color:C.gold,marginBottom:4,fontFamily:"Arial",letterSpacing:2}}>TYPE</div><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"9px",fontSize:13,fontFamily:"Arial",outline:"none",boxSizing:"border-box"}}>{MEAL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div></div><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex: 1 paume poulet + 2 poings riz" style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box",marginBottom:10}}/><SHdr>SÉLECTION RAPIDE</SHdr><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{MEAL_PRESETS.map((p,i)=><button key={i} onClick={()=>setForm({...form,description:p})} style={{background:form.description===p?`${C.green}22`:C.card2,border:`1px solid ${form.description===p?C.green:"#E2E8F0"}`,borderRadius:8,color:form.description===p?C.green:C.muted,fontSize:11,padding:"6px 10px",cursor:"pointer",fontFamily:"Arial"}}>{p}</button>)}</div><Btn onClick={saveMeal} color={C.green} textColor="#fff" style={{width:"100%"}} disabled={!form.description.trim()}>💾 Ajouter</Btn></Card></div></div>);
}

function Rappels({reminders,onSave,onDelete,onToggle}) {
  const [view,setView]=useState("main");const [form,setForm]=useState({label:"",time:"12:00",days:[],type:"nutrition"});const [permGranted,setPermGranted]=useState(false);
  useEffect(()=>{if("Notification" in window)setPermGranted(Notification.permission==="granted");},[]);
  const requestPerm=async()=>{if("Notification" in window){const p=await Notification.requestPermission();setPermGranted(p==="granted");}};
  const PRESETS=[{label:"Séance du matin",time:"06:30",days:[1,2,3,4,5],type:"seance",emoji:"💪"},{label:"Protéines en premier !",time:"12:30",days:[0,1,2,3,4,5,6],type:"nutrition",emoji:"🍳"},{label:"Pas de riz ce soir",time:"19:30",days:[0,1,2,3,4,5,6],type:"nutrition",emoji:"🚫"},{label:"Prépare tes œufs durs",time:"21:30",days:[0,1,2,3,4,5,6],type:"nutrition",emoji:"🥚"},{label:"Séance tapis",time:"06:00",days:[2,4],type:"tapis",emoji:"⚡"},{label:"Test 3 km",time:"06:30",days:[6],type:"eval",emoji:"🏆"},{label:"Bois de l'eau !",time:"15:00",days:[0,1,2,3,4,5,6],type:"nutrition",emoji:"💧"}];
  const DAYS=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  const TYPE_COLORS={seance:C.gold,nutrition:C.green,course:C.blue,tapis:C.teal,eval:C.orange};
  const toggleDay=(d)=>setForm(f=>({...f,days:f.days.includes(d)?f.days.filter(x=>x!==d):[...f.days,d].sort()}));
  const saveReminder=()=>{if(!form.label||!form.time||!form.days.length)return;onSave({id:Date.now(),...form,active:true});setForm({label:"",time:"12:00",days:[],type:"nutrition"});setView("main");};
  const addPreset=(p)=>onSave({id:Date.now(),...p,active:true});
  if(view==="new")return(<div><BackBar title="Nouveau rappel" onBack={()=>setView("main")} color={C.purple}/><div style={{padding:"16px 16px 80px"}}><InputField label="TITRE" value={form.label} onChange={v=>setForm({...form,label:v})} placeholder="Ex: Boire de l'eau" color={C.purple}/><InputField label="HEURE" type="time" value={form.time} onChange={v=>setForm({...form,time:v})} color={C.purple}/><div style={{marginBottom:12}}><div style={{fontSize:10,color:C.purple,marginBottom:8,fontFamily:"Arial",letterSpacing:2}}>JOURS</div><div style={{display:"flex",gap:6}}>{DAYS.map((d,i)=><button key={i} onClick={()=>toggleDay(i)} style={{flex:1,padding:"8px 2px",borderRadius:8,background:form.days.includes(i)?C.purple:C.card2,border:`1px solid ${form.days.includes(i)?C.purple:"#E2E8F0"}`,color:form.days.includes(i)?"#fff":C.muted,fontSize:10,fontFamily:"Arial",cursor:"pointer"}}>{d}</button>)}</div></div><Btn onClick={saveReminder} color={C.purple} textColor="#fff" style={{width:"100%"}} disabled={!form.label||!form.time||!form.days.length}>💾 Créer</Btn></div></div>);
  return(<div><div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>🔔 Rappels</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>{reminders.filter(r=>r.active).length} actifs</div></div><Btn onClick={()=>setView("new")} color={C.purple} textColor="#fff" style={{padding:"8px 14px",fontSize:12}}>+ Créer</Btn></div><div style={{padding:"12px 16px 80px"}}>{!permGranted&&<div style={{background:"#FEE2E2",border:`1px solid ${C.red}44`,borderRadius:12,padding:"14px 16px",marginBottom:12}}><div style={{fontSize:13,fontWeight:700,color:C.red,fontFamily:"Arial",marginBottom:6}}>🔕 Notifications désactivées</div><Btn onClick={requestPerm} color={C.red} textColor="#fff" style={{width:"100%",fontSize:13}}>Activer les notifications</Btn></div>}{permGranted&&<div style={{background:"#DCFCE7",border:`1px solid ${C.green}44`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}><span>✅</span><span style={{fontSize:12,color:C.green,fontFamily:"Arial"}}>Notifications autorisées</span></div>}{reminders.length>0&&<>{reminders.map((r,i)=><div key={i} style={{background:r.active?C.card:C.bg,borderRadius:12,padding:"14px 16px",marginBottom:8,borderLeft:`3px solid ${r.active?TYPE_COLORS[r.type]||C.gold:"#C7D2EE"}`,opacity:r.active?1:0.5}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"Arial"}}>{r.emoji||"🔔"} {r.label}</div><div style={{fontSize:12,color:TYPE_COLORS[r.type]||C.gold,fontFamily:"Arial",fontWeight:700,marginTop:2}}>{r.time} · {r.days?.map(d=>DAYS[d]).join(", ")}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><button onClick={()=>onToggle(r.id)} style={{width:36,height:20,borderRadius:10,border:"none",cursor:"pointer",background:r.active?C.green:"#C7D2EE",position:"relative"}}><div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:r.active?18:3,transition:"left 0.2s"}}/></button><button onClick={()=>onDelete(r.id)} style={{background:"none",border:"none",color:"#E05C5C55",fontSize:16,cursor:"pointer"}}>✕</button></div></div></div>)}</> }<SHdr>⚡ RAPPELS RECOMMANDÉS</SHdr>{PRESETS.map((p,i)=>{const exists=reminders.some(r=>r.label===p.label);return<div key={i} onClick={()=>!exists&&addPreset(p)} style={{background:exists?"#DCFCE7":C.card,borderRadius:10,padding:"12px 16px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:exists?"default":"pointer",opacity:exists?0.6:1,border:`1px solid ${exists?C.green+"33":C.border}`}}><div><div style={{fontSize:14,color:C.text,fontFamily:"Arial"}}>{p.emoji} {p.label}</div><div style={{fontSize:11,color:C.muted,fontFamily:"Arial",marginTop:2}}>{p.time} · {p.days.map(d=>DAYS[d]).join(", ")}</div></div>{exists?<Badge text="✓ Ajouté" color={C.green}/>:<span style={{color:TYPE_COLORS[p.type],fontSize:18}}>+</span>}</div>;})}</div></div>);
}

// ═══════════════════════════════════════════════════
//  APP PRINCIPALE
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
//  CALENDRIER — NAVIGATION & AJOUT SESSIONS PASSÉES
// ═══════════════════════════════════════════════════
function Calendrier({workouts, runs, tapisHistory, meals, evals, measures, onSaveWorkout, onSaveRun, onSaveTapis, onSaveMeal, onSaveMeasure, onSaveEval}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [addView, setAddView] = useState(null); // "workout"|"run"|"tapis"|"meal"|"measure"|"eval"
  // Formulaires
  const [workoutForm, setWorkoutForm] = useState({circuit:"30", exos:[]});
  const [runForm, setRunForm] = useState({distance:"", duration:"", notes:""});
  const [tapisForm, setTapisForm] = useState({sessionId:"1", dureeReelle:"", completed:true});
  const [mealForm, setMealForm] = useState({time:"12:00", type:"Déjeuner", description:""});
  const [measureForm, setMeasureForm] = useState({weight:"", waist:"", arm:"", chest:""});
  const [evalForm, setEvalForm] = useState({type:"3km", duree:"", support:"tapis", notes:""});

  const selDate = selectedDay ? localDateStr(selectedDay) : null;

  // ── Helpers calendrier ──────────────────────────
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    // Jours du mois précédent pour compléter la première semaine (lundi=0)
    const startDow = (firstDay.getDay() + 6) % 7;
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({date: d, otherMonth: true});
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({date: new Date(year, month, i), otherMonth: false});
    }
    // Compléter jusqu'à 42 cases
    while (days.length < 42) {
      const d = new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1);
      days.push({date: d, otherMonth: true});
    }
    return days;
  };

  const getActivitiesForDay = (dateStr) => {
    const acts = [];
    if (workouts.some(w => w.date === dateStr)) acts.push({type:"workout", color:C.gold, icon:"💪"});
    if (runs.some(r => r.date === dateStr)) acts.push({type:"run", color:C.blue, icon:"🏃"});
    if (tapisHistory.some(t => t.date === dateStr)) acts.push({type:"tapis", color:C.teal, icon:"⚡"});
    if (meals.some(m => m.date === dateStr)) acts.push({type:"meal", color:C.green, icon:"🍳"});
    if (evals.some(e => e.date === dateStr)) acts.push({type:"eval", color:C.orange, icon:"🏆"});
    if (measures.some(m => m.date === dateStr)) acts.push({type:"measure", color:C.purple, icon:"📏"});
    return acts;
  };

  const getDayActivities = (dateStr) => ({
    workouts: workouts.filter(w => w.date === dateStr),
    runs: runs.filter(r => r.date === dateStr),
    tapis: tapisHistory.filter(t => t.date === dateStr),
    meals: meals.filter(m => m.date === dateStr),
    evals: evals.filter(e => e.date === dateStr),
    measures: measures.filter(m => m.date === dateStr),
  });

  const prevMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1));
  const nextMonth = () => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1));

  const todayStr = today();
  const days = getDaysInMonth(currentMonth);
  const monthLabel = currentMonth.toLocaleDateString("fr-FR", {month:"long", year:"numeric"});

  // ── Sauvegarde depuis calendrier ──────────────────
  const handleSaveWorkout = async () => {
    if (!selDate) return;
    await onSaveWorkout({
      id: Date.now(),
      date: selDate,
      type: `Circuit ${workoutForm.circuit} min`,
      duree: parseInt(workoutForm.circuit),
      exercises: CIRCUITS[parseInt(workoutForm.circuit)]?.map(e => ({
        name: e.name, muscle: e.muscle,
        sets: [{reps: "", weight: ""}]
      })) || []
    });
    setAddView(null);
    setWorkoutForm({circuit:"30", exos:[]});
  };

  const handleSaveRun = async () => {
    if (!selDate || !runForm.distance || !runForm.duration) return;
    await onSaveRun({
      id: Date.now(), date: selDate,
      distance: parseFloat(runForm.distance),
      duration: parseFloat(runForm.duration),
      notes: runForm.notes
    });
    setAddView(null);
    setRunForm({distance:"", duration:"", notes:""});
  };

  const handleSaveTapis = async () => {
    if (!selDate) return;
    const s = TAPIS_SESSIONS.find(s => s.id === parseInt(tapisForm.sessionId));
    await onSaveTapis({
      id: Date.now(), date: selDate,
      sessionId: parseInt(tapisForm.sessionId),
      sessionLabel: s?.label || "Séance tapis",
      bloc: s?.bloc || 1, niveau: s?.niveau || "",
      dureeReelle: parseFloat(tapisForm.dureeReelle) || 0,
      completed: tapisForm.completed,
      phases: s?.phases.length || 0
    });
    setAddView(null);
    setTapisForm({sessionId:"1", dureeReelle:"", completed:true});
  };

  const handleSaveMeal = async () => {
    if (!selDate || !mealForm.description.trim()) return;
    await onSaveMeal({id: Date.now(), date: selDate, ...mealForm});
    setAddView(null);
    setMealForm({time:"12:00", type:"Déjeuner", description:""});
  };

  const handleSaveMeasure = async () => {
    if (!selDate || (!measureForm.weight && !measureForm.waist)) return;
    await onSaveMeasure({id: Date.now(), date: selDate, ...measureForm});
    setAddView(null);
    setMeasureForm({weight:"", waist:"", arm:"", chest:""});
  };

  const handleSaveEval = async () => {
    if (!selDate || !evalForm.duree) return;
    const et = EVAL_TYPES.find(e => e.id === evalForm.type);
    const dureeMin = parseFloat(evalForm.duree);
    await onSaveEval({
      id: Date.now(), date: selDate,
      type: evalForm.type, label: et?.label || evalForm.type,
      duree: dureeMin, support: evalForm.support,
      notes: evalForm.notes,
      objectifMin: et?.objectifMin || 14,
      reussi: dureeMin < (et?.objectifMin || 14)
    });
    setAddView(null);
    setEvalForm({type:"3km", duree:"", support:"tapis", notes:""});
  };

  // ── Vue détail d'un jour ──────────────────────────
  if (selectedDay && !addView) {
    const ds = selDate;
    const dayActs = getDayActivities(ds);
    const isFuture = ds > todayStr;
    const dayLabel = selectedDay.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"});

    return (
      <div>
        <BackBar
          title={dayLabel}
          onBack={() => setSelectedDay(null)}
          color={C.gold}
          right={
            !isFuture ? (
              <GhostBtn onClick={() => setAddView("choose")} color={C.gold}>+ Ajouter</GhostBtn>
            ) : null
          }
        />
        <div style={{padding:"12px 16px 80px"}}>
          {isFuture && (
            <Card style={{background:"#1A1A0A", border:`1px solid ${C.gold}33`, textAlign:"center"}}>
              <div style={{fontSize:13, color:C.muted, fontFamily:"Arial"}}>
                📅 Date future — tu pourras y ajouter des activités une fois ce jour arrivé
              </div>
            </Card>
          )}

          {/* Séances muscu */}
          {dayActs.workouts.length > 0 && (
            <Card>
              <SHdr color={C.gold}>💪 MUSCU</SHdr>
              {dayActs.workouts.map((w, i) => (
                <div key={i} style={{paddingBottom: i < dayActs.workouts.length-1 ? 8 : 0, marginBottom: i < dayActs.workouts.length-1 ? 8 : 0, borderBottom: i < dayActs.workouts.length-1 ? `1px solid ${C.border}` : "none"}}>
                  <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{w.type}</div>
                  {w.exercises?.map((ex, ei) => (
                    <div key={ei} style={{fontSize:11, color:C.muted, fontFamily:"Arial", marginTop:3}}>
                      › {ex.name} — {ex.sets?.filter(s=>s.reps).map((s,si)=>`${s.reps}reps${s.weight?`×${s.weight}kg`:""}`).join(", ")||"—"}
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}

          {/* Courses */}
          {dayActs.runs.length > 0 && (
            <Card>
              <SHdr color={C.blue}>🏃 COURSE EXTÉRIEURE</SHdr>
              {dayActs.runs.map((r, i) => (
                <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom: i < dayActs.runs.length-1 ? 8 : 0}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{r.distance} km · {r.duration} min</div>
                    <div style={{fontSize:11, color:C.muted, fontFamily:"Arial"}}>Allure : {fmtPace(r.distance, r.duration)}/km</div>
                    {r.notes && <div style={{fontSize:11, color:C.muted, fontFamily:"Arial", fontStyle:"italic"}}>"{r.notes}"</div>}
                  </div>
                  <Badge text={r.duration/r.distance <= 14/3 ? "✅ Objectif" : fmtPace(r.distance,r.duration)+"/km"} color={r.duration/r.distance<=14/3?C.green:C.blue}/>
                </div>
              ))}
            </Card>
          )}

          {/* Tapis */}
          {dayActs.tapis.length > 0 && (
            <Card>
              <SHdr color={C.teal}>⚡ TAPIS</SHdr>
              {dayActs.tapis.map((t, i) => (
                <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{t.sessionLabel}</div>
                    <div style={{fontSize:11, color:C.muted, fontFamily:"Arial"}}>{t.dureeReelle} min · Bloc {t.bloc}</div>
                  </div>
                  <Badge text={t.completed?"✓ Complète":"Partielle"} color={t.completed?C.green:C.gold}/>
                </div>
              ))}
            </Card>
          )}

          {/* Tests */}
          {dayActs.evals.length > 0 && (
            <Card>
              <SHdr color={C.orange}>🏆 TESTS</SHdr>
              {dayActs.evals.map((e, i) => (
                <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{e.label}</div>
                    <div style={{fontSize:11, color:C.muted, fontFamily:"Arial"}}>{fmtDuration(e.duree)} · {e.support}</div>
                  </div>
                  <Badge text={e.reussi?"✅ Objectif !":"En cours"} color={e.reussi?C.green:C.orange}/>
                </div>
              ))}
            </Card>
          )}

          {/* Mensurations */}
          {dayActs.measures.length > 0 && (
            <Card>
              <SHdr color={C.purple}>📏 MENSURATIONS</SHdr>
              {dayActs.measures.map((m, i) => (
                <div key={i} style={{display:"flex", gap:12, flexWrap:"wrap"}}>
                  {m.weight && <span style={{fontSize:13, color:C.text, fontFamily:"Arial"}}>⚖️ {m.weight} kg</span>}
                  {m.waist  && <span style={{fontSize:13, color:C.gold, fontFamily:"Arial"}}>🔵 {m.waist} cm</span>}
                  {m.arm    && <span style={{fontSize:13, color:C.green, fontFamily:"Arial"}}>💪 {m.arm} cm</span>}
                  {m.chest  && <span style={{fontSize:13, color:C.blue, fontFamily:"Arial"}}>🫁 {m.chest} cm</span>}
                </div>
              ))}
            </Card>
          )}

          {/* Repas */}
          {dayActs.meals.length > 0 && (
            <Card>
              <SHdr color={C.green}>🍳 REPAS</SHdr>
              {dayActs.meals.sort((a,b)=>a.time.localeCompare(b.time)).map((m, i) => (
                <div key={i} style={{display:"flex", gap:12, padding:"6px 0", borderBottom: i < dayActs.meals.length-1 ? `1px solid ${C.border}` : "none"}}>
                  <div style={{minWidth:50, textAlign:"center"}}>
                    <div style={{fontSize:11, color:C.gold, fontFamily:"Arial", fontWeight:700}}>{m.time}</div>
                    <div style={{fontSize:9, color:C.muted, fontFamily:"Arial"}}>{m.type}</div>
                  </div>
                  <div style={{fontSize:13, color:C.text, fontFamily:"Arial", lineHeight:1.4}}>{m.description}</div>
                </div>
              ))}
            </Card>
          )}

          {/* Rien ce jour */}
          {!isFuture && Object.values(dayActs).every(a=>a.length===0) && (
            <div style={{textAlign:"center", padding:"40px 0", color:C.muted, fontFamily:"Arial"}}>
              <div style={{fontSize:44, marginBottom:12}}>📅</div>
              <div style={{fontSize:14, marginBottom:8}}>Aucune activité ce jour</div>
              <Btn onClick={()=>setAddView("choose")} color={C.gold} style={{fontSize:13}}>+ Ajouter une activité</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Choix du type d'activité à ajouter ───────────
  if (addView === "choose") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        <BackBar title={`Ajouter — ${dayLabel}`} onBack={()=>setAddView(null)} color={C.gold}/>
        <div style={{padding:"16px 16px 80px"}}>
          <SHdr>QUE VEUX-TU AJOUTER ?</SHdr>
          {[
            {id:"workout", icon:"💪", label:"Séance muscu", sub:"Circuit 15, 30 ou 45 min", color:C.gold},
            {id:"run",     icon:"🏃", label:"Course extérieure", sub:"Distance + temps + allure calculée", color:C.blue},
            {id:"tapis",   icon:"⚡", label:"Séance tapis", sub:"Séance guidée ou libre", color:C.teal},
            {id:"eval",    icon:"🏆", label:"Test chronométré", sub:"3 km · 6 km · 10 km", color:C.orange},
            {id:"meal",    icon:"🍳", label:"Repas / nutrition", sub:"Saisie rapide sans pesée", color:C.green},
            {id:"measure", icon:"📏", label:"Mensurations", sub:"Ventre · Poids · Bras · Poitrine", color:C.purple},
          ].map((opt, i) => (
            <div key={i} onClick={()=>setAddView(opt.id)} style={{
              background:C.card, borderRadius:12, padding:"16px", marginBottom:8,
              borderLeft:`3px solid ${opt.color}`, cursor:"pointer",
              display:"flex", gap:14, alignItems:"center"
            }}>
              <span style={{fontSize:28}}>{opt.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{opt.label}</div>
                <div style={{fontSize:11, color:C.muted, fontFamily:"Arial", marginTop:2}}>{opt.sub}</div>
              </div>
              <span style={{color:opt.color, fontSize:18}}>›</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Formulaires d'ajout ───────────────────────────
  if (addView === "workout") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        <BackBar title={`💪 Muscu — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.gold}/>
        <div style={{padding:"16px 16px 80px"}}>
          <SHdr>CIRCUIT EFFECTUÉ</SHdr>
          <div style={{display:"flex", gap:8, marginBottom:16}}>
            {["15","30","45"].map(min => (
              <button key={min} onClick={()=>setWorkoutForm(f=>({...f, circuit:min}))} style={{
                flex:1, padding:"14px 8px", borderRadius:10,
                background: workoutForm.circuit===min ? C.gold : C.card2,
                border: `1px solid ${workoutForm.circuit===min ? C.gold : "#E2E8F0"}`,
                color: workoutForm.circuit===min ? C.bg : C.muted,
                fontSize:16, fontWeight:700, fontFamily:"Arial", cursor:"pointer"
              }}>{min} min</button>
            ))}
          </div>
          <Card style={{background:"#1A1A0A", border:`1px solid ${C.gold}22`}}>
            <SHdr>EXERCICES INCLUS</SHdr>
            {CIRCUITS[parseInt(workoutForm.circuit)]?.map((e,i) => (
              <div key={i} style={{fontSize:12, color:"#92400E", fontFamily:"Arial", marginBottom:4}}>
                › {e.name} · {e.detail}
              </div>
            ))}
          </Card>
          <div style={{background:C.card2, borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:12, color:C.muted, fontFamily:"Arial"}}>
            ℹ️ Tu pourras détailler les séries depuis l'onglet Muscu pour les séances futures. Ici on enregistre le circuit effectué.
          </div>
          <Btn onClick={handleSaveWorkout} color={C.gold} style={{width:"100%"}}>💾 Enregistrer cette séance</Btn>
        </div>
      </div>
    );
  }

  if (addView === "run") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    const pace = runForm.distance && runForm.duration ? fmtPace(parseFloat(runForm.distance), parseFloat(runForm.duration)) : null;
    return (
      <div>
        <BackBar title={`🏃 Course — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.blue}/>
        <div style={{padding:"16px 16px 80px"}}>
          <InputField label="DISTANCE" type="number" value={runForm.distance} onChange={v=>setRunForm(f=>({...f,distance:v}))} placeholder="3.0" unit="km" color={C.blue}/>
          <InputField label="DURÉE" type="number" value={runForm.duration} onChange={v=>setRunForm(f=>({...f,duration:v}))} placeholder="20" unit="min" color={C.blue}/>
          {pace && (
            <Card style={{background:"#EEF1FA", border:`1px solid ${C.blue}44`, textAlign:"center", marginBottom:12}}>
              <div style={{fontSize:11, color:C.muted, fontFamily:"Arial", marginBottom:4}}>ALLURE CALCULÉE</div>
              <div style={{fontSize:32, fontWeight:700, color:C.blue, fontFamily:"Arial"}}>{pace}<span style={{fontSize:14}}>/km</span></div>
              <div style={{fontSize:12, color:parseFloat(runForm.duration)/parseFloat(runForm.distance)<=14/3?C.green:C.muted, fontFamily:"Arial", marginTop:4}}>
                {parseFloat(runForm.duration)/parseFloat(runForm.distance)<=14/3?"✅ Objectif 14 min atteint !":"Cible : 4'40\"/km"}
              </div>
            </Card>
          )}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10, color:C.blue, marginBottom:4, fontFamily:"Arial", letterSpacing:2}}>NOTES</div>
            <textarea value={runForm.notes} onChange={e=>setRunForm(f=>({...f,notes:e.target.value}))} placeholder="Ressenti, météo, conditions..."
              style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:60,resize:"none",boxSizing:"border-box"}}/>
          </div>
          <Btn onClick={handleSaveRun} color={C.blue} textColor="#fff" style={{width:"100%"}} disabled={!runForm.distance||!runForm.duration}>💾 Enregistrer</Btn>
        </div>
      </div>
    );
  }

  if (addView === "tapis") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        <BackBar title={`⚡ Tapis — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.teal}/>
        <div style={{padding:"16px 16px 80px"}}>
          <SHdr color={C.teal}>SÉANCE EFFECTUÉE</SHdr>
          {TAPIS_SESSIONS.map((s,i) => (
            <div key={i} onClick={()=>setTapisForm(f=>({...f,sessionId:String(s.id)}))} style={{
              background:tapisForm.sessionId===String(s.id)?`${s.color}22`:C.card,
              borderRadius:10, padding:"14px 16px", marginBottom:8,
              border:`1px solid ${tapisForm.sessionId===String(s.id)?s.color:C.border}`,
              cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center"
            }}>
              <div>
                <div style={{fontSize:14, fontWeight:700, color:C.text, fontFamily:"Arial"}}>{s.label}</div>
                <div style={{fontSize:11, color:C.muted, fontFamily:"Arial"}}>{s.sublabel} · {s.duree}</div>
              </div>
              {tapisForm.sessionId===String(s.id) && <span style={{color:s.color, fontSize:20}}>✓</span>}
            </div>
          ))}
          <InputField label="DURÉE RÉELLE" type="number" value={tapisForm.dureeReelle} onChange={v=>setTapisForm(f=>({...f,dureeReelle:v}))} placeholder="28" unit="min" color={C.teal}/>
          <div style={{marginBottom:16}}>
            <SHdr color={C.teal}>SÉANCE</SHdr>
            <div style={{display:"flex", gap:8}}>
              {[{v:true,l:"✅ Complète"},{v:false,l:"⚡ Partielle"}].map(opt => (
                <button key={String(opt.v)} onClick={()=>setTapisForm(f=>({...f,completed:opt.v}))} style={{
                  flex:1, padding:"10px", borderRadius:8,
                  background:tapisForm.completed===opt.v?`${C.teal}22`:C.card2,
                  border:`1px solid ${tapisForm.completed===opt.v?C.teal:"#E2E8F0"}`,
                  color:tapisForm.completed===opt.v?C.teal:C.muted, fontSize:12, fontFamily:"Arial", cursor:"pointer"
                }}>{opt.l}</button>
              ))}
            </div>
          </div>
          <Btn onClick={handleSaveTapis} color={C.teal} textColor={C.bg} style={{width:"100%"}}>💾 Enregistrer</Btn>
        </div>
      </div>
    );
  }

  if (addView === "eval") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    const et = EVAL_TYPES.find(e=>e.id===evalForm.type);
    const dureeMin = parseFloat(evalForm.duree)||0;
    const reussi = dureeMin > 0 && et && dureeMin < et.objectifMin;
    return (
      <div>
        <BackBar title={`🏆 Test — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.orange}/>
        <div style={{padding:"16px 16px 80px"}}>
          <SHdr>TYPE DE TEST</SHdr>
          <div style={{display:"flex", gap:8, marginBottom:16}}>
            {EVAL_TYPES.map(e => (
              <button key={e.id} onClick={()=>setEvalForm(f=>({...f,type:e.id}))} style={{
                flex:1, padding:"12px 4px", borderRadius:10,
                background:evalForm.type===e.id?`${e.color}22`:C.card2,
                border:`1px solid ${evalForm.type===e.id?e.color:"#E2E8F0"}`,
                color:evalForm.type===e.id?e.color:C.muted,
                fontSize:12, fontWeight:700, fontFamily:"Arial", cursor:"pointer"
              }}>
                <div style={{fontSize:20}}>{e.icon}</div>
                <div>{e.label}</div>
                <div style={{fontSize:9, marginTop:2}}>{e.objectif}</div>
              </button>
            ))}
          </div>
          <InputField label="TEMPS RÉALISÉ" type="number" value={evalForm.duree} onChange={v=>setEvalForm(f=>({...f,duree:v}))} placeholder="Ex: 13.5" unit="min" color={C.orange}/>
          <MiniConverter onResult={v=>setEvalForm(f=>({...f,duree:v}))} color={C.orange}/>
          {dureeMin > 0 && (
            <Card style={{background:reussi?"#DCFCE7":"#FEE2E2", border:`1px solid ${reussi?C.green:C.red}44`, textAlign:"center", marginBottom:12}}>
              <div style={{fontSize:26, fontWeight:700, color:reussi?C.green:C.red, fontFamily:"Arial"}}>{fmtDuration(dureeMin)}</div>
              <div style={{fontSize:12, color:reussi?C.green:C.muted, fontFamily:"Arial", marginTop:4}}>
                {reussi?`✅ Objectif atteint !`:`Objectif : ${et?.objectif}`}
              </div>
            </Card>
          )}
          <div style={{display:"flex", gap:8, marginBottom:16}}>
            {["tapis","extérieur"].map(s=>(
              <button key={s} onClick={()=>setEvalForm(f=>({...f,support:s}))} style={{
                flex:1, padding:"10px", borderRadius:8,
                background:evalForm.support===s?`${C.orange}22`:C.card2,
                border:`1px solid ${evalForm.support===s?C.orange:"#E2E8F0"}`,
                color:evalForm.support===s?C.orange:C.muted,
                fontSize:12, fontFamily:"Arial", cursor:"pointer"
              }}>{s==="tapis"?"⚡ Tapis":"🌿 Extérieur"}</button>
            ))}
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10, color:C.orange, marginBottom:4, fontFamily:"Arial", letterSpacing:2}}>NOTES</div>
            <textarea value={evalForm.notes} onChange={e=>setEvalForm(f=>({...f,notes:e.target.value}))} placeholder="Ressenti, conditions..."
              style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:50,resize:"none",boxSizing:"border-box"}}/>
          </div>
          <Btn onClick={handleSaveEval} color={C.orange} textColor={C.bg} style={{width:"100%"}} disabled={!evalForm.duree}>💾 Enregistrer</Btn>
        </div>
      </div>
    );
  }

  if (addView === "meal") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        <BackBar title={`🍳 Repas — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.green}/>
        <div style={{padding:"16px 16px 80px"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10}}>
            <div>
              <div style={{fontSize:10, color:C.green, marginBottom:4, fontFamily:"Arial", letterSpacing:2}}>HEURE</div>
              <input type="time" value={mealForm.time} onChange={e=>setMealForm(f=>({...f,time:e.target.value}))}
                style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"9px",fontSize:13,fontFamily:"Arial",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:10, color:C.green, marginBottom:4, fontFamily:"Arial", letterSpacing:2}}>TYPE</div>
              <select value={mealForm.type} onChange={e=>setMealForm(f=>({...f,type:e.target.value}))}
                style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"9px",fontSize:13,fontFamily:"Arial",outline:"none",boxSizing:"border-box"}}>
                {MEAL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <textarea value={mealForm.description} onChange={e=>setMealForm(f=>({...f,description:e.target.value}))}
            placeholder="Ex: 1 paume poulet + 2 poings riz + eau"
            style={{width:"100%",background:C.card2,border:"1px solid #E2E8F0",borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,fontFamily:"Arial",outline:"none",minHeight:70,resize:"none",boxSizing:"border-box",marginBottom:10}}/>
          <SHdr>SÉLECTION RAPIDE</SHdr>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:16}}>
            {MEAL_PRESETS.map((p,i) => (
              <button key={i} onClick={()=>setMealForm(f=>({...f,description:p}))} style={{
                background:mealForm.description===p?`${C.green}22`:C.card2,
                border:`1px solid ${mealForm.description===p?C.green:"#E2E8F0"}`,
                borderRadius:8, color:mealForm.description===p?C.green:C.muted,
                fontSize:11, padding:"6px 10px", cursor:"pointer", fontFamily:"Arial"
              }}>{p}</button>
            ))}
          </div>
          <Btn onClick={handleSaveMeal} color={C.green} textColor="#fff" style={{width:"100%"}} disabled={!mealForm.description.trim()}>💾 Enregistrer</Btn>
        </div>
      </div>
    );
  }

  if (addView === "measure") {
    const dayLabel = selectedDay?.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
    return (
      <div>
        <BackBar title={`📏 Mesures — ${dayLabel}`} onBack={()=>setAddView("choose")} color={C.purple}/>
        <div style={{padding:"16px 16px 80px"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16}}>
            <InputField label="POIDS" type="number" value={measureForm.weight} onChange={v=>setMeasureForm(f=>({...f,weight:v}))} placeholder="78" unit="kg" color={C.purple}/>
            <InputField label="VENTRE" type="number" value={measureForm.waist} onChange={v=>setMeasureForm(f=>({...f,waist:v}))} placeholder="95" unit="cm" color={C.purple}/>
            <InputField label="BRAS" type="number" value={measureForm.arm} onChange={v=>setMeasureForm(f=>({...f,arm:v}))} placeholder="31" unit="cm" color={C.purple}/>
            <InputField label="POITRINE" type="number" value={measureForm.chest} onChange={v=>setMeasureForm(f=>({...f,chest:v}))} placeholder="95" unit="cm" color={C.purple}/>
          </div>
          <Btn onClick={handleSaveMeasure} color={C.purple} textColor="#fff" style={{width:"100%"}} disabled={!measureForm.weight&&!measureForm.waist}>💾 Enregistrer</Btn>
        </div>
      </div>
    );
  }

  // ── Vue calendrier principal ──────────────────────
  return (
    <div>
      <div style={{background:C.card, padding:"16px", borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <button onClick={prevMonth} style={{background:"none", border:"none", color:C.gold, fontSize:20, cursor:"pointer", padding:"0 8px"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:16, fontWeight:700, color:C.text, fontFamily:"Arial", textTransform:"capitalize"}}>{monthLabel}</div>
            <div style={{fontSize:11, color:C.muted, fontFamily:"Arial"}}>Appuie sur un jour pour voir ou ajouter</div>
          </div>
          <button onClick={nextMonth} style={{background:"none", border:"none", color:C.gold, fontSize:20, cursor:"pointer", padding:"0 8px"}}>›</button>
        </div>
      </div>

      <div style={{padding:"8px 12px 80px"}}>
        {/* Légende */}
        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:10, padding:"8px 4px"}}>
          {[{c:C.gold,l:"Muscu"},{c:C.blue,l:"Course"},{c:C.teal,l:"Tapis"},{c:C.orange,l:"Test"},{c:C.green,l:"Repas"},{c:C.purple,l:"Mesures"}].map(l=>(
            <div key={l.l} style={{display:"flex", alignItems:"center", gap:3}}>
              <div style={{width:8, height:8, borderRadius:"50%", background:l.c}}/>
              <span style={{fontSize:9, color:C.muted, fontFamily:"Arial"}}>{l.l}</span>
            </div>
          ))}
        </div>

        {/* Jours de la semaine */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:4}}>
          {["L","M","M","J","V","S","D"].map((d,i) => (
            <div key={i} style={{textAlign:"center", fontSize:10, color:C.muted, fontFamily:"Arial", padding:"4px 0"}}>{d}</div>
          ))}
        </div>

        {/* Grille des jours */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3}}>
          {days.map((day, i) => {
            const ds = localDateStr(day.date);
            const acts = getActivitiesForDay(ds);
            const isToday = ds === todayStr;
            const isFuture = ds > todayStr;
            const isSelected = selectedDay && ds === localDateStr(selectedDay);
            const hasActs = acts.length > 0;

            return (
              <div key={i} onClick={()=>{if(!day.otherMonth)setSelectedDay(day.date);}}
                style={{
                  minHeight:52, borderRadius:8, padding:"4px 2px",
                  background: isSelected ? `${C.gold}33` : isToday ? "#FFFBEB" : day.otherMonth ? C.bg : C.card,
                  border: isSelected ? `1px solid ${C.gold}` : isToday ? `1px solid ${C.gold}55` : `1px solid ${C.border}`,
                  cursor: day.otherMonth ? "default" : "pointer",
                  opacity: day.otherMonth ? 0.3 : 1,
                  display:"flex", flexDirection:"column", alignItems:"center",
                }}>
                <div style={{
                  fontSize:12, fontFamily:"Arial", marginBottom:2,
                  color: isToday ? C.gold : isFuture ? "#94A3B8" : C.text,
                  fontWeight: isToday ? 700 : 400,
                }}>{day.date.getDate()}</div>

                {/* Points d'activité */}
                {hasActs && (
                  <div style={{display:"flex", flexWrap:"wrap", gap:2, justifyContent:"center"}}>
                    {acts.slice(0,4).map((a,ai) => (
                      <div key={ai} style={{width:5, height:5, borderRadius:"50%", background:a.color}}/>
                    ))}
                  </div>
                )}

                {/* Indicateur aujourd'hui */}
                {isToday && !hasActs && (
                  <div style={{width:4, height:4, borderRadius:"50%", background:C.gold}}/>
                )}
              </div>
            );
          })}
        </div>

        {/* Résumé du mois */}
        <Card style={{marginTop:12}}>
          <SHdr>RÉSUMÉ DU MOIS</SHdr>
          {(() => {
            const monthStr = currentMonth.toISOString().slice(0,7);
            const mWorkouts = workouts.filter(w=>w.date.startsWith(monthStr)).length;
            const mRuns = runs.filter(r=>r.date.startsWith(monthStr)).length;
            const mTapis = tapisHistory.filter(t=>t.date.startsWith(monthStr)).length;
            const mEvals = evals.filter(e=>e.date.startsWith(monthStr)).length;
            const mMeals = meals.filter(m=>m.date.startsWith(monthStr)).length;
            return(
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
                {[
                  {icon:"💪", val:mWorkouts, label:"Muscu", c:C.gold},
                  {icon:"🏃", val:mRuns, label:"Course", c:C.blue},
                  {icon:"⚡", val:mTapis, label:"Tapis", c:C.teal},
                  {icon:"🏆", val:mEvals, label:"Tests", c:C.orange},
                  {icon:"🍳", val:mMeals, label:"Repas", c:C.green},
                  {icon:"📅", val:mWorkouts+mRuns+mTapis, label:"Total séances", c:C.purple},
                ].map((s,i)=>(
                  <div key={i} style={{background:C.card2, borderRadius:8, padding:"10px", textAlign:"center"}}>
                    <div style={{fontSize:16}}>{s.icon}</div>
                    <div style={{fontSize:20, fontWeight:700, color:s.c, fontFamily:"Arial"}}>{s.val}</div>
                    <div style={{fontSize:9, color:C.muted, fontFamily:"Arial"}}>{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════
//  DONNÉES — EXPORT / IMPORT / SYNC
// ═══════════════════════════════════════════════════
function Donnees({workouts,runs,measures,meals,reminders,tapisHistory,evals,onImport}) {
  const [importStatus, setImportStatus] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    // Vérifier l'espace disponible
    if(navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(({usage, quota}) => {
        setStorageInfo({used: Math.round(usage/1024), total: Math.round(quota/1024/1024)});
      }).catch(() => {});
    }
  }, []);

  const allData = {workouts, runs, measures, meals, reminders, tapisHistory, evals,
    exportedAt: new Date().toISOString(), version: "2"};

  const handleExport = () => {
    const json = JSON.stringify(allData, null, 2);
    const blob = new Blob([json], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monapp-fitness-${localDateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(!data.workouts && !data.runs && !data.evals) {
          setImportStatus({ok:false, msg:"Fichier invalide — format non reconnu"});
          return;
        }
        onImport(data);
        setImportStatus({ok:true, msg:`✅ Données importées ! ${(data.workouts||[]).length} séances, ${(data.runs||[]).length} courses, ${(data.evals||[]).length} tests.`});
      } catch {
        setImportStatus({ok:false, msg:"❌ Fichier corrompu ou illisible"});
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const totalEntries = workouts.length + runs.length + measures.length + meals.length + tapisHistory.length + evals.length;

  return (
    <div>
      <div style={{background:C.card,padding:"16px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:"Arial"}}>⚙️ Données</div>
        <div style={{fontSize:11,color:C.muted,fontFamily:"Arial"}}>Export · Import · Synchronisation</div>
      </div>
      <div style={{padding:"12px 16px 80px"}}>

        {/* Résumé des données */}
        <Card>
          <SHdr>📊 TES DONNÉES</SHdr>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
            {[
              {icon:"💪",val:workouts.length,label:"Muscu",c:C.gold},
              {icon:"🏃",val:runs.length,label:"Courses",c:C.blue},
              {icon:"⚡",val:tapisHistory.length,label:"Tapis",c:C.teal},
              {icon:"🏆",val:evals.length,label:"Tests",c:C.orange},
              {icon:"🍳",val:meals.length,label:"Repas",c:C.green},
              {icon:"📏",val:measures.length,label:"Mesures",c:C.purple},
            ].map((s,i)=>(
              <div key={i} style={{background:C.card2,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:16}}>{s.icon}</div>
                <div style={{fontSize:18,fontWeight:700,color:s.c,fontFamily:"Arial"}}>{s.val}</div>
                <div style={{fontSize:9,color:C.muted,fontFamily:"Arial"}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",textAlign:"center"}}>
            {totalEntries} entrées au total
            {storageInfo && ` · ${storageInfo.used} Ko utilisés`}
          </div>
        </Card>

        {/* Export */}
        <Card style={{border:`1px solid ${C.gold}33`}}>
          <SHdr color={C.gold}>📤 EXPORTER MES DONNÉES</SHdr>
          <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:12,lineHeight:1.7}}>
            Génère un fichier <strong style={{color:C.text}}>.json</strong> avec toutes tes données.<br/>
            Garde-le en lieu sûr ou transfère-le sur un autre appareil.
          </div>
          <Btn onClick={handleExport} color={C.gold} style={{width:"100%"}}>
            📥 Télécharger mon fichier de données
          </Btn>
        </Card>

        {/* Import */}
        <Card style={{border:`1px solid ${C.blue}33`}}>
          <SHdr color={C.blue}>📂 IMPORTER DES DONNÉES</SHdr>
          <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",marginBottom:12,lineHeight:1.7}}>
            Charge un fichier exporté depuis un autre appareil.<br/>
            <strong style={{color:C.red}}>⚠️ Remplace toutes les données actuelles.</strong>
          </div>
          {importStatus && (
            <div style={{background:importStatus.ok?"#DCFCE7":"#FEE2E2",border:`1px solid ${importStatus.ok?C.green:C.red}44`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,color:importStatus.ok?C.green:C.red,fontFamily:"Arial"}}>
              {importStatus.msg}
            </div>
          )}
          <label style={{display:"block",width:"100%",background:C.blue,color:"#fff",borderRadius:10,padding:"12px 20px",fontSize:14,fontWeight:700,fontFamily:"Arial",cursor:"pointer",textAlign:"center",boxSizing:"border-box"}}>
            📂 Choisir un fichier .json
            <input type="file" accept=".json" onChange={handleImport} style={{display:"none"}}/>
          </label>
        </Card>

        {/* Comment synchroniser */}
        <Card style={{background:"#EEF1FA",border:`1px solid ${C.blue}22`}}>
          <SHdr color={C.blue}>💡 COMMENT SYNCHRONISER ENTRE APPAREILS</SHdr>
          <div style={{fontSize:12,color:"#3B82F6",fontFamily:"Arial",lineHeight:2}}>
            1. Sur l'appareil A → <strong style={{color:C.text}}>Exporter</strong> le fichier<br/>
            2. Envoie-le par <strong style={{color:C.text}}>WhatsApp, Mail ou Drive</strong><br/>
            3. Sur l'appareil B → <strong style={{color:C.text}}>Importer</strong> le fichier reçu<br/>
            <span style={{fontSize:10,color:C.muted}}>Sync automatique possible avec un backend — contacte le dev.</span>
          </div>
        </Card>

        {/* Stockage utilisé */}
        <Card style={{background:"#DCFCE7",border:`1px solid ${C.green}22`}}>
          <SHdr color={C.green}>💾 STOCKAGE</SHdr>
          <div style={{fontSize:12,color:C.muted,fontFamily:"Arial",lineHeight:1.8}}>
            ✅ <strong style={{color:C.green}}>IndexedDB</strong> — persistant même après fermeture<br/>
            ✅ <strong style={{color:C.green}}>localStorage</strong> — copie de secours<br/>
            <span style={{fontSize:10,color:C.muted}}>Tes données restent sur ton appareil.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [workouts, setWorkouts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [meals, setMeals] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [tapisHistory, setTapisHistory] = useState([]);
  const [evals, setEvals] = useState([]);
  const [wellness, setWellness] = useState([]);
  const [waistGoal, setWaistGoalState] = useState(85);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  // ── CHARGEMENT AU DÉMARRAGE ───────────────────────
  useEffect(()=>{
    const loadAll = async () => {
      const [w,r,m,ml,rm,t,ev,wl] = await Promise.all([
        dbLoad(KEYS.workouts, []),
        dbLoad(KEYS.runs, []),
        dbLoad(KEYS.measures, []),
        dbLoad(KEYS.meals, []),
        dbLoad(KEYS.reminders, []),
        dbLoad(KEYS.tapis, []),
        dbLoad(KEYS.evals, []),
        dbLoad(KEYS.wellness, []),
      ]);
      setWorkouts(w); setRuns(r); setMeasures(m); setMeals(ml);
      setReminders(rm); setTapisHistory(t); setEvals(ev); setWellness(wl);
      // Charger objectif ventre
      try {
        const g = await idbGet("gend_v2_waistGoal");
        if(g) setWaistGoalState(parseFloat(g)||85);
        else { const gl = localStorage.getItem("gend_v2_waistGoal"); if(gl) setWaistGoalState(parseFloat(gl)||85); }
      } catch {}
      setLoaded(true);
    };
    loadAll();
  },[]);

  const setWaistGoal = async (g) => {
    setWaistGoalState(g);
    try { await idbSet("gend_v2_waistGoal", String(g)); } catch {}
    try { localStorage.setItem("gend_v2_waistGoal", String(g)); } catch {}
  };

  // ── RAPPELS ACTIFS ─────────────────────────────────
  useEffect(()=>{
    if(!reminders.length) return;
    const check=()=>{
      if(!("Notification" in window)||Notification.permission!=="granted") return;
      const now=new Date();
      const hm=`${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
      reminders.filter(r=>r.active&&r.time===hm&&r.days?.includes(now.getDay())).forEach(r=>{
        new Notification(`${r.emoji||"🔔"} ${r.label}`,{body:"Programme Mayotte"});
      });
    };
    const iv=setInterval(check,60000);
    return()=>clearInterval(iv);
  },[reminders]);

  // ── SAUVEGARDE AVEC FEEDBACK ───────────────────────
  const withSave = async (setter, key, arr) => {
    setter(arr);
    const ok = await dbSave(key, arr);
    setSaveStatus(ok?"✅ Sauvegardé":"⚠️ Erreur save");
    setTimeout(()=>setSaveStatus(""), 2000);
  };

  const saveWorkout  = async (s) => withSave(setWorkouts,  KEYS.workouts,  [...workouts, s]);
  const saveRun      = async (r) => withSave(setRuns,      KEYS.runs,      [...runs, r]);
  const saveMeasure  = async (m) => withSave(setMeasures,  KEYS.measures,  [...measures, m]);
  const saveMeal     = async (m) => withSave(setMeals,     KEYS.meals,     [...meals, m]);
  const saveReminder = async (r) => withSave(setReminders, KEYS.reminders, [...reminders, r]);
  const saveTapis    = async (t) => withSave(setTapisHistory, KEYS.tapis,  [...tapisHistory, t]);
  const saveEval     = async (e) => withSave(setEvals,     KEYS.evals,     [...evals, e]);
  const saveWellness = async (w) => withSave(setWellness,  KEYS.wellness,  [...wellness, w]);

  const deleteReminder = async (id) => withSave(setReminders, KEYS.reminders, reminders.filter(r=>r.id!==id));
  const toggleReminder = async (id) => withSave(setReminders, KEYS.reminders, reminders.map(r=>r.id===id?{...r,active:!r.active}:r));

  const handleImport = async (data) => {
    const w  = Array.isArray(data.workouts)    ? data.workouts    : workouts;
    const r  = Array.isArray(data.runs)        ? data.runs        : runs;
    const m  = Array.isArray(data.measures)    ? data.measures    : measures;
    const ml = Array.isArray(data.meals)       ? data.meals       : meals;
    const rm = Array.isArray(data.reminders)   ? data.reminders   : reminders;
    const t  = Array.isArray(data.tapisHistory)? data.tapisHistory: tapisHistory;
    const ev = Array.isArray(data.evals)       ? data.evals       : evals;
    setWorkouts(w);  setRuns(r);  setMeasures(m);  setMeals(ml);
    setReminders(rm); setTapisHistory(t); setEvals(ev);
    await Promise.all([
      dbSave(KEYS.workouts, w), dbSave(KEYS.runs, r), dbSave(KEYS.measures, m),
      dbSave(KEYS.meals, ml),   dbSave(KEYS.reminders, rm),
      dbSave(KEYS.tapis, t),    dbSave(KEYS.evals, ev),
    ]);
  };

  const NAV = [
    {id:"dashboard",  icon:"🏠", label:"Accueil"},
    {id:"seances",    icon:"💪", label:"Muscu"},
    {id:"course",     icon:"🏃", label:"Course"},
    {id:"tapis",      icon:"⚡", label:"Tapis"},
    {id:"evals",      icon:"🏆", label:"Tests"},
    {id:"mesures",    icon:"📏", label:"Mesures"},
    {id:"calendrier", icon:"📅", label:"Agenda"},
    {id:"donnees",    icon:"⚙️", label:"Données"},
  ];

  if(!loaded) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:44}}>💪</div>
      <div style={{color:C.gold,fontFamily:"Arial",fontSize:14}}>Chargement de tes données...</div>
      <div style={{color:C.muted,fontFamily:"Arial",fontSize:11}}>Connexion au stockage persistant</div>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto",position:"relative"}}>
      {/* Indicateur de sauvegarde */}
      {saveStatus&&(
        <div style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",background:C.card2,border:`1px solid ${saveStatus.includes("✅")?C.green:C.red}`,borderRadius:20,padding:"6px 16px",fontSize:12,color:saveStatus.includes("✅")?C.green:C.red,fontFamily:"Arial",zIndex:999,whiteSpace:"nowrap"}}>
          {saveStatus}
        </div>
      )}

      <div style={{paddingBottom:65}}>
        {screen==="dashboard" && <Dashboard workouts={workouts} runs={runs} measures={measures} meals={meals} tapisHistory={tapisHistory} evals={evals} onNav={setScreen} waistGoal={waistGoal} onSetWaistGoal={setWaistGoal}/>}
        {screen==="seances"   && <Seances workouts={workouts} onSave={saveWorkout} onSaveWellness={saveWellness}/>}
        {screen==="course"    && <Course runs={runs} onSave={saveRun}/>}
        {screen==="tapis"     && <Tapis tapisHistory={tapisHistory} onSaveTapis={saveTapis} onSaveWellness={saveWellness}/>}
        {screen==="evals"     && <Evaluations evals={evals} onSave={saveEval}/>}
        {screen==="mesures"   && <Mesures measures={measures} onSave={saveMeasure}/>}
        {screen==="repas"     && <Repas meals={meals} onSave={saveMeal}/>}
        {screen==="rappels"   && <Rappels reminders={reminders} onSave={saveReminder} onDelete={deleteReminder} onToggle={toggleReminder}/>}
        {screen==="calendrier" && <Calendrier workouts={workouts} runs={runs} tapisHistory={tapisHistory} meals={meals} evals={evals} measures={measures} onSaveWorkout={saveWorkout} onSaveRun={saveRun} onSaveTapis={saveTapis} onSaveMeal={saveMeal} onSaveMeasure={saveMeasure} onSaveEval={saveEval}/>}
        {screen==="donnees"    && <Donnees workouts={workouts} runs={runs} measures={measures} meals={meals} reminders={reminders} tapisHistory={tapisHistory} evals={evals} onImport={handleImport}/>}
      </div>	
           {/* Barre navigation */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.bg,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setScreen(n.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"8px 2px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:1,borderTop:`2px solid ${screen===n.id?C.gold:"transparent"}`}}>
            <span style={{fontSize:15}}>{n.icon}</span>
            <span style={{fontSize:7,color:screen===n.id?C.gold:"#94A3B8",fontFamily:"Arial"}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}