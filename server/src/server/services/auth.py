from __future__ import annotations
"""Authentication service for JWT token management."""

from datetime import datetime, timedelta, timezone as dt_tz
from typing import Optional, Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from server.config import get_settings

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthError(Exception):
    """Raised when authentication fails."""

    pass


class AuthService:
    """
    Service for authentication and JWT token management.

    Handles:
    - Password hashing and verification
    - JWT token creation and validation
    - User authentication
    """

    def __init__(
        self,
        secret_key: Optional[str] = None,
        algorithm: Optional[str] = None,
        expiration_minutes: Optional[int] = None,
    ):
        settings = get_settings()
        self.secret_key = secret_key or settings.jwt_secret_key
        self.algorithm = algorithm or settings.jwt_algorithm
        self.expiration_minutes = expiration_minutes or settings.jwt_expiration_minutes

    def hash_password(self, password: str) -> str:
        """Hash a plain text password."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(
        self,
        user_id: UUID,
        email: str,
        expires_delta: Optional[timedelta] = None,
        extra_claims: dict[str, Any] | None = None,
    ) -> str:
        """
        Create a JWT access token.

        Args:
            user_id: User's UUID
            email: User's email
            expires_delta: Optional custom expiration
            extra_claims: Additional claims to include

        Returns:
            Encoded JWT token string
        """
        if expires_delta is None:
            expires_delta = timedelta(minutes=self.expiration_minutes)

        now = datetime.now(dt_tz.utc)
        expire = now + expires_delta

        payload = {
            "sub": str(user_id),
            "email": email,
            "iat": now,
            "exp": expire,
            "type": "access",
        }

        if extra_claims:
            payload.update(extra_claims)

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def decode_token(self, token: str) -> dict[str, Any]:
        """
        Decode and validate a JWT token.

        Args:
            token: JWT token string

        Returns:
            Decoded token payload

        Raises:
            AuthError: If token is invalid or expired
        """
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )
            return payload
        except JWTError as e:
            raise AuthError(f"Invalid token: {e}")

    def get_user_id_from_token(self, token: str) -> UUID:
        """
        Extract user ID from a valid token.

        Args:
            token: JWT token string

        Returns:
            User's UUID

        Raises:
            AuthError: If token is invalid
        """
        payload = self.decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise AuthError("Token missing user ID")
        return UUID(user_id)

    def verify_token_type(self, token: str, expected_type: str = "access") -> bool:
        """Check if token type matches expected type."""
        try:
            payload = self.decode_token(token)
            return payload.get("type") == expected_type
        except AuthError:
            return False


# Singleton instance
_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    """Get auth service singleton."""
    global _auth_service  # noqa: PLW0603
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
