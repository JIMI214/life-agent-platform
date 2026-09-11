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

function formatDelta(value) {
  if (!value) return '변화 없음';
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
      if (!r.ok) throw new Error(j.detail || '인증 실패');
      localStorage.setItem('lifeagent_token', j.token);
      window.location.reload();
    } catch (e) { setAuthError(e.message || '로그인 실패'); }
  }

  async function logout() {
    try { await authorizedFetch(`${API}/auth/logout`, {method:'POST'}); } catch {}
    localStorage.removeItem('lifeagent_token');
    window.location.reload();
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
    const saved = localStorage.getItem('lifeagent_token');
    if (!saved) { setAuthReady(true); return; }
    fetch(`${API}/auth/me`, {headers:{Authorization:`Bearer ${saved}`}})
      .then(async r => { if (!r.ok) throw new Error('expired'); const me = await r.json(); setToken(saved); setUser(me); setAuthReady(true); })
      .catch(() => { localStorage.removeItem('lifeagent_token'); setAuthReady(true); });
  }, []);

  useEffect(() => { if (token && user) refresh(); }, [token, user]);


  function startVoiceInput() {
    if (typeof window === 'undefined') return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSupported(false);
      setVoiceNote('현재 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 권장합니다.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = lang === 'zh' ? 'zh-CN' : 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListening(true);
    setVoiceNote('듣고 있습니다. 생활 관리 목표를 말씀해 주세요…');
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setMessage(transcript);
        setVoiceNote(`인식 완료: ${transcript}`);
      }
    };
    recognition.onerror = (event) => {
      setVoiceNote(`음성 인식을 완료하지 못했습니다: ${event.error || 'unknown error'}`);
    };
    recognition.onend = () => setListening(false);
    try { recognition.start(); }
    catch { setListening(false); setVoiceNote('음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
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
    setLastDecision('Agent가 Context를 읽는 중');
    try {
      const r = await authorizedFetch(`${API}/agent`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({message: actual})
      });
      if (!r.ok) throw new Error('agent');
      const j = await r.json();
      setReply(j.message || '');
      setTrace(j.trace || []);
      setPending(j.pending_action || null);
      setLastDecision(j.pending_action ? '사용자 확인 대기' : '읽기 전용 응답 · 데이터 변경 없음');
      const d = await refresh();
      if (!j.pending_action && d) setAfterContext(snapshot(d));
    } catch {
      setReply('백엔드에 연결할 수 없습니다. FastAPI v1.1 실행 상태를 확인해 주세요.');
      setLastDecision('연결 실패');
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
      setReply(j.message || '작업 완료');
      setTrace(t => [...t, {
        stage:'execution',
        title: approve ? 'Tool 실행' : '실행 거부',
        detail: approve ? '사용자 확인 후에만 쓰기를 실행하고 Personal Context를 갱신합니다.' : '사용자가 작업을 거부하여 데이터베이스는 변경되지 않습니다.',
        status: approve ? 'done' : 'blocked'
      }]);
      setPending(null);
      setLastDecision(approve ? '확인 후 실행 완료' : '거부됨 · 데이터 변경 없음');
      const d = await refresh();
      if (d) setAfterContext(snapshot(d));
    } catch {
      setReply('확인 작업에 실패했습니다. 백엔드 터미널을 확인해 주세요.');
      setLastDecision('실행 실패');
    }
    setBusy(false);
  }

  async function seedDemo() {
    setBusy(true);
    try {
      await authorizedFetch(`${API}/demo/seed`, {method:'POST'});
      setReply('데모 데이터를 불러왔습니다. 이제 “내일 일정을 계획해 줘”를 실행하면 Context-aware 계획을 확인할 수 있습니다.');
      setTrace([]);
      setPending(null);
      setBeforeContext(null);
      setAfterContext(null);
      setLastDecision('데모 데이터 로드 완료');
      await refresh();
    } catch {
      setReply('데모 데이터 로드에 실패했습니다. 백엔드 실행 상태를 확인해 주세요.');
    } finally { setBusy(false); }
  }

  async function generateDailyPlan() {
    setPlannerBusy(true);
    setLastDecision('교차 도메인 생활 계획 생성 중');
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
      setReply(j.summary || '통합 생활 계획이 생성되었습니다.');
      setPending(null);
      setBeforeContext(snapshot(data));
      setAfterContext(snapshot(data));
      setLastDecision('읽기 전용 통합 계획 · 데이터 변경 없음');
    } catch {
      setReply('통합 계획 생성에 실패했습니다. FastAPI v1.1 실행 상태를 확인해 주세요.');
      setLastDecision('계획 실패');
    }
    setPlannerBusy(false);
  }


  async function analyzeDecision() {
    setDecisionBusy(true);
    setLastDecision('Local Reasoning이 충돌을 분석하는 중');
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
      setReply(j.recommendation || '로컬 의사결정 분석이 완료되었습니다.');
      setPending(null);
      setBeforeContext(snapshot(data));
      setAfterContext(snapshot(data));
      setLastDecision(`로컬 추론 완료 · 위험 ${j.risk}`);
    } catch {
      setReply('의사결정 분석에 실패했습니다. FastAPI v1.1 실행 상태를 확인해 주세요.');
      setLastDecision('추론 실패');
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
    } catch { setVisionError('이미지 분석에 실패했습니다. 백엔드 실행 상태를 확인해 주세요.'); }
    setVisionBusy(false);
  }

  async function proposeVisionWrite() {
    if (!visionResult) return;
    setBusy(true); setVisionError('');
    try {
      const r = await authorizedFetch(`${API}/vision/propose`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:visionKind,result:visionResult})});
      if (!r.ok) throw new Error('proposal');
      const j = await r.json();
      setPending(j); setReply(j.summary + '. 확인 후 실행해 주세요.');
      setTrace([
        {stage:'input',title:'이미지 입력',detail:visionKind === 'receipt' ? '영수증 이미지' : '냉장고 / 식재료 이미지',status:'done'},
        {stage:'vision',title:'멀티모달 이해',detail:`인식 소스: ${visionResult.source || 'unknown'} · confidence ${visionResult.confidence ?? '-'}`,status:'done'},
        {stage:'tool',title:'Tool 준비',detail:j.summary,status:'done'},
        {stage:'safety',title:'Human-in-the-loop',detail:'데이터베이스는 아직 변경되지 않았으며 사용자 확인을 기다립니다.',status:'waiting'}
      ]);
      setBeforeContext(snapshot(data)); setAfterContext(null); setLastDecision('사용자 확인 대기');
    } catch { setVisionError('확인 대기 작업을 생성하지 못했습니다.'); }
    setBusy(false);
  }

  async function runEvaluation() {
    setEvaluationBusy(true);
    setLastDecision('로컬 평가 스위트 실행 중');
    try {
      const r = await authorizedFetch(`${API}/evaluation/run`, {method:'POST'});
      if (!r.ok) throw new Error('evaluation');
      const j = await r.json();
      setEvaluation(j);
      setReply(`평가 완료: ${j.tests_passed}/${j.tests_total} 통과 · Pass Rate ${Math.round(Number(j.pass_rate||0)*100)}%`);
      setTrace([
        {stage:'evaluation',title:'결정적 테스트 실행',detail:`총 ${j.tests_total}개 · 로컬 실행 ${j.latency_ms} ms`,status:'done'},
        {stage:'metrics',title:'정량 지표 계산',detail:`Pass Rate ${Math.round(Number(j.pass_rate||0)*100)}% · Safety ${Math.round(Number(j.safety_rate||0)*100)}%`,status:'done'},
        {stage:'evidence',title:'항목별 결과 보존',detail:'각 테스트는 범주, 기대 동작, 실제 결과를 표시하며 논문 실험 장에 활용할 수 있습니다.',status:'done'}
      ]);
      setLastDecision('평가 완료');
    } catch {
      setReply('평가에 실패했습니다. FastAPI v1.1 실행 상태를 확인해 주세요.');
      setLastDecision('평가 실패');
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
      setReply('발표 시연 환경 준비 완료: 데모 데이터, 평가 지표, 시스템 요약이 생성되었습니다.');
      setLastDecision('DEFENSE MODE READY');
    } catch {
      setReply('발표 시연 모드 준비에 실패했습니다. FastAPI v1.1 실행 상태를 확인해 주세요.');
    }
    setDefenseBusy(false);
  }

  function exportDefenseReport() {
    if (!defenseSummary) return;
    const payload = {generated_at:new Date().toISOString(), user:{username:user.username,display_name:user.display_name}, ...defenseSummary};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='life-agent-v1.1-defense-report.json'; a.click();
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
      if (manageKind === 'schedule') await apiWrite('/schedules','POST',{title:manageForm.title || '새 일정', scheduled_at:manageForm.scheduled_at || '미정'});
      if (manageKind === 'task') await apiWrite('/tasks','POST',{title:manageForm.title || '새 할 일', priority:manageForm.priority, due_at:manageForm.due_at || null});
      if (manageKind === 'expense') await apiWrite('/expenses','POST',{item:manageForm.item || '지출', amount:Number(manageForm.amount || 0), category:manageForm.category || 'other'});
      if (manageKind === 'ingredient') await apiWrite('/ingredients','POST',{name:manageForm.name || '식재료', quantity:manageForm.quantity || '1', expires_on:manageForm.expires_on || null});
      setManageNotice('Personal Context에 저장하고 작업 기록에 추가했습니다.');
      await refresh();
    } catch { setManageNotice('작업에 실패했습니다. 입력값과 백엔드를 확인해 주세요.'); }
    setBusy(false);
  }

  async function removeItem(kind,id) {
    if (!window.confirm('이 데이터를 삭제하시겠습니까? 작업 기록에서 실행 취소할 수 있습니다.')) return;
    try { await apiWrite(`/${kind}s/${id}`,'DELETE'); setManageNotice('삭제 완료 · 작업 기록에서 실행 취소할 수 있습니다.'); await refresh(); }
    catch { setManageNotice('삭제 실패'); }
  }

  async function toggleTask(x) {
    try { await apiWrite(`/tasks/${x.id}`,'PATCH',{completed:!x.completed}); setManageNotice(x.completed?'할 일을 미완료 상태로 되돌렸습니다.':'할 일을 완료로 표시했습니다.'); await refresh(); }
    catch { setManageNotice('할 일 상태 업데이트 실패'); }
  }

  async function editItem(kind,x) {
    try {
      let body={};
      if(kind==='schedule') { const title=window.prompt('일정 제목',x.title); if(title===null)return; const t=window.prompt('시간',x.scheduled_at); if(t===null)return; body={title,scheduled_at:t}; }
      if(kind==='task') { const title=window.prompt('할 일 제목',x.title); if(title===null)return; const priority=window.prompt('우선순위 high / medium / low',x.priority); if(priority===null)return; body={title,priority}; }
      if(kind==='expense') { const item=window.prompt('지출 항목',x.item); if(item===null)return; const amount=window.prompt('금액',String(x.amount)); if(amount===null)return; body={item,amount:Number(amount)}; }
      if(kind==='ingredient') { const name=window.prompt('식재료 이름',x.name); if(name===null)return; const quantity=window.prompt('수량',x.quantity); if(quantity===null)return; body={name,quantity}; }
      await apiWrite(`/${kind}s/${x.id}`,'PATCH',body); setManageNotice('수정 완료 · 작업 기록에 저장했습니다.'); await refresh();
    } catch { setManageNotice('수정 실패'); }
  }

  async function undoHistory(id) {
    try { const j=await apiWrite(`/history/${id}/undo`,'POST'); setManageNotice(j.message || '실행 취소 완료'); await refresh(); }
    catch { setManageNotice('실행 취소에 실패했습니다. 이미 취소되었거나 데이터가 변경되었을 수 있습니다.'); }
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

  if (!authReady) return <main className="authPage"><section className="authCard card"><span className="sectionTag">LIFE AGENT v1.1</span><h1>보안 세션 복원 중…<small className="zhTitle">正在恢复安全会话…</small></h1></section></main>;

  if (!token || !user) return <main className="authPage">
    <section className="authCard card">
      <span className="sectionTag">USER AUTHENTICATION</span>
      <h1>Life Agent <span>v1.1</span></h1>
      <p>각 계정은 독립적인 Schedule / Task / Expense / Ingredient / Preference Context를 사용합니다. 사용자 간 데이터는 서로 섞이지 않습니다.</p>
      {authMode==='register' && <input placeholder="표시 이름" value={authForm.display_name} onChange={e=>setAuthForm({...authForm,display_name:e.target.value})}/>} 
      <input placeholder="사용자 이름" value={authForm.username} onChange={e=>setAuthForm({...authForm,username:e.target.value})}/>
      <input type="password" placeholder="비밀번호 (최소 6자)" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')submitAuth()}}/>
      {authError && <div className="visionError">{authError}</div>}
      <button className="primary" onClick={submitAuth}>{authMode==='register'?'계정 생성 후 시작':'로그인'}</button>
      <button className="ghost authSwitch" onClick={()=>{setAuthError('');setAuthMode(authMode==='login'?'register':'login')}}>{authMode==='login'?'계정이 없나요? 회원가입':'이미 계정이 있나요? 로그인'}</button>
      <div className="authArchitecture"><span>LOGIN</span><i>→</i><span>SESSION</span><i>→</i><span>USER ID</span><i>→</i><span>ISOLATED CONTEXT</span></div>
    </section>
  </main>;

  return <main>
    <header className="topbar">
      <div>
        <p className="eyebrow">CONTEXT-AWARE PERSONAL LIFE AGENT</p>
        <h1>Life Agent <span>v1.1</span></h1>
        <p className="subtitle">Voice Input · API-ready LLM Layer · Multimodal Review · User-isolated Context · Human-in-the-loop</p>
      </div>
      <div className="headerActions">
        <div className="userBadge"><small>ACTIVE USER</small><b>{user.display_name}</b><span>@{user.username}</span></div>{user.role==='admin' && <button className="adminShortcut" onClick={()=>{window.location.href='/admin'}}>ADMIN</button>}
        <div className="languageSwitch" aria-label="Language"><button className={lang==='ko'?'active':''} onClick={()=>changeLanguage('ko')}>한국어</button><button className={lang==='zh'?'active':''} onClick={()=>changeLanguage('zh')}>中文</button></div><button className="ghost" onClick={logout}>{L('로그아웃','退出登录')}</button>
        <span className={`mode ${mode}`}>{mode === 'openai' ? 'LLM MODE' : 'DEMO MODE'}</span>
        <button className="ghost" onClick={seedDemo} disabled={busy}>{L('데모 데이터 불러오기','加载演示数据')}</button>
      </div>
    </header>

    <section className="card defenseCard">
      <div className="cardHead"><div><span className="sectionTag">DEFENSE MODE · v1.1</span><h3>{L('원클릭 졸업작품 발표 준비','一键准备答辩演示')}<small className="zhTitle">{L('一键准备答辩演示','원클릭 졸업작품 발표 준비')}</small></h3></div><small>{defenseSummary?.demo_ready ? 'READY' : 'NOT PREPARED'}</small></div>
      <div className="defenseIntro"><div><h4>교수님의 핵심 질문에 답할 근거를 한곳에 모았습니다.<small className="zhTitle">把最容易被老师追问的证据集中到一个地方。</small></h4><p>{L('데모 Context를 자동 로드하고 로컬 평가를 실행한 뒤 아키텍처, 사용자 격리, Safety Gate, Undo, capability 상태를 요약합니다. API Key가 없어도 핵심 시스템을 완전히 시연할 수 있습니다.','自动加载演示 Context 并运行本地评估，然后汇总架构、用户隔离、Safety Gate、Undo 与 capability 状态。即使没有 API Key，也能完整演示核心系统。')}</p></div><div className="defenseActions"><button className="primary" onClick={prepareDefenseDemo} disabled={defenseBusy || busy}>{defenseBusy?L('시연 환경 준비 중…','正在准备演示环境…'):L('발표 시연 준비','准备答辩演示')}</button><button className="ghost" onClick={exportDefenseReport} disabled={!defenseSummary}>{L('실험 요약 내보내기','导出实验摘要')}</button></div></div>
      {defenseSummary && <div className="defenseGrid">
        <div><span>ARCHITECTURE</span><b>8 stages</b><small>{defenseSummary.architecture.join(' → ')}</small></div>
        <div><span>EVALUATION</span><b>{defenseSummary.evaluation.tests_passed}/{defenseSummary.evaluation.tests_total}</b><small>Pass {Math.round(defenseSummary.evaluation.pass_rate*100)}% · Safety {Math.round(defenseSummary.evaluation.safety_rate*100)}%</small></div>
        <div><span>USER ISOLATION</span><b>ENABLED</b><small>Context bound to authenticated user</small></div>
        <div><span>WRITE SAFETY</span><b>CONFIRM + UNDO</b><small>쓰기 전 확인 · 작업 기록 · Undo</small></div>
      </div>}
    </section>

    <section className="hero card" id="home">
      <div className="heroCopy">
        <span className="sectionTag">PERSONAL CONTEXT ENGINE</span>
        <h2>{L('생활 상태를 먼저 이해한 뒤, 도구 호출 여부를 결정합니다.','先理解生活状态，再决定是否调用工具。')}<small className="zhTitle">{L('先理解生活状态，再决定是否调用工具。','생활 상태를 먼저 이해한 뒤, 도구 호출 여부를 결정합니다.')}</small></h2>
        <p>{L('Agent는 현재 로그인 사용자의 일정, 할 일, 지출, 식재료, 선호만 읽습니다. 계정별 Context는 완전히 격리되며 모든 데이터베이스 쓰기는 사용자의 명시적 확인을 거칩니다.','Agent 只读取当前登录用户的日程、待办、支出、食材与偏好。不同账号的 Context 完全隔离，任何数据库写入都必须经过用户明确确认。')}</p>
        <div className="chips">
          {quickPrompts.map(x => <button key={x} onClick={() => send(x)} disabled={busy}>{x}</button>)}
        </div>
        <div className="architecture">
          <span>INPUT</span><i>→</i><span>CONTEXT</span><i>→</i><span>REASONING</span><i>→</i><span>TOOL</span><i>→</i><span>SAFETY</span><i>→</i><span>EXECUTION</span>
        </div>
      </div>
      <div className="agentPanel">
        <div className="panelTitle"><label>{L('Life Agent에게 목표를 입력하세요','给 Life Agent 一个目标')}<small className="zhTitle">{L('给 Life Agent 一个目标','Life Agent에게 목표를 입력하세요')}</small></label><span>{lastDecision}</span></div>
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={L('예: 오늘 커피에 4,500원을 썼어','例如：今天咖啡花了4500韩元')} />
        <div className="agentActionRow">
          <button className={`voiceButton ${listening ? 'listening' : ''}`} onClick={startVoiceInput} disabled={busy || listening}>{listening ? L('🎙 듣는 중…','🎙 正在聆听…') : L('🎙 음성 입력','🎙 语音输入')}</button>
          <button className="primary" onClick={() => send()} disabled={busy}>{busy ? L('Agent 처리 중…','Agent 处理中…') : L('Agent 실행','运行 Agent')}</button>
        </div>
        {voiceNote && <div className={`voiceNote ${voiceSupported ? '' : 'unsupported'}`}>{voiceNote}</div>}
        {reply && <div className="reply">{reply.split('\n').map((x,i)=><span key={i}>{x || <br/>}</span>)}</div>}
        {pending && <div className="approval">
          <div><b>{L('사용자 확인 필요','需要用户确认')}</b><small>{pending.summary}</small><em>{L('아직 데이터베이스에 쓰지 않았습니다','尚未写入数据库')}</em></div>
          <div className="approvalBtns"><button onClick={() => confirm(false)} disabled={busy}>{L('거부','拒绝')}</button><button className="approve" onClick={() => confirm(true)} disabled={busy}>{L('확인 후 실행','确认执行')}</button></div>
        </div>}
      </div>
    </section>

    <section className="card capabilityCard">
      <div className="cardHead">
        <div><span className="sectionTag">AI CAPABILITY GATEWAY</span><h3>{L('로컬 기능 + API-ready 지능형 계층','本地能力 + API-ready 智能层')}<small className="zhTitle">{L('本地能力 + API-ready 智能层','로컬 기능 + API-ready 지능형 계층')}</small></h3></div>
        <small>{capabilities?.llm?.enabled ? 'OPENAI CONNECTED' : 'LOCAL FALLBACK ACTIVE'}</small>
      </div>
      <div className="capabilityIntro">
        <h4>API Key 없이도 완전히 실행되며, 향후 모델 연동 시 시스템을 재구축할 필요가 없습니다.<small className="zhTitle">没有 API Key 也能完整运行；以后接入模型时不需要推翻系统。</small></h4>
        <p>Agent의 Context, Reasoning, Safety, Database, Evaluation은 외부 모델과 독립적으로 동작합니다. LLM / Vision은 교체 가능한 capability layer이며 API가 없으면 로컬 규칙과 Demo Vision을 자동 사용합니다.</p>
      </div>
      <div className="capabilityGrid">
        <div><span>LLM ROUTER</span><b>{capabilities?.llm?.enabled ? 'CONNECTED' : 'LOCAL FALLBACK'}</b><small>{capabilities?.llm?.model || 'deterministic rules'}</small></div>
        <div><span>VISION</span><b>{capabilities?.vision?.enabled ? 'REAL VISION' : 'DEMO FALLBACK'}</b><small>{capabilities?.vision?.model || 'demo recognizer'}</small></div>
        <div><span>VOICE INPUT</span><b>{voiceSupported ? 'BROWSER READY' : 'UNSUPPORTED'}</b><small>Web Speech · Chrome / Edge 권장</small></div>
        <div><span>SAFETY GATE</span><b>ENABLED</b><small>Confirm before write · Undo available</small></div>
      </div>
    </section>

    <section className="card plannerCard" id="planner">
      <div className="cardHead">
        <div><span className="sectionTag">CROSS-DOMAIN LIFE PLANNER</span><h3>{L('내일 통합 생활 계획','明日综合生活计划')}<small className="zhTitle">{L('明日综合生活计划','내일 통합 생활 계획')}</small></h3></div>
        <small>Schedule + Task + Food + Expense + Preference</small>
      </div>
      <div className="plannerIntro">
        <div>
          <h4>다섯 모듈을 단순히 나열하는 것이 아니라 서로 제약하도록 합니다.<small className="zhTitle">不是把五个模块摆在一起，而是让它们互相约束。</small></h4>
          <p>고정 일정은 먼저 유지하고, 우선순위가 높은 할 일을 빈 시간에 배치합니다. 식사는 냉장고 재고를 읽고, Expense Context는 보수적 알림만 제공하며, 개인 선호는 실행 규칙으로 사용합니다. 전체 계획 과정은 읽기 전용입니다.</p>
        </div>
        <button className="primary plannerButton" onClick={generateDailyPlan} disabled={plannerBusy || busy}>{plannerBusy ? L('통합 계획 생성 중…','正在生成综合计划…') : L('내일 통합 계획 생성','生成明日综合计划')}</button>
      </div>
      {dailyPlan ? <>
        <div className="plannerMeta">
          <div><span>CONTEXT COVERAGE</span><strong>{Math.round(Number(dailyPlan.coverage || 0) * 100)}%</strong><small>{(dailyPlan.context_domains || []).join(' · ') || '저 Context 모드'}</small></div>
          <div><span>PLANNER SOURCE</span><strong>{dailyPlan.source === 'openai' ? 'LLM' : 'RULE + DEMO'}</strong><small>읽기 전용 계획 · 쓰기 Tool 미호출</small></div>
          <div><span>PLAN NODES</span><strong>{dailyPlan.items?.length || 0}</strong><small>각 노드에 설명 가능한 근거 포함</small></div>
        </div>
        <div className="timeline">
          {(dailyPlan.items || []).map((x,i)=><div className="planNode" key={`${x.title}-${i}`}>
            <div className="planTime">{x.time || '제안'}</div>
            <div className="planBody"><div className="planTitle"><b>{x.title}</b><span>{x.type || 'plan'}</span></div><p>{x.reason}</p><div className="signals">{(x.signals || []).map(s=><em key={s}>{s}</em>)}</div></div>
          </div>)}
        </div>
        <div className="plannerInsights"><span>WHY THIS PLAN</span>{(dailyPlan.insights || []).map((x,i)=><p key={i}>✓ {x}</p>)}</div>
      </> : <div className="emptyTrace compact">데모 데이터를 불러온 뒤 “내일 통합 계획 생성”을 클릭하세요. v1.1은 일정, 할 일, 식재료, 지출, 선호를 한 번의 계획에 반영하고 각 결정의 Context 근거를 표시합니다.</div>}
    </section>


    <section className="card reasoningCard">
      <div className="cardHead">
        <div><span className="sectionTag">LOCAL REASONING ENGINE</span><h3>{L('충돌 감지 · 우선순위 평가 · 동적 재계획','冲突检测 · 优先级评分 · 动态重规划')}<small className="zhTitle">{L('冲突检测 · 优先级评分 · 动态重规划','충돌 감지 · 우선순위 평가 · 동적 재계획')}</small></h3></div>
        <small>NO API REQUIRED</small>
      </div>
      <div className="reasoningIntro">
        <div><h4>결정적 제약 조건을 먼저 계산한 뒤, 대규모 모델 필요 여부를 판단합니다.<small className="zhTitle">先做确定性约束计算，再决定是否需要大模型。</small></h4><p>후보 일정을 입력하면 v1.1이 기존 Schedule / Task Context를 읽고 로컬에서 시간 충돌, 위험 점수, 할 일 우선순위, 대체 시간을 계산합니다. API를 호출하지 않으며 데이터베이스를 자동 변경하지 않습니다.</p></div>
        <div className="decisionForm">
          <input value={decisionInput.title} onChange={e=>setDecisionInput({...decisionInput,title:e.target.value})} placeholder="후보 계획 예: 병원 가기" />
          <input value={decisionInput.proposed_at} onChange={e=>setDecisionInput({...decisionInput,proposed_at:e.target.value})} placeholder="예: 내일 15:00" />
          <input type="number" min="15" max="240" value={decisionInput.duration_minutes} onChange={e=>setDecisionInput({...decisionInput,duration_minutes:Number(e.target.value)||60})} />
          <button className="primary" onClick={analyzeDecision} disabled={decisionBusy || busy}>{decisionBusy ? L('제약 조건 계산 중…','正在计算约束…') : L('후보 계획 분석','分析候选计划')}</button>
        </div>
      </div>
      {decisionResult ? <div className="decisionResult">
        <div className="riskPanel"><span>CONFLICT RISK</span><strong className={`risk ${decisionResult.risk?.toLowerCase()}`}>{decisionResult.risk}</strong><b>{decisionResult.risk_score}/100</b><small>{decisionResult.source}</small></div>
        <div className="reasoningDetails">
          <div><span>충돌 감지</span>{decisionResult.conflicts?.length ? decisionResult.conflicts.map((x,i)=><p className="conflict" key={i}><b>⚠ {x.title}</b><small>{x.scheduled_at} · 약 {x.overlap_minutes}분 중복 · {x.severity}</small></p>) : <p className="safe"><b>✓ 고정 일정 충돌 없음</b><small>후보 시간을 다음 확인 단계로 진행할 수 있습니다.</small></p>}</div>
          <div><span>동적 조정안</span>{(decisionResult.alternatives||[]).map((x,i)=><p key={i}><b>{x.time}</b><small>{x.reason}</small></p>)}</div>
          <div><span>Task Priority Score</span>{(decisionResult.task_scores||[]).map((x,i)=><p key={i}><b>{x.score} · {x.title}</b><small>{x.priority || 'medium'} · {x.due_at || '마감 시간 없음'}</small></p>)}</div>
        </div>
        <div className="recommendation"><span>DECISION EXPLANATION</span><p>{decisionResult.recommendation}</p></div>
      </div> : <div className="emptyTrace compact">먼저 데모 데이터를 불러온 뒤 “병원 가기 / 내일 15:00 / 60분” 상태로 분석하세요. 데모 데이터의 15:30 졸업작품 회의와 겹치므로 HIGH 충돌이 감지되어야 합니다.</div>}
    </section>

    <section className="card multimodal">
      <div className="cardHead"><div><span className="sectionTag">MULTIMODAL VISION</span><h3>{L('이미지 → 구조화된 Context','图片 → 结构化 Context')}<small className="zhTitle">{L('图片 → 结构化 Context','이미지 → 구조화된 Context')}</small></h3></div><small>{mode === 'openai' ? 'REAL VISION' : 'Demo fallback'}</small></div>
      <div className="visionGrid">
        <div className="visionUpload">
          <div className="visionTabs"><button className={visionKind==='receipt'?'active':''} onClick={()=>{setVisionKind('receipt');setVisionResult(null)}}>{L('영수증 인식','小票识别')}</button><button className={visionKind==='fridge'?'active':''} onClick={()=>{setVisionKind('fridge');setVisionResult(null)}}>{L('냉장고 인식','冰箱识别')}</button></div>
          <label className="dropzone"><input type="file" accept="image/*" onChange={e=>analyzeImage(e.target.files?.[0])}/><b>{visionBusy ? '이미지 분석 중…' : '이미지 선택'}</b><small>JPG / PNG / WEBP 지원 · 최대 8MB</small></label>
          {visionError && <div className="visionError">{visionError}</div>}
        </div>
        <div className="visionResult">
          <span>STRUCTURED RESULT · REVIEWABLE</span>
          {visionPreview && <img className="visionPreviewImage" src={visionPreview} alt="업로드 미리보기" />}
          {visionResult ? <>
            {visionKind==='receipt' ? <div className="visionEditGrid">
              <label><small>가맹점</small><input value={visionResult.merchant || ''} onChange={e=>setVisionResult({...visionResult,merchant:e.target.value})}/></label>
              <label><small>금액 KRW</small><input type="number" value={visionResult.amount || 0} onChange={e=>setVisionResult({...visionResult,amount:Number(e.target.value||0)})}/></label>
              <label><small>카테고리</small><input value={visionResult.category || ''} onChange={e=>setVisionResult({...visionResult,category:e.target.value})}/></label>
              <div className="sourceBox"><small>소스</small><b>{visionResult.source || '-'}</b><em>confidence {visionResult.confidence ?? '-'}</em></div>
            </div> : <div className="ingredientPreview">{(visionResult.ingredients||[]).map((x,i)=><div key={i}><b>{x.name}</b><small>{x.quantity || '1'}{x.expires_on ? ` · ${x.expires_on}` : ''}</small></div>)}</div>}
            {visionResult.note && <div className="visionSourceNote">{visionResult.note}</div>}
            <button className="primary visionPropose" onClick={proposeVisionWrite} disabled={busy}>{L('확인 대기 작업 생성','生成待确认操作')}</button>
            <small className="visionNote">구조화 결과를 먼저 검토·수정한 뒤 작업을 생성합니다. 데이터베이스 쓰기는 Human-in-the-loop 확인을 거칩니다.</small>
          </> : <div className="emptyTrace compact">이미지를 업로드하면 사람이 수정할 수 있는 구조화 인식 결과가 여기에 표시됩니다.</div>}
        </div>
      </div>
    </section>

    <section className="card managerCard" id="manager">
      <div className="cardHead">
        <div><span className="sectionTag">CONTEXT DATA MANAGER</span><h3>{L('생활 데이터 관리 · CRUD · Undo','生活数据管理 · CRUD · Undo')}<small className="zhTitle">{L('生活数据管理 · CRUD · Undo','생활 데이터 관리 · CRUD · Undo')}</small></h3></div>
        <small>LOCAL DATABASE</small>
      </div>
      <div className="managerIntro"><div><h4>Agent는 분석뿐 아니라 실제 Context도 관리합니다.<small className="zhTitle">Agent 不只会分析，现在也能管理真实 Context。</small></h4><p>추가, 수정, 삭제, 할 일 상태 변경은 모두 Action History에 기록됩니다. 잘못된 작업은 Undo할 수 있어 시스템의 통제 가능한 실행 능력을 보여줍니다.</p></div></div>
      <div className="managerTabs">{['schedule','task','expense','ingredient'].map(k=><button key={k} className={manageKind===k?'active':''} onClick={()=>setManageKind(k)}>{({schedule:'일정',task:'할 일',expense:'지출',ingredient:'식재료'})[k]}</button>)}</div>
      <div className="managerForm">
        {(manageKind==='schedule'||manageKind==='task') && <input placeholder={manageKind==='schedule'?'일정 제목':'할 일 제목'} value={manageForm.title} onChange={e=>setManageForm({...manageForm,title:e.target.value})}/>} 
        {manageKind==='schedule' && <input placeholder="시간 예: 내일 09:00" value={manageForm.scheduled_at} onChange={e=>setManageForm({...manageForm,scheduled_at:e.target.value})}/>} 
        {manageKind==='task' && <><select value={manageForm.priority} onChange={e=>setManageForm({...manageForm,priority:e.target.value})}><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select><input placeholder="마감 시간" value={manageForm.due_at} onChange={e=>setManageForm({...manageForm,due_at:e.target.value})}/></>} 
        {manageKind==='expense' && <><input placeholder="지출 항목" value={manageForm.item} onChange={e=>setManageForm({...manageForm,item:e.target.value})}/><input type="number" placeholder="금액 KRW" value={manageForm.amount} onChange={e=>setManageForm({...manageForm,amount:e.target.value})}/><input placeholder="카테고리" value={manageForm.category} onChange={e=>setManageForm({...manageForm,category:e.target.value})}/></>} 
        {manageKind==='ingredient' && <><input placeholder="식재료 이름" value={manageForm.name} onChange={e=>setManageForm({...manageForm,name:e.target.value})}/><input placeholder="수량" value={manageForm.quantity} onChange={e=>setManageForm({...manageForm,quantity:e.target.value})}/><input placeholder="유효기간 예: 3일 후" value={manageForm.expires_on} onChange={e=>setManageForm({...manageForm,expires_on:e.target.value})}/></>} 
        <button className="primary" onClick={addContextItem} disabled={busy}>{L('Context에 추가','添加到 Context')}</button>
      </div>
      {manageNotice && <div className="manageNotice">{manageNotice}</div>}
      <div className="historyBlock"><div className="historyHead"><span>ACTION HISTORY</span><small>최근 10개 · Undo 가능</small></div>{data.history?.length ? data.history.map(h=><div className="historyRow" key={h.id}><div><b>{h.summary}</b><small>{h.operation} · {h.entity_type} · #{h.entity_id ?? '-'}</small></div><button disabled={h.undone} onClick={()=>undoHistory(h.id)}>{h.undone?'취소됨':'실행 취소'}</button></div>) : <div className="emptyTrace compact">아직 작업 기록이 없습니다. Context를 추가, 수정 또는 삭제하면 여기에 기록됩니다.</div>}</div>
    </section>


    <section className="card evaluationCard" id="evaluation">
      <div className="cardHead">
        <div><span className="sectionTag">EVALUATION LAB</span><h3>{L('재현 가능한 실험 · 지표 검증','可重复实验 · 指标验证')}<small className="zhTitle">{L('可重复实验 · 指标验证','재현 가능한 실험 · 지표 검증')}</small></h3></div>
        <small>THESIS METRICS · NO API REQUIRED</small>
      </div>
      <div className="evaluationIntro">
        <div><h4>단순히 “작동한다”를 보여주는 것이 아니라 “올바르게 작동하는가”를 측정합니다.<small className="zhTitle">不是只展示“它能跑”，而是测量“它跑得对不对”。</small></h4><p>v1.1은 로컬 결정적 테스트 스위트를 유지하여 시간 충돌 감지, 할 일 우선순위, Context 커버리지, 읽기 전용 Safety Gate, 사용자 데이터 격리를 검증합니다. 결과는 반복 실행 가능하며 졸업논문 실험·평가 장에 활용할 수 있습니다.</p></div>
        <button className="primary plannerButton" onClick={runEvaluation} disabled={evaluationBusy || busy}>{evaluationBusy ? L('평가 실행 중…','评估运行中…') : L('평가 스위트 실행','运行评估套件')}</button>
      </div>
      {evaluation ? <>
        <div className="evaluationMetrics">
          <div><span>PASS RATE</span><strong>{Math.round(Number(evaluation.pass_rate||0)*100)}%</strong><small>{evaluation.tests_passed}/{evaluation.tests_total} tests passed</small></div>
          <div><span>SAFETY RATE</span><strong>{Math.round(Number(evaluation.safety_rate||0)*100)}%</strong><small>Safety + Security checks</small></div>
          <div><span>LOCAL LATENCY</span><strong>{evaluation.latency_ms} ms</strong><small>현재 장치의 1회 테스트 스위트</small></div>
          <div><span>SOURCE</span><strong>LOCAL</strong><small>재현 가능 · 외부 API 미호출</small></div>
        </div>
        <div className="evaluationList">
          {(evaluation.tests||[]).map((t,i)=><div className={`evaluationRow ${t.passed?'pass':'fail'}`} key={`${t.name}-${i}`}>
            <span>{t.passed?'PASS':'FAIL'}</span><div><b>{t.name}</b><small>{t.category} · {t.detail}</small></div>
          </div>)}
        </div>
        <div className="evaluationNote">{evaluation.note}</div>
      </> : <div className="emptyTrace compact">“평가 스위트 실행”을 클릭하면 로컬에서 고정 테스트를 실행하고 Pass Rate, Safety Rate, Latency, 항목별 근거를 생성합니다.</div>}
    </section>

    <section className="stats">
      <div className="card stat"><span>생활 Context<small className="zhTitle">生活 Context</small></span><strong>{data.schedules.length + data.tasks.length + data.ingredients.length + data.preferences.length}</strong><small>구조화 Context 항목</small></div>
      <div className="card stat"><span>최근 일정<small className="zhTitle">近期日程</small></span><strong>{data.schedules.length}</strong><small>Schedule Context</small></div>
      <div className="card stat"><span>할 일<small className="zhTitle">待办任务</small></span><strong>{data.tasks.length}</strong><small>Task Context</small></div>
      <div className="card stat"><span>누적 지출<small className="zhTitle">累计支出</small></span><strong>₩ {Number(data.expense_total).toLocaleString()}</strong><small>Expense Context</small></div>
    </section>

    <section className="workbench">
      <div className="card traceCard">
        <div className="cardHead"><div><span className="sectionTag">AGENT TRACE</span><h3>{L('Agent 의사결정 흐름','Agent 决策链路')}<small className="zhTitle">{L('Agent 决策链路','Agent 의사결정 흐름')}</small></h3></div><small>발표 시각화</small></div>
        {trace.length ? <div className="trace">
          {trace.map((x,i)=><div className={`traceItem ${x.status || 'done'}`} key={`${x.stage}-${i}`}>
            <div className="traceIndex">{String(i+1).padStart(2,'0')}</div>
            <div><b>{x.title}</b><small>{x.detail}</small></div>
            <span>{x.stage}</span>
          </div>)}
        </div> : <div className="emptyTrace">Agent 요청을 실행하면 Input → Context → Reasoning → Tool → Safety → Execution 흐름을 표시합니다. 단순한 AI 텍스트만 보여주지 않습니다.</div>}
      </div>

      <div className="card contextCard">
        <div className="cardHead"><div><span className="sectionTag">CONTEXT DIFF</span><h3>{L('실행 전 / 실행 후','执行前 / 执行后')}<small className="zhTitle">{L('执行前 / 执行后','실행 전 / 실행 후')}</small></h3></div><small>실제 쓰기 여부 검증</small></div>
        {beforeContext ? <div className="diffGrid">
          <div><span>일정</span><b>{beforeContext.schedules} → {afterContext?.schedules ?? '대기'}</b><small>{diff ? formatDelta(diff.schedules) : '실행 대기'}</small></div>
          <div><span>지출 항목</span><b>{beforeContext.expenses} → {afterContext?.expenses ?? '대기'}</b><small>{diff ? formatDelta(diff.expenses) : '실행 대기'}</small></div>
          <div><span>누적 지출<small className="zhTitle">累计支出</small></span><b>₩{beforeContext.expense_total.toLocaleString()} → {afterContext ? `₩${afterContext.expense_total.toLocaleString()}` : '대기'}</b><small>{diff ? `₩${diff.expense_total.toLocaleString()}` : '실행 대기'}</small></div>
          <div><span>안전 상태</span><b>{pending ? 'WAITING' : afterContext ? 'RESOLVED' : 'READ ONLY'}</b><small>{pending ? '데이터베이스 미변경' : '작업 상태 확정'}</small></div>
        </div> : <div className="emptyTrace compact">요청을 실행하면 Context 변경 전후 차이를 표시해 Human-in-the-loop가 실제로 작동함을 증명합니다.</div>}
      </div>
    </section>

    <section className="contextWide card">
      <div className="cardHead"><div><span className="sectionTag">LIVE CONTEXT</span><h3>Personal Context Snapshot</h3></div><small>실시간 갱신</small></div>
      <div className="contextGrid wide">
        <div><span>선호</span>{data.preferences.length ? data.preferences.slice(0,3).map(x=><p key={x.id}><b>{x.key}</b><small>{x.value}</small></p>) : <em>선호 없음</em>}</div>
        <div><span>유통기한 임박 식재료</span>{expiring.length ? expiring.map(x=><p key={x.id}><b>{x.name}</b><small>{x.quantity} · {x.expires_on}</small></p>) : <em>기록 없음</em>}</div>
        <div><span>확인 대기 작업</span>{data.pending_actions?.length ? data.pending_actions.slice(0,3).map(x=><p key={x.id}><b>#{x.id} {x.summary}</b><small>{x.status}</small></p>) : <em>확인 대기 작업 없음</em>}</div>
      </div>
    </section>

    <section className="grid">
      <div className="card listCard"><span className="sectionTag">SCHEDULE</span><h3>{L('스마트 일정','智能日程')}<small className="zhTitle">{L('智能日程','스마트 일정')}</small></h3>{data.schedules.length ? data.schedules.map(x=><div className="row manageRow" key={x.id}><div><b>{x.title}</b><small>{x.scheduled_at}</small></div><div><button onClick={()=>editItem('schedule',x)}>수정</button><button onClick={()=>removeItem('schedule',x.id)}>삭제</button></div></div>) : <p className="muted">데이터 없음</p>}</div>
      <div className="card listCard"><span className="sectionTag">TASKS</span><h3>{L('할 일 / 우선순위','待办 / 优先级')}<small className="zhTitle">{L('待办 / 优先级','할 일 / 우선순위')}</small></h3>{data.tasks.length ? data.tasks.map(x=><div className="row manageRow" key={x.id}><div><b>{x.title}</b><small>{x.priority} · {x.due_at || '마감 미설정'}</small></div><div><button onClick={()=>toggleTask(x)}>완료</button><button onClick={()=>editItem('task',x)}>수정</button><button onClick={()=>removeItem('task',x.id)}>삭제</button></div></div>) : <p className="muted">데이터 없음</p>}</div>
      <div className="card listCard"><span className="sectionTag">EXPENSES</span><h3>{L('지출 Context','消费 Context')}<small className="zhTitle">{L('消费 Context','지출 Context')}</small></h3>{data.expenses.length ? data.expenses.map(x=><div className="row manageRow" key={x.id}><div><b>{x.item}</b><small>₩ {Number(x.amount).toLocaleString()} · {x.category}</small></div><div><button onClick={()=>editItem('expense',x)}>수정</button><button onClick={()=>removeItem('expense',x.id)}>삭제</button></div></div>) : <p className="muted">데이터 없음</p>}</div>
      <div className="card listCard"><span className="sectionTag">FOOD</span><h3>{L('냉장고 / 식재료','冰箱 / 食材')}<small className="zhTitle">{L('冰箱 / 食材','냉장고 / 식재료')}</small></h3>{data.ingredients.length ? data.ingredients.map(x=><div className="row manageRow" key={x.id}><div><b>{x.name}</b><small>{x.quantity}{x.expires_on ? ` · ${x.expires_on}` : ''}</small></div><div><button onClick={()=>editItem('ingredient',x)}>수정</button><button onClick={()=>removeItem('ingredient',x.id)}>삭제</button></div></div>) : <p className="muted">식재료 Context 없음</p>}</div>
    </section>

    <footer>Life Agent v1.1 · Voice Input · AI Capability Gateway · Multimodal Review · Evaluation Lab</footer>
  
    <nav className="mobileNav" aria-label="Mobile navigation">
      <a href="#home"><span>⌂</span><small>{L('홈','首页')}</small></a>
      <a href="#planner"><span>◫</span><small>{L('계획','规划')}</small></a>
      <a href="#manager"><span>＋</span><small>{L('데이터','数据')}</small></a>
      <a href="#evaluation"><span>✓</span><small>{L('평가','评估')}</small></a>
      {user.role==='admin' && <a href="/admin"><span>⚙</span><small>Admin</small></a>}
    </nav>
</main>
}
