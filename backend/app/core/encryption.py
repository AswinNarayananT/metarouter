from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import Text, TypeDecorator
from app.config import settings

_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not settings.TOKEN_ENCRYPTION_KEY:
            raise RuntimeError("TOKEN_ENCRYPTION_KEY is not set; cannot encrypt or decrypt stored tokens")
        _fernet = Fernet(settings.TOKEN_ENCRYPTION_KEY.encode())
    return _fernet


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt value: wrong TOKEN_ENCRYPTION_KEY or the value was never encrypted") from exc


class EncryptedText(TypeDecorator):
    """
    Text column that is encrypted at rest. Code reads and writes plain strings;
    the database only ever sees ciphertext. Values can't be filtered on in queries.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else encrypt(value)

    def process_result_value(self, value, dialect):
        return None if value is None else decrypt(value)
