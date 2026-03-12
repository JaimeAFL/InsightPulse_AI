# InsightPulse AI

Aplicación web ligera para **consultar informes de negocio en lenguaje natural** y obtener una respuesta accionable con:

- KPIs priorizados por relevancia.
- Visualización automática (barras, líneas, pie o doughnut).
- Tabla de soporte para validar resultados.
- Explicación textual lista para compartir.

> Si vienes por curiosidad: este proyecto convierte una pregunta tipo *“¿qué producto fue clave el último mes en Madrid?”* en un resumen visual útil para decisiones rápidas.

---

## Enlace a la aplicacion web

https://pagina-web-informe2.vercel.app/

---

## ¿Para qué sirve?

`InsightPulse AI` está pensado para equipos que necesitan transformar datos en decisiones sin montar una plataforma pesada de BI.

Permite:

- Consultar información de negocio desde una interfaz web simple.
- Estandarizar la salida para que siempre venga en formato útil (KPIs + gráfico + tabla + explicación).
- Reducir el tiempo entre “tengo una duda” y “tengo una conclusión con contexto”.

---

## Casos de uso

- **Retail / Ventas:** identificar producto estrella, tiendas con mejor evolución o caídas relevantes.
- **Operaciones:** detectar anomalías por sede, región o período.
- **Dirección / Management:** obtener resúmenes ejecutivos rápidos con foco en impacto económico.
- **Equipos de datos:** prototipar un asistente analítico antes de escalar a una solución enterprise.

Ejemplos de preguntas:

- “¿Qué categoría creció más en el último trimestre y con qué confianza?”
- “Compárame mes vs mes en el punto de venta 22.”
- “¿Dónde hay señales de caída respecto al objetivo?”

---

## ¿Cómo se utiliza?

### 1) Requisitos

- Node.js 18+.
- Cuenta y clave de OpenAI.
- Un Assistant creado en OpenAI (Assistants v2).

### 2) Configuración de entorno

Define estas variables en tu entorno (local o Vercel):

```bash
OPENAI_API_KEY=tu_api_key
ASSISTANT_ID=asst_xxxxx
```

### 3) Ejecutar en local

Este repo está preparado con estructura de funciones serverless (`/api`) y frontend estático (`/public`).

Opciones recomendadas:

- **Vercel (recomendado):** importar el repositorio, configurar variables de entorno y desplegar.
- **Local:** servir `public/` y exponer `api/ask` y `api/ping` con un runtime compatible con funciones serverless.

### 4) Flujo de uso en la UI

1. Escribe una pregunta de negocio.
2. Pulsa **Preguntar**.
3. Recibe:
   - Indicadores KPI.
   - Gráfico interactivo.
   - Tabla de datos.
   - Explicación resumida (copiable).

---

## Características técnicas

- **Frontend sin framework** (HTML + JS vanilla).
- **Estilos con Tailwind CDN** para iteración rápida.
- **Gráficas con Chart.js**.
- **Backend serverless** en `/api/ask` y `/api/ping`.
- Integración con **OpenAI Assistants v2** vía HTTP.
- Contrato de salida reforzado para exigir JSON estructurado con:
  - `explicacion`
  - `kpis`
  - `grafico`
  - `tabla`
- Normalización y tolerancia a formatos alternativos (fallback para `datasets/values`, tablas y parsing de JSON).
- Filtro de KPIs por muestra mínima, relevancia e impacto para priorizar insights útiles.

---

## Estructura del proyecto

```text
/
├─ api/
│  ├─ ask.js          # POST /api/ask (consulta al assistant + normalización)
│  └─ ping.js         # GET /api/ping (health check)
├─ public/
│  ├─ index.html      # interfaz de consulta
│  └─ demo-response.json
├─ package.json
└─ README.md
```

---

## API rápida

### `POST /api/ask`

Body esperado:

```json
{ "pregunta": "¿Qué producto fue el más relevante en marzo?" }
```

Respuesta esperada (resumen):

```json
{
  "explicacion": "...",
  "kpis": [
    {
      "nombre": "Ingresos",
      "valor": 125000,
      "unidad": "€",
      "periodo": "2025-03",
      "comparacion": { "tipo": "MoM", "valor": 0.18 },
      "muestra": 1200,
      "confianza": 0.92,
      "relevance_score": 0.88
    }
  ],
  "grafico": {
    "tipo": "bar",
    "labels": ["A", "B"],
    "datasets": [{ "label": "Serie 1", "data": [10, 20] }]
  },
  "tabla": []
}
```

### `GET /api/ping`

Endpoint de comprobación de vida.

---

## Nombre alternativo sugerido para el repositorio

Si quieres un nombre más atractivo que invite a entrar:

### **`insightpulse-ai`**

Porque comunica rápido el valor principal: *insights accionables + velocidad + IA*.

Otras opciones cortas:

- `kpi-radar-ai`
- `biz-insights-assistant`
- `report-query-ai`

---

## Disclaimer

- Esta herramienta **no reemplaza** procesos formales de analítica o auditoría.
- Las respuestas dependen de la calidad de los datos y del prompt/contexto del Assistant.
- Puede haber variabilidad en los resultados del modelo entre ejecuciones.
- Recomendado para soporte a decisión, no como única fuente de verdad en decisiones críticas.

