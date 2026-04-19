from __future__ import annotations
from typing import Optional
"""Vehicle profile model."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from server.database import Base


class VehicleType(str, Enum):
    """Type of RV or vehicle."""

    MOTORIZED = "motorized"
    TOWABLE = "towable"
    VAN = "van"
    TRUCK = "truck"
    OTHER = "other"


class VehicleProfile(Base):
    """RV/Vehicle profile for routing restrictions."""

    __tablename__ = "vehicle_profiles"

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
    name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    make: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    model: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(
        nullable=False,
    )
    vehicle_type: Mapped[VehicleType] = mapped_column(
        String(20),
        default=VehicleType.OTHER,
        nullable=False,
    )
    # Dimensions in feet
    length: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    width: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    height: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    # Weight in pounds
    weight: Mapped[Optional[float]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    # Performance
    max_speed: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    is_default: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
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
        back_populates="vehicle_profiles",
    )
    trips: Mapped[list["Trip"]] = relationship(  # noqa: F821
        "Trip",
        back_populates="vehicle_profile",
    )

    def __repr__(self) -> str:
        return f"<VehicleProfile {self.year} {self.make} {self.model}>"
