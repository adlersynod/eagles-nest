from __future__ import annotations
from typing import Optional
"""Vehicle profile Pydantic schemas."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class VehicleType(str, Enum):
    """Type of RV or vehicle."""

    MOTORIZED = "motorized"
    TOWABLE = "towable"
    VAN = "van"
    TRUCK = "truck"
    OTHER = "other"


class VehicleProfileBase(BaseModel):
    """Base vehicle profile schema with common fields."""

    name: Optional[str] = Field(None, max_length=100)
    make: str = Field(..., max_length=50)
    model: str = Field(..., max_length=50)
    year: int = Field(..., ge=1900, le=2030)
    vehicle_type: VehicleType = VehicleType.OTHER
    # Dimensions in feet
    length: Optional[float] = Field(None, ge=0)
    width: Optional[float] = Field(None, ge=0)
    height: Optional[float] = Field(None, ge=0)
    # Weight in pounds
    weight: Optional[float] = Field(None, ge=0)
    # Performance
    max_speed: Optional[float] = Field(None, ge=0)


class VehicleProfileCreate(VehicleProfileBase):
    """Schema for creating a vehicle profile."""

    pass


class VehicleProfileUpdate(BaseModel):
    """Schema for updating a vehicle profile (all fields optional)."""

    name: Optional[str] = Field(None, max_length=100)
    make: Optional[str] = Field(None, max_length=50)
    model: Optional[str] = Field(None, max_length=50)
    year: Optional[int] = Field(None, ge=1900, le=2030)
    vehicle_type: Optional[VehicleType] = None
    length: Optional[float] = Field(None, ge=0)
    width: Optional[float] = Field(None, ge=0)
    height: Optional[float] = Field(None, ge=0)
    weight: Optional[float] = Field(None, ge=0)
    max_speed: Optional[float] = Field(None, ge=0)
    is_default: Optional[bool] = None


class VehicleProfile(VehicleProfileBase):
    """Full vehicle profile schema with all fields."""

    id: UUID
    user_id: UUID
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
