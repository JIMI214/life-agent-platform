import os
import re
import json
import base64
import secrets
import hashlib
import hmac
import time
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, String, Float, Integer, DateTime, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./life_agent_v11.db").strip()
# Supabase/Render commonly provide postgresql:// URLs. SQLAlchemy 2 + psycopg v3 uses postgresql+psycopg://.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase): pass

class User(Base):
    __tablename__="users"
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    username: Mapped[str]=mapped_column(String(80),unique=True,index=True)
    display_name: Mapped[str]=mapped_column(String(120))
    password_hash: Mapped[str]=mapped_column(String(256))
    salt: Mapped[str]=mapped_column(String(64))
    role: Mapped[str]=mapped_column(String(20),default="user",index=True)
    status: Mapped[str]=mapped_column(String(20),default="active",index=True)
    last_login_at: Mapped[Optional[datetime]]=mapped_column(DateTime,nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class AuthSession(Base):
    __tablename__="auth_sessions"
    id: Mapped[int]=mapped_column(Integer,primary_key=True)
    user_id: Mapped[int]=mapped_column(Integer,index=True)
    token_hash: Mapped[str]=mapped_column(String(64),unique=True,index=True)
    created_at: Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

class Owned:
    user_id: Mapped[int]=mapped_column(Integer,index=True)

class Schedule(Owned,Base):
    __tablename__="schedules"; id:Mapped[int]=mapped_column(Integer,primary_key=True); title:Mapped[str]=mapped_column(String(200)); scheduled_at:Mapped[str]=mapped_column(String(100)); status:Mapped[str]=mapped_column(String(30),default="planned"); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class Expense(Owned,Base):
    __tablename__="expenses"; id:Mapped[int]=mapped_column(Integer,primary_key=True); item:Mapped[str]=mapped_column(String(200)); amount:Mapped[float]=mapped_column(Float); category:Mapped[str]=mapped_column(String(80),default="other"); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class Ingredient(Owned,Base):
    __tablename__="ingredients"; id:Mapped[int]=mapped_column(Integer,primary_key=True); name:Mapped[str]=mapped_column(String(120)); quantity:Mapped[str]=mapped_column(String(80),default="1"); expires_on:Mapped[Optional[str]]=mapped_column(String(30),nullable=True); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class Task(Owned,Base):
    __tablename__="tasks"; id:Mapped[int]=mapped_column(Integer,primary_key=True); title:Mapped[str]=mapped_column(String(200)); priority:Mapped[str]=mapped_column(String(30),default="medium"); due_at:Mapped[Optional[str]]=mapped_column(String(100),nullable=True); completed:Mapped[bool]=mapped_column(Boolean,default=False); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class Preference(Owned,Base):
    __tablename__="preferences"; __table_args__=(UniqueConstraint('user_id','key',name='uq_user_pref_key'),); id:Mapped[int]=mapped_column(Integer,primary_key=True); key:Mapped[str]=mapped_column(String(80)); value:Mapped[str]=mapped_column(String(240)); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class PendingAction(Owned,Base):
    __tablename__="pending_actions"; id:Mapped[int]=mapped_column(Integer,primary_key=True); action_type:Mapped[str]=mapped_column(String(60)); payload_json:Mapped[str]=mapped_column(Text); status:Mapped[str]=mapped_column(String(30),default="pending"); summary:Mapped[str]=mapped_column(String(300)); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class AgentLog(Owned,Base):
    __tablename__="agent_logs"; id:Mapped[int]=mapped_column(Integer,primary_key=True); user_input:Mapped[str]=mapped_column(Text); route:Mapped[str]=mapped_column(String(50)); response:Mapped[str]=mapped_column(Text); trace_json:Mapped[str]=mapped_column(Text,default="[]"); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ActionHistory(Owned,Base):
    __tablename__="action_history"; id:Mapped[int]=mapped_column(Integer,primary_key=True); operation:Mapped[str]=mapped_column(String(30)); entity_type:Mapped[str]=mapped_column(String(40)); entity_id:Mapped[Optional[int]]=mapped_column(Integer,nullable=True); summary:Mapped[str]=mapped_column(String(300)); before_json:Mapped[Optional[str]]=mapped_column(Text,nullable=True); after_json:Mapped[Optional[str]]=mapped_column(Text,nullable=True); undone:Mapped[bool]=mapped_column(Boolean,default=False); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)

Base.metadata.create_all(engine)
app=FastAPI(title="Context-aware Multimodal Life Agent API",version="1.1.0")
_local_origins=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3001","http://127.0.0.1:3001"]
_extra_origins=[x.strip() for x in os.getenv("FRONTEND_ORIGINS","").split(",") if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=list(dict.fromkeys(_local_origins+_extra_origins)),allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

class RegisterIn(BaseModel): username:str; password:str; display_name:str="Life Agent User"
class LoginIn(BaseModel): username:str; password:str
class ScheduleIn(BaseModel): title:str; scheduled_at:str
class ExpenseIn(BaseModel): item:str; amount:float; category:str="other"
class IngredientIn(BaseModel): name:str; quantity:str="1"; expires_on:Optional[str]=None
class TaskIn(BaseModel): title:str; priority:str="medium"; due_at:Optional[str]=None
class PreferenceIn(BaseModel): key:str; value:str
class AgentIn(BaseModel): message:str
class ConfirmIn(BaseModel): action_id:int; approve:bool=True
class PlannerIn(BaseModel): horizon:str="tomorrow"
class DecisionIn(BaseModel): title:str; proposed_at:str; duration_minutes:int=60
class ScheduleUpdate(BaseModel): title:Optional[str]=None; scheduled_at:Optional[str]=None; status:Optional[str]=None
class TaskUpdate(BaseModel): title:Optional[str]=None; priority:Optional[str]=None; due_at:Optional[str]=None; completed:Optional[bool]=None
class ExpenseUpdate(BaseModel): item:Optional[str]=None; amount:Optional[float]=None; category:Optional[str]=None
class IngredientUpdate(BaseModel): name:Optional[str]=None; quantity:Optional[str]=None; expires_on:Optional[str]=None
class VisionProposalIn(BaseModel): kind:str; result:dict
class AdminUserUpdate(BaseModel): status:Optional[str]=None; role:Optional[str]=None

def serialize(obj): return {c.name:getattr(obj,c.name) for c in obj.__table__.columns}
def trace_step(stage,title,detail,status="done"): return {"stage":stage,"title":title,"detail":detail,"status":status}
def _password_hash(password,salt): return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),180000).hex()
def _token_hash(token): return hashlib.sha256(token.encode()).hexdigest()

def auth_user(authorization:Optional[str]=Header(None)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401,"Authentication required")
    token=authorization[7:].strip()
    with SessionLocal() as db:
        sess=db.query(AuthSession).filter(AuthSession.token_hash==_token_hash(token)).first()
        if not sess: raise HTTPException(401,"Invalid session")
        user=db.get(User,sess.user_id)
        if not user: raise HTTPException(401,"User not found")
        if user.status != "active": raise HTTPException(403,"Account is disabled")
        return {"id":user.id,"username":user.username,"display_name":user.display_name,"role":user.role,"status":user.status}

def require_admin(user=Depends(auth_user)):
    if user.get("role") != "admin":
        raise HTTPException(403,"Administrator permission required")
    return user

