from pydantic import BaseModel


class AutoReplyRequest(BaseModel):
    enabled: bool  # False = every new chat goes straight to the team
