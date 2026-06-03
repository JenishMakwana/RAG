from datetime import datetime, timedelta, timezone
# Reference: https://fastapi.tiangolo.com/tutorial/security/
from typing import Any, Union
from jose import jwt
import bcrypt
from passlib.context import CryptContext
from .config import settings

# Graceful legacy verifier for pbkdf2_sha256 hashes in database
legacy_context = CryptContext(schemes=["pbkdf2_sha256"])

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    # Use modern timezone-aware UTC datetime (Python 3.12+ standard)
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # If it's a legacy pbkdf2 hash, verify with passlib legacy context
        if hashed_password.startswith("$pbkdf2-sha256"):
            return legacy_context.verify(plain_password, hashed_password)
        # Otherwise, verify using standard native bcrypt
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception as e:
        print(f"[-] Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    # Hash password using native bcrypt (highly secure and fully compatible with Python 3.12+)
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")