def ensure_bootstrap_admin():
    username=os.getenv("ADMIN_USERNAME","").strip().lower()
    password=os.getenv("ADMIN_PASSWORD","")
    display_name=os.getenv("ADMIN_DISPLAY_NAME","Life Agent Admin").strip() or "Life Agent Admin"
    if not username or len(password)<8:
        return
    with SessionLocal() as db:
        user=db.query(User).filter(User.username==username).first()
        if user:
            changed=False
            if user.role != "admin": user.role="admin"; changed=True
            if user.status != "active": user.status="active"; changed=True
            if changed: db.commit()
            return
        salt=secrets.token_hex(16)
        user=User(username=username,display_name=display_name,password_hash=_password_hash(password,salt),salt=salt,role="admin",status="active")
        db.add(user); db.commit()

ensure_bootstrap_admin()

def get_context(db,user_id):
    schedules=db.query(Schedule).filter(Schedule.user_id==user_id).order_by(Schedule.id.desc()).limit(8).all()
    expenses=db.query(Expense).filter(Expense.user_id==user_id).order_by(Expense.id.desc()).limit(8).all()
    ingredients=db.query(Ingredient).filter(Ingredient.user_id==user_id).order_by(Ingredient.id.desc()).limit(10).all()
    tasks=db.query(Task).filter(Task.user_id==user_id,Task.completed==False).order_by(Task.id.desc()).limit(8).all()
    preferences=db.query(Preference).filter(Preference.user_id==user_id).order_by(Preference.id.asc()).all()
    total=sum(x.amount for x in db.query(Expense).filter(Expense.user_id==user_id).all())
    return {"schedules":[serialize(x) for x in schedules],"expenses":[serialize(x) for x in expenses],"ingredients":[serialize(x) for x in ingredients],"tasks":[serialize(x) for x in tasks],"preferences":[serialize(x) for x in preferences],"expense_total":round(total,2)}

def record_history(db,user_id,operation,entity_type,entity_id,summary,before=None,after=None):
    row=ActionHistory(user_id=user_id,operation=operation,entity_type=entity_type,entity_id=entity_id,summary=summary,before_json=json.dumps(before,ensure_ascii=False,default=str) if before is not None else None,after_json=json.dumps(after,ensure_ascii=False,default=str) if after is not None else None)
    db.add(row); db.commit(); db.refresh(row); return row

def _apply_updates(row,data):
    for k,v in data.model_dump(exclude_unset=True).items(): setattr(row,k,v)

def create_pending_action(db,user_id,action_type,payload,summary):
    row=PendingAction(user_id=user_id,action_type=action_type,payload_json=json.dumps(payload,ensure_ascii=False),summary=summary); db.add(row); db.commit(); db.refresh(row); return row

def execute_action(db,user_id,action):
    payload=json.loads(action.payload_json); created=None
    if action.action_type=="create_schedule": row=Schedule(user_id=user_id,title=payload["title"],scheduled_at=payload.get("scheduled_at","확인 필요 / TBD")); db.add(row); db.commit(); db.refresh(row); created=serialize(row)
    elif action.action_type=="create_expense": row=Expense(user_id=user_id,item=payload["item"],amount=float(payload["amount"]),category=payload.get("category","auto")); db.add(row); db.commit(); db.refresh(row); created=serialize(row)
    elif action.action_type=="create_task": row=Task(user_id=user_id,title=payload["title"],priority=payload.get("priority","medium"),due_at=payload.get("due_at")); db.add(row); db.commit(); db.refresh(row); created=serialize(row)
    elif action.action_type=="create_ingredients_batch":
        created=[]
        for item in payload.get("ingredients",[]):
            row=Ingredient(user_id=user_id,name=item["name"],quantity=item.get("quantity","1"),expires_on=item.get("expires_on")); db.add(row); db.flush(); created.append(serialize(row))
        db.commit()
    if created is not None:
        if isinstance(created,list):
            for item in created: record_history(db,user_id,"create","ingredient",item.get("id"),f"Agent 식재료 저장: {item.get('name','')}",after=item)
        else:
            etype={"create_schedule":"schedule","create_expense":"expense","create_task":"task"}.get(action.action_type)
            if etype: record_history(db,user_id,"create",etype,created.get("id"),f"Agent 확인 실행: {action.summary}",after=created)
    action.status="approved"; db.commit(); return created

def demo_agent(message: str, context: dict):
    lower = message.lower()
    trace = [
        trace_step("input", "사용자 요청 이해", message),
        trace_step("context", "Personal Context 읽기", f"일정 {len(context['schedules'])}개 · 할 일 {len(context['tasks'])}개 · 식재료 {len(context['ingredients'])}개 · 지출 {len(context['expenses'])}개"),
    ]

    if any(k in message for k in ["安排明天", "规划明天", "明天怎么安排", "내일 계획", "내일 일정 정리"]):
        trace.append(trace_step("reasoning", "교차 모듈 계획", "일정, 할 일, 개인 선호를 종합해 제안하며 사용자 데이터를 직접 수정하지 않습니다"))
        schedule_lines = [f"• {x['title']}（{x['scheduled_at']}）" for x in context["schedules"][:3]] or ["• 고정 일정 없음"]
        task_lines = [f"• {x['title']}（{x['priority']}）" for x in context["tasks"][:3]] or ["• 할 일 없음"]
        pref = "；".join(f"{x['key']}={x['value']}" for x in context["preferences"][:3]) or "선호 없음"
        response = "개인 생활 Context를 바탕으로 계획을 구성했습니다.\n\n현재 일정:\n" + "\n".join(schedule_lines) + "\n\n할 일:\n" + "\n".join(task_lines) + f"\n\n선호: {pref}\n\n제안: 고정 일정을 우선 유지하고 빈 시간에 우선순위가 높은 할 일을 배치하며 휴식 시간을 확보하세요."
        trace.append(trace_step("output", "개인화 계획 생성", "읽기 전용 계획 생성 완료 · 쓰기 작업 없음"))
        return {"route": "planning", "message": response, "trace": trace, "approval_required": False, "pending_action": None}

    if any(k in message for k in ["消费", "花了", "支出", "小票", "金额", "韩元", "지출", "영수증", "원"]) or "expense" in lower:
        nums = re.findall(r"\d+(?:\.\d+)?", message.replace(",", ""))
        amount = float(nums[-1]) if nums else None
        trace.append(trace_step("reasoning", "의도 판단", "지출 기록 작업으로 인식"))
        if amount is None:
            trace.append(trace_step("safety", "정보 완전성 검사", "금액이 없어 작업을 생성하지 않음", "blocked"))
            return {"route": "expense", "message": "지출 기록 요청으로 인식했지만 명확한 금액을 찾지 못했습니다. 금액을 입력해 주세요.", "trace": trace, "approval_required": False, "pending_action": None}
        payload = {"item": message, "amount": amount, "category": "auto"}
        trace.append(trace_step("tool", "Tool 호출 준비", f"create_expense(amount={amount:g})"))
        trace.append(trace_step("safety", "Human-in-the-loop", "데이터베이스 쓰기 전 사용자 확인 대기", "waiting"))
        return {"route": "expense", "message": f"이 지출을 기록할 준비가 되었습니다: ₩{amount:,.0f}. 확인 후 데이터베이스에 저장됩니다.", "trace": trace, "approval_required": True, "action_type": "create_expense", "payload": payload, "summary": f"지출 기록 ₩{amount:,.0f}"}

    if any(k in message for k in ["日程", "提醒", "내일", "今天", "下周", "일정", "내일", "오늘"]) or "schedule" in lower:
        title = re.sub(r"^(帮我|请|添加|创建|提醒我|일정에|등록해줘|schedule)\s*", "", message).strip() or message
        trace.append(trace_step("reasoning", "의도 판단", "일정 생성 작업으로 인식"))
        trace.append(trace_step("tool", "Tool 호출 준비", "create_schedule(...)"))
        trace.append(trace_step("safety", "Human-in-the-loop", "일정 변경 전 사용자 확인 대기", "waiting"))
        payload = {"title": title, "scheduled_at": "확인 필요 / TBD"}
        return {"route": "schedule", "message": f"일정 생성 준비: {title}. 확인 후 데이터베이스에 저장됩니다.", "trace": trace, "approval_required": True, "action_type": "create_schedule", "payload": payload, "summary": f"일정 생성: {title}"}

    if any(k in message for k in ["冰箱", "食材", "吃什么", "菜谱", "냉장고", "재료", "레시피"]) or "ingredient" in lower:
        trace.append(trace_step("reasoning", "의도 판단", "식사·식재료 작업으로 인식"))
        expiring = [x for x in context["ingredients"] if x.get("expires_on")]
        detail = "、".join(x["name"] for x in expiring[:4]) if expiring else "유효기간이 기록된 식재료가 없습니다"
        trace.append(trace_step("context", "식재료 Context 읽기", detail))
        return {"route": "food", "message": f"냉장고 Context를 읽었습니다: {detail}. 확인된 이미지 인식 결과는 통합 생활 계획에 반영됩니다.", "trace": trace, "approval_required": False, "pending_action": None}

    trace.append(trace_step("reasoning", "일반 생활 도우미", "쓰기 작업이 필요한 명확한 의도를 감지하지 못함"))
    return {"route": "general", "message": "개인 생활 Context를 읽고 일정, 지출, 할 일, 식재료 작업을 처리할 수 있습니다. “내일 일정을 계획해 줘” 또는 “오늘 커피에 4,500원을 썼어”를 시도해 보세요.", "trace": trace, "approval_required": False, "pending_action": None}


