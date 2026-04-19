from __future__ import annotations
from typing import Optional
"""Trip model."""

import uuid
from datetime import date, datetime
from enum import Enum

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from server.database import Base


class TripStatus(str, Enum):
    """Trip lifecycle status."""

    DRAFT = "draft"
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Trip(Base):
    """Trip model representing an RV journey."""

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicle_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(
        String(2000),
        nullable=True,
    )
    status: Mapped[TripStatus] = mapped_column(
        String(20),
        default=TripStatus.DRAFT,
        nullable=False,
        index=True,
    )
    start_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
    )
    end_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
    )
    # Cached route data from OSRM (GeoJSON + metrics)
    route_data: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="trips",
    )
    vehicle_profile: Mapped["VehicleProfile"] = relationship(  # noqa: F821
        "VehicleProfile",
        back_populates="trips",
    )
    waypoints: Mapped[list["Waypoint"]] = relationship(  # noqa: F821
        "Waypoint",
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="Waypoint.order",
    )

    def __repr__(self) -> str:
        return f"<Trip {self.name} ({self.status.value})>"
