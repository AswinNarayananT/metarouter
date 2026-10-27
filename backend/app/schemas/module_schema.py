from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, ConfigDict

class PlatformModuleBase(BaseModel):
    key: str = Field(..., pattern=r"^[a-z0-9_]{2,50}$", description="Lowercase alphanumeric snake_case key, e.g., 'orders'")
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    category: str = Field("General", max_length=50)
    icon: str = Field("Box", max_length=50)
    is_active: bool = True
    default_enabled: bool = False

class CreateModuleRequest(PlatformModuleBase):
    pass

class UpdateModuleRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    icon: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    default_enabled: Optional[bool] = None

class PlatformModuleResponse(PlatformModuleBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class OrganizationFeatureItem(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    category: str
    icon: str
    is_active_globally: bool
    default_enabled: bool
    enabled_for_workspace: bool
    is_custom_override: bool

class OrganizationFeaturesResponse(BaseModel):
    organization_id: int
    organization_name: str
    features: Dict[str, bool]
    modules: List[OrganizationFeatureItem]

class UpdateOrganizationFeaturesRequest(BaseModel):
    features: Dict[str, bool]
