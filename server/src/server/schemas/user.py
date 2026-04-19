from __future__ import annotations
from typing import Optional
"""User Pydantic schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    """Base user schema with common fields."""

    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)


class UserPreferences(BaseModel):
    """User preferences for trip planning."""

    distance_unit: str = Field(default="miles")
    routing_profile: str = Field(default="driving")
    avoid_ferries: bool = False
    avoid_tolls: bool = False
    prefer_scenic: bool = False
    max_elevation: Optional[float] = None
    notifications_enabled: bool = True
    offline_maps_regions: list[str] = Field(default_factory=list)


class UserCreate(UserBase):
    """Schema for creating a user."""

    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Schema for updating a user (all fields optional)."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class User(UserBase):
    """Full user schema with all fields."""

    id: UUID
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
