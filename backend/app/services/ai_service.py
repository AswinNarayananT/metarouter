import time
import httpx
from google import genai
from google.genai import types, errors
from sqlalchemy.orm import Session
from app.config import settings
from app.models.ai_settings_model import OrganizationAISettings
from app.models.knowledge_model import KnowledgeChunk
from app.models.conversation_model import ChatMessage, Conversation
from app.services.vector_service import search_organization_knowledge, find_organization_chunks, format_knowledge_context

# One request never hangs for minutes; the client's own retries are off so generate_with_backup decides
client = genai.Client(
    api_key=settings.GOOGLE_API_KEY,
    http_options=types.HttpOptions(timeout=settings.GEMINI_TIMEOUT_SECONDS * 1000, retry_options=types.HttpRetryOptions(attempts=1))
)

# Gemini errors worth another try: rate limited, overloaded, server trouble
RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
# Timeouts: the model already used the whole time limit, so the next model is tried instead of the same one again
TIMEOUT_STATUS_CODES = {408, 504}
RETRY_DELAY_SECONDS = 1.5


def model_chain(main: str, backups: str) -> list:
    # "main" then the comma-separated backups from .env, in order
    return [main] + [m.strip() for m in (backups or "").split(",") if m.strip()]


def generate_with_backup(models: list, contents, config, purpose: str, timeout_seconds: int = settings.GEMINI_TIMEOUT_SECONDS):
    # A shorter limit for this call (customer replies) than the client default (documents, voice notes)
    if timeout_seconds != settings.GEMINI_TIMEOUT_SECONDS:
        config.http_options = types.HttpOptions(timeout=timeout_seconds * 1000, retry_options=types.HttpRetryOptions(attempts=1))

    # 1. Main model first (retried a little), then the backup; a bad request fails at once (a backup won't fix it)
    last_error = None
    for model in [m for m in dict.fromkeys(models) if m]:
        for attempt in range(settings.GEMINI_RETRIES + 1):
            try:
                response = client.models.generate_content(model=model, contents=contents, config=config)
                if model != models[0]:
                    print(f"[GEMINI] {purpose}: answered by backup model {model}")
                return response
            except errors.APIError as e:
                if e.code not in RETRYABLE_STATUS_CODES:
                    raise
                last_error = e
                print(f"[GEMINI] {purpose}: {model} failed ({e.code} {e.status}), attempt {attempt + 1}")
                if e.code in TIMEOUT_STATUS_CODES:
                    break  # Next model
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_error = e
                print(f"[GEMINI] {purpose}: {model} {type(e).__name__} after {timeout_seconds}s limit, trying the next model")
                break  # Next model
            time.sleep(RETRY_DELAY_SECONDS * (attempt + 1))

    # 2. Every model failed: the caller decides what to do (escalate, keep details, retry later)
    raise last_error

AI_HISTORY_MESSAGES = 10  # Most recent messages sent to Gemini as conversation context
# Room for thinking AND the reply: thinking tokens count against this limit, and with the long organization
# prompt the model can think for ~350 tokens, which used to cut replies off mid-sentence. Length is kept
# short by the REPLY STYLE rule instead.
REPLY_MAX_OUTPUT_TOKENS = 2048
HANDOVER_TEXT = "I am connecting you with a support representative who will assist you shortly."
SENTENCE_ENDS = (".", "!", "?", "…")
KNOWLEDGE_CHUNKS_PER_REPLY = 5  # Knowledge base passages given to the AI for each customer message
NO_DOCUMENTS_TEXT = "No additional company documents provided."


def finish_cut_reply(text: str) -> str:
    # A reply that hit the token limit: keep it up to the last complete sentence (never send "...If you have")
    if "[ESCALATE_TO_HUMAN]" in text:
        return f"[ESCALATE_TO_HUMAN] {HANDOVER_TEXT}"
    cut = max(text.rfind(end) for end in SENTENCE_ENDS)
    return text[:cut + 1].strip() if cut > 0 else ""

