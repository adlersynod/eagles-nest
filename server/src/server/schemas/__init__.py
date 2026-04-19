from __future__ import annotations
from typing import Optional
"""Pydantic schemas for request/response validation."""

from server.schemas.route import (
    RouteData,
    RouteLeg,
    RouteResponse,
    RouteStep,
    WaypointReorderRequest,
)
from server.schemas.trip import (
    Trip,
    TripBase,
    TripCreate,
    TripDetail,
    TripList,
    TripStatus,
    TripUpdate,
)
from server.schemas.user import (
    User,
    UserBase,
    UserPreferences,
    UserUpdate,
)
from server.schemas.vehicle_profile import (
    VehicleProfile,
    VehicleProfileBase,
    VehicleProfileCreate,
    VehicleProfileUpdate,
    VehicleType,
)
from server.schemas.waypoint import (
    Waypoint,
    WaypointBase,
    WaypointCreate,
    WaypointUpdate,
)

__all__ = [
    "Trip",
    "TripBase",
    "TripCreate",
    "TripDetail",
    "TripList",
    "TripStatus",
    "TripUpdate",
    "Waypoint",
    "WaypointBase",
    "WaypointCreate",
    "WaypointUpdate",
    "VehicleProfile",
    "VehicleProfileBase",
    "VehicleProfileCreate",
    "VehicleProfileUpdate",
    "VehicleType",
    "User",
    "UserBase",
    "UserPreferences",
    "UserUpdate",
    "RouteData",
    "RouteLeg",
    "RouteResponse",
    "RouteStep",
    "WaypointReorderRequest",
]