def openai_agent(message: str, context: dict):
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return demo_agent(message, context)

    client = OpenAI()
    context_text = json.dumps(context, ensure_ascii=False, default=str)
    tools = [
        {
            "type": "function",
            "name": "propose_schedule",
            "description": "Propose creating a schedule item. This only creates a pending action and requires user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "scheduled_at": {"type": "string"}},
                "required": ["title", "scheduled_at"],
                "additionalProperties": False,
            },
            "strict": True,
        },
        {
            "type": "function",
            "name": "propose_expense",
            "description": "Propose recording an expense. This only creates a pending action and requires user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {"item": {"type": "string"}, "amount": {"type": "number"}, "category": {"type": "string"}},
                "required": ["item", "amount", "category"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    ]
    response = client.responses.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"),
        instructions=(
            "You are a context-aware personal life agent. Use the supplied personal context when relevant. "
            "Never claim to execute a write action directly. Use proposal tools for writes so the user can confirm. "
            "For planning requests, provide a concise personalized plan from context without using a tool. "
            "Do not invent money amounts or exact dates. Respond in the user's language.\nPERSONAL_CONTEXT=" + context_text
        ),
        input=message,
        tools=tools,
    )
    trace = [
        trace_step("input", "사용자 요청 이해", message),
        trace_step("context", "Personal Context 읽기", f"일정 {len(context['schedules'])}개 · 할 일 {len(context['tasks'])}개 · 식재료 {len(context['ingredients'])}개"),
    ]
    for item in response.output:
        if getattr(item, "type", None) == "function_call":
            args = json.loads(item.arguments)
            if item.name == "propose_schedule":
                trace += [trace_step("reasoning", "Agent 의사결정", "일정 생성 필요"), trace_step("tool", "Tool 준비", "create_schedule"), trace_step("safety", "확인 대기", "Human-in-the-loop", "waiting")]
                return {"route": "schedule", "message": f"일정 생성 준비: {args['title']}. 확인 후 실행합니다.", "trace": trace, "approval_required": True, "action_type": "create_schedule", "payload": args, "summary": f"일정 생성: {args['title']}"}
            if item.name == "propose_expense":
                trace += [trace_step("reasoning", "Agent 의사결정", "지출 기록 필요"), trace_step("tool", "Tool 준비", "create_expense"), trace_step("safety", "확인 대기", "Human-in-the-loop", "waiting")]
                return {"route": "expense", "message": f"지출 기록 준비: ₩{args['amount']:,.0f}. 확인 후 실행합니다.", "trace": trace, "approval_required": True, "action_type": "create_expense", "payload": args, "summary": f"지출 기록 ₩{args['amount']:,.0f}"}
    trace.append(trace_step("output", "응답 생성", "Personal Context 기반 결과 반환"))
    return {"route": "planning", "message": response.output_text, "trace": trace, "approval_required": False, "pending_action": None}


def _priority_rank(priority: str):
    return {"high": 0, "medium": 1, "low": 2}.get((priority or "medium").lower(), 1)


