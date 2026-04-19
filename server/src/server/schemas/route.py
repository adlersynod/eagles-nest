from __future__ import annotations
from typing import Optional
"""Route-related Pydantic schemas for OSRM integration."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RouteStep(BaseModel):
    """A single turn-by-turn step in a route leg."""

    distance: float
    duration: float
    geometry: dict
    instruction: str
    name: str
    type: str = Field(
        ...,
        description="Step type: depart, arrive, turn, new_name, continue, rotary, merge, ramp, fork, bear, lane, end",
    )


class RouteLeg(BaseModel):
    """A leg of the route between two waypoints."""

    distance: float = Field(description="Leg distance in meters")
    duration: float = Field(description="Leg duration in seconds")
    summary: str
    steps: list[RouteStep] = Field(default_factory=list)


class RouteData(BaseModel):
    """Cached route data from OSRM."""

    geometry: dict = Field(description="GeoJSON geometry")
    distance: float = Field(description="Total distance in meters")
    duration: float = Field(description="Total duration in seconds")
    legs: list[RouteLeg] = Field(default_factory=list)
    summary: str = Field(description="Human-readable route summary")


class RouteResponse(BaseModel):
    """Response from route calculation endpoint."""

    trip_id: UUID
    route_data: RouteData
    vehicle_profile_id: Optional[UUID] = None
    osrm_version: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class WaypointReorderRequest(BaseModel):
    """Request to reorder waypoints in a trip."""

    waypoint_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of waypoint IDs in desired order",
    )
