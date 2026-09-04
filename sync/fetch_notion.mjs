// Notion의 두 데이터소스(취업 공고 트래커 / 스킬 개발 트래커)를 읽어
// data/jobs.json, data/skills.json 으로 저장하는 스크립트.
// 실행: NOTION_TOKEN=secret_xxx node sync/fetch_notion.mjs
// Node 18+ (전역 fetch 사용)

import { writeFileSync, mkdirSync } from "fs";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2025-09-03";

// 두 데이터소스의 ID. 다른 DB를 쓰고 싶으면 이 값만 바꾸면 됩니다.
const JOBS_DATA_SOURCE_ID = "ea770134-cd53-48bf-8da4-bb77da4a5a50";
const SKILLS_DATA_SOURCE_ID = "ce92a03c-5b4e-4b00-ba83-4885d3c46798";
const EVENTS_DATA_SOURCE_ID = "48efd254-0a54-420a-8fed-d9b33caf62a3";

async function queryDataSource(dsId) {
  let results = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dsId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    if (!res.ok) {
      throw new Error(`Notion API 오류 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function val(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return prop.title.map((t) => t.plain_text).join("");
    case "rich_text":
      return prop.rich_text.map((t) => t.plain_text).join("");
    case "select":
      return prop.select?.name ?? null;
    case "multi_select":
      return prop.multi_select.map((o) => o.name);
    case "url":
      return prop.url;
    case "number":
      return prop.number;
    case "date":
      return prop.date?.start ?? null;
    default:
      return null;
  }
}

function mapJob(page) {
  const p = page.properties;
  return {
    id: page.id,
    title: val(p["공고명"]),
    company: val(p["회사"]),
    location: val(p["위치"]),
    size: val(p["회사규모"]),
    employment: val(p["고용형태"]),
    deadline: val(p["마감일"]),
    status: val(p["상태"]),
    priority: val(p["우선순위"]),
    score: val(p["적합도 점수"]),
    fields: val(p["직무분야"]),
    link: val(p["링크"]),
  };
}

function mapSkill(page) {
  const p = page.properties;
  let steps = [];
  let note = "";
  const raw = val(p["체크리스트_JSON"]);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      steps = parsed.steps || [];
      note = parsed.note || "";
    } catch { /* 무시: 형식이 깨졌으면 빈 값으로 */ }
  }
  return {
    id: page.id,
    name: val(p["항목명"]),
    category: val(p["카테고리"]),
    goal: val(p["목표"]),
    method: val(p["학습방법"]),
    status: val(p["상태"]),
    startDate: val(p["시작일"]),
    targetDate: val(p["목표일_시험일"]),
    weeklyHours: val(p["주간 목표 학습시간(h)"]),
    progress: val(p["진행률(%)"]) || 0,
    steps,
    note,
  };
}

function mapEvent(page) {
  const p = page.properties;
  let steps = [];
  let done = false;
  const raw = val(p["체크리스트_JSON"]);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      steps = parsed.steps || [];
      done = !!parsed.done;
    } catch { /* 무시 */ }
  }
  return {
    id: page.id,
    title: val(p["제목"]),
    date: val(p["날짜"]),
    note: val(p["메모"]),
    category: val(p["카테고리"]) || "개인일정",
    steps,
    done,
  };
}

async function main() {
  if (!NOTION_TOKEN) {
    console.error("NOTION_TOKEN 환경변수가 없습니다. GitHub Secrets에 등록되었는지 확인하세요.");
    process.exit(1);
  }
  mkdirSync("data", { recursive: true });

  const jobPages = await queryDataSource(JOBS_DATA_SOURCE_ID);
  writeFileSync(
    "data/jobs.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), jobs: jobPages.map(mapJob) }, null, 2)
  );

  const skillPages = await queryDataSource(SKILLS_DATA_SOURCE_ID);
  writeFileSync(
    "data/skills.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), skills: skillPages.map(mapSkill) }, null, 2)
  );

  const eventPages = await queryDataSource(EVENTS_DATA_SOURCE_ID);
  writeFileSync(
    "data/events.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), events: eventPages.map(mapEvent) }, null, 2)
  );

  console.log(`동기화 완료: 공고 ${jobPages.length}건, 스킬 ${skillPages.length}건, 개인일정 ${eventPages.length}건`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