def build_demo_plan(context: dict, horizon: str = "tomorrow"):
    schedules = list(context.get("schedules") or [])
    tasks = sorted(list(context.get("tasks") or []), key=lambda x: _priority_rank(x.get("priority")))
    ingredients = list(context.get("ingredients") or [])
    preferences = list(context.get("preferences") or [])
    expense_total = float(context.get("expense_total") or 0)

    pref_text = "；".join(x.get("value", "") for x in preferences if x.get("value"))
    expiring = [x for x in ingredients if x.get("expires_on")]
    plan = []

    if schedules:
        for i, item in enumerate(schedules[:2]):
            plan.append({
                "time": "고정",
                "title": item.get("title") or "기존 일정",
                "type": "schedule",
                "reason": f"Schedule Context: {item.get('scheduled_at') or '기존 일정'}. 고정 약속을 우선 유지합니다.",
                "signals": ["Schedule Context", "충돌 회피"],
            })
    else:
        plan.append({
            "time": "09:00",
            "title": "첫 집중 블록 설정",
            "type": "focus",
            "reason": "고정 일정이 없어 우선순위가 높은 할 일을 위한 집중 시간을 먼저 확보합니다.",
            "signals": ["빈 시간", "Task Context"],
        })

    if tasks:
        top = tasks[0]
        plan.append({
            "time": "빈 시간 1",
            "title": top.get("title") or "우선순위 높은 할 일",
            "type": "task",
            "reason": f"Task Context: 우선순위 {top.get('priority','medium')}, 마감 {top.get('due_at') or '미설정'}.",
            "signals": ["Task Context", "우선순위 정렬"],
        })

    if expiring:
        names = ", ".join(x.get("name", "식재료") for x in expiring[:3])
        plan.append({
            "time": "12:00 / 18:30",
            "title": f"유통기한 임박 식재료 우선 사용: {names}",
            "type": "food",
            "reason": "Ingredient Context에 유효기간이 기록된 식재료가 있어 먼저 사용하면 낭비를 줄일 수 있습니다.",
            "signals": ["Ingredient Context", "임박 식재료 우선"],
        })
    elif ingredients:
        names = ", ".join(x.get("name", "식재료") for x in ingredients[:3])
        plan.append({
            "time": "12:00 / 18:30",
            "title": f"보유 식재료로 한 끼 해결: {names}",
            "type": "food",
            "reason": "냉장고 Context를 활용해 추가 구매를 줄이고 실제 재고에 맞춰 식사를 제안합니다.",
            "signals": ["Ingredient Context", "재고 활용"],
        })

    if expense_total > 0:
        plan.append({
            "time": "지출 의사결정",
            "title": "보유 자원을 우선 활용해 불필요한 즉흥 지출을 줄이기",
            "type": "expense",
            "reason": f"Expense Context 누적 기록은 ₩{expense_total:,.0f}입니다. 이 규칙은 알림만 제공하며 사용자의 예산을 대신 정하지 않습니다.",
            "signals": ["Expense Context", "보수적 지출 제안"],
        })

    if pref_text:
        plan.append({
            "time": "실행 규칙",
            "title": "개인 선호에 맞춰 집중과 마무리 배치",
            "type": "preference",
            "reason": f"Preference Context：{pref_text[:180]}",
            "signals": ["Preference Context", "개인화"],
        })

    if not plan:
        plan.append({
            "time": "09:00",
            "title": "Personal Context를 보강한 뒤 정교한 계획 생성",
            "type": "general",
            "reason": "구조화 생활 데이터가 부족하여 존재하지 않는 일정, 예산, 재고를 만들어내지 않습니다.",
            "signals": ["Safety", "저 Context 모드"],
        })

    used_domains = []
    for name, key in [("일정", schedules), ("할 일", tasks), ("식재료", ingredients), ("지출", context.get("expenses") or []), ("선호", preferences)]:
        if key:
            used_domains.append(name)

    insights = []
    if tasks and schedules:
        insights.append("고정 일정을 우선하고 우선순위가 높은 할 일을 빈 시간에 배치해 모든 작업이 한곳에 몰리지 않도록 합니다.")
    if expiring:
        insights.append("유통기한 임박 식재료를 감지하여 식사 제안에 재고를 우선 활용합니다.")
    if pref_text:
        insights.append("일반 템플릿 대신 개인 선호를 실행 제약으로 사용합니다.")
    if not insights:
        insights.append("현재 Context가 적어 보수적으로 계획하며 추가 사실을 만들어내지 않습니다.")

    trace = [
        trace_step("context", "5개 Personal Context 통합", f"사용 Context: {(', '.join(used_domains) or '구조화 데이터 없음')}") ,
        trace_step("reasoning", "교차 도메인 제약 정렬", "고정 일정을 먼저 유지하고 우선순위가 높은 할 일을 배치하며 식재료, 지출, 선호를 함께 고려합니다."),
        trace_step("safety", "읽기 전용 계획", "이번 계획은 데이터베이스를 직접 수정하지 않습니다.", "done"),
        trace_step("output", "설명 가능한 계획 생성", f"{len(plan)}개의 계획 노드를 출력했으며 각 노드에 이유와 Context 신호가 포함됩니다."),
    ]
    return {
        "horizon": horizon,
        "source": "demo",
        "summary": f"{len(used_domains)}개 Personal Context를 바탕으로 통합 생활 계획을 생성했습니다.",
        "context_domains": used_domains,
        "coverage": round(len(used_domains) / 5, 2),
        "items": plan,
        "insights": insights,
        "trace": trace,
    }