def get_organization_knowledge_chunks(db: Session, organization_id: int, user_query: str) -> str:
    """
    Retrieves the knowledge base chunks most relevant to the query, strictly filtered by organization_id.
    """
    has_chunks = db.query(KnowledgeChunk.id).filter(
        KnowledgeChunk.organization_id == organization_id
    ).first()

    if not has_chunks:
        return NO_DOCUMENTS_TEXT

    try:
        return search_organization_knowledge(db, organization_id, user_query, limit=KNOWLEDGE_CHUNKS_PER_REPLY)
    except Exception as e:
        # Answer from rules alone rather than failing the whole reply
        print(f"Knowledge search error: {e}")
        return NO_DOCUMENTS_TEXT


def organization_prompt_settings(db: Session, organization_id: int) -> tuple:
    # Saved bot name and rules (what customers get)
    ai_settings = db.query(OrganizationAISettings).filter_by(organization_id=organization_id).first()
    bot_name = ai_settings.bot_name if ai_settings else "Support Bot"
    custom_rules = ai_settings.system_instructions if ai_settings and ai_settings.system_instructions else "Be polite and helpful."
    return bot_name, custom_rules


def build_system_instruction(bot_name: str, custom_rules: str, knowledge_context: str) -> str:
    # Strict guardrails & handover rules; the same prompt for live chats and the "Try it" simulator
    return f"""
    You are {bot_name}, a customer service AI representing ONLY this organization.

    ORGANIZATION RULES & POLICIES:
    {custom_rules}

    VERIFIED KNOWLEDGE BASE:
    {knowledge_context}

    GENERAL QUESTIONS (answer them yourself):
    Questions about the organization in general (locations, courses, fees model, timings, admissions, policies)
    are yours to answer from the rules and knowledge base. If the exact detail isn't there, do NOT escalate:
    share what you do know, say honestly that you don't have that specific detail, never invent it, and offer
    a person: "Would you like me to connect you with our team for that?". Escalate only if they say yes.

    CRITICAL ESCALATION PROTOCOL:
    You MUST output the string "[ESCALATE_TO_HUMAN]" at the beginning of your response if:
    1. The user asks to talk to a human, agent, representative, or manager (including saying yes to your offer).
    2. The user expresses strong anger, frustration, or dissatisfaction.
    3. The request involves sensitive actions (e.g., immediate refund execution, account deletion).
    4. The request is about the customer's own case and needs someone to look up or change their records
       (a specific payment or receipt, their admission status, a refund, a document they submitted).

    If escalating, write a polite note following the tag:
    Example: "[ESCALATE_TO_HUMAN] I am connecting you with a support representative who will assist you shortly."

    REPLY STYLE:
    Keep replies short and conversational, like a WhatsApp message: at most about 80 words unless the customer
    asks for details. Always finish your sentences.

    LANGUAGE:
    Always reply in English, whatever language the customer writes or speaks in (Malayalam, Hindi, Tamil,
    Manglish ...). Understand their message, but answer only in simple, clear English.

    CLOSING PROTOCOL:
    1. When you have fully answered the customer's question or solved their problem, end that reply by asking
       if there is anything else you can help with.
    2. If the customer then says they need nothing else (e.g. "no", "that's all", "no thanks", "ok thank you"),
       reply with a short friendly goodbye and put the string "[RESOLVED]" at the beginning of your response.
       Example: "[RESOLVED] Glad I could help! Have a great day."
    3. Never use "[RESOLVED]" together with "[ESCALATE_TO_HUMAN]", and never while the customer still needs help.
    """


def generate_reply(system_instruction: str, contents: list) -> str:
    # Gemini with the chat model chain; raises if every model fails or the reply is unusable
    response = generate_with_backup(
        model_chain(settings.GEMINI_CHAT_MODEL, settings.GEMINI_CHAT_BACKUP_MODEL),
        contents,
        types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2, # Low temperature ensures strict policy adherence
            max_output_tokens=REPLY_MAX_OUTPUT_TOKENS,
            # Gemini 3 ignores thinking_budget=0; "low" is the lowest level it accepts.
            thinking_config=types.ThinkingConfig(thinking_level="low"),
        ),
        "customer reply",
        timeout_seconds=settings.GEMINI_CHAT_TIMEOUT_SECONDS  # The customer is waiting: move to the backup sooner
    )
    if not response.text:
        raise ValueError(f"Empty response from Gemini (finish reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'})")

    # Cut off by the token limit: finish at the last full sentence instead of sending half of one
    reply = response.text.strip()
    if response.candidates and response.candidates[0].finish_reason == types.FinishReason.MAX_TOKENS:
        print(f"[GEMINI] customer reply hit the token limit; trimming to the last full sentence: {reply[-60:]!r}")
        reply = finish_cut_reply(reply)
        if not reply:
            raise ValueError("Reply was cut off before its first sentence ended")
    return reply


