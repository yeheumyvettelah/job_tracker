// Cloudflare Worker: 브라우저에서 Notion 토큰을 직접 다루지 않도록,
// 이 워커가 대신 Notion API를 호출합니다.
// 필요한 환경변수(Settings > Variables and Secrets):
//   NOTION_TOKEN  (secret)  - Notion integration의 Internal Integration Secret
//   APP_SECRET    (secret)  - 아무 문자열이나 정해서 프론트엔드와 맞춰줌 (완전한 보안은 아니고, 최소한의 접근 제한)
//   ALLOWED_ORIGIN (변수, 선택) - 예: https://내계정.github.io  (비워두면 전체 허용)

const NOTION_VERSION = "2025-09-03";
const JOBS_DS = "ea770134-cd53-48bf-8da4-bb77da4a5a50";
const SKILLS_DS = "ce92a03c-5b4e-4b00-ba83-4885d3c46798";
const EVENTS_DS = "48efd254-0a54-420a-8fed-d9b33caf62a3";

function corsHeaders(env){
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
function json(obj, status, headers){
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
const rt = (s) => (s == null || s === "") ? [] : [{ type: "text", text: { content: String(s) } }];
const dateVal = (d) => (d ? { start: d } : null);

async function notion(env, path, method, body){
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function handle(body, env){
  const { action, payload } = body;
  switch (action) {
    case "updateJobStatus":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: { "상태": { select: { name: payload.status } } },
      });
    case "updateJobDeadline":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: { "마감일": { date: dateVal(payload.deadline) } },
      });
    case "updateSkillState":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: {
          "진행률(%)": { number: payload.progress },
          "체크리스트_JSON": { rich_text: rt(JSON.stringify({ steps: payload.steps, note: payload.note })) },
        },
      });
    case "updateSkillMeta":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: {
          ...(payload.name !== undefined ? { "항목명": { title: rt(payload.name) } } : {}),
          ...(payload.category !== undefined ? { "카테고리": { select: { name: payload.category } } } : {}),
          ...(payload.goal !== undefined ? { "목표": { rich_text: rt(payload.goal) } } : {}),
          ...(payload.targetDate !== undefined ? { "목표일_시험일": { date: dateVal(payload.targetDate) } } : {}),
          ...(payload.weeklyHours !== undefined ? { "주간 목표 학습시간(h)": { number: payload.weeklyHours } } : {}),
        },
      });
    case "updateSkillTargetDate":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: { "목표일_시험일": { date: dateVal(payload.targetDate) } },
      });
    case "createSkill":
      return notion(env, `/pages`, "POST", {
        parent: { type: "data_source_id", data_source_id: SKILLS_DS },
        properties: {
          "항목명": { title: rt(payload.name) },
          "카테고리": { select: { name: payload.category } },
          "목표": { rich_text: rt(payload.goal) },
          "목표일_시험일": { date: dateVal(payload.targetDate) },
          "주간 목표 학습시간(h)": { number: payload.weeklyHours ?? null },
          "상태": { select: { name: "계획중" } },
          "진행률(%)": { number: 0 },
          "체크리스트_JSON": { rich_text: rt(JSON.stringify({ steps: [], note: "" })) },
        },
      });
    case "deleteSkill":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", { archived: true });
    case "createEvent":
      return notion(env, `/pages`, "POST", {
        parent: { type: "data_source_id", data_source_id: EVENTS_DS },
        properties: {
          "제목": { title: rt(payload.title) },
          "날짜": { date: dateVal(payload.date) },
          "메모": { rich_text: rt(payload.note) },
          "카테고리": { select: { name: payload.category || "개인일정" } },
          "체크리스트_JSON": { rich_text: rt(JSON.stringify({ done: false, steps: payload.steps || [] })) },
        },
      });
    case "updateEvent":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: {
          ...(payload.title !== undefined ? { "제목": { title: rt(payload.title) } } : {}),
          ...(payload.date !== undefined ? { "날짜": { date: dateVal(payload.date) } } : {}),
          ...(payload.note !== undefined ? { "메모": { rich_text: rt(payload.note) } } : {}),
          ...(payload.category !== undefined ? { "카테고리": { select: { name: payload.category } } } : {}),
        },
      });
    case "updateEventChecklist":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", {
        properties: {
          "체크리스트_JSON": { rich_text: rt(JSON.stringify({ done: !!payload.done, steps: payload.steps || [] })) },
        },
      });
    case "deleteEvent":
      return notion(env, `/pages/${payload.pageId}`, "PATCH", { archived: true });
    default:
      throw new Error("알 수 없는 action: " + action);
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(env);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return json({ error: "POST만 지원합니다." }, 405, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "잘못된 JSON 입니다." }, 400, headers); }

    if (!env.APP_SECRET || body.secret !== env.APP_SECRET) {
      return json({ error: "인증 실패 (APP_SECRET 불일치)" }, 401, headers);
    }

    try {
      const result = await handle(body, env);
      return json({ ok: true, result }, 200, headers);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) }, 500, headers);
    }
  },
};
