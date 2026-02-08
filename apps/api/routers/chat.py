"""
Chat Router — Groq-powered chatbot assistant.

POST /chat  — send a message, get a reply + suggested UI actions.

Rate limited to 30 requests per wallet per hour.
"""

import time
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from database import get_db
from settings import get_settings
from services.chat_context import get_chat_context

router = APIRouter(prefix="/chat", tags=["chat"])

# ── Rate limiter (in-memory, per wallet, 30/hour) ──────────────────────
_chat_rate: Dict[str, List[float]] = {}
RATE_LIMIT = 30
RATE_WINDOW = 3600  # 1 hour


def _check_rate(wallet: str) -> None:
    now = time.time()
    key = wallet.lower() if wallet else "anonymous"
    history = _chat_rate.get(key, [])
    history = [t for t in history if t > now - RATE_WINDOW]
    if len(history) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Chat rate limit exceeded (30 messages/hour). Try again later.",
        )
    history.append(now)
    _chat_rate[key] = history


# ── Request / Response models ──────────────────────────────────────────

class ChatAction(BaseModel):
    type: str = Field(..., description="NAVIGATE | HIGHLIGHT | SCROLL_TO | SUGGEST_INPUT")
    to: Optional[str] = None
    targetId: Optional[str] = None
    fieldId: Optional[str] = None
    suggestedValue: Optional[str] = None
    label: Optional[str] = None


class ChatRequest(BaseModel):
    wallet: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=2000)
    page: Optional[str] = "/"
    context: Optional[Dict[str, Any]] = None
    sessionId: Optional[str] = None
    lastAction: Optional[str] = None


class ChatSafety(BaseModel):
    canAutoExecute: bool = False


class ChatResponse(BaseModel):
    reply: str
    actions: List[ChatAction] = []
    safety: ChatSafety = ChatSafety()


# ── Known routes & element IDs ─────────────────────────────────────────

KNOWN_ROUTES = {
    "/": "Home page — landing page with project overview",
    "/register": "Register page — register as a worker on-chain",
    "/workproofs": "Work Proofs page — view shift history, earnings, reviews",
    "/offer": "Get Offer page — generate AI credit attestation",
    "/loan": "Loan page — borrow against credit offer, repay loans",
    "/manager": "Manager Portal — manage projects, workers, shifts, reviews",
}

KNOWN_ELEMENTS = {
    "register-btn": "Button to register as a worker on the blockchain",
    "simulate-workproof-btn": "Admin button to simulate a work proof submission",
    "generate-offer-btn": "Button to generate an AI credit attestation / offer",
    "borrow-btn": "Button to borrow USDC against an active credit offer",
    "repay-btn": "Button to repay an outstanding loan",
    "connect-wallet-btn": "Button to connect MetaMask wallet",
    "manager-create-project-btn": "Button to create a new project in Manager Portal",
    "manager-add-worker-btn": "Button to add a new worker in Manager Portal",
}

# ── System prompt ──────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the UnEmpower Assistant — a helpful chatbot embedded in the UnEmpower web app.
UnEmpower is a blockchain-enforced worker lending platform powered by AI credit scoring.

Your role:
- Help users navigate the app and understand features
- Answer questions about loans, repayment, work proofs, credit offers, the manager portal
- Suggest next steps based on the user's current state
- Guide users step-by-step in simple language

IMPORTANT RULES:
1. You must NEVER ask for private keys, seed phrases, OTPs, passwords, or any sensitive information.
2. You must NEVER attempt to execute blockchain transactions. You can only SUGGEST actions.
3. You can suggest at most 2 actions per response.
4. Only use these action types:
   - NAVIGATE: Navigate to a page. Use "to" field with one of: /, /register, /workproofs, /offer, /loan, /manager
   - HIGHLIGHT: Highlight a button/element. Use "targetId" field with a known element ID.
   - SCROLL_TO: Scroll to an element. Use "targetId" field.
   - SUGGEST_INPUT: Suggest filling an input. Use "fieldId" and "suggestedValue" fields.
5. If the user asks for something unsafe or you cannot help, refuse politely and suggest a safe alternative.

KNOWN ELEMENT IDs you can reference:
- register-btn: Register as worker button
- simulate-workproof-btn: Simulate work proof (admin)
- generate-offer-btn: Generate credit offer button
- borrow-btn: Borrow USDC button
- repay-btn: Repay loan button
- connect-wallet-btn: Connect wallet button
- manager-create-project-btn: Create project button
- manager-add-worker-btn: Add worker button

KNOWN ROUTES:
- / (Home)
- /register (Register as Worker)
- /workproofs (View Work Proofs & Earnings)
- /offer (Generate Credit Offer)
- /loan (Borrow & Repay)
- /manager (Manager Portal)

The typical user flow is:
1. Connect wallet → 2. Register as worker → 3. Get work proofs/shifts logged → 4. Generate credit offer → 5. Borrow USDC → 6. Repay loan