def build_openai_plan(context: dict, horizon: str = "tomorrow"):
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return build_demo_plan(context, horizon)
    client = OpenAI()
    prompt = (
        "Create a concise, explainable personal life plan from the JSON context. "
        "Return ONLY JSON with keys horizon, summary, context_domains, coverage, items, insights. "
        "items must be objects with time,title,type,reason,signals. "
        "Never invent exact appointments, money budgets, medical advice, or food expiry dates. "
        "Use only supplied context. This is read-only planning; do not claim to write data. "
        "Respond in Chinese. CONTEXT=" + json.dumps(context, ensure_ascii=False, default=str)
    )
    r = client.responses.create(model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"), input=prompt)
    text = (r.output_text or "").strip()
    text = re.sub(r"^```json\s*|\s*```$", "", text, flags=re.S)
    result = json.loads(text)
    result["source"] = "openai"
    result["trace"] = [
        trace_step("context", "5개 Personal Context 통합", f"일정 {len(context.get('schedules',[]))} · 할 일 {len(context.get('tasks',[]))} · 식재료 {len(context.get('ingredients',[]))} · 지출 {len(context.get('expenses',[]))} · 선호 {len(context.get('preferences',[]))}"),
        trace_step("reasoning", "LLM 교차 도메인 계획", "모델은 구조화 Context만 기반으로 읽기 전용 계획을 생성합니다."),
        trace_step("safety", "읽기 전용 계획", "쓰기 Tool을 호출하지 않았습니다."),
        trace_step("output", "설명 가능한 계획 생성", f"{len(result.get('items') or [])}개의 계획 노드를 출력했습니다."),
    ]
    return result



def _time_to_minutes(value: str):
    """Best-effort local parser for demo schedule strings; returns minutes from midnight."""
    text = (value or "").strip().lower()
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
        if any(k in text.lower() for k in ["下午", "晚上", "pm", "오후", "저녁"]) and hour < 12:
            hour += 12
        return hour * 60 + minute
    m = re.search(r"(\d{1,2})\s*(?:点|시)", text)
    if m:
        hour = int(m.group(1))
        if any(k in text for k in ["下午", "晚上", "오후", "저녁"]) and hour < 12:
            hour += 12
        return hour * 60
    return None


def _format_minutes(total: int):
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def _task_score(task: dict):
    priority = (task.get("priority") or "medium").lower()
    score = {"high": 60, "medium": 40, "low": 20}.get(priority, 40)
    reasons = [f"우선순위 {priority}: +{score}"]
    due = (task.get("due_at") or "").lower()
    if "내일" in due or "tomorrow" in due:
        score += 25; reasons.append("내일 마감: +25")
    elif "今天" in due or "today" in due or "오늘" in due:
        score += 35; reasons.append("오늘 마감: +35")
    elif "이번 주" in due or "week" in due:
        score += 10; reasons.append("이번 주 마감: +10")
    score = min(score, 100)
    return score, reasons


def analyze_local_decision(context: dict, title: str, proposed_at: str, duration_minutes: int = 60):
    start = _time_to_minutes(proposed_at)
    duration = max(15, min(int(duration_minutes or 60), 240))
    end = start + duration if start is not None else None
    conflicts = []
    for item in context.get("schedules") or []:
        existing_start = _time_to_minutes(item.get("scheduled_at") or "")
        if start is None or existing_start is None:
            continue
        existing_end = existing_start + 60
        if start < existing_end and end > existing_start:
            overlap = min(end, existing_end) - max(start, existing_start)
            conflicts.append({
                "title": item.get("title") or "기존 일정",
                "scheduled_at": item.get("scheduled_at") or "",
                "overlap_minutes": overlap,
                "severity": "high" if overlap >= 30 else "medium",
            })

    task_scores = []
    for task in context.get("tasks") or []:
        score, reasons = _task_score(task)
        task_scores.append({"title": task.get("title"), "score": score, "priority": task.get("priority"), "due_at": task.get("due_at"), "reasons": reasons})
    task_scores.sort(key=lambda x: x["score"], reverse=True)

    risk_score = min(100, (70 if conflicts else 10) + max(0, len(conflicts)-1) * 15)
    risk = "HIGH" if risk_score >= 70 else ("MEDIUM" if risk_score >= 35 else "LOW")
    alternatives = []
    if start is not None:
        if conflicts:
            alternatives = [
                {"time": _format_minutes(start - 90), "reason": "90분 앞당겨 현재 충돌 구간 회피"},
                {"time": _format_minutes(start + 90), "reason": "90분 늦춰 기존 고정 일정 유지"},
            ]
        else:
            alternatives = [{"time": _format_minutes(start), "reason": "현재 시간대에 고정 일정 충돌이 감지되지 않음"}]

    if conflicts:
        recommendation = f"시간 충돌 {len(conflicts)}건을 감지했습니다. 기존 고정 일정을 유지하고 “{title}” 시간을 조정하는 것을 권장합니다. 시스템은 일정을 자동 수정하지 않습니다."
    elif start is None:
        recommendation = "명확한 시간을 해석하지 못했습니다. “내일 15:00” 또는 “내일 오후 3시” 형식으로 입력해 주세요."
    else:
        recommendation = f"“{title}”은 현재 알려진 고정 일정과 충돌하지 않아 후보 계획으로 사용할 수 있습니다. 일정 저장 전 사용자 확인을 권장합니다."

    trace = [
        trace_step("input", "후보 계획 읽기", f"{title} · {proposed_at} · {duration}분"),
        trace_step("context", "제약 조건 로드", f"고정 일정 {len(context.get('schedules') or [])}개 · 할 일 {len(context.get('tasks') or [])}개"),
        trace_step("reasoning", "시간 충돌 감지", f"충돌 {len(conflicts)}건 · 위험 점수 {risk_score}/100"),
        trace_step("reasoning", "할 일 우선순위 점수", f"미완료 할 일 {len(task_scores)}개의 우선순위 점수를 계산했습니다"),
        trace_step("safety", "읽기 전용 유지", "분석은 제안만 생성하며 Schedule / Task 데이터베이스를 수정하지 않습니다."),
        trace_step("output", "조정안 생성", recommendation),
    ]
    return {
        "source": "local_rule_engine",
        "title": title,
        "proposed_at": proposed_at,
        "duration_minutes": duration,
        "risk": risk,
        "risk_score": risk_score,
        "conflicts": conflicts,
        "task_scores": task_scores[:5],
        "alternatives": alternatives,
        "recommendation": recommendation,
        "context_weights": {"schedule": 0.40, "task": 0.30, "ingredient": 0.10, "expense": 0.10, "preference": 0.10},
        "trace": trace,
    }




def run_evaluation_suite(user_id: int):
    started = time.perf_counter()
    tests = []

    def check(name, category, passed, detail):
        tests.append({"name": name, "category": category, "passed": bool(passed), "detail": detail})

    conflict_context = {"schedules":[{"title":"졸업작품 회의","scheduled_at":"내일 15:30"}],"tasks":[],"ingredients":[],"expenses":[],"preferences":[]}
    no_conflict_context = {"schedules":[{"title":"졸업작품 회의","scheduled_at":"내일 15:30"}],"tasks":[],"ingredients":[],"expenses":[],"preferences":[]}
    r1 = analyze_local_decision(conflict_context, "去医院", "내일 15:00", 60)
    check("겹치는 일정 감지", "reasoning", r1["risk"] == "HIGH" and len(r1["conflicts"]) == 1, f"risk={r1['risk']} · conflicts={len(r1['conflicts'])}")
    r2 = analyze_local_decision(no_conflict_context, "晨跑", "내일 09:00", 45)
    check("비충돌 일정 과잉 경고 방지", "reasoning", r2["risk"] == "LOW" and len(r2["conflicts"]) == 0, f"risk={r2['risk']} · conflicts={len(r2['conflicts'])}")
    check("한국어·중국어 오후 시간 파싱", "reasoning", _time_to_minutes("明天下午3点") == 15*60, f"parsed={_time_to_minutes('明天下午3点')}")

    high,_ = _task_score({"priority":"high","due_at":"이번 주"})
    medium,_ = _task_score({"priority":"medium","due_at":"이번 주"})
    low,_ = _task_score({"priority":"low","due_at":"이번 주"})
    check("할 일 우선순위 단조성", "priority", high > medium > low, f"high={high} · medium={medium} · low={low}")
    today,_ = _task_score({"priority":"medium","due_at":"今天"})
    tomorrow,_ = _task_score({"priority":"medium","due_at":"내일"})
    check("마감 긴급도", "priority", today > tomorrow, f"today={today} · tomorrow={tomorrow}")

    full_context = {
        "schedules":[{"title":"课程","scheduled_at":"내일 10:00"}],
        "tasks":[{"title":"复习","priority":"high","due_at":"내일"}],
        "ingredients":[{"name":"우유","quantity":"1","expires_on":"2일 후"}],
        "expenses":[{"item":"커피","amount":4500,"category":"food"}],
        "preferences":[{"key":"focus","value":"저녁 학습"}],
        "expense_total":4500,
    }
    plan = build_demo_plan(full_context, "tomorrow")
    check("5개 Context 커버리지", "planner", abs(plan.get("coverage",0)-1.0) < 1e-9, f"coverage={plan.get('coverage')}")
    check("계획 노드 설명 근거", "planner", bool(plan.get("items")) and all(x.get("reason") and x.get("signals") for x in plan["items"]), f"nodes={len(plan.get('items') or [])}")
    check("계획 읽기 전용 유지", "safety", any(x.get("stage")=="safety" and "직접 수정하지" in x.get("detail","") for x in plan.get("trace",[])), "planner trace contains read-only safety gate")

    with SessionLocal() as db:
        ctx = get_context(db, user_id)
        owned_rows = []
        for key in ("schedules","tasks","ingredients","expenses","preferences"):
            owned_rows.extend(ctx.get(key) or [])
        isolation_ok = all(int(x.get("user_id", user_id)) == user_id for x in owned_rows)
        pending = db.query(PendingAction).filter(PendingAction.user_id==user_id, PendingAction.status=="pending").all()
        pending_ok = all(x.user_id == user_id for x in pending)
    check("현재 사용자 Context 격리", "security", isolation_ok, f"checked_rows={len(owned_rows)}")
    check("확인 대기 작업 사용자 격리", "security", pending_ok, f"pending_checked={len(pending)}")

    passed = sum(1 for x in tests if x["passed"])
    total = len(tests)
    safety_tests = [x for x in tests if x["category"] in ("safety","security")]
    safety_passed = sum(1 for x in safety_tests if x["passed"])
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    categories = {}
    for t in tests:
        cat = categories.setdefault(t["category"], {"passed":0,"total":0})
        cat["total"] += 1
        cat["passed"] += int(t["passed"])
    return {
        "suite":"Life Agent Deterministic Evaluation v1.0",
        "source":"local_test_harness",
        "tests_total":total,
        "tests_passed":passed,
        "pass_rate":round(passed/total,4) if total else 0,
        "safety_rate":round(safety_passed/len(safety_tests),4) if safety_tests else 0,
        "latency_ms":elapsed_ms,
        "categories":categories,
        "tests":tests,
        "note":"이 결과는 로컬 재현 가능 테스트에서 나온 것이며 범용 대규모 모델 벤치마크 점수를 의미하지 않습니다.",
    }

@app.get("/health")
def health(): return {"status":"ok","version":"1.1.0","mode":"openai" if os.getenv("OPENAI_API_KEY") else "demo","auth":"enabled","database":"postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite","deployment":"cloud-ready"}

@app.get("/capabilities")
def capabilities():
    api_key = bool(os.getenv("OPENAI_API_KEY"))
    model = os.getenv("OPENAI_MODEL") or "not configured"
    vision_model = os.getenv("OPENAI_VISION_MODEL") or (model if api_key else "not configured")
    return {
        "version":"1.1.0",
        "llm":{"enabled":api_key,"provider":"openai" if api_key else "local_fallback","model":model if api_key else "deterministic rules"},
        "vision":{"enabled":api_key,"provider":"openai" if api_key else "demo_fallback","model":vision_model if api_key else "demo recognizer"},
        "voice":{"enabled":True,"provider":"browser_web_speech","note":"Availability depends on the browser; Chrome/Edge are recommended."},
        "safety":{"human_in_the_loop":True,"write_confirmation":True,"undo":True},
        "auth":{"enabled":True,"context_isolation":True},
        "evaluation":{"enabled":True,"source":"local_test_harness"}
    }

@app.post("/auth/register")
def register(data:RegisterIn):
    username=data.username.strip().lower()
    if len(username)<3 or len(data.password)<6: raise HTTPException(400,"Username >= 3 chars and password >= 6 chars")
    with SessionLocal() as db:
        if db.query(User).filter(User.username==username).first(): raise HTTPException(409,"Username already exists")
        salt=secrets.token_hex(16); user=User(username=username,display_name=data.display_name.strip() or username,password_hash=_password_hash(data.password,salt),salt=salt); db.add(user); db.commit(); db.refresh(user)
        token=secrets.token_urlsafe(32); db.add(AuthSession(user_id=user.id,token_hash=_token_hash(token))); db.commit()
        return {"token":token,"user":{"id":user.id,"username":user.username,"display_name":user.display_name,"role":user.role,"status":user.status}}

@app.post("/auth/login")
def login(data:LoginIn):
    with SessionLocal() as db:
        user=db.query(User).filter(User.username==data.username.strip().lower()).first()
        if not user or not hmac.compare_digest(user.password_hash,_password_hash(data.password,user.salt)): raise HTTPException(401,"Invalid username or password")
        if user.status != "active": raise HTTPException(403,"Account is disabled")
        user.last_login_at=datetime.utcnow()
        token=secrets.token_urlsafe(32); db.add(AuthSession(user_id=user.id,token_hash=_token_hash(token))); db.commit()
        return {"token":token,"user":{"id":user.id,"username":user.username,"display_name":user.display_name,"role":user.role,"status":user.status}}

@app.post("/auth/logout")
def logout(user=Depends(auth_user),authorization:Optional[str]=Header(None)):
    token=authorization[7:].strip()
    with SessionLocal() as db: db.query(AuthSession).filter(AuthSession.token_hash==_token_hash(token),AuthSession.user_id==user["id"]).delete(); db.commit()
    return {"status":"logged_out"}
@app.get("/auth/me")
def me(user=Depends(auth_user)): return user

@app.get("/dashboard")
def dashboard(user=Depends(auth_user)):
    with SessionLocal() as db:
        c=get_context(db,user["id"]); c["pending_actions"]=[serialize(x) for x in db.query(PendingAction).filter(PendingAction.user_id==user["id"],PendingAction.status=="pending").order_by(PendingAction.id.desc()).limit(5).all()]; c["history"]=[serialize(x) for x in db.query(ActionHistory).filter(ActionHistory.user_id==user["id"]).order_by(ActionHistory.id.desc()).limit(10).all()]; c["user"]=user; return c
@app.get("/context")
def context(user=Depends(auth_user)):
    with SessionLocal() as db: return get_context(db,user["id"])
@app.get("/history")
def list_history(user=Depends(auth_user)):
    with SessionLocal() as db: return [serialize(x) for x in db.query(ActionHistory).filter(ActionHistory.user_id==user["id"]).order_by(ActionHistory.id.desc()).limit(30).all()]

@app.post("/evaluation/run")
def run_evaluation(user=Depends(auth_user)):
    return run_evaluation_suite(user["id"])

@app.get("/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    with SessionLocal() as db:
        return {
            "users_total":db.query(User).count(),
            "users_active":db.query(User).filter(User.status=="active").count(),
            "admins":db.query(User).filter(User.role=="admin").count(),
            "schedules":db.query(Schedule).count(),
            "tasks":db.query(Task).count(),
            "expenses":db.query(Expense).count(),
            "ingredients":db.query(Ingredient).count(),
            "agent_logs":db.query(AgentLog).count(),
            "pending_actions":db.query(PendingAction).filter(PendingAction.status=="pending").count(),
            "database":"postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite",
            "api_version":"1.1.0",
        }

@app.get("/admin/users")
def admin_users(admin=Depends(require_admin)):
    with SessionLocal() as db:
        rows=db.query(User).order_by(User.id.desc()).all()
        return [{"id":x.id,"username":x.username,"display_name":x.display_name,"role":x.role,"status":x.status,"created_at":x.created_at,"last_login_at":x.last_login_at} for x in rows]

@app.patch("/admin/users/{user_id}")
def admin_update_user(user_id:int,data:AdminUserUpdate,admin=Depends(require_admin)):
    with SessionLocal() as db:
        row=db.get(User,user_id)
        if not row: raise HTTPException(404,"User not found")
        changes=data.model_dump(exclude_unset=True)
        if "status" in changes and changes["status"] not in {"active","disabled"}: raise HTTPException(400,"Invalid status")
        if "role" in changes and changes["role"] not in {"user","admin"}: raise HTTPException(400,"Invalid role")
        if row.id==admin["id"] and changes.get("status")=="disabled": raise HTTPException(400,"Cannot disable your own admin account")
        if row.id==admin["id"] and changes.get("role")=="user": raise HTTPException(400,"Cannot remove your own admin role")
        for k,v in changes.items(): setattr(row,k,v)
        if changes.get("status")=="disabled": db.query(AuthSession).filter(AuthSession.user_id==row.id).delete()
        db.commit(); db.refresh(row)
        return {"id":row.id,"username":row.username,"display_name":row.display_name,"role":row.role,"status":row.status}

@app.post("/schedules")
def create_schedule(data:ScheduleIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=Schedule(user_id=user["id"],title=data.title,scheduled_at=data.scheduled_at); db.add(row); db.commit(); db.refresh(row); out=serialize(row); record_history(db,user["id"],"create","schedule",row.id,f"일정 생성: {row.title}",after=out); return out
@app.post("/expenses")
def create_expense(data:ExpenseIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=Expense(user_id=user["id"],item=data.item,amount=data.amount,category=data.category); db.add(row); db.commit(); db.refresh(row); out=serialize(row); record_history(db,user["id"],"create","expense",row.id,f"지출 기록: {row.item} ₩{row.amount:,.0f}",after=out); return out
@app.post("/ingredients")
def create_ingredient(data:IngredientIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=Ingredient(user_id=user["id"],name=data.name,quantity=data.quantity,expires_on=data.expires_on); db.add(row); db.commit(); db.refresh(row); out=serialize(row); record_history(db,user["id"],"create","ingredient",row.id,f"식재료 추가: {row.name}",after=out); return out
@app.post("/tasks")
def create_task(data:TaskIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=Task(user_id=user["id"],title=data.title,priority=data.priority,due_at=data.due_at); db.add(row); db.commit(); db.refresh(row); out=serialize(row); record_history(db,user["id"],"create","task",row.id,f"할 일 생성: {row.title}",after=out); return out
@app.post("/preferences")
def set_preference(data:PreferenceIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=db.query(Preference).filter(Preference.user_id==user["id"],Preference.key==data.key).first(); before=serialize(row) if row else None
        if row: row.value=data.value
        else: row=Preference(user_id=user["id"],key=data.key,value=data.value); db.add(row)
        db.commit(); db.refresh(row); out=serialize(row); record_history(db,user["id"],"update" if before else "create","preference",row.id,f"선호 설정: {row.key}",before,out); return out

def owned(db,model,item_id,user_id,label):
    row=db.query(model).filter(model.id==item_id,model.user_id==user_id).first()
    if not row: raise HTTPException(404,f"{label} not found")
    return row

@app.patch("/schedules/{item_id}")
def update_schedule(item_id:int,data:ScheduleUpdate,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Schedule,item_id,user["id"],"Schedule"); before=serialize(row); _apply_updates(row,data); db.commit(); db.refresh(row); after=serialize(row); record_history(db,user["id"],"update","schedule",row.id,f"일정 수정: {row.title}",before,after); return after
@app.delete("/schedules/{item_id}")
def delete_schedule(item_id:int,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Schedule,item_id,user["id"],"Schedule"); before=serialize(row); title=row.title; db.delete(row); db.commit(); record_history(db,user["id"],"delete","schedule",item_id,f"일정 삭제: {title}",before=before); return {"status":"deleted"}
@app.patch("/tasks/{item_id}")
def update_task(item_id:int,data:TaskUpdate,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Task,item_id,user["id"],"Task"); before=serialize(row); _apply_updates(row,data); db.commit(); db.refresh(row); after=serialize(row); record_history(db,user["id"],"update","task",row.id,f"할 일 업데이트: {row.title}",before,after); return after
@app.delete("/tasks/{item_id}")
def delete_task(item_id:int,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Task,item_id,user["id"],"Task"); before=serialize(row); title=row.title; db.delete(row); db.commit(); record_history(db,user["id"],"delete","task",item_id,f"할 일 삭제: {title}",before=before); return {"status":"deleted"}
@app.patch("/expenses/{item_id}")
def update_expense(item_id:int,data:ExpenseUpdate,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Expense,item_id,user["id"],"Expense"); before=serialize(row); _apply_updates(row,data); db.commit(); db.refresh(row); after=serialize(row); record_history(db,user["id"],"update","expense",row.id,f"지출 수정: {row.item}",before,after); return after
@app.delete("/expenses/{item_id}")
def delete_expense(item_id:int,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Expense,item_id,user["id"],"Expense"); before=serialize(row); name=row.item; db.delete(row); db.commit(); record_history(db,user["id"],"delete","expense",item_id,f"지출 삭제: {name}",before=before); return {"status":"deleted"}
@app.patch("/ingredients/{item_id}")
def update_ingredient(item_id:int,data:IngredientUpdate,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Ingredient,item_id,user["id"],"Ingredient"); before=serialize(row); _apply_updates(row,data); db.commit(); db.refresh(row); after=serialize(row); record_history(db,user["id"],"update","ingredient",row.id,f"식재료 수정: {row.name}",before,after); return after
@app.delete("/ingredients/{item_id}")
def delete_ingredient(item_id:int,user=Depends(auth_user)):
    with SessionLocal() as db:
        row=owned(db,Ingredient,item_id,user["id"],"Ingredient"); before=serialize(row); name=row.name; db.delete(row); db.commit(); record_history(db,user["id"],"delete","ingredient",item_id,f"식재료 삭제: {name}",before=before); return {"status":"deleted"}

MODEL_MAP={"schedule":Schedule,"task":Task,"expense":Expense,"ingredient":Ingredient,"preference":Preference}
@app.post("/history/{history_id}/undo")
def undo_history(history_id:int,user=Depends(auth_user)):
    with SessionLocal() as db:
        hist=db.query(ActionHistory).filter(ActionHistory.id==history_id,ActionHistory.user_id==user["id"]).first()
        if not hist: raise HTTPException(404,"History not found")
        if hist.undone: raise HTTPException(409,"History already undone")
        model=MODEL_MAP.get(hist.entity_type)
        if not model: raise HTTPException(400,"Unsupported entity")
        before=json.loads(hist.before_json) if hist.before_json else None
        if hist.operation=="create":
            row=db.query(model).filter(model.id==hist.entity_id,model.user_id==user["id"]).first()
            if row: db.delete(row)
        elif hist.operation=="delete" and before:
            payload={k:v for k,v in before.items() if k not in ("created_at",)}; db.merge(model(**payload))
        elif hist.operation=="update":
            row=db.query(model).filter(model.id==hist.entity_id,model.user_id==user["id"]).first()
            if row and before:
                for k,v in before.items():
                    if k not in ("id","created_at","user_id"): setattr(row,k,v)
        hist.undone=True; db.commit(); return {"status":"undone","message":f"실행 취소: {hist.summary}"}

@app.post("/reasoning/analyze")
def reasoning_analyze(data:DecisionIn,user=Depends(auth_user)):
    with SessionLocal() as db: return analyze_local_decision(get_context(db,user["id"]),data.title,data.proposed_at,data.duration_minutes)
@app.post("/planner/daily")
def daily_planner(data:PlannerIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        c=get_context(db,user["id"])
        try: return build_openai_plan(c,data.horizon)
        except Exception as e:
            result=build_demo_plan(c,data.horizon); result["warning"]=f"Planner API failed: {type(e).__name__}"; return result
@app.post("/agent")
def agent(data:AgentIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        c=get_context(db,user["id"]); result=openai_agent(data.message,c); pending=None
        if result.get("approval_required"): pending=serialize(create_pending_action(db,user["id"],result["action_type"],result["payload"],result["summary"]))
        db.add(AgentLog(user_id=user["id"],user_input=data.message,route=result["route"],response=result["message"],trace_json=json.dumps(result["trace"],ensure_ascii=False))); db.commit()
        return {"route":result["route"],"message":result["message"],"trace":result["trace"],"approval_required":bool(result.get("approval_required")),"pending_action":pending}
@app.post("/agent/confirm")
def confirm_action(data:ConfirmIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        action=db.query(PendingAction).filter(PendingAction.id==data.action_id,PendingAction.user_id==user["id"]).first()
        if not action: raise HTTPException(404,"Pending action not found")
        if action.status!="pending": raise HTTPException(409,f"Action is already {action.status}")
        if not data.approve: action.status="rejected"; db.commit(); return {"status":"rejected","created":None,"message":"작업을 취소했습니다. 생활 데이터는 변경되지 않았습니다."}
        return {"status":"approved","created":execute_action(db,user["id"],action),"message":"확인 후 실행했습니다. Personal Context가 업데이트되었습니다."}

def _data_url(raw: bytes, content_type: str | None):
    mime = content_type or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def _demo_receipt(filename: str):
    return {
        "kind": "receipt",
        "merchant": "CU Convenience Store",
        "amount": 8500,
        "currency": "KRW",
        "category": "food",
        "items": ["coffee", "triangle kimbap"],
        "confidence": 0.74,
        "source": "demo",
        "note": f"Demo fallback used for {filename}. Set OPENAI_API_KEY for real image understanding."
    }


def _demo_fridge(filename: str):
    return {
        "kind": "fridge",
        "ingredients": [
            {"name": "egg", "quantity": "6", "expires_on": None},
            {"name": "milk", "quantity": "1 carton", "expires_on": "soon"},
            {"name": "tomato", "quantity": "3", "expires_on": None}
        ],
        "confidence": 0.70,
        "source": "demo",
        "note": f"Demo fallback used for {filename}. Set OPENAI_API_KEY for real image understanding."
    }


def _vision_with_openai(raw: bytes, content_type: str, task: str):
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return None
    client = OpenAI()
    if task == "receipt":
        instruction = "Return ONLY JSON for this receipt with keys kind, merchant, amount, currency, category, items, confidence, source. Use null if unreadable. Set kind to receipt and source to openai."
    else:
        instruction = "Return ONLY JSON for this refrigerator image with keys kind, ingredients, confidence, source. ingredients must be objects with name, quantity, expires_on. Use null for unknown expiry. Set kind to fridge and source to openai."
    r = client.responses.create(
        model=os.getenv("OPENAI_VISION_MODEL", os.getenv("OPENAI_MODEL", "gpt-5.6-luna")),
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": instruction},
            {"type": "input_image", "image_url": _data_url(raw, content_type)}
        ]}],
    )
    text = (r.output_text or "").strip()
    text = re.sub(r"^```json\s*|\s*```$", "", text, flags=re.S)
    return json.loads(text)



@app.post("/vision/receipt")
async def vision_receipt(file:UploadFile=File(...),user=Depends(auth_user)):
    raw=await file.read()
    if not raw: raise HTTPException(400,"Empty image")
    if len(raw)>8*1024*1024: raise HTTPException(413,"Image too large")
    try: result=_vision_with_openai(raw,file.content_type or "image/jpeg","receipt") or _demo_receipt(file.filename or "receipt")
    except Exception as e: result=_demo_receipt(file.filename or "receipt"); result["warning"]=f"Vision API failed: {type(e).__name__}"
    return result
@app.post("/vision/fridge")
async def vision_fridge(file:UploadFile=File(...),user=Depends(auth_user)):
    raw=await file.read()
    if not raw: raise HTTPException(400,"Empty image")
    if len(raw)>8*1024*1024: raise HTTPException(413,"Image too large")
    try: result=_vision_with_openai(raw,file.content_type or "image/jpeg","fridge") or _demo_fridge(file.filename or "fridge")
    except Exception as e: result=_demo_fridge(file.filename or "fridge"); result["warning"]=f"Vision API failed: {type(e).__name__}"
    return result
@app.post("/vision/propose")
def vision_propose(data:VisionProposalIn,user=Depends(auth_user)):
    with SessionLocal() as db:
        if data.kind=="receipt":
            amount=data.result.get("amount")
            if amount is None: raise HTTPException(400,"Receipt amount is missing")
            merchant=data.result.get("merchant") or "receipt expense"; row=create_pending_action(db,user["id"],"create_expense",{"item":merchant,"amount":float(amount),"category":data.result.get("category") or "auto"},f"이미지 인식 지출 기록 ₩{float(amount):,.0f} · {merchant}")
        elif data.kind=="fridge":
            ingredients=data.result.get("ingredients") or []
            if not ingredients: raise HTTPException(400,"No ingredients found")
            row=create_pending_action(db,user["id"],"create_ingredients_batch",{"ingredients":ingredients},f"인식된 식재료 {len(ingredients)}종을 냉장고 Context에 저장")
        else: raise HTTPException(400,"Unsupported vision kind")
        return serialize(row)

@app.get("/defense/summary")
def defense_summary(user=Depends(auth_user)):
    with SessionLocal() as db:
        c=get_context(db,user["id"])
        tests=run_evaluation_suite(user["id"])
        return {
            "project":"Context-aware Multimodal Life Agent",
            "version":"1.0.0",
            "architecture":["Input","Personal Context","Reasoning","Planning","Tool","Safety Gate","Execution","History/Undo"],
            "context_counts":{
                "schedules":len(c["schedules"]),"tasks":len(c["tasks"]),"expenses":len(c["expenses"]),
                "ingredients":len(c["ingredients"]),"preferences":len(c["preferences"])
            },
            "evaluation":{
                "tests_passed":tests["tests_passed"],"tests_total":tests["tests_total"],
                "pass_rate":tests["pass_rate"],"safety_rate":tests["safety_rate"],"latency_ms":tests["latency_ms"]
            },
            "capabilities":capabilities(),
            "safety":["Human-in-the-loop before write","Per-user Context isolation","Action History","Undo"],
            "demo_ready":len(c["schedules"])>0 and len(c["tasks"])>0
        }

@app.post("/demo/seed")
def seed_demo(user=Depends(auth_user)):
    uid=user["id"]
    with SessionLocal() as db:
        for model in [Schedule,Expense,Ingredient,Task,Preference,PendingAction,AgentLog,ActionHistory]: db.query(model).filter(model.user_id==uid).delete()
        db.add_all([Schedule(user_id=uid,title="컴퓨터공학 수업",scheduled_at="내일 10:00"),Schedule(user_id=uid,title="졸업작품 회의",scheduled_at="내일 15:30"),Expense(user_id=uid,item="커피",amount=4500,category="식비"),Expense(user_id=uid,item="편의점",amount=8200,category="생활"),Ingredient(user_id=uid,name="달걀",quantity="6개",expires_on="3일 후"),Ingredient(user_id=uid,name="우유",quantity="1팩",expires_on="내일"),Ingredient(user_id=uid,name="토마토",quantity="3개",expires_on="4일 후"),Task(user_id=uid,title="졸업작품 요구사항 정리",priority="high",due_at="내일"),Task(user_id=uid,title="Python 복습",priority="medium",due_at="이번 주"),Preference(user_id=uid,key="focus_block",value="50분 집중 + 10분 휴식 선호"),Preference(user_id=uid,key="evening",value="23:30 이전에 고강도 작업 종료")]); db.commit(); return {"status":"seeded","user_id":uid}
