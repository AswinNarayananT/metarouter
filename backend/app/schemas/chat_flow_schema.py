from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.services.messaging_service import INTERACTIVE_BODY_MAX_CHARS, WHATSAPP_TEXT_MAX_CHARS, BUTTON_TITLE_MAX_CHARS, MAX_LIST_ROWS, ROW_TITLE_MAX_CHARS, ROW_DESCRIPTION_MAX_CHARS

FLOW_ID_PATTERN = r"^[A-Za-z0-9_-]{1,40}$"  # Box and option ids (they go into the tap ids sent to WhatsApp)
MAX_FLOW_NODES = 100


class FlowModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class FlowPosition(FlowModel):
    x: float
    y: float


class FlowOption(FlowModel):
    id: str = Field(pattern=FLOW_ID_PATTERN)
    title: str = Field(min_length=1, max_length=ROW_TITLE_MAX_CHARS)                    # 3 or fewer with titles up to 20 go out as buttons, otherwise a list
    description: Optional[str] = Field(None, max_length=ROW_DESCRIPTION_MAX_CHARS)      # Only shown in a list
    next: Optional[str] = None                                                          # The box this option leads to


class QuestionNode(FlowModel):
    id: str = Field(pattern=FLOW_ID_PATTERN)
    type: Literal["question"]
    text: str = Field(min_length=1, max_length=INTERACTIVE_BODY_MAX_CHARS)
    menu_button: Optional[str] = Field(None, max_length=BUTTON_TITLE_MAX_CHARS)         # The list's button ("Options" when empty)
    options: list[FlowOption] = Field(min_length=1, max_length=MAX_LIST_ROWS)
    position: FlowPosition


class AnswerNode(FlowModel):
    id: str = Field(pattern=FLOW_ID_PATTERN)
    type: Literal["answer"]
    text: str = Field(min_length=1, max_length=WHATSAPP_TEXT_MAX_CHARS)
    next: Optional[str] = None                                                          # A question to ask after the answer
    position: FlowPosition


class OrderNode(FlowModel):
    id: str = Field(pattern=FLOW_ID_PATTERN)
    type: Literal["order"]
    position: FlowPosition


class ActionNode(FlowModel):
    # problem: opens a ticket; team: hands the chat to the team; ai: the AI answers. Empty text = the default message
    id: str = Field(pattern=FLOW_ID_PATTERN)
    type: Literal["problem", "team", "ai"]
    text: Optional[str] = Field(None, max_length=INTERACTIVE_BODY_MAX_CHARS)
    position: FlowPosition


FlowNode = Annotated[Union[QuestionNode, AnswerNode, OrderNode, ActionNode], Field(discriminator="type")]


class ChatFlowDocument(FlowModel):
    start: str
    nodes: list[FlowNode] = Field(min_length=1, max_length=MAX_FLOW_NODES)

    @model_validator(mode="after")
    def check_links(self):
        # 1. Box ids are unique, and the menu starts with a question
        nodes = {}
        for node in self.nodes:
            if node.id in nodes:
                raise ValueError("Two boxes have the same id")
            nodes[node.id] = node
        if not isinstance(nodes.get(self.start), QuestionNode):
            raise ValueError("The menu must start with a question")

        # 2. Every option leads somewhere (WhatsApp refuses two options with the same title); an answer can only lead on to a question
        for node in self.nodes:
            # "{name}" is empty for a customer without a name: there must be other text
            if isinstance(node, (QuestionNode, AnswerNode)) and not node.text.replace("{name}", "").strip():
                raise ValueError(f'"{node.text[:40]}" needs some text besides {{name}}')
            if isinstance(node, QuestionNode):
                option_ids = [option.id for option in node.options]
                if len(set(option_ids)) != len(option_ids):
                    raise ValueError(f'Two options in "{node.text[:40]}" have the same id')
                titles = [option.title.lower() for option in node.options]
                if len(set(titles)) != len(titles):
                    raise ValueError(f'Two options in "{node.text[:40]}" have the same title')
                for option in node.options:
                    if not option.next or option.next not in nodes:
                        raise ValueError(f'Option "{option.title}" has no next step')
            if isinstance(node, AnswerNode) and node.next and not isinstance(nodes.get(node.next), QuestionNode):
                raise ValueError(f'The answer "{node.text[:40]}" can only lead on to a question')
        return self
