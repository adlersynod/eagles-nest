from __future__ import annotations
from typing import Optional
"""Waypoint-related Pydantic schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WaypointBase(BaseModel):
    """Base waypoint schema with common fields."""

    name: str = Field(..., min_length=1, max_length=255)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)


class WaypointCreate(WaypointBase):
    """Schema for creating a waypoint."""

    order: Optional[int] = Field(None, ge=0)


class WaypointUpdate(BaseModel):
    """Schema for updating a waypoint (all fields optional)."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    order: Optional[int] = Field(None, ge=0)
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=2000)


class Waypoint(WaypointBase):
    """Full waypoint schema with all fields."""

    id: UUID
    trip_id: UUID
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
