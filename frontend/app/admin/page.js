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

  const afetch=(path,opt={})=>fetch(`${API}${path}`,{...opt,headers:{...(opt.headers||{}),Authorization:`Bearer ${token}`}});

  async function load(currentToken=token){
    setBusy(true); setError('');
    try{
      const headers={Authorization:`Bearer ${currentToken}`};
      const [mr,sr,ur]=await Promise.all([fetch(`${API}/auth/me`,{headers}),fetch(`${API}/admin/stats`,{headers}),fetch(`${API}/admin/users`,{headers})]);
      if(!mr.ok) throw new Error('로그인이 필요합니다 / 需要登录');
      const m=await mr.json();
      if(m.role!=='admin') throw new Error('관리자 권한이 없습니다 / 没有管理员权限');
      if(!sr.ok||!ur.ok) throw new Error('관리자 데이터를 불러오지 못했습니다');
      setMe(m); setStats(await sr.json()); setUsers(await ur.json());
    }catch(e){setError(e.message||'Admin error');}
    setBusy(false);
  }

  useEffect(()=>{
    const t=localStorage.getItem('lifeagent_token')||'';
    setToken(t);
    if(t) load(t); else setError('먼저 메인 화면에서 관리자 계정으로 로그인하세요 / 请先用管理员账号登录');
  },[]);

  async function updateUser(id,patch){
    if(!token) return;
    const r=await afetch(`/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){setError(j.detail||'변경 실패');return;}
    await load();
  }

  return <main className="adminPage">
    <header className="adminTopbar">
      <div><p className="eyebrow">LIFE AGENT · ADMIN CONSOLE</p><h1>관리자 대시보드 <span>v1.1</span><small className="zhTitle">管理员后台</small></h1></div>
      <div className="adminTopActions"><span>{me?`@${me.username}`:'ADMIN'}</span><button onClick={()=>location.href='/'}>← 사용자 화면 / 用户界面</button></div>
    </header>
    {error && <section className="card adminError">{error}</section>}
    {stats && <>
      <section className="adminStats">
        <div><span>USERS</span><b>{stats.users_total}</b><small>Active {stats.users_active}</small></div>
        <div><span>ADMINS</span><b>{stats.admins}</b><small>role-based access</small></div>
        <div><span>CONTEXT</span><b>{stats.schedules+stats.tasks+stats.expenses+stats.ingredients}</b><small>all owned records</small></div>
        <div><span>AGENT LOGS</span><b>{stats.agent_logs}</b><small>Pending {stats.pending_actions}</small></div>
        <div><span>DATABASE</span><b>{String(stats.database).toUpperCase()}</b><small>API {stats.api_version}</small></div>
      </section>
      <section className="card adminUsers">
        <div className="cardHead"><div><span className="sectionTag">USER MANAGEMENT</span><h3>사용자 관리<small className="zhTitle">用户管理</small></h3></div><small>{busy?'REFRESHING':'ROLE + STATUS'}</small></div>
        <div className="adminTableWrap"><table><thead><tr><th>ID</th><th>USER</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>
          {users.map(u=><tr key={u.id}><td>{u.id}</td><td><b>{u.display_name}</b><small>@{u.username}</small></td><td><span className={`adminPill ${u.role}`}>{u.role}</span></td><td><span className={`adminPill ${u.status}`}>{u.status}</span></td><td>{u.created_at?new Date(u.created_at).toLocaleDateString():'-'}</td><td><div className="adminActions"><button onClick={()=>updateUser(u.id,{status:u.status==='active'?'disabled':'active'})}>{u.status==='active'?'비활성화 / 禁用':'활성화 / 启用'}</button><button onClick={()=>updateUser(u.id,{role:u.role==='admin'?'user':'admin'})}>{u.role==='admin'?'USER로 변경':'ADMIN으로 변경'}</button></div></td></tr>)}
        </tbody></table></div>
      </section>
    </>}
  </main>;
}
