'use client';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const quickPromptsKo = [
  '내일 일정을 계획해 줘',
  '오늘 커피에 4,500원을 썼어',
  '내일 오후 3시에 Python 공부',
  '냉장고 식재료를 어떻게 활용하면 좋을까?',
];

const quickPromptsZh = [
  '帮我安排明天',
  '今天咖啡花了4500韩元',
  '明天下午3点学习Python',
  '冰箱里的食材怎么安排比较好？',
];

const emptyData = { schedules: [], expenses: [], ingredients: [], tasks: [], preferences: [], pending_actions: [], history: [], expense_total: 0 };

function snapshot(d) {
  return {
    schedules: d?.schedules?.length || 0,
    tasks: d?.tasks?.length || 0,
    ingredients: d?.ingredients?.length || 0,
    expenses: d?.expenses?.length || 0,
    expense_total: Number(d?.expense_total || 0),
  };
}

function formatDelta(value, lang) {
  if (!value) return lang === 'zh' ? '无变化' : '변화 없음';
  return `${value > 0 ? '+' : ''}${value}`;
}

export default function Home() {
  const [data, setData] = useState(emptyData);
  const [message, setMessage] = useState('내일 일정을 계획해 줘');
  const [reply, setReply] = useState('');
  const [trace, setTrace] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('demo');
  const [beforeContext, setBeforeContext] = useState(null);
  const [afterContext, setAfterContext] = useState(null);
  const [lastDecision, setLastDecision] = useState('Agent 요청 대기');
  const [visionKind, setVisionKind] = useState('receipt');
  const [visionResult, setVisionResult] = useState(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionError, setVisionError] = useState('');
  const [dailyPlan, setDailyPlan] = useState(null);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [decisionInput, setDecisionInput] = useState({title:'병원 가기', proposed_at:'내일 15:00', duration_minutes:60});
  const [decisionResult, setDecisionResult] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [manageKind, setManageKind] = useState('schedule');
  const [manageForm, setManageForm] = useState({title:'', scheduled_at:'내일 09:00', priority:'medium', due_at:'이번 주', item:'', amount:'', category:'생활', name:'', quantity:'1', expires_on:''});
  const [manageNotice, setManageNotice] = useState('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({username:'demo', password:'demo1234', display_name:'Demo User'});
  const [authError, setAuthError] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const [visionPreview, setVisionPreview] = useState('');
  const [defenseSummary, setDefenseSummary] = useState(null);
  const [defenseBusy, setDefenseBusy] = useState(false);
  const [lang, setLang] = useState('ko');
  const quickPrompts = lang === 'zh' ? quickPromptsZh : quickPromptsKo;
  const L = (ko, zh) => lang === 'zh' ? zh : ko;

  // Backend demo/rule-engine payloads are intentionally language-neutral at the API boundary,
  // but older v1.2 responses contain Korean explanatory text. In Chinese UI mode every
  // backend-originated display string is normalized here so interaction results never leak Korean.
  const T = (value) => {
    if (value === null || value === undefined) return '';
    if (lang !== 'zh' || typeof value !== 'string') return value;
    let out = value;
    const replacements = [
      ['개인 생활 Context를 읽고 일정, 지출, 할 일, 식재료 작업을 처리할 수 있습니다. “내일 일정을 계획해 줘” 또는 “오늘 커피에 4,500원을 썼어”를 시도해 보세요.','可以读取个人生活 Context，并处理日程、支出、待办和食材操作。可以尝试“帮我安排明天”或“今天咖啡花了4500韩元”。'],
      ['개인 생활 Context를 바탕으로 계획을 구성했습니다.','已根据个人生活 Context 生成计划。'], ['현재 일정:','当前日程：'], ['제안:','建议：'],
      ['고정 일정을 우선 유지하고 빈 시간에 우선순위가 높은 할 일을 배치하며 휴식 시간을 확보하세요.','优先保留固定日程，把高优先级待办安排到空闲时间，并预留休息时间。'],
      ['이 지출을 기록할 준비가 되었습니다:','已准备记录这笔支出：'], ['확인 후 데이터베이스에 저장됩니다.','确认后将保存到数据库。'],
      ['지출 기록 요청으로 인식했지만 명확한 금액을 찾지 못했습니다. 금액을 입력해 주세요.','已识别为支出记录请求，但未找到明确金额。请输入金额。'],
      ['일정 생성 준비:','已准备创建日程：'], ['고정 일정 없음','暂无固定日程'], ['할 일 없음','暂无待办'], ['선호 없음','暂无偏好'],
      ['유효기간이 기록된 식재료가 없습니다','没有记录有效期的食材'], ['냉장고 Context를 읽었습니다:','已读取冰箱 Context：'], ['확인된 이미지 인식 결과는 통합 생활 계획에 반영됩니다.','已确认的图片识别结果会纳入综合生活计划。'],
      ['확인 필요 / TBD','需要确认 / TBD'], ['Agent 식재료 저장','Agent 保存食材'], ['Agent 확인 실행','Agent 确认执行'],
      ['Agent 요청 대기','等待 Agent 请求'], ['컴퓨터공학 수업','计算机工程课程'], ['졸업작품 회의','毕业设计会议'], ['졸업작품 요구사항 정리','整理毕业设计需求'],
      ['Python 복습','Python 复习'], ['병원 가기','去医院'], ['커피','咖啡'], ['편의점','便利店'], ['달걀','鸡蛋'], ['우유','牛奶'], ['토마토','番茄'],
      ['식비','餐饮'], ['생활','生活'], ['6개','6个'], ['1팩','1盒'], ['3개','3个'], ['3일 후','3天后'], ['4일 후','4天后'], ['2일 후','2天后'],
      ['내일','明天'], ['오늘','今天'], ['이번 주','本周'], ['고정','固定'], ['빈 시간 1','空闲时间 1'], ['빈 시간','空闲时间'],
      ['첫 집중 블록 설정','设置首个专注时段'], ['기존 일정','已有日程'], ['우선순위 높은 할 일','高优先级待办'],
      ['유통기한 임박 식재료 우선 사용','优先使用临期食材'], ['보유 식재료로 한 끼 해결','使用现有食材安排一餐'],
      ['지출 의사결정','支出决策'], ['보유 자원을 우선 활용해 불필요한 즉흥 지출을 줄이기','优先利用现有资源，减少不必要的临时支出'],
      ['실행 규칙','执行规则'], ['개인 선호에 맞춰 집중과 마무리 배치','根据个人偏好安排专注与收尾'],
      ['Personal Context를 보강한 뒤 정교한 계획 생성','补充 Personal Context 后生成更精确的计划'],
      ['Schedule Context:','Schedule Context：'], ['고정 약속을 우선 유지합니다.','优先保留固定安排。'],
      ['고정 일정이 없어 우선순위가 높은 할 일을 위한 집중 시간을 먼저 확보합니다.','当前没有固定日程，先为高优先级待办预留专注时间。'],
      ['우선순위','优先级'], ['마감','截止时间'], ['미설정','未设置'],
      ['Ingredient Context에 유효기간이 기록된 식재료가 있어 먼저 사용하면 낭비를 줄일 수 있습니다.','Ingredient Context 中存在记录了有效期的食材，优先使用可以减少浪费。'],
      ['냉장고 Context를 활용해 추가 구매를 줄이고 실제 재고에 맞춰 식사를 제안합니다.','利用冰箱 Context 减少额外购买，并根据实际库存给出餐食建议。'],
      ['Expense Context 누적 기록은','Expense Context 累计记录为'], ['입니다. 이 규칙은 알림만 제공하며 사용자의 예산을 대신 정하지 않습니다.','。该规则只提供提醒，不替用户决定预算。'],
      ['구조화 생활 데이터가 부족하여 존재하지 않는 일정, 예산, 재고를 만들어내지 않습니다.','结构化生活数据不足，因此不会虚构不存在的日程、预算或库存。'],
      ['일정','日程'], ['할 일','待办'], ['식재료','食材'], ['지출','支出'], ['선호','偏好'],
      ['고정 일정을 우선하고 우선순위가 높은 할 일을 빈 시간에 배치해 모든 작업이 한곳에 몰리지 않도록 합니다.','优先保留固定日程，并把高优先级待办安排到空闲时间，避免所有任务集中在同一时段。'],
      ['유통기한 임박 식재료를 감지하여 식사 제안에 재고를 우선 활용합니다.','检测临期食材，并在餐食建议中优先利用现有库存。'],
      ['일반 템플릿 대신 개인 선호를 실행 제약으로 사용합니다.','不使用通用模板，而是把个人偏好作为执行约束。'],
      ['현재 Context가 적어 보수적으로 계획하며 추가 사실을 만들어내지 않습니다.','当前 Context 较少，因此采用保守规划，不额外虚构事实。'],
      ['5개 Personal Context 통합','整合 5 类 Personal Context'], ['사용 Context','使用的 Context'], ['구조화 데이터 없음','无结构化数据'],
      ['교차 도메인 제약 정렬','跨域约束排序'], ['고정 일정을 먼저 유지하고 우선순위가 높은 할 일을 배치하며 식재료, 지출, 선호를 함께 고려합니다.','先保留固定日程，再安排高优先级待办，并同时考虑食材、支出和偏好。'],
      ['읽기 전용 계획','只读计划'], ['이번 계획은 데이터베이스를 직접 수정하지 않습니다.','本次计划不会直接修改数据库。'],
      ['설명 가능한 계획 생성','生成可解释计划'], ['개의 계획 노드를 출력했으며 각 노드에 이유와 Context 신호가 포함됩니다.','个计划节点，每个节点都包含原因与 Context 信号。'],
      ['개 Personal Context를 바탕으로 통합 생활 계획을 생성했습니다.','类 Personal Context 生成了综合生活计划。'],
      ['충돌 회피','避免冲突'], ['우선순위 정렬','优先级排序'], ['임박 식재료 우선','临期食材优先'], ['재고 활용','利用库存'], ['보수적 지출 제안','保守支出建议'], ['개인화','个性化'], ['저 Context 모드','低 Context 模式'],
      ['후보 계획 읽기','读取候选计划'], ['제약 조건 로드','加载约束条件'], ['시간 충돌 감지','检测时间冲突'], ['할 일 우선순위 점수','待办优先级评分'], ['읽기 전용 유지','保持只读'], ['조정안 생성','生成调整方案'],
      ['고정 일정','固定日程'], ['충돌','冲突'], ['위험 점수','风险分数'], ['미완료','未完成'], ['개의 우선순위 점수를 계산했습니다','项优先级分数已计算'],
['분 앞당겨 현재 충돌 구간 회피','分钟前移，避开当前冲突时段'], ['분 늦춰 기존 고정 일정 유지','分钟后移，保留已有固定日程'],
      ['현재 시간대에 고정 일정 충돌이 감지되지 않음','当前时段未检测到固定日程冲突'],
      ['시간 충돌','时间冲突'], ['건을 감지했습니다. 기존 고정 일정을 유지하고','项。建议保留已有固定日程，并调整'], ['시간을 조정하는 것을 권장합니다. 시스템은 일정을 자동 수정하지 않습니다.','的时间。系统不会自动修改日程。'],
      ['명확한 시간을 해석하지 못했습니다.','无法解析明确时间。'], ['형식으로 입력해 주세요.','格式输入。'],
      ['현재 알려진 고정 일정과 충돌하지 않아 후보 계획으로 사용할 수 있습니다. 일정 저장 전 사용자 확인을 권장합니다.','与当前已知固定日程不冲突，可以作为候选计划。保存日程前建议由用户确认。'],
      ['분석은 제안만 생성하며 Schedule / Task 데이터베이스를 수정하지 않습니다.','分析只生成建议，不会修改 Schedule / Task 数据库。'],
      ['사용자 요청 이해','理解用户请求'], ['Personal Context 읽기','读取 Personal Context'], ['교차 모듈 계획','跨模块规划'],
      ['일정, 할 일, 개인 선호를 종합해 제안하며 사용자 데이터를 직접 수정하지 않습니다','综合日程、待办和个人偏好给出建议，不直接修改用户数据'],
      ['개인화 계획 생성','生成个性化计划'], ['읽기 전용 계획 생성 완료 · 쓰기 작업 없음','只读计划已生成 · 无写入操作'],
      ['의도 판단','意图判断'], ['지출 기록 작업으로 인식','识别为支出记录操作'], ['정보 완전성 검사','信息完整性检查'], ['금액이 없어 작업을 생성하지 않음','缺少金额，未创建操作'],
      ['Tool 호출 준비','准备调用 Tool'], ['데이터베이스 쓰기 전 사용자 확인 대기','数据库写入前等待用户确认'],
      ['일정 생성 작업으로 인식','识别为创建日程操作'], ['일정 변경 전 사용자 확인 대기','修改日程前等待用户确认'],
      ['식사·식재료 작업으로 인식','识别为餐食/食材操作'], ['식재료 Context 읽기','读取食材 Context'], ['일반 생활 도우미','通用生活助手'], ['쓰기 작업이 필요한 명확한 의도를 감지하지 못함','未检测到需要写入操作的明确意图'],
      ['Agent 의사결정','Agent 决策'], ['일정 생성 필요','需要创建日程'], ['지출 기록 필요','需要记录支出'], ['Tool 준비','准备 Tool'], ['확인 대기','等待确认'], ['응답 생성','生成响应'], ['Personal Context 기반 결과 반환','返回基于 Personal Context 的结果'],
      ['작업을 취소했습니다. 생활 데이터는 변경되지 않았습니다.','操作已取消，生活数据未发生变化。'], ['확인 후 실행했습니다. Personal Context가 업데이트되었습니다.','确认后已执行，Personal Context 已更新。'],
      ['이미지 인식 지출 기록','图像识别支出记录'], ['인식된 식재료','识别到的食材'], ['종을 냉장고 Context에 저장','类保存到冰箱 Context'],
      ['일정 생성','创建日程'], ['지출 기록','记录支出'], ['식재료 추가','添加食材'], ['할 일 생성','创建待办'], ['선호 설정','设置偏好'], ['일정 수정','修改日程'], ['일정 삭제','删除日程'], ['할 일 업데이트','更新待办'], ['할 일 삭제','删除待办'], ['지출 수정','修改支出'], ['지출 삭제','删除支出'], ['식재료 수정','修改食材'], ['식재료 삭제','删除食材'], ['실행 취소','撤销操作'],
      ['50분 집중 + 10분 휴식 선호','偏好 50 分钟专注 + 10 分钟休息'], ['23:30 이전에 고강도 작업 종료','23:30 前结束高强度任务'],
      ['내일 10:00','明天 10:00'], ['내일 15:30','明天 15:30'], ['내일 15:00','明天 15:00'], ['내일 09:00','明天 09:00'],
      ['겹치는 일정 감지','检测日程冲突'], ['비충돌 일정 과잉 경고 방지','避免无冲突日程的过度警告'], ['한국어·중국어 오후 시간 파싱','中韩下午时间解析'],
      ['할 일 우선순위 단조성','待办优先级顺序验证'], ['마감 긴급도','截止时间紧迫度验证'], ['5개 Context 커버리지','5类 Context 覆盖率'],
      ['계획 노드 설명 근거','计划节点依据验证'], ['계획 읽기 전용 유지','保持计划只读'], ['현재 사용자 Context 격리','当前用户 Context 隔离'],
      ['확인 대기 작업 사용자 격리','待确认操作的用户隔离'], ['이 결과는 로컬 재현 가능 테스트에서 나온 것이며 범용 대규모 모델 벤치마크 점수를 의미하지 않습니다.','该结果来自本地可重复测试，并不代表通用大模型基准测试得分。'],
      ['LLM 교차 도메인 계획','LLM 跨域规划'], ['모델은 구조화 Context만 기반으로 읽기 전용 계획을 생성합니다.','模型仅基于结构化 Context 生成只读计划。'],
      ['쓰기 Tool을 호출하지 않았습니다.','未调用写入 Tool。'], ['개의 계획 노드를 출력했습니다.','个计划节点已生成。'],
      ['명확한 시간을 해석하지 못했습니다. “내일 15:00” 또는 “내일 오후 3시” 형식으로 입력해 주세요.','无法解析明确时间。请输入“明天 15:00”或“明天下午3点”之类的时间。'],
      ['저녁 학습','晚间学习'], ['내일 계획','明日计划'], ['내일 일정 정리','整理明日日程'], ['영수증','小票'], ['냉장고','冰箱'], ['재료','食材'], ['레시피','食谱'],
      ['확인 후 실행합니다.','确认后执行。'], ['지출 기록 준비','准备记录支出'], ['직접 수정하지','不会直接修改'], ['오후','下午'], ['저녁','晚上'],
      ['”은 ','”'], ['원','韩元'], ['계획','计划'], ['사용자','用户'], ['현재','当前'], ['작업','操作'], ['결과','结果'], ['로컬','本地'], ['테스트','测试'],
      ['재현 가능','可重复'], ['범용','通用'], ['대규모 모델','大模型'], ['벤치마크','基准测试'], ['점수','分数'], ['의미하지 않습니다','并不代表'],
      ['모델','模型'], ['구조화','结构化'], ['기반으로','基于'], ['생성합니다','生成'], ['호출하지 않았습니다','未调用'], ['설명','说明'], ['근거','依据'],
      ['격리','隔离'], ['긴급도','紧迫度'], ['단조성','顺序验证'], ['과잉 경고 방지','避免过度警告'], ['감지','检测'], ['파싱','解析'], ['중국어','中文'], ['한국어','韩文']
    ];
    replacements.sort((a,b) => b[0].length - a[0].length);
    for (const [from, to] of replacements) out = out.split(from).join(to);
    out = out
      .replace(/(\d+)개/g, '$1项')
      .replace(/(\d+)건/g, '$1项')
      .replace(/(\d+)종/g, '$1类')
      .replace(/(\d+)분/g, '$1分钟');
    return out;
  };
  const evaluationLabels = {
    '겹치는 일정 감지': {zh:'检测日程冲突', en:'Detect overlapping schedules'},
    '비충돌 일정 과잉 경고 방지': {zh:'避免无冲突日程的过度警告', en:'Avoid false conflict warnings'},
    '한국어·중국어 오후 시간 파싱': {zh:'中韩下午时间解析', en:'Parse Korean and Chinese afternoon time'},
    '할 일 우선순위 단조성': {zh:'待办优先级顺序验证', en:'Validate task-priority ordering'},
    '마감 긴급도': {zh:'截止时间紧迫度验证', en:'Validate deadline urgency'},
    '5개 Context 커버리지': {zh:'5类 Context 覆盖率', en:'Five-domain Context coverage'},
    '계획 노드 설명 근거': {zh:'计划节点依据验证', en:'Validate planning-node evidence'},
    '계획 읽기 전용 유지': {zh:'保持计划只读', en:'Keep planning read-only'},
    '현재 사용자 Context 격리': {zh:'当前用户 Context 隔离', en:'Current-user Context isolation'},
    '확인 대기 작업 사용자 격리': {zh:'待确认操作的用户隔离', en:'Pending-action user isolation'},
  };
  const evaluationName = (name) => lang === 'zh' ? (evaluationLabels[name]?.zh || name) : name;
  const evaluationNameEn = (name) => evaluationLabels[name]?.en || 'Evaluation test';

  function changeLanguage(next) {
    setLang(next);
    if (typeof window !== 'undefined') localStorage.setItem('lifeagent_lang', next);
  }

  function authorizedFetch(url, opt = {}, overrideToken = null) {
    const t = overrideToken || token;
    const headers = {...(opt.headers || {})};
    if (t) headers.Authorization = `Bearer ${t}`;
    return fetch(url, {...opt, headers});
  }

  async function submitAuth() {
    setAuthError('');
    try {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const body = authMode === 'register' ? authForm : {username:authForm.username,password:authForm.password};
      const r = await fetch(`${API}${endpoint}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || L('인증 실패','认证失败'));
      sessionStorage.setItem('lifeagent_token', j.token);
      localStorage.removeItem('lifeagent_token');
      setToken(j.token);
      setUser(j.user);
    } catch (e) { setAuthError(e.message || L('로그인 실패','登录失败')); }
  }

  async function logout() {
    try { await authorizedFetch(`${API}/auth/logout`, {method:'POST'}); } catch {}
    sessionStorage.removeItem('lifeagent_token');
    localStorage.removeItem('lifeagent_token');
    setToken('');
    setUser(null);
    setData(emptyData);
  }

  async function getDashboard() {
    const r = await authorizedFetch(`${API}/dashboard`);
    if (!r.ok) throw new Error('dashboard');
    return r.json();
  }

  async function refresh() {
    try {
      const [d, h, c] = await Promise.all([
        getDashboard(),
        fetch(`${API}/health`).then(r => r.json()),
        fetch(`${API}/capabilities`).then(r => r.json()).catch(() => null),
      ]);
      setData(d);
      setMode(h.mode || 'demo');
      if (c) setCapabilities(c);
      return d;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const savedLang = localStorage.getItem('lifeagent_lang');
    if (savedLang === 'ko' || savedLang === 'zh') setLang(savedLang);
    localStorage.removeItem('lifeagent_token');
    const saved = sessionStorage.getItem('lifeagent_token');
    if (!saved) { setAuthReady(true); return; }
    fetch(`${API}/auth/me`, {headers:{Authorization:`Bearer ${saved}`}})
      .then(async r => { if (!r.ok) throw new Error('expired'); const me = await r.json(); setToken(saved); setUser(me); setAuthReady(true); })
      .catch(() => { sessionStorage.removeItem('lifeagent_token'); setAuthReady(true); });
  }, []);

  useEffect(() => { if (token && user) refresh(); }, [token, user]);
  useEffect(() => {
    setMessage(current => (current === quickPromptsKo[0] || current === quickPromptsZh[0]) ? (lang === 'zh' ? quickPromptsZh[0] : quickPromptsKo[0]) : current);
    setLastDecision(current => T(current));
    setReply(current => T(current));
    setTrace(current => current.map(x => ({...x, title:T(x.title), detail:T(x.detail)})));
    setDecisionInput(current => ({...current, title: lang === 'zh' ? '去医院' : '병원 가기', proposed_at: lang === 'zh' ? '明天 15:00' : '내일 15:00'}));
    setManageForm(current => ({
      ...current,
      scheduled_at: ['내일 09:00','明天 09:00'].includes(current.scheduled_at) ? (lang === 'zh' ? '明天 09:00' : '내일 09:00') : current.scheduled_at,
      due_at: ['이번 주','本周'].includes(current.due_at) ? (lang === 'zh' ? '本周' : '이번 주') : current.due_at,
      category: ['생활','生活'].includes(current.category) ? (lang === 'zh' ? '生活' : '생활') : current.category,
    }));
  }, [lang]);


  function startVoiceInput() {
    if (typeof window === 'undefined') return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceNote(L('현재 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 권장합니다.','当前浏览器不支持语音识别，建议使用 Chrome 或 Edge。'));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang === 'zh' ? 'zh-CN' : 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    setVoiceNote(L('듣고 있습니다. 생활 관리 목표를 말씀해 주세요…','正在聆听，请说出你的生活管理目标…'));
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setMessage(transcript);
        setVoiceNote(`${L('인식 완료','识别完成')} · Recognized: ${transcript}`);
      }
    };
    recognition.onerror = (event) => {
      setVoiceNote(`${L('음성 인식 실패','语音识别失败')} · Voice recognition failed: ${event.error || 'unknown error'}`);
    };
    recognition.onend = () => setListening(false);
    try { recognition.start(); }
    catch { setListening(false); setVoiceNote(L('음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.','无法启动语音识别，请稍后重试。')); }
  }

  async function send(text = message) {
    const actual = text.trim();
    if (!actual) return;
    setMessage(actual);
    setBusy(true);
    setReply('');
    setTrace([]);
    setPending(null);
    setBeforeContext(snapshot(data));
    setAfterContext(null);
    setLastDecision(L('Agent가 Context를 읽는 중 · Reading Context','Agent 正在读取 Context · Reading Context'));
    try {
      const r = await authorizedFetch(`${API}/agent`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({message: actual})
      });
      if (!r.ok) throw new Error('agent');
      const j = await r.json();
      setReply(T(j.message || ''));
      setTrace((j.trace || []).map(x => ({...x, title:T(x.title), detail:T(x.detail)})));
      setPending(j.pending_action || null);
      setLastDecision(j.pending_action ? L('사용자 확인 대기 · Awaiting confirmation','等待用户确认 · Awaiting confirmation') : L('읽기 전용 응답 · 데이터 변경 없음 · Read only','只读响应 · 数据未修改 · Read only'));
      const d = await refresh();
      if (!j.pending_action && d) setAfterContext(snapshot(d));
    } catch {
      setReply(L('백엔드에 연결할 수 없습니다. FastAPI v1.2 실행 상태를 확인해 주세요.','无法连接后端，请检查 FastAPI v1.2 运行状态。'));
      setLastDecision(L('연결 실패 · Connection failed','连接失败 · Connection failed'));
    }
    setBusy(false);
  }

  async function confirm(approve) {
    if (!pending) return;
    setBusy(true);
    const before = snapshot(data);
    setBeforeContext(before);
    try {
      const r = await authorizedFetch(`${API}/agent/confirm`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action_id: pending.id, approve})
      });
      if (!r.ok) throw new Error('confirm');
      const j = await r.json();
      setReply(T(j.message) || L('작업 완료','操作完成'));
      setTrace(t => [...t, {
        stage:'execution',
        title: approve ? L('Tool 실행','Tool 执行') : L('실행 거부','拒绝执行'),
        detail: approve ? L('사용자 확인 후에만 쓰기를 실행하고 Personal Context를 갱신합니다.','仅在用户确认后执行写入并更新 Personal Context。') : L('사용자가 작업을 거부하여 데이터베이스는 변경되지 않습니다.','用户拒绝操作，数据库不会被修改。'),
        status: approve ? 'done' : 'blocked'
      }]);
      setPending(null);
      setLastDecision(approve ? L('확인 후 실행 완료','确认后执行完成') : L('거부됨 · 데이터 변경 없음','已拒绝 · 数据未修改'));
      const d = await refresh();
      if (d) setAfterContext(snapshot(d));
    } catch {
      setReply(L('확인 작업에 실패했습니다. 백엔드 터미널을 확인해 주세요.','确认操作失败，请检查后端。'));
      setLastDecision(L('실행 실패','执行失败'));
    }
    setBusy(false);
  }

  async function seedDemo() {
    setBusy(true);
    try {
      await authorizedFetch(`${API}/demo/seed`, {method:'POST'});
      setReply(L('데모 데이터를 불러왔습니다. 이제 “내일 일정을 계획해 줘”를 실행하면 Context-aware 계획을 확인할 수 있습니다.','演示数据已加载。现在运行“帮我安排明天”，即可查看 Context-aware 计划。'));
      setTrace([]);
      setPending(null);
      setBeforeContext(null);
      setAfterContext(null);
      setLastDecision(L('데모 데이터 로드 완료','演示数据加载完成'));
      await refresh();
    } catch {
      setReply(L('데모 데이터 로드에 실패했습니다. 백엔드 실행 상태를 확인해 주세요.','演示数据加载失败，请检查后端运行状态。'));
    } finally { setBusy(false); }
  }

  async function generateDailyPlan() {
    setPlannerBusy(true);
    setLastDecision(L('교차 도메인 생활 계획 생성 중','正在生成跨域生活计划'));
    try {
      const r = await authorizedFetch(`${API}/planner/daily`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({horizon:'tomorrow'})
      });
      if (!r.ok) throw new Error('planner');
      const j = await r.json();
      setDailyPlan(j);
      setTrace(j.trace || []);
      setReply(T(j.summary) || L('통합 생활 계획이 생성되었습니다.','综合生活计划已生成。'));
      setPending(null);
      setBeforeContext(snapshot(data));
      setAfterContext(snapshot(data));
      setLastDecision(L('읽기 전용 통합 계획 · 데이터 변경 없음','只读综合计划 · 数据未修改'));
    } catch {
      setReply(L('통합 계획 생성에 실패했습니다. FastAPI v1.2 실행 상태를 확인해 주세요.','综合计划生成失败，请检查 FastAPI v1.2 运行状态。'));
      setLastDecision(L('계획 실패','规划失败'));
    }
    setPlannerBusy(false);
  }


  async function analyzeDecision() {
    setDecisionBusy(true);
    setLastDecision(L('Local Reasoning이 충돌을 분석하는 중','Local Reasoning 正在分析冲突'));
    try {
      const r = await authorizedFetch(`${API}/reasoning/analyze`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(decisionInput)
      });
      if (!r.ok) throw new Error('reasoning');
      const j = await r.json();
      setDecisionResult(j);
      setTrace(j.trace || []);
      setReply(T(j.recommendation) || L('로컬 의사결정 분석이 완료되었습니다.','本地决策分析已完成。'));
      setPending(null);
      setBeforeContext(snapshot(data));
      setAfterContext(snapshot(data));
      setLastDecision(L(`로컬 추론 완료 · 위험 ${j.risk}`,`本地推理完成 · 风险 ${j.risk}`));
    } catch {
      setReply(L('의사결정 분석에 실패했습니다. FastAPI v1.2 실행 상태를 확인해 주세요.','决策分析失败，请检查 FastAPI v1.2 运行状态。'));
      setLastDecision(L('추론 실패','推理失败'));
    }
    setDecisionBusy(false);
  }

  async function analyzeImage(file) {
    if (!file) return;
    if (visionPreview) URL.revokeObjectURL(visionPreview);
    setVisionPreview(URL.createObjectURL(file));
    setVisionBusy(true); setVisionError(''); setVisionResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await authorizedFetch(`${API}/vision/${visionKind}`, {method:'POST', body:fd});
      if (!r.ok) throw new Error('vision');
      setVisionResult(await r.json());
    } catch { setVisionError(L('이미지 분석에 실패했습니다. 백엔드 실행 상태를 확인해 주세요.','图片分析失败，请检查后端运行状态。')); }
    setVisionBusy(false);
  }

  async function proposeVisionWrite() {
    if (!visionResult) return;
    setBusy(true); setVisionError('');
    try {
      const r = await authorizedFetch(`${API}/vision/propose`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:visionKind,result:visionResult})});
      if (!r.ok) throw new Error('proposal');
      const j = await r.json();
      setPending(j); setReply(`${T(j.summary)}. ${L('확인 후 실행해 주세요.','请确认后执行。')}`);
      setTrace([
        {stage:'input',title:L('이미지 입력','图片输入'),detail:visionKind === 'receipt' ? L('영수증 이미지','小票图片') : L('냉장고 / 식재료 이미지','冰箱 / 食材图片'),status:'done'},
        {stage:'vision',title:L('멀티모달 이해','多模态理解'),detail:`${L('인식 소스','识别来源')}: ${visionResult.source || 'unknown'} · confidence ${visionResult.confidence ?? '-'}`,status:'done'},
        {stage:'tool',title:L('Tool 준비','准备 Tool'),detail:T(j.summary),status:'done'},
        {stage:'safety',title:'Human-in-the-loop',detail:L('데이터베이스는 아직 변경되지 않았으며 사용자 확인을 기다립니다.','数据库尚未修改，正在等待用户确认。'),status:'waiting'}
      ]);
      setBeforeContext(snapshot(data)); setAfterContext(null); setLastDecision(L('사용자 확인 대기','等待用户确认'));
    } catch { setVisionError(L('확인 대기 작업을 생성하지 못했습니다.','无法创建待确认操作。')); }
    setBusy(false);
  }

  async function runEvaluation() {
    setEvaluationBusy(true);
    setLastDecision(L('로컬 평가 스위트 실행 중','正在运行本地评估套件'));
    try {
      const r = await authorizedFetch(`${API}/evaluation/run`, {method:'POST'});
      if (!r.ok) throw new Error('evaluation');
      const j = await r.json();
      setEvaluation(j);
      setReply(lang === 'zh'
        ? `评估完成：${j.tests_passed}/${j.tests_total} 通过 · Pass Rate ${Math.round(Number(j.pass_rate||0)*100)}%`
        : `평가 완료: ${j.tests_passed}/${j.tests_total} 통과 · Pass Rate ${Math.round(Number(j.pass_rate||0)*100)}%`);
      setTrace([
        {stage:'evaluation',title:L('결정적 테스트 실행','运行确定性测试'),detail:lang === 'zh' ? `共 ${j.tests_total} 项 · 本地运行 ${j.latency_ms} ms` : `총 ${j.tests_total}개 · 로컬 실행 ${j.latency_ms} ms`,status:'done'},
        {stage:'metrics',title:L('정량 지표 계산','计算量化指标'),detail:`Pass Rate ${Math.round(Number(j.pass_rate||0)*100)}% · Safety ${Math.round(Number(j.safety_rate||0)*100)}%`,status:'done'},
        {stage:'evidence',title:L('항목별 결과 보존','保存逐项结果'),detail:L('각 테스트는 범주, 기대 동작, 실제 결과를 표시하며 논문 실험 장에 활용할 수 있습니다.','每项测试都会显示类别、预期行为和实际结果，可用于毕业论文的实验与评估章节。'),status:'done'}
      ]);
      setLastDecision(L('평가 완료','评估完成'));
    } catch {
      setReply(L('평가에 실패했습니다. FastAPI v1.2 실행 상태를 확인해 주세요.','评估失败，请确认 FastAPI v1.2 正在运行。'));
      setLastDecision(L('평가 실패','评估失败'));
    }
    setEvaluationBusy(false);
  }

  async function prepareDefenseDemo() {
    setDefenseBusy(true);
    try {
      await authorizedFetch(`${API}/demo/seed`, {method:'POST'});
      const er = await authorizedFetch(`${API}/evaluation/run`, {method:'POST'});
      const ej = await er.json();
      setEvaluation(ej);
      const sr = await authorizedFetch(`${API}/defense/summary`);
      const sj = await sr.json();
      setDefenseSummary(sj);
      await refresh();
      setReply(L('발표 시연 환경 준비 완료: 데모 데이터, 평가 지표, 시스템 요약이 생성되었습니다.','答辩演示环境已准备完成：已生成演示数据、评估指标和系统摘要。'));
      setLastDecision('DEFENSE MODE READY');
    } catch {
      setReply(L('발표 시연 모드 준비에 실패했습니다. FastAPI v1.2 실행 상태를 확인해 주세요.','答辩演示模式准备失败，请检查 FastAPI v1.2 运行状态。'));
    }
    setDefenseBusy(false);
  }

  function exportDefenseReport() {
    if (!defenseSummary) return;
    const payload = {generated_at:new Date().toISOString(), user:{username:user.username,display_name:user.display_name}, ...defenseSummary};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='life-agent-v1.2-defense-report.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  async function apiWrite(path, method='POST', body=null) {
    const opt = {method, headers:{'Content-Type':'application/json'}};
    if (body !== null) opt.body = JSON.stringify(body);
    const r = await authorizedFetch(`${API}${path}`, opt);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function addContextItem() {
    setBusy(true); setManageNotice('');
    try {
      if (manageKind === 'schedule') await apiWrite('/schedules','POST',{title:manageForm.title || L('새 일정','新日程'), scheduled_at:manageForm.scheduled_at || L('미정','未定')});
      if (manageKind === 'task') await apiWrite('/tasks','POST',{title:manageForm.title || L('새 할 일','新待办'), priority:manageForm.priority, due_at:manageForm.due_at || null});
      if (manageKind === 'expense') await apiWrite('/expenses','POST',{item:manageForm.item || L('지출','支出'), amount:Number(manageForm.amount || 0), category:manageForm.category || 'other'});
      if (manageKind === 'ingredient') await apiWrite('/ingredients','POST',{name:manageForm.name || L('식재료','食材'), quantity:manageForm.quantity || '1', expires_on:manageForm.expires_on || null});
      setManageNotice(L('Personal Context에 저장하고 작업 기록에 추가했습니다.','已保存到 Personal Context，并添加到操作记录。'));
      await refresh();
    } catch { setManageNotice(L('작업에 실패했습니다. 입력값과 백엔드를 확인해 주세요.','操作失败，请检查输入值和后端。')); }
    setBusy(false);
  }

  async function removeItem(kind,id) {
    if (!window.confirm(L('이 데이터를 삭제하시겠습니까? 작업 기록에서 실행 취소할 수 있습니다.','确定删除这条数据吗？可在操作记录中撤销。'))) return;
    try { await apiWrite(`/${kind}s/${id}`,'DELETE'); setManageNotice(L('삭제 완료 · 작업 기록에서 실행 취소할 수 있습니다.','删除完成 · 可在操作记录中撤销。')); await refresh(); }
    catch { setManageNotice(L('삭제 실패','删除失败')); }
  }

  async function toggleTask(x) {
    try { await apiWrite(`/tasks/${x.id}`,'PATCH',{completed:!x.completed}); setManageNotice(x.completed?L('할 일을 미완료 상태로 되돌렸습니다.','已将待办恢复为未完成。'):L('할 일을 완료로 표시했습니다.','已将待办标记为完成。')); await refresh(); }
    catch { setManageNotice(L('할 일 상태 업데이트 실패','待办状态更新失败')); }
  }

  async function editItem(kind,x) {
    try {
      let body={};
      if(kind==='schedule') { const title=window.prompt(L('일정 제목','日程标题'),x.title); if(title===null)return; const t=window.prompt(L('시간','时间'),T(x.scheduled_at)); if(t===null)return; body={title,scheduled_at:t}; }
      if(kind==='task') { const title=window.prompt(L('할 일 제목','待办标题'),x.title); if(title===null)return; const priority=window.prompt(L('우선순위 high / medium / low','优先级 high / medium / low'),x.priority); if(priority===null)return; body={title,priority}; }
      if(kind==='expense') { const item=window.prompt(L('지출 항목','支出项目'),x.item); if(item===null)return; const amount=window.prompt(L('금액','金额'),String(x.amount)); if(amount===null)return; body={item,amount:Number(amount)}; }
      if(kind==='ingredient') { const name=window.prompt(L('식재료 이름','食材名称'),x.name); if(name===null)return; const quantity=window.prompt(L('수량','数量'),x.quantity); if(quantity===null)return; body={name,quantity}; }
      await apiWrite(`/${kind}s/${x.id}`,'PATCH',body); setManageNotice(L('수정 완료 · 작업 기록에 저장했습니다.','修改完成 · 已保存到操作记录。')); await refresh();
    } catch { setManageNotice(L('수정 실패','修改失败')); }
  }

  async function undoHistory(id) {
    try { const j=await apiWrite(`/history/${id}/undo`,'POST'); setManageNotice(T(j.message) || L('실행 취소 완료','撤销完成')); await refresh(); }
    catch { setManageNotice(L('실행 취소에 실패했습니다. 이미 취소되었거나 데이터가 변경되었을 수 있습니다.','撤销失败。该操作可能已撤销，或数据已发生变化。')); }
  }

  const expiring = useMemo(() => data.ingredients.filter(x => x.expires_on).slice(0, 4), [data.ingredients]);
  const diff = useMemo(() => {
    if (!beforeContext || !afterContext) return null;
    return {
      schedules: afterContext.schedules - beforeContext.schedules,
      tasks: afterContext.tasks - beforeContext.tasks,
      expenses: afterContext.expenses - beforeContext.expenses,
      expense_total: afterContext.expense_total - beforeContext.expense_total,
    };
  }, [beforeContext, afterContext]);

  if (!authReady) return <main className="authPage"><section className="authCard card"><div className="authLangRow"><div className="languageSwitch" aria-label="Language"><button className={lang==='ko'?'active':''} onClick={()=>changeLanguage('ko')}>한국어</button><button className={lang==='zh'?'active':''} onClick={()=>changeLanguage('zh')}>中文</button></div></div><span className="sectionTag">LIFE AGENT v1.2 · SECURE SESSION</span><h1>{L('보안 세션 복원 중…','正在恢复安全会话…')}<small className="enTitle">Restoring secure session…</small></h1></section></main>;

  if (!token || !user) return <main className="authPage">
    <section className="authCard card">
      <div className="authLangRow"><div className="languageSwitch" aria-label="Language"><button className={lang==='ko'?'active':''} onClick={()=>changeLanguage('ko')}>한국어</button><button className={lang==='zh'?'active':''} onClick={()=>changeLanguage('zh')}>中文</button></div></div>
      <span className="sectionTag">USER AUTHENTICATION</span>
      <h1>{authMode==='register' ? L('회원가입','用户注册') : L('사용자 로그인','用户登录')} <span>v1.2</span><small className="enTitle">{authMode==='register' ? 'Create Account' : 'User Login'}</small></h1>
      <p>{L('각 계정은 독립적인 Schedule / Task / Expense / Ingredient / Preference Context를 사용합니다. 사용자 간 데이터는 서로 섞이지 않습니다.','每个账号都使用独立的 Schedule / Task / Expense / Ingredient / Preference Context，不同用户的数据不会相互混合。')}<small className="enTitle block">Each account uses isolated personal context and user data never mixes across accounts.</small></p>
      {authMode==='register' && <input placeholder={L('표시 이름 · Display name','显示名称 · Display name')} value={authForm.display_name} onChange={e=>setAuthForm({...authForm,display_name:e.target.value})}/>} 
      <input placeholder={L('사용자 이름 · Username','用户名 · Username')} value={authForm.username} onChange={e=>setAuthForm({...authForm,username:e.target.value})}/>
      <input type="password" placeholder={L('비밀번호 (최소 6자) · Password','密码（至少6位）· Password')} value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')submitAuth()}}/>
      {authError && <div className="visionError">{authError}</div>}
      <button className="primary" onClick={submitAuth}>{authMode==='register'?L('계정 생성 · Create Account','创建账号 · Create Account'):L('로그인 · Login','登录 · Login')}</button>
      <button className="ghost authSwitch" onClick={()=>{setAuthError('');setAuthMode(authMode==='login'?'register':'login')}}>{authMode==='login'?L('계정이 없나요? 회원가입 · Sign up','没有账号？注册 · Sign up'):L('이미 계정이 있나요? 로그인 · Login','已有账号？登录 · Login')}</button>
      <div className="authArchitecture"><span>LOGIN</span><i>→</i><span>SESSION</span><i>→</i><span>USER ID</span><i>→</i><span>ISOLATED CONTEXT</span></div>
    </section>
  </main>;

  return <main>
    <header className="topbar">
      <div>
        <p className="eyebrow">CONTEXT-AWARE PERSONAL LIFE AGENT</p>
        <h1>Life Agent <span>v1.2</span></h1>
        <p className="subtitle">Voice Input · API-ready LLM Layer · Multimodal Review · User-isolated Context · Human-in-the-loop</p>
      </div>
      <div className="headerActions">
        <div className="userBadge"><small>ACTIVE USER</small><b>{user.display_name}</b><span>@{user.username}</span></div>{user.role==='admin' && <button className="adminShortcut" onClick={()=>{window.location.href='/admin'}}>ADMIN</button>}
        <div className="languageSwitch" aria-label="Language"><button className={lang==='ko'?'active':''} onClick={()=>changeLanguage('ko')}>한국어</button><button className={lang==='zh'?'active':''} onClick={()=>changeLanguage('zh')}>中文</button></div><button className="ghost" onClick={logout}>{L('로그아웃 · Logout','退出登录 · Logout')}</button>
        <span className={`mode ${mode}`}>{mode === 'openai' ? 'LLM MODE' : 'DEMO MODE'}</span>
        <button className="ghost" onClick={seedDemo} disabled={busy}>{L('데모 데이터 불러오기 · Load Demo Data','加载演示数据 · Load Demo Data')}</button>
      </div>
    </header>

    <section className="card defenseCard">
      <div className="cardHead"><div><span className="sectionTag">DEFENSE MODE · v1.2</span><h3>{L('원클릭 졸업작품 발표 준비','一键准备答辩演示')}<small className="enTitle">One-click Defense Demo</small></h3></div><small>{defenseSummary?.demo_ready ? 'READY' : 'NOT PREPARED'}</small></div>
      <div className="defenseIntro"><div><h4>{L('교수님의 핵심 질문에 답할 근거를 한곳에 모았습니다.','把答辩中最容易被追问的证据集中在一个地方。')}<small className="enTitle">Evidence for the key defense questions is collected in one place.</small></h4><p>{L('데모 Context를 자동 로드하고 로컬 평가를 실행한 뒤 아키텍처, 사용자 격리, Safety Gate, Undo, capability 상태를 요약합니다. API Key가 없어도 핵심 시스템을 완전히 시연할 수 있습니다.','自动加载演示 Context 并运行本地评估，然后汇总架构、用户隔离、Safety Gate、Undo 与 capability 状态。即使没有 API Key，也能完整演示核心系统。')}</p></div><div className="defenseActions"><button className="primary" onClick={prepareDefenseDemo} disabled={defenseBusy || busy}>{defenseBusy?L('시연 환경 준비 중…','正在准备演示环境…'):L('발표 시연 준비','准备答辩演示')}</button><button className="ghost" onClick={exportDefenseReport} disabled={!defenseSummary}>{L('실험 요약 내보내기','导出实验摘要')}</button></div></div>
      {defenseSummary && <div className="defenseGrid">
        <div><span>ARCHITECTURE</span><b>8 stages</b><small>{defenseSummary.architecture.join(' → ')}</small></div>
        <div><span>EVALUATION</span><b>{defenseSummary.evaluation.tests_passed}/{defenseSummary.evaluation.tests_total}</b><small>Pass {Math.round(defenseSummary.evaluation.pass_rate*100)}% · Safety {Math.round(defenseSummary.evaluation.safety_rate*100)}%</small></div>
        <div><span>USER ISOLATION</span><b>ENABLED</b><small>Context bound to authenticated user</small></div>
        <div><span>WRITE SAFETY</span><b>CONFIRM + UNDO</b><small>{L('쓰기 전 확인 · 작업 기록 · Undo','写入前确认 · 操作记录 · Undo')} · WRITE SAFETY</small></div>
      </div>}
    </section>

    <section className="hero card" id="home">
      <div className="heroCopy">
        <span className="sectionTag">PERSONAL CONTEXT ENGINE</span>
        <h2>{L('생활 상태를 먼저 이해한 뒤, 도구 호출 여부를 결정합니다.','先理解生活状态，再决定是否调用工具。')}<small className="enTitle">Understand context first, then decide whether to call tools.</small></h2>
        <p>{L('Agent는 현재 로그인 사용자의 일정, 할 일, 지출, 식재료, 선호만 읽습니다. 계정별 Context는 완전히 격리되며 모든 데이터베이스 쓰기는 사용자의 명시적 확인을 거칩니다.','Agent 只读取当前登录用户的日程、待办、支出、食材与偏好。不同账号的 Context 完全隔离，任何数据库写入都必须经过用户明确确认。')}</p>
        <div className="chips">
          {quickPrompts.map(x => <button key={x} onClick={() => send(x)} disabled={busy}>{x}</button>)}
        </div>
        <div className="architecture">
          <span>INPUT</span><i>→</i><span>CONTEXT</span><i>→</i><span>REASONING</span><i>→</i><span>TOOL</span><i>→</i><span>SAFETY</span><i>→</i><span>EXECUTION</span>
        </div>
      </div>
      <div className="agentPanel">
        <div className="panelTitle"><label>{L('Life Agent에게 목표를 입력하세요','给 Life Agent 一个目标')}</label><span>{T(lastDecision)}</span></div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={L('예: 오늘 커피에 4,500원을 썼어','例如：今天咖啡花了4500韩元')} />
        <div className="agentActionRow">
          <button className={`voiceButton ${listening ? 'listening' : ''}`} onClick={startVoiceInput} disabled={busy || listening}>{listening ? L('🎙 듣는 중…','🎙 正在聆听…') : L('🎙 음성 입력','🎙 语音输入')}</button>
          <button className="primary" onClick={() => send()} disabled={busy}>{busy ? L('Agent 처리 중…','Agent 处理中…') : L('Agent 실행','运行 Agent')}</button>
        </div>
        {voiceNote && <div className={`voiceNote ${voiceSupported ? '' : 'unsupported'}`}>{voiceNote}</div>}
        {reply && <div className="reply">{T(reply).split('\n').map((x,i)=><span key={i}>{x || <br/>}</span>)}</div>}
        {pending && <div className="approval">
          <div><b>{L('사용자 확인 필요','需要用户确认')}</b><small>{T(pending.summary)}</small><em>{L('아직 데이터베이스에 쓰지 않았습니다','尚未写入数据库')}</em></div>
          <div className="approvalBtns"><button onClick={() => confirm(false)} disabled={busy}>{L('거부','拒绝')}</button><button className="approve" onClick={() => confirm(true)} disabled={busy}>{L('확인 후 실행','确认执行')}</button></div>
        </div>}
      </div>
    </section>

    <section className="card capabilityCard">
      <div className="cardHead">
        <div><span className="sectionTag">AI CAPABILITY GATEWAY</span><h3>{L('로컬 기능 + API-ready 지능형 계층','本地能力 + API-ready 智能层')}<small className="enTitle">Local Capability + API-ready Intelligence</small></h3></div>
        <small>{capabilities?.llm?.enabled ? 'OPENAI CONNECTED' : 'LOCAL FALLBACK ACTIVE'}</small>
      </div>
      <div className="capabilityIntro">
        <h4>{L('API Key 없이도 완전히 실행되며, 향후 모델 연동 시 시스템을 재구축할 필요가 없습니다.','没有 API Key 也可以完整运行，今后接入模型时无需重构系统。')}<small className="enTitle">Runs fully without an API key and remains model-ready.</small></h4>
        <p className="localeBody"><span>{L('Agent의 Context, Reasoning, Safety, Database, Evaluation은 외부 모델과 독립적으로 동작합니다. LLM / Vision은 교체 가능한 capability layer이며 API가 없으면 로컬 규칙과 Demo Vision을 자동 사용합니다.','Agent 的 Context、Reasoning、Safety、Database、Evaluation 独立于外部模型运行。LLM / Vision 是可替换的 capability layer，没有 API 时自动使用本地规则和 Demo Vision。')}</span><small>Context, reasoning, safety, database, and evaluation run independently of external models. LLM and Vision are replaceable capability layers; local rules and Demo Vision are used when no API is configured.</small></p>
      </div>
      <div className="capabilityGrid">
        <div><span>LLM ROUTER</span><b>{capabilities?.llm?.enabled ? 'CONNECTED' : 'LOCAL FALLBACK'}</b><small>{capabilities?.llm?.model || 'deterministic rules'}</small></div>
        <div><span>VISION</span><b>{capabilities?.vision?.enabled ? 'REAL VISION' : 'DEMO FALLBACK'}</b><small>{capabilities?.vision?.model || 'demo recognizer'}</small></div>
        <div><span>VOICE INPUT</span><b>{voiceSupported ? 'BROWSER READY' : 'UNSUPPORTED'}</b><small>Web Speech · Chrome / Edge</small></div>
        <div><span>SAFETY GATE</span><b>ENABLED</b><small>Confirm before write · Undo available</small></div>
      </div>
    </section>

    <section className="card plannerCard" id="planner">
      <div className="cardHead">
        <div><span className="sectionTag">CROSS-DOMAIN LIFE PLANNER</span><h3>{L('내일 통합 생활 계획','明日综合生活计划')}<small className="enTitle">Tomorrow Integrated Life Plan</small></h3></div>
        <small>Schedule + Task + Food + Expense + Preference</small>
      </div>
      <div className="plannerIntro">
        <div>
          <h4>{L('다섯 모듈을 단순히 나열하는 것이 아니라 서로 제약하도록 합니다.','不是简单并列五个模块，而是让它们相互约束。')}<small className="enTitle">Five domains constrain one another instead of operating as isolated modules.</small></h4>
          <p>{L('고정 일정은 먼저 유지하고, 우선순위가 높은 할 일을 빈 시간에 배치합니다. 식사는 냉장고 재고를 읽고, Expense Context는 보수적 알림만 제공하며, 개인 선호는 실행 규칙으로 사용합니다. 전체 계획 과정은 읽기 전용입니다.','系统先保留固定日程，再把高优先级待办安排到空闲时间；餐饮会参考冰箱库存，Expense Context 只提供保守提醒，个人偏好作为执行规则。整个规划过程保持只读。')}</p>
        </div>
        <button className="primary plannerButton" onClick={generateDailyPlan} disabled={plannerBusy || busy}>{plannerBusy ? L('통합 계획 생성 중…','正在生成综合计划…') : L('내일 통합 계획 생성','生成明日综合计划')}</button>
      </div>
      {dailyPlan ? <>
        <div className="plannerMeta">
          <div><span>CONTEXT COVERAGE</span><strong>{Math.round(Number(dailyPlan.coverage || 0) * 100)}%</strong><small>{(dailyPlan.context_domains || []).map(T).join(' · ') || L('저 Context 모드','低 Context 模式')} · CONTEXT</small></div>
          <div><span>PLANNER SOURCE</span><strong>{dailyPlan.source === 'openai' ? 'LLM' : 'RULE + DEMO'}</strong><small>{L('읽기 전용 계획 · 쓰기 Tool 미호출','只读计划 · 未调用写入 Tool')} · READ ONLY</small></div>
          <div><span>PLAN NODES</span><strong>{dailyPlan.items?.length || 0}</strong><small>{L('각 노드에 설명 가능한 근거 포함','每个节点包含可解释依据')} · EXPLAINABLE</small></div>
        </div>
        <div className="timeline">
          {(dailyPlan.items || []).map((x,i)=><div className="planNode" key={`${x.title}-${i}`}>
            <div className="planTime">{T(x.time) || L('제안','建议')}</div>
            <div className="planBody"><div className="planTitle"><b>{T(x.title)}</b><span>{x.type || 'plan'}</span></div><p>{T(x.reason)}</p><div className="signals">{(x.signals || []).map(s=><em key={s}>{T(s)}</em>)}</div></div>
          </div>)}
        </div>
        <div className="plannerInsights"><span>WHY THIS PLAN</span>{(dailyPlan.insights || []).map((x,i)=><p key={i}>✓ {T(x)}</p>)}</div>
      </> : <div className="emptyTrace compact">{L('데모 데이터를 불러온 뒤 “내일 통합 계획 생성”을 클릭하세요. v1.2는 일정, 할 일, 식재료, 지출, 선호를 한 번의 계획에 반영하고 각 결정의 Context 근거를 표시합니다.','加载演示数据后点击“生成明日综合计划”。v1.2 会在一次规划中综合日程、待办、食材、支出和偏好，并显示每个决策的 Context 依据。')}</div>}
    </section>


    <section className="card reasoningCard">
      <div className="cardHead">
        <div><span className="sectionTag">LOCAL REASONING ENGINE</span><h3>{L('충돌 감지 · 우선순위 평가 · 동적 재계획','冲突检测 · 优先级评分 · 动态重规划')}</h3></div>
        <small>NO API REQUIRED</small>
      </div>
      <div className="reasoningIntro">
        <div><h4>{L('결정적 제약 조건을 먼저 계산한 뒤, 대규모 모델 필요 여부를 판단합니다.','先计算确定性约束，再判断是否需要大模型。')}<small className="enTitle">Deterministic constraints first, model escalation second.</small></h4><p>{L('후보 일정을 입력하면 v1.2가 기존 Schedule / Task Context를 읽고 로컬에서 시간 충돌, 위험 점수, 할 일 우선순위, 대체 시간을 계산합니다. API를 호출하지 않으며 데이터베이스를 자동 변경하지 않습니다.','输入候选日程后，v1.2 会读取现有 Schedule / Task Context，在本地计算时间冲突、风险分数、待办优先级和替代时间。不会调用 API，也不会自动修改数据库。')}</p></div>
        <div className="decisionForm">
          <input value={decisionInput.title} onChange={e=>setDecisionInput({...decisionInput,title:e.target.value})} placeholder={L('후보 계획 예: 병원 가기 · Candidate plan','候选计划，例如：去医院 · Candidate plan')} />
          <input value={decisionInput.proposed_at} onChange={e=>setDecisionInput({...decisionInput,proposed_at:e.target.value})} placeholder={L('예: 내일 15:00 · Proposed time','例如：明天 15:00 · Proposed time')} />
          <input type="number" min="15" max="240" value={decisionInput.duration_minutes} onChange={e=>setDecisionInput({...decisionInput,duration_minutes:Number(e.target.value)||60})} />
          <button className="primary" onClick={analyzeDecision} disabled={decisionBusy || busy}>{decisionBusy ? L('제약 조건 계산 중…','正在计算约束…') : L('후보 계획 분석','分析候选计划')}</button>
        </div>
      </div>
      {decisionResult ? <div className="decisionResult">
        <div className="riskPanel"><span>CONFLICT RISK</span><strong className={`risk ${decisionResult.risk?.toLowerCase()}`}>{decisionResult.risk}</strong><b>{decisionResult.risk_score}/100</b><small>{decisionResult.source}</small></div>
        <div className="reasoningDetails">
          <div><span>{L('충돌 감지','冲突检测')} · CONFLICTS</span>{decisionResult.conflicts?.length ? decisionResult.conflicts.map((x,i)=><p className="conflict" key={i}><b>⚠ {T(x.title)}</b><small>{T(x.scheduled_at)} · {L('약','约')} {x.overlap_minutes}{L('분 중복','分钟重叠')} · {x.severity}</small></p>) : <p className="safe"><b>✓ {L('고정 일정 충돌 없음','无固定日程冲突')} · NO FIXED CONFLICT</b><small>{L('후보 시간을 다음 확인 단계로 진행할 수 있습니다.','候选时间可以进入下一确认步骤。')}</small></p>}</div>
          <div><span>{L('동적 조정안','动态调整方案')} · ALTERNATIVES</span>{(decisionResult.alternatives||[]).map((x,i)=><p key={i}><b>{T(x.time)}</b><small>{T(x.reason)}</small></p>)}</div>
          <div><span>Task Priority Score</span>{(decisionResult.task_scores||[]).map((x,i)=><p key={i}><b>{x.score} · {T(x.title)}</b><small>{x.priority || 'medium'} · {T(x.due_at) || L('마감 시간 없음','未设置截止时间')}</small></p>)}</div>
        </div>
        <div className="recommendation"><span>DECISION EXPLANATION</span><p>{T(decisionResult.recommendation)}</p></div>
      </div> : <div className="emptyTrace compact">{L('먼저 데모 데이터를 불러온 뒤 “병원 가기 / 내일 15:00 / 60분” 상태로 분석하세요. 데모 데이터의 15:30 졸업작품 회의와 겹치므로 HIGH 충돌이 감지되어야 합니다.','先加载演示数据，再以“去医院 / 明天 15:00 / 60分钟”进行分析。因为与演示数据中的 15:30 毕业设计会议重叠，应该检测到 HIGH 冲突。')}</div>}
    </section>

    <section className="card multimodal">
      <div className="cardHead"><div><span className="sectionTag">MULTIMODAL VISION</span><h3>{L('이미지 → 구조화된 Context','图片 → 结构化 Context')}</h3></div><small>{mode === 'openai' ? 'REAL VISION' : 'Demo fallback'}</small></div>
      <div className="visionGrid">
        <div className="visionUpload">
          <div className="visionTabs"><button className={visionKind==='receipt'?'active':''} onClick={()=>{setVisionKind('receipt');setVisionResult(null)}}>{L('영수증 인식','小票识别')}</button><button className={visionKind==='fridge'?'active':''} onClick={()=>{setVisionKind('fridge');setVisionResult(null)}}>{L('냉장고 인식','冰箱识别')}</button></div>
          <label className="dropzone"><input type="file" accept="image/*" onChange={e=>analyzeImage(e.target.files?.[0])}/><b>{visionBusy ? L('이미지 분석 중…','正在分析图片…') : L('이미지 선택','选择图片')}</b><small>JPG / PNG / WEBP · MAX 8MB</small></label>
          {visionError && <div className="visionError">{visionError}</div>}
        </div>
        <div className="visionResult">
          <span>STRUCTURED RESULT · REVIEWABLE</span>
          {visionPreview && <img className="visionPreviewImage" src={visionPreview} alt={L('업로드 미리보기','上传预览')} />}
          {visionResult ? <>
            {visionKind==='receipt' ? <div className="visionEditGrid">
              <label><small>{L('가맹점','商家')} · MERCHANT</small><input value={visionResult.merchant || ''} onChange={e=>setVisionResult({...visionResult,merchant:e.target.value})}/></label>
              <label><small>{L('금액','金额')} · AMOUNT KRW</small><input type="number" value={visionResult.amount || 0} onChange={e=>setVisionResult({...visionResult,amount:Number(e.target.value||0)})}/></label>
              <label><small>{L('카테고리','类别')} · CATEGORY</small><input value={visionResult.category || ''} onChange={e=>setVisionResult({...visionResult,category:e.target.value})}/></label>
              <div className="sourceBox"><small>{L('소스','来源')} · SOURCE</small><b>{visionResult.source || '-'}</b><em>confidence {visionResult.confidence ?? '-'}</em></div>
            </div> : <div className="ingredientPreview">{(visionResult.ingredients||[]).map((x,i)=><div key={i}><b>{T(x.name)}</b><small>{T(x.quantity || '1')}{x.expires_on ? ` · ${T(x.expires_on)}` : ''}</small></div>)}</div>}
            {visionResult.note && <div className="visionSourceNote">{T(visionResult.note)}</div>}
            <button className="primary visionPropose" onClick={proposeVisionWrite} disabled={busy}>{L('확인 대기 작업 생성','生成待确认操作')}</button>
            <small className="visionNote">{L('구조화 결과를 먼저 검토·수정한 뒤 작업을 생성합니다. 데이터베이스 쓰기는 Human-in-the-loop 확인을 거칩니다.','先检查并修改结构化结果，再生成操作。数据库写入必须经过 Human-in-the-loop 确认。')}</small>
          </> : <div className="emptyTrace compact">{L('이미지를 업로드하면 사람이 수정할 수 있는 구조화 인식 결과가 여기에 표시됩니다.','上传图片后，这里会显示可由用户修改的结构化识别结果。')}</div>}
        </div>
      </div>
    </section>

    <section className="card managerCard" id="manager">
      <div className="cardHead">
        <div><span className="sectionTag">CONTEXT DATA MANAGER</span><h3>{L('생활 데이터 관리 · CRUD · Undo','生活数据管理 · CRUD · Undo')}</h3></div>
        <small>LOCAL DATABASE</small>
      </div>
      <div className="managerIntro"><div><h4>{L('Agent는 분석뿐 아니라 실제 Context도 관리합니다.','Agent 不仅分析，也管理真实 Context。')}<small className="enTitle">The Agent manages real context, not analysis alone.</small></h4><p>{L('추가, 수정, 삭제, 할 일 상태 변경은 모두 Action History에 기록됩니다. 잘못된 작업은 Undo할 수 있어 시스템의 통제 가능한 실행 능력을 보여줍니다.','新增、修改、删除和待办状态变更都会记录到 Action History。错误操作可以 Undo，用于展示系统可控的执行能力。')}</p></div></div>
      <div className="managerTabs">{['schedule','task','expense','ingredient'].map(k=><button key={k} className={manageKind===k?'active':''} onClick={()=>setManageKind(k)}>{lang==='zh'?({schedule:'日程',task:'待办',expense:'支出',ingredient:'食材'})[k]:({schedule:'일정',task:'할 일',expense:'지출',ingredient:'식재료'})[k]} <small>{({schedule:'Schedule',task:'Task',expense:'Expense',ingredient:'Ingredient'})[k]}</small></button>)}</div>
      <div className="managerForm">
        {(manageKind==='schedule'||manageKind==='task') && <input placeholder={manageKind==='schedule'?L('일정 제목 · Schedule title','日程标题 · Schedule title'):L('할 일 제목 · Task title','待办标题 · Task title')} value={manageForm.title} onChange={e=>setManageForm({...manageForm,title:e.target.value})}/>} 
        {manageKind==='schedule' && <input placeholder={L('시간 예: 내일 09:00 · Time','时间，例如：明天 09:00 · Time') } value={manageForm.scheduled_at} onChange={e=>setManageForm({...manageForm,scheduled_at:e.target.value})}/>} 
        {manageKind==='task' && <><select value={manageForm.priority} onChange={e=>setManageForm({...manageForm,priority:e.target.value})}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select><input placeholder={L('마감 시간','截止时间')} value={manageForm.due_at} onChange={e=>setManageForm({...manageForm,due_at:e.target.value})}/></>} 
        {manageKind==='expense' && <><input placeholder={L('지출 항목 · Expense item','消费项目 · Expense item') } value={manageForm.item} onChange={e=>setManageForm({...manageForm,item:e.target.value})}/><input type="number" placeholder={L('금액 KRW · Amount','金额 KRW · Amount') } value={manageForm.amount} onChange={e=>setManageForm({...manageForm,amount:e.target.value})}/><input placeholder={L('카테고리 · Category','类别 · Category') } value={manageForm.category} onChange={e=>setManageForm({...manageForm,category:e.target.value})}/></>} 
        {manageKind==='ingredient' && <><input placeholder={L('식재료 이름 · Ingredient','食材名称 · Ingredient') } value={manageForm.name} onChange={e=>setManageForm({...manageForm,name:e.target.value})}/><input placeholder={L('수량 · Quantity','数量 · Quantity') } value={manageForm.quantity} onChange={e=>setManageForm({...manageForm,quantity:e.target.value})}/><input placeholder={L('유효기간 예: 3일 후 · Expiry','有效期，例如：3天后 · Expiry') } value={manageForm.expires_on} onChange={e=>setManageForm({...manageForm,expires_on:e.target.value})}/></>} 
        <button className="primary" onClick={addContextItem} disabled={busy}>{L('Context에 추가','添加到 Context')}</button>
      </div>
      {manageNotice && <div className="manageNotice">{T(manageNotice)}</div>}
      <div className="historyBlock"><div className="historyHead"><span>ACTION HISTORY</span><small>{L('최근 10개 · Undo 가능','最近10条 · 可 Undo')} · ACTION LOG</small></div>{data.history?.length ? data.history.map(h=><div className="historyRow" key={h.id}><div><b>{T(h.summary)}</b><small>{h.operation} · {h.entity_type} · #{h.entity_id ?? '-'}</small></div><button disabled={h.undone} onClick={()=>undoHistory(h.id)}>{h.undone?L('취소됨 · Undone','已撤销 · Undone'):L('실행 취소 · Undo','撤销操作 · Undo')}</button></div>) : <div className="emptyTrace compact">{L('아직 작업 기록이 없습니다. Context를 추가, 수정 또는 삭제하면 여기에 기록됩니다.','暂无操作记录。新增、修改或删除 Context 后会记录在这里。')}<small className="enTitle">No action history yet.</small></div>}</div>
    </section>


    <section className="card evaluationCard" id="evaluation">
      <div className="cardHead">
        <div><span className="sectionTag">EVALUATION LAB</span><h3>{L('재현 가능한 실험 · 지표 검증','可重复实验 · 指标验证')}<small className="enTitle">Reproducible Evaluation & Metrics</small></h3></div>
        <small>THESIS METRICS · NO API REQUIRED</small>
      </div>
      <div className="evaluationIntro">
        <div className="evaluationCopy">
          <h4>{L('단순히 “작동한다”를 보여주는 것이 아니라 “올바르게 작동하는가”를 측정합니다.','不只是展示“能运行”，而是测量“是否运行正确”。')}<small className="enTitle">Measure whether the system works correctly, not merely whether it runs.</small></h4>
          <p className="evaluationDescription">{L('v1.2는 로컬 결정적 테스트 스위트를 유지하여 시간 충돌 감지, 할 일 우선순위, Context 커버리지, 읽기 전용 Safety Gate, 사용자 데이터 격리를 검증합니다. 결과는 반복 실행 가능하며 졸업논문 실험·평가 장에 활용할 수 있습니다.','v1.2 通过本地确定性测试套件验证时间冲突检测、待办优先级、Context 覆盖率、只读 Safety Gate 与用户数据隔离。结果可重复运行，并可用于毕业论文的实验与评估章节。')}<small className="enBody">v1.2 uses a local deterministic test suite to verify schedule-conflict detection, task priority, Context coverage, the read-only Safety Gate, and user-data isolation. The results are reproducible and suitable for the thesis evaluation chapter.</small></p>
        </div>
        <button className="primary plannerButton evaluationButton" onClick={runEvaluation} disabled={evaluationBusy || busy}>{evaluationBusy ? L('평가 실행 중…','评估运行中…') : L('평가 스위트 실행','运行评估套件')}<small className="buttonEn">{evaluationBusy ? 'Running Evaluation…' : 'Run Evaluation Suite'}</small></button>
      </div>
      {evaluation ? <>
        <div className="evaluationMetrics">
          <div><span>PASS RATE</span><strong>{Math.round(Number(evaluation.pass_rate||0)*100)}%</strong><small>{evaluation.tests_passed}/{evaluation.tests_total} tests passed</small></div>
          <div><span>SAFETY RATE</span><strong>{Math.round(Number(evaluation.safety_rate||0)*100)}%</strong><small>Safety + Security checks</small></div>
          <div><span>LOCAL LATENCY</span><strong>{evaluation.latency_ms} ms</strong><small>{L('현재 장치의 1회 테스트 스위트','当前设备单次测试套件')} · LOCAL</small></div>
          <div><span>SOURCE</span><strong>LOCAL</strong><small>{L('재현 가능 · 외부 API 미호출','可重复 · 不调用外部 API')} · LOCAL</small></div>
        </div>
        <div className="evaluationList">
          {(evaluation.tests||[]).map((t,i)=><div className={`evaluationRow ${t.passed?'pass':'fail'}`} key={`${t.name}-${i}`}>
            <span>{t.passed?'PASS':'FAIL'}</span><div><b>{evaluationName(t.name)}<small className="enTitle block">{evaluationNameEn(t.name)}</small></b><small>{t.category} · {T(t.detail)}</small></div>
          </div>)}
        </div>
        <div className="evaluationNote">{L('이 결과는 로컬 재현 가능 테스트에서 나온 것이며 범용 대규모 모델 벤치마크 점수를 의미하지 않습니다.','该结果来自本地可重复测试，并不代表通用大模型基准测试得分。')}<small className="enBody">These results come from reproducible local tests and are not a general-purpose large-model benchmark score.</small></div>
      </> : <div className="emptyTrace compact">{L('“평가 스위트 실행”을 클릭하면 로컬에서 고정 테스트를 실행하고 Pass Rate, Safety Rate, Latency, 항목별 근거를 생성합니다.','点击“运行评估套件”后，将在本地运行固定测试并生成 Pass Rate、Safety Rate、Latency 和逐项证据。')}</div>}
    </section>

    <section className="stats">
      <div className="card stat"><span>{L('생활 Context','生活 Context')}<small className="enTitle">LIFE CONTEXT</small></span><strong>{data.schedules.length + data.tasks.length + data.ingredients.length + data.preferences.length}</strong><small>{L('구조화 Context 항목','结构化 Context 项')} · STRUCTURED</small></div>
      <div className="card stat"><span>{L('최근 일정','近期日程')}<small className="enTitle">RECENT SCHEDULE</small></span><strong>{data.schedules.length}</strong><small>SCHEDULE CONTEXT</small></div>
      <div className="card stat"><span>{L('할 일','待办任务')}<small className="enTitle">TASKS</small></span><strong>{data.tasks.length}</strong><small>TASK CONTEXT</small></div>
      <div className="card stat"><span>{L('누적 지출','累计支出')}<small className="enTitle">TOTAL EXPENSE</small></span><strong>₩ {Number(data.expense_total).toLocaleString()}</strong><small>EXPENSE CONTEXT</small></div>
    </section>

    <section className="workbench">
      <div className="card traceCard">
        <div className="cardHead"><div><span className="sectionTag">AGENT TRACE</span><h3>{L('Agent 의사결정 흐름','Agent 决策链路')}<small className="enTitle">Agent Decision Flow</small></h3></div><small>{L('발표 시각화','答辩可视化')} · DEFENSE VIEW</small></div>
        {trace.length ? <div className="trace">
          {trace.map((x,i)=><div className={`traceItem ${x.status || 'done'}`} key={`${x.stage}-${i}`}>
            <div className="traceIndex">{String(i+1).padStart(2,'0')}</div>
            <div><b>{T(x.title)}</b><small>{T(x.detail)}</small></div>
            <span>{x.stage}</span>
          </div>)}
        </div> : <div className="emptyTrace">{L('Agent 요청을 실행하면 Input → Context → Reasoning → Tool → Safety → Execution 흐름을 표시합니다. 단순한 AI 텍스트만 보여주지 않습니다.','运行 Agent 请求后，将展示 Input → Context → Reasoning → Tool → Safety → Execution 流程，而不是只显示 AI 文本。')}</div>}
      </div>

      <div className="card contextCard">
        <div className="cardHead"><div><span className="sectionTag">CONTEXT DIFF</span><h3>{L('실행 전 / 실행 후','执行前 / 执行后')}<small className="enTitle">Before / After Execution</small></h3></div><small>{L('실제 쓰기 여부 검증','验证真实写入状态')} · WRITE CHECK</small></div>
        {beforeContext ? <div className="diffGrid">
          <div><span>{L('일정','日程')} · SCHEDULE</span><b>{beforeContext.schedules} → {afterContext?.schedules ?? L('대기','等待')}</b><small>{diff ? formatDelta(diff.schedules, lang) : L('실행 대기','等待执行')}</small></div>
          <div><span>{L('지출 항목','支出项目')} · EXPENSES</span><b>{beforeContext.expenses} → {afterContext?.expenses ?? L('대기','等待')}</b><small>{diff ? formatDelta(diff.expenses, lang) : L('실행 대기','等待执行')}</small></div>
          <div><span>{L('누적 지출','累计支出')} · TOTAL EXPENSE</span><b>₩{beforeContext.expense_total.toLocaleString()} → {afterContext ? `₩${afterContext.expense_total.toLocaleString()}` : L('대기','等待')}</b><small>{diff ? `₩${diff.expense_total.toLocaleString()}` : L('실행 대기','等待执行')}</small></div>
          <div><span>{L('안전 상태','安全状态')} · SAFETY</span><b>{pending ? 'WAITING' : afterContext ? 'RESOLVED' : 'READ ONLY'}</b><small>{pending ? L('데이터베이스 미변경','数据库未修改') : L('작업 상태 확정','操作状态已确认')}</small></div>
        </div> : <div className="emptyTrace compact">{L('요청을 실행하면 Context 변경 전후 차이를 표시해 Human-in-the-loop가 실제로 작동함을 증명합니다.','运行请求后会显示 Context 修改前后的差异，用于证明 Human-in-the-loop 确实生效。')}</div>}
      </div>
    </section>

    <section className="contextWide card">
      <div className="cardHead"><div><span className="sectionTag">LIVE CONTEXT</span><h3>Personal Context Snapshot</h3></div><small>{L('실시간 갱신','实时更新')} · LIVE</small></div>
      <div className="contextGrid wide">
        <div><span>{L('선호','偏好')} · PREFERENCE</span>{data.preferences.length ? data.preferences.slice(0,3).map(x=><p key={x.id}><b>{T(x.key)}</b><small>{T(x.value)}</small></p>) : <em>{L('선호 없음','暂无偏好')}</em>}</div>
        <div><span>{L('유통기한 임박 식재료','临期食材')} · EXPIRING FOOD</span>{expiring.length ? expiring.map(x=><p key={x.id}><b>{T(x.name)}</b><small>{T(x.quantity)} · {T(x.expires_on)}</small></p>) : <em>{L('기록 없음','暂无记录')}</em>}</div>
        <div><span>{L('확인 대기 작업','待确认操作')} · PENDING ACTIONS</span>{data.pending_actions?.length ? data.pending_actions.slice(0,3).map(x=><p key={x.id}><b>#{x.id} {T(x.summary)}</b><small>{x.status}</small></p>) : <em>{L('확인 대기 작업 없음','暂无待确认操作')}</em>}</div>
      </div>
    </section>

    <section className="grid">
      <div className="card listCard"><span className="sectionTag">SCHEDULE</span><h3>{L('스마트 일정','智能日程')}</h3>{data.schedules.length ? data.schedules.map(x=><div className="row manageRow" key={x.id}><div><b>{T(x.title)}</b><small>{T(x.scheduled_at)}</small></div><div><button onClick={()=>editItem('schedule',x)}>{L('수정 · Edit','修改 · Edit')}</button><button onClick={()=>removeItem('schedule',x.id)}>{L('삭제 · Delete','删除 · Delete')}</button></div></div>) : <p className="muted">{L('데이터 없음','暂无数据')}</p>}</div>
      <div className="card listCard"><span className="sectionTag">TASKS</span><h3>{L('할 일 / 우선순위','待办 / 优先级')}</h3>{data.tasks.length ? data.tasks.map(x=><div className="row manageRow" key={x.id}><div><b>{T(x.title)}</b><small>{x.priority} · {T(x.due_at) || L('마감 미설정','未设置截止时间')}</small></div><div><button onClick={()=>toggleTask(x)}>{L('완료 · Done','完成 · Done')}</button><button onClick={()=>editItem('task',x)}>{L('수정 · Edit','修改 · Edit')}</button><button onClick={()=>removeItem('task',x.id)}>{L('삭제 · Delete','删除 · Delete')}</button></div></div>) : <p className="muted">{L('데이터 없음','暂无数据')}</p>}</div>
      <div className="card listCard"><span className="sectionTag">EXPENSES</span><h3>{L('지출 Context','消费 Context')}</h3>{data.expenses.length ? data.expenses.map(x=><div className="row manageRow" key={x.id}><div><b>{T(x.item)}</b><small>₩ {Number(x.amount).toLocaleString()} · {T(x.category)}</small></div><div><button onClick={()=>editItem('expense',x)}>{L('수정 · Edit','修改 · Edit')}</button><button onClick={()=>removeItem('expense',x.id)}>{L('삭제 · Delete','删除 · Delete')}</button></div></div>) : <p className="muted">{L('데이터 없음','暂无数据')}</p>}</div>
      <div className="card listCard"><span className="sectionTag">FOOD</span><h3>{L('냉장고 / 식재료','冰箱 / 食材')}</h3>{data.ingredients.length ? data.ingredients.map(x=><div className="row manageRow" key={x.id}><div><b>{T(x.name)}</b><small>{T(x.quantity)}{x.expires_on ? ` · ${T(x.expires_on)}` : ''}</small></div><div><button onClick={()=>editItem('ingredient',x)}>{L('수정 · Edit','修改 · Edit')}</button><button onClick={()=>removeItem('ingredient',x.id)}>{L('삭제 · Delete','删除 · Delete')}</button></div></div>) : <p className="muted">{L('식재료 Context 없음','暂无食材 Context')}</p>}</div>
    </section>

    <footer>Life Agent v1.2 · Voice Input · AI Capability Gateway · Multimodal Review · Evaluation Lab</footer>
  
    <nav className="mobileNav" aria-label="Mobile navigation">
      <a href="#home"><span>⌂</span><small>{L('홈','首页')}</small></a>
      <a href="#planner"><span>◫</span><small>{L('계획','规划')}</small></a>
      <a href="#manager"><span>＋</span><small>{L('데이터','数据')}</small></a>
      <a href="#evaluation"><span>✓</span><small>{L('평가','评估')}</small></a>
      {user.role==='admin' && <a href="/admin"><span>⚙</span><small>Admin</small></a>}
    </nav>
</main>
}
