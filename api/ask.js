// /api/ask.js  (sin SDK, Assistants v2 por HTTP)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  const asstId = process.env.ASSISTANT_ID;
  if (!apiKey || !asstId) return res.status(500).json({ error: 'Faltan OPENAI_API_KEY o ASSISTANT_ID' });

  try {
    const { pregunta } = req.body || {};
    if (!pregunta) return res.status(400).json({ error: 'Falta "pregunta"' });

    // --- Helper OpenAI (Assistants v2) ---
    const oi = async (path, method='GET', body=null) => {
      const r = await fetch('https://api.openai.com/v1' + path, {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: body ? JSON.stringify(body) : null
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ` + await r.text());
      return r.json();
    };

    // --- CONTRATO DE SALIDA PARA KPIs RELEVANTES ---
    const contract = `
Devuélveme SOLO un JSON:
{
  "explicacion": "string breve",
  "kpis": [{
    "nombre": "string",
    "valor": number,
    "unidad": "€|%|u|…",
    "periodo": "YYYY-MM|etiqueta",
    "comparacion": {"tipo":"MoM|YoY|vs objetivo","valor": number /*relativo, ej 0.18 = +18%*/},
    "muestra": number,
    "confianza": 0..1,
    "relevance_score": 0..1,
    "justificacion": "criterio cuantitativo breve",
    "dimension": "string",
    "id_dim": "string"
  }],
  "grafico": {
    "tipo": "bar|line|pie|doughnut",
    "labels": ["..."],
    "datasets": [{ "label":"Serie 1", "data":[numbers] }]
    /* si no puedes: {"labels":[...], "values":[...], "label":"Serie 1"} */
  },
  "tabla": [] /* array de objetos, o {headers:[], rows:[[]]} */
}
Reglas KPI: NO incluyas KPIs con muestra<50. Rellena comparacion y relevance_score.
Prioriza impacto económico, cambios significativos, anomalías y objetivo.`;

    // 1) Crear thread con pregunta + contrato
    const thread = await oi('/threads', 'POST', {
      messages: [
        { role: 'user', content: pregunta },
        { role: 'user', content: contract }
      ]
    });

    // 2) Lanzar run del Assistant
    let run = await oi(`/threads/${thread.id}/runs`, 'POST', { assistant_id: asstId });

    // 3) Poll hasta completar
    for (let i=0; i<60 && (run.status==='queued'||run.status==='in_progress'); i++) {
      await sleep(1000);
      run = await oi(`/threads/${thread.id}/runs/${run.id}`);
    }
    if (run.status !== 'completed') {
      return res.status(500).json({ error: `Run ${run.status}`, details: run.last_error || null });
    }

    // 4) Leer mensajes del hilo
    const msgs = await oi(`/threads/${thread.id}/messages?order=desc&limit=5`);
    const firstAssistant = (msgs.data||[]).find(m => m.role === 'assistant');
    const text = (firstAssistant?.content||[])
      .filter(c=>c.type==='text')
      .map(c=>c.text.value)
      .join('\n')
      .trim();

    // 5) Parsear y normalizar + seleccionar KPIs relevantes
    const raw = safeParseJSON(text) || { explicacion: text || 'Sin contenido', kpis: [], grafico:{}, tabla: [] };
    const data = normalizeAll(raw);
    data.kpis = selectTopKpis(data);

    return res.status(200).json(data);

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}

/* ================= Utils ================= */

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function safeParseJSON(s){
  if (!s) return null;
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = f ? f[1] : s;
  try { return JSON.parse(c); } catch {}
  const a=c.indexOf('{'), b=c.lastIndexOf('}'); if(a>=0&&b>a){ try{ return JSON.parse(c.slice(a,b+1)); }catch{} }
  return null;
}

function normalizeAll(raw){
  const out = { ...raw };

  // Gráfico -> datasets[]
  const g = raw?.grafico || {};
  const labels = Array.isArray(g.labels) ? g.labels : [];
  let datasets = [];
  if (Array.isArray(g.datasets) && g.datasets.length) {
    datasets = g.datasets;
  } else if (Array.isArray(g.values)) {
    datasets = [{ label: g.label || 'Serie 1', data: g.values }];
  }
  out.grafico = { tipo: g.tipo || 'bar', labels, datasets };

  // Tabla -> array de objetos
  const tb = raw?.tabla;
  if (Array.isArray(tb)) {
    out.tabla = tb;
  } else if (tb?.rows && Array.isArray(tb.rows)) {
    const headers = Array.isArray(tb.headers) ? tb.headers : [];
    out.tabla = tb.rows.map(r => Object.fromEntries(r.map((v,i)=>[headers[i] ?? `Col ${i+1}`, v])));
  } else {
    out.tabla = [];
  }

  // KPIs saneados
  out.kpis = Array.isArray(raw.kpis) ? raw.kpis.map(k => ({
    nombre: k.nombre ?? '',
    valor: Number(k.valor ?? 0),
    unidad: k.unidad ?? '',
    periodo: k.periodo ?? '',
    comparacion: k.comparacion ?? null,
    muestra: Number(k.muestra ?? 0),
    confianza: typeof k.confianza==='number' ? k.confianza : null,
    relevance_score: typeof k.relevance_score==='number' ? k.relevance_score : null,
    justificacion: k.justificacion ?? '',
    dimension: k.dimension ?? '',
    id_dim: k.id_dim ?? ''
  })) : [];

  return out;
}

/* ---------- Selección de KPIs relevantes ---------- */
const KPI_CFG = {
  minRelevance: 0.55,
  minSample: 50,
  weights: { effect: 0.45, trend: 0.30, sample: 0.15, novelty: 0.10 },
  topN: 4,
  priorities: { "Ingresos": 0.08, "Margen": 0.06, "Conversion": 0.06, "Ticket medio": 0.05 }
};

function normAbs(x){ if (!isFinite(x)) return 0; const v=Math.abs(x); return Math.min(1, v/(v+1)); }
function noveltyScore(k){ const t=k?.comparacion?.valor ?? 0; return Math.max(0, Math.min(1, Math.abs(t)*0.6)); }

function scoreKpi(k){
  const effect = normAbs(k.valor ?? 0);
  const trend  = normAbs(k?.comparacion?.valor ?? 0);
  const sample = Math.max(0, Math.min(1, ((k.muestra ?? 0)/1000)));
  const novel  = noveltyScore(k);
  const nameBoost = KPI_CFG.priorities[k.nombre] ?? 0;

  const w = KPI_CFG.weights;
  let s = (effect*w.effect) + (trend*w.trend) + (sample*w.sample) + (novel*w.novelty);
  s = Math.min(1, s + nameBoost);
  if (typeof k.relevance_score === 'number') s = (s*0.6) + (k.relevance_score*0.4);
  return s;
}

function dedupKpis(list){
  const seen = new Map();
  for (const k of list){
    const key = (k.nombre||'').toLowerCase()+'|'+(k.id_dim||'')+'|'+(k.periodo||'');
    const s = scoreKpi(k);
    if (!seen.has(key) || s > seen.get(key).__score) { k.__score = s; seen.set(key, k); }
  }
  return [...seen.values()];
}

function deriveKpisFromData(data){
  const extra = [];
  // Suma de la primera serie del gráfico
  const serie = Array.isArray(data.grafico?.datasets?.[0]?.data) ? data.grafico.datasets[0].data : [];
  if (serie.length){
    extra.push({
      nombre: data.grafico.datasets[0].label || 'Total serie 1',
      valor: serie.reduce((a,b)=>a+(+b||0),0),
      unidad: '',
      comparacion: { tipo: '—', valor: 0 },
      muestra: serie.length,
      relevance_score: 0.6,
      justificacion: 'Suma de la serie'
    });
  }
  // Tamaño de muestra de tabla
  const filas = Array.isArray(data.tabla) ? data.tabla.length : 0;
  if (filas){
    extra.push({
      nombre: 'Filas en tabla',
      valor: filas,
      unidad: '',
      comparacion: { tipo: '—', valor: 0 },
      muestra: filas,
      relevance_score: 0.55,
      justificacion: 'Tamaño de muestra de la tabla'
    });
  }
  return extra;
}

function selectTopKpis(data){
  const incoming = Array.isArray(data.kpis) ? data.kpis.slice() : [];
  // Añade derivados si vienen pocos
  if (incoming.length < KPI_CFG.topN) incoming.push(...deriveKpisFromData(data));

  return dedupKpis(incoming)
    .filter(k => (k.muestra ?? 1) >= KPI_CFG.minSample)
    .filter(k => (k.relevance_score ?? 0) >= (KPI_CFG.minRelevance - 0.10) || scoreKpi(k) >= KPI_CFG.minRelevance)
    .sort((a,b) => scoreKpi(b) - scoreKpi(a))
    .slice(0, KPI_CFG.topN)
    .map(k => { delete k.__score; return k; });
}
