import re
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator

# What Meta accepts for a text template; checked here so the admin gets a clear message straight away
APP_TEMPLATE_PREFIX = "metarouter_"  # The app's own templates (order updates)
TEMPLATE_NAME_MAX_CHARS = 100
TEMPLATE_BODY_MAX_CHARS = 1024
TEMPLATE_EXAMPLE_MAX_CHARS = 200
NAME_PATTERN = re.compile(r"^[a-z0-9_]+$")
LANGUAGE_PATTERN = re.compile(r"^[a-z]{2,3}(_[A-Z]{2})?$")
VARIABLE_PATTERN = re.compile(r"\{\{(.*?)\}\}")


def body_variables(body: str) -> list:
    # "Hi {{1}}, order {{2}}" -> [1, 2], each variable once, in the order they first appear
    found = VARIABLE_PATTERN.findall(body)
    if any(not value.isdigit() for value in found) or len(found) != body.count("{{") or len(found) != body.count("}}"):
        raise ValueError("Write variables as {{1}}, {{2}} and so on")
    return list(dict.fromkeys(int(value) for value in found))


class TemplateCreate(BaseModel):
    phone_number_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=TEMPLATE_NAME_MAX_CHARS)
    category: Literal["UTILITY", "MARKETING"]
    language: str = Field(..., min_length=2, max_length=10)
    body: str = Field(..., min_length=1, max_length=TEMPLATE_BODY_MAX_CHARS)
    examples: list[str] = Field(default=[], max_length=20)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not NAME_PATTERN.match(value):
            raise ValueError("Use lowercase letters, numbers and underscores only")
        if value.startswith(APP_TEMPLATE_PREFIX):
            raise ValueError(f"Names starting with {APP_TEMPLATE_PREFIX} are kept for the app's own templates")
        return value

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        if not LANGUAGE_PATTERN.match(value):
            raise ValueError("Choose a language from the list")
        return value

    @field_validator("body")
    @classmethod
    def validate_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message text is required")
        if value.startswith("{{") or value.endswith("}}"):
            raise ValueError("The message can't start or end with a variable")
        variables = body_variables(value)
        if variables != list(range(1, len(variables) + 1)):
            raise ValueError("Number variables in order: {{1}}, then {{2}}, and so on")
        return value

    @field_validator("examples")
    @classmethod
    def validate_examples(cls, value: list) -> list:
        # Meta refuses line breaks in a variable
        value = [example.strip() for example in value]
        if any(not example or len(example) > TEMPLATE_EXAMPLE_MAX_CHARS or re.search(r"[\n\t]", example) for example in value):
            raise ValueError(f"Each example needs one line of text, up to {TEMPLATE_EXAMPLE_MAX_CHARS} characters")
        return value

    @model_validator(mode="after")
    def validate_example_count(self) -> "TemplateCreate":
        if len(self.examples) != len(body_variables(self.body)):
            raise ValueError("Add one example for each variable")
        return self
