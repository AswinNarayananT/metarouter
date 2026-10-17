from google import genai
from google.genai import types
from sqlalchemy.orm import Session
from app.config import settings
from app.models.ai_chat import OrganizationAISettings, KnowledgeChunk, ChatMessage, Conversation
from app.services.vector_service import search_tenant_knowledge

client = genai.Client(api_key=settings.GOOGLE_API_KEY)

def get_tenant_knowledge_chunks(db: Session, organization_id: int, user_query: str) -> str:
    """
    Retrieves the knowledge base chunks most relevant to the query, strictly filtered by organization_id.
    """
    has_chunks = db.query(KnowledgeChunk.id).filter(
        KnowledgeChunk.organization_id == organization_id
    ).first()

    if not has_chunks:
        return "No additional company documents provided."

    try:
        return search_tenant_knowledge(db, organization_id, user_query, limit=5)
    except Exception as e:
        # Answer from rules alone rather than failing the whole reply
        print(f"Knowledge search error: {e}")
        return "No additional company documents provided."

def generate_ai_response(db: Session, conversation: Conversation, new_message: str) -> str:
    """
    Generates a tenant-isolated response using Gemini.
    """
    org_id = conversation.organization_id

    # 1. Fetch Tenant System Instructions
    ai_settings = db.query(OrganizationAISettings).filter_by(organization_id=org_id).first()
    bot_name = ai_settings.bot_name if ai_settings else "Support Bot"
    custom_rules = ai_settings.system_instructions if ai_settings and ai_settings.system_instructions else "Be polite and helpful."

    # 2. Retrieve Tenant Knowledge Base Chunks
    knowledge_context = get_tenant_knowledge_chunks(db, org_id, new_message)

    # 3. Construct Strict Guardrails & Handover Rules
    system_instruction = f"""
    You are {bot_name}, a customer service AI representing ONLY this organization.

    ORGANIZATION RULES & POLICIES:
    {custom_rules}

    VERIFIED KNOWLEDGE BASE:
    {knowledge_context}

    CRITICAL ESCALATION PROTOCOL:
    You MUST output the string "[ESCALATE_TO_HUMAN]" at the beginning of your response if:
    1. The user asks to talk to a human, agent, representative, or manager.
    2. The user expresses strong anger, frustration, or dissatisfaction.
    3. The request involves sensitive actions (e.g., immediate refund execution, account deletion).
    4. You cannot answer the question accurately using the provided rules and knowledge base.

    If escalating, write a polite note following the tag:
    Example: "[ESCALATE_TO_HUMAN] I am connecting you with a support representative who will assist you shortly."
    """

    # 4. Fetch Chat History (Last 10 Messages)
    past_messages = db.query(ChatMessage).filter_by(
        conversation_id=conversation.id
    ).order_by(ChatMessage.created_at.asc()).limit(10).all()

    contents = []
    for msg in past_messages:
        role = "user" if msg.sender == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.content)]
            )
        )
    
    # Append the new incoming message
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=new_message)]
        )
    )

    # 5. Call Gemini
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_CHAT_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2, # Low temperature ensures strict policy adherence
                max_output_tokens=350,
                # Thinking tokens count against max_output_tokens and can crowd out the reply.
                # Gemini 3 ignores thinking_budget=0; "low" is the lowest level it accepts.
                thinking_config=types.ThinkingConfig(thinking_level="low"),
            ),
        )
        if not response.text:
            raise ValueError(f"Empty response from Gemini (finish reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'})")
        return response.text.strip()
    except Exception as e:
        print(f"Gemini Generation Error: {e}")
        return "[ESCALATE_TO_HUMAN] I am having trouble processing your request. Transferring you to an agent."