You must return your response as valid JSON with this exact structure:
{
  "reply": "your helpful text response here",
  "actions": [
    {"type": "NAVIGATE", "to": "/route", "label": "Button label"}
  ]
}

Keep replies concise (2-4 sentences max). Be friendly and helpful.
Do NOT include markdown formatting in your reply text — plain text only.
Always return valid JSON. No extra text outside the JSON object."""


# ── Groq API call ──────────────────────────────────────────────────────

async def _call_groq(system: str, user_message: str) -> dict:
    """Call Groq chat completion API and parse JSON response."""
    settings = get_settings()
    api_key = settings.GROQ_API_KEY

    if not api_key:
        return {
            "reply": "Chatbot is not configured. Please ask the administrator to set the GROQ_API_KEY.",
            "actions": [],
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 500,
                "response_format": {"type": "json_object"},
            },
        )

    if resp.status_code != 200:
        print(f"  [CHAT] Groq API error: {resp.status_code} {resp.text[:200]}")
        return {
            "reply": "Sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.",
            "actions": [],
        }

    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        try:
            start = content.index("{")
            end = content.rindex("}") + 1
            parsed = json.loads(content[start:end])
        except (ValueError, json.JSONDecodeError):
            parsed = {"reply": content, "actions": []}

    return parsed


# ── Endpoint ───────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    """Process a chat message and return an AI response with suggested actions."""

    # Rate limit
    _check_rate(req.wallet or "anonymous")

    # Build context
    db_context = get_chat_context(req.wallet, db)

    # Merge with frontend-supplied context
    if req.context:
        db_context.update(req.context)

    # Build user message with context
    context_summary = f"""
USER STATE:
- Wallet: {req.wallet or 'not connected'}
- Current page: {req.page}
- Worker linked: {db_context.get('linked', False)}
"""

    if db_context.get("worker"):
        w = db_context["worker"]
        context_summary += f"- Worker: {w.get('full_name', 'Unknown')} | Project: {w.get('project', 'None')} | Rate: ₹{w.get('rate_per_hour', 0)}/hr\n"

    if db_context.get("totals"):
        t = db_context["totals"]
        context_summary += f"- Shifts: {t.get('total_proofs', 0)} | Hours (7d): {t.get('hours_7d', 0)} | Total earned: ₹{t.get('total_earned', 0)}\n"

    if db_context.get("reviews"):
        r = db_context["reviews"]
        context_summary += f"- Reviews: {r.get('count', 0)} | Avg rating: {r.get('avg_rating', 'N/A')}\n"

    if db_context.get("latest_offer"):
        o = db_context["latest_offer"]
        context_summary += f"- Latest offer: credit={o.get('credit_limit')} | APR={o.get('apr_bps')}bps | trust={o.get('trust_score')}\n"

    if db_context.get("on_chain_proofs"):
        context_summary += f"- On-chain proofs: {db_context['on_chain_proofs']}\n"

    if req.sessionId:
        context_summary += f"- Voice session active (sessionId: {req.sessionId})\n"
    if req.lastAction:
        context_summary += f"- User just executed action: {req.lastAction}. Guide them on the NEXT step.\n"

    full_user_msg = f"{context_summary}\nUSER MESSAGE: {req.message}"

    # Call Groq
    result = await _call_groq(SYSTEM_PROMPT, full_user_msg)

    # Sanitize actions — only allow known types and routes
    raw_actions = result.get("actions", [])
    safe_actions = []
    for a in raw_actions[:2]:  # max 2 actions
        action_type = a.get("type", "")
        if action_type == "NAVIGATE" and a.get("to") in KNOWN_ROUTES:
            safe_actions.append(ChatAction(
                type="NAVIGATE",
                to=a["to"],
                label=a.get("label", f"Go to {a['to']}"),
            ))
        elif action_type == "HIGHLIGHT" and a.get("targetId") in KNOWN_ELEMENTS:
            safe_actions.append(ChatAction(
                type="HIGHLIGHT",
                targetId=a["targetId"],
                label=a.get("label", f"Look at {a['targetId']}"),
            ))
        elif action_type == "SCROLL_TO" and a.get("targetId"):
            safe_actions.append(ChatAction(
                type="SCROLL_TO",
                targetId=a["targetId"],
                label=a.get("label", "Scroll to element"),
            ))
        elif action_type == "SUGGEST_INPUT" and a.get("fieldId"):
            safe_actions.append(ChatAction(
                type="SUGGEST_INPUT",
                fieldId=a["fieldId"],
                suggestedValue=a.get("suggestedValue", ""),
                label=a.get("label", "Fill in value"),
            ))

    reply_text = result.get("reply", "I'm not sure how to help with that. Could you rephrase?")

    # Log (no sensitive content)
    action_types = [a.type for a in safe_actions]
    print(f"  [CHAT] wallet={req.wallet or 'anon'} page={req.page} actions={action_types}")

    return ChatResponse(
        reply=reply_text,
        actions=safe_actions,
        safety=ChatSafety(canAutoExecute=False),
    )
