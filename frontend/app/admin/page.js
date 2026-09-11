'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AdminPage(){
  const [token,setToken]=useState('');
  const [me,setMe]=useState(null);
  const [stats,setStats]=useState(null);
  const [users,setUsers]=useState([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [lang,setLang]=useState('ko');
  const L=(ko,zh)=>lang==='zh'?zh:ko;
  const afetch=(path,opt={})=>fetch(`${API}${path}`,{...opt,headers:{...(opt.headers||{}),Authorization:`Bearer ${token}`}});

  function changeLanguage(next){ setLang(next); localStorage.setItem('lifeagent_lang',next); }

  async function load(currentToken=token){
    setBusy(true); setError('');
    try{
      const headers={Authorization:`Bearer ${currentToken}`};
      const [mr,sr,ur]=await Promise.all([fetch(`${API}/auth/me`,{headers}),fetch(`${API}/admin/stats`,{headers}),fetch(`${API}/admin/users`,{headers})]);
      if(!mr.ok) throw new Error(L('로그인이 필요합니다.','需要登录。'));
      const m=await mr.json();
      if(m.role!=='admin') throw new Error(L('관리자 권한이 없습니다.','没有管理员权限。'));
      if(!sr.ok||!ur.ok) throw new Error(L('관리자 데이터를 불러오지 못했습니다.','无法加载管理员数据。'));
      setMe(m); setStats(await sr.json()); setUsers(await ur.json());
    }catch(e){setError(e.message||'Admin error');}
    setBusy(false);
  }

  useEffect(()=>{
    const saved=localStorage.getItem('lifeagent_lang'); if(saved==='ko'||saved==='zh') setLang(saved);
    localStorage.removeItem('lifeagent_token');
    const t=sessionStorage.getItem('lifeagent_token')||'';
    setToken(t);
    if(t) load(t); else setError(L('먼저 메인 화면에서 관리자 계정으로 로그인하세요.','请先在主页面使用管理员账号登录。'));
  },[]);

  async function updateUser(id,patch){
    if(!token) return;
    const r=await afetch(`/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){setError(j.detail||L('변경 실패','修改失败'));return;}
    await load();
  }

  return <main className="adminPage">
    <header className="adminTopbar">
      <div><p className="eyebrow">LIFE AGENT · ADMIN CONSOLE</p><h1>{L('관리자 대시보드','管理员后台')} <span>v1.2</span><small className="enTitle">Administrator Dashboard</small></h1></div>
      <div className="adminTopActions">
        <div className="languageSwitch" aria-label="Language"><button className={lang==='ko'?'active':''} onClick={()=>changeLanguage('ko')}>한국어</button><button className={lang==='zh'?'active':''} onClick={()=>changeLanguage('zh')}>中文</button></div>
        <span>{me?`@${me.username}`:'ADMIN'}</span><button onClick={()=>location.href='/'}>← {L('사용자 화면','用户界面')} · User View</button>
      </div>
    </header>
    {error && <section className="card adminError">{error}</section>}
    {stats && <>
      <section className="adminStats">
        <div><span>USERS</span><b>{stats.users_total}</b><small>{L('활성 사용자','活跃用户')} · Active {stats.users_active}</small></div>
        <div><span>ADMINS</span><b>{stats.admins}</b><small>{L('역할 기반 접근','基于角色的访问')} · role-based access</small></div>
        <div><span>CONTEXT</span><b>{stats.schedules+stats.tasks+stats.expenses+stats.ingredients}</b><small>{L('사용자 소유 레코드','用户所属记录')} · owned records</small></div>
        <div><span>AGENT LOGS</span><b>{stats.agent_logs}</b><small>{L('대기 작업','待处理操作')} · Pending {stats.pending_actions}</small></div>
        <div><span>DATABASE</span><b>{String(stats.database).toUpperCase()}</b><small>API {stats.api_version}</small></div>
      </section>
      <section className="card adminUsers">
        <div className="cardHead"><div><span className="sectionTag">USER MANAGEMENT</span><h3>{L('사용자 관리','用户管理')}<small className="enTitle">User Management</small></h3></div><small>{busy?'REFRESHING':'ROLE + STATUS'}</small></div>
        <div className="adminTableWrap"><table><thead><tr><th>ID</th><th>USER</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>
          {users.map(u=><tr key={u.id}><td>{u.id}</td><td><b>{u.display_name}</b><small>@{u.username}</small></td><td><span className={`adminPill ${u.role}`}>{u.role}</span></td><td><span className={`adminPill ${u.status}`}>{u.status}</span></td><td>{u.created_at?new Date(u.created_at).toLocaleDateString():'-'}</td><td><div className="adminActions"><button onClick={()=>updateUser(u.id,{status:u.status==='active'?'disabled':'active'})}>{u.status==='active'?`${L('비활성화','禁用')} · Disable`:`${L('활성화','启用')} · Enable`}</button><button onClick={()=>updateUser(u.id,{role:u.role==='admin'?'user':'admin'})}>{u.role==='admin'?`${L('USER로 변경','改为 USER')} · Set USER`:`${L('ADMIN으로 변경','改为 ADMIN')} · Set ADMIN`}</button></div></td></tr>)}
        </tbody></table></div>
      </section>
    </>}
  </main>;
}