def generate_ai_response(db: Session, conversation: Conversation, new_message: str) -> str:
    """
    Generates an organization-isolated response using Gemini.
    """
    org_id = conversation.organization_id

    # 1. Fetch the Organization System Instructions
    bot_name, custom_rules = organization_prompt_settings(db, org_id)

    # 2. Retrieve the Organization Knowledge Base Chunks
    knowledge_context = get_organization_knowledge_chunks(db, org_id, new_message)

    # 3. Construct Strict Guardrails & Handover Rules
    system_instruction = build_system_instruction(bot_name, custom_rules, knowledge_context)

    # 4. Fetch Chat History: the most recent messages, oldest first
    # Activity entries ("Aromal took this chat") are for the team, not part of the conversation with the customer
    recent_messages = db.query(ChatMessage).filter(ChatMessage.conversation_id == conversation.id, ChatMessage.sender != "system").order_by(ChatMessage.id.desc()).limit(AI_HISTORY_MESSAGES).all()
    past_messages = list(reversed(recent_messages))

    contents = []
    for msg in past_messages:
        role = "user" if msg.sender == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.content)]
            )
        )

    # Append the new message, unless it's already the last saved one (incoming chats are saved before this runs;
    # document summaries are not saved as messages, so they are added here)
    last = past_messages[-1] if past_messages else None
    if not (last and last.sender == "user" and last.content == new_message):
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=new_message)]
            )
        )

    # 5. Call Gemini
    try:
        return generate_reply(system_instruction, contents)
    except Exception as e:
        print(f"Gemini Generation Error: {e}")
        return "[ESCALATE_TO_HUMAN] I am having trouble processing your request. Transferring you to an agent."


def simulate_ai_response(db: Session, organization_id: int, history: list, new_message: str) -> dict:
    # "Try it" on the AI Assistant page: the saved settings and knowledge base, the same prompt and models
    # as live chats, but the conversation comes from the request and nothing is saved or sent
    # 1. Saved bot name and rules
    bot_name, custom_rules = organization_prompt_settings(db, organization_id)

    # 2. Knowledge base passages with their match distance (to show as sources)
    has_knowledge = db.query(KnowledgeChunk.id).filter(KnowledgeChunk.organization_id == organization_id).first() is not None
    matches = []
    knowledge_context = NO_DOCUMENTS_TEXT
    if has_knowledge:
        try:
            matches = find_organization_chunks(db, organization_id, new_message, limit=KNOWLEDGE_CHUNKS_PER_REPLY)
            knowledge_context = format_knowledge_context([chunk for chunk, _ in matches])
        except Exception as e:
            print(f"[AI SIMULATOR] Knowledge search error: {e}")

    # 3. Earlier turns of the test chat, then the new question
    contents = [
        types.Content(role="user" if turn["role"] == "customer" else "model", parts=[types.Part.from_text(text=turn["text"])])
        for turn in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=new_message)]))

    # 4. Same model call as a live chat; a failure is reported as one (not dressed up as a handover)
    started = time.monotonic()
    raw_reply = None
    error = None
    try:
        raw_reply = generate_reply(build_system_instruction(bot_name, custom_rules, knowledge_context), contents)
    except Exception as e:
        print(f"[AI SIMULATOR] Gemini error: {e}")
        error = str(e)

    return {
        "raw_reply": raw_reply,
        "error": error,
        "matches": matches,
        "has_knowledge": has_knowledge,
        "elapsed_ms": int((time.monotonic() - started) * 1000)
    }