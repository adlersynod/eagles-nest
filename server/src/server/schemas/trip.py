from __future__ import annotations
from typing import Optional
"""Trip-related Pydantic schemas."""

from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class TripStatus(str, Enum):
    """Trip lifecycle status."""

    DRAFT = "draft"
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TripBase(BaseModel):
    """Base trip schema with common fields."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    status: TripStatus = TripStatus.DRAFT
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class TripCreate(TripBase):
    """Schema for creating a trip."""

    vehicle_profile_id: Optional[UUID] = None


class TripUpdate(BaseModel):
    """Schema for updating a trip (all fields optional)."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[TripStatus] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    vehicle_profile_id: Optional[UUID] = None


class Trip(TripBase):
    """Full trip schema with all fields."""

    id: UUID
    user_id: UUID
    vehicle_profile_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    waypoints_count: int = 0

    model_config = {"from_attributes": True}


class TripDetail(Trip):
    """Trip with nested waypoints."""

    waypoints: list["Waypoint"] = Field(default_factory=list)  # noqa: F821


class TripList(BaseModel):
    """Paginated trip list response."""

    items: list[Trip]
    total: int
    limit: int
    offset: int


# Import for type hints
from server.schemas.waypoint import Waypoint
