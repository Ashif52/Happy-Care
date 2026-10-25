import os
import uuid
import hashlib
import base64
import re
from pathlib import Path
from typing import Tuple, Optional
from fastapi import UploadFile, HTTPException
from app.config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov", ".wav", ".mp3", ".ogg", ".pdf"}
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
    "audio/webm", "audio/wav", "audio/mpeg", "audio/ogg",
    "application/pdf", "application/octet-stream"
}

# Maximum upload limit: 25 MB per media file
MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024

class StorageService:
    @staticmethod
    def _sanitize_subfolder(subfolder: str) -> str:
        """Prevent path traversal in subfolder argument"""
        clean = "".join(c for c in subfolder if c.isalnum() or c in ("-", "_"))
        return clean or "evidence"

    @staticmethod
    def inspect_and_validate_magic_bytes(file_bytes: bytes, fallback_ext: str = ".jpg") -> Tuple[str, str]:
        """
        Deep content inspection: validates binary magic bytes at the beginning of the file.
        Returns: (detected_extension, media_type)
        Rejects executables, scripts, HTML, and unauthorized formats.
        """
        if len(file_bytes) < 4:
            raise HTTPException(status_code=400, detail="Corrupt or truncated media file.")

        # Check for dangerous executable / script signatures
        if file_bytes[:2] == b"MZ":  # DOS / Windows PE executable
            raise HTTPException(status_code=400, detail="Executable files are strictly prohibited.")
        if file_bytes[:4] == b"\x7fELF":  # Linux ELF executable
            raise HTTPException(status_code=400, detail="Executable binaries are strictly prohibited.")
        if file_bytes[:4] in (b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe"):  # Mach-O
            raise HTTPException(status_code=400, detail="Executable binaries are strictly prohibited.")

        head_100 = file_bytes[:128].lower()
        if (
            b"<html" in head_100
            or b"<script" in head_100
            or b"<?php" in head_100
            or b"<!doctype" in head_100
            or b"<svg" in head_100
        ):
            raise HTTPException(status_code=400, detail="Active script and HTML uploads are strictly prohibited.")

        # 1. JPEG: FF D8 FF
        if file_bytes[:3] == b"\xff\xd8\xff":
            return ".jpg", "image"

        # 2. PNG: 89 50 4E 47 0D 0A 1A 0A
        if file_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            return ".png", "image"

        # 3. GIF: GIF87a or GIF89a
        if file_bytes[:6] in (b"GIF87a", b"GIF89a"):
            return ".gif", "image"

        # 4. WebP: RIFF....WEBP
        if len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
            return ".webp", "image"

        # 5. MP4 / MOV / QuickTime: [offset 4:8 == b"ftyp"] or moov
        if len(file_bytes) >= 12 and file_bytes[4:8] == b"ftyp":
            return ".mp4", "video"

        # 6. WebM / Matroska: 1A 45 DF A3 (EBML Header)
        if file_bytes[:4] == b"\x1a\x45\xdf\xa3":
            return ".webm", "video"

        # 7. Audio WAV: RIFF....WAVE
        if len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WAVE":
            return ".wav", "audio"

        # 8. Audio MP3: ID3 or sync frame FF FB / FF F3
        if file_bytes[:3] == b"ID3" or file_bytes[:2] in (b"\xff\xfb", b"\xff\xf3"):
            return ".mp3", "audio"

        # 9. Audio OGG: OggS
        if file_bytes[:4] == b"OggS":
            return ".ogg", "audio"

        # 10. PDF
        if file_bytes[:4] == b"%PDF":
            return ".pdf", "document"

        # If extension is in allowed list and no malicious pattern found, accept fallback
        clean_ext = fallback_ext.lower().strip()
        if clean_ext in [".jpg", ".jpeg", ".png", ".webp"]:
            return clean_ext if clean_ext != ".jpeg" else ".jpg", "image"
        elif clean_ext in [".mp4", ".webm", ".mov"]:
            return clean_ext, "video"
        elif clean_ext in [".wav", ".mp3", ".ogg"]:
            return clean_ext, "audio"

        raise HTTPException(
            status_code=400,
            detail="Unsupported media format. Please upload standard JPEG, PNG, WebP photos or MP4, WebM videos."
        )

    @staticmethod
    def is_cloudinary_configured() -> bool:
        """Check if Cloudinary environment credentials are provided"""
        return bool(
            settings.CLOUDINARY_URL
            or (settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)
        )

    @staticmethod
    def _init_cloudinary():
        """Configure Cloudinary SDK with environment credentials"""
        import cloudinary
        if settings.CLOUDINARY_URL:
            cloudinary.config(cloudinary_url=settings.CLOUDINARY_URL)
        else:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True
            )

    @staticmethod
    def save_upload_file(file: UploadFile, subfolder: str = "evidence") -> Tuple[str, str, int, str]:
        """Saves an UploadFile with magic bytes validation. Returns (url, sha256_hash, file_size_bytes, media_type)"""
        clean_subfolder = StorageService._sanitize_subfolder(subfolder)
        
        file_ext = Path(file.filename).suffix.lower() if file.filename else ".bin"
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file extension '{file_ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )
        
        # Read initial chunk to inspect magic bytes
        first_chunk = file.file.read(8192)
        if not first_chunk:
            raise HTTPException(status_code=400, detail="Empty upload file.")
            
        detected_ext, media_type = StorageService.inspect_and_validate_magic_bytes(first_chunk, fallback_ext=file_ext)
        
        # Read full content for hash and size calculation
        sha256 = hashlib.sha256()
        sha256.update(first_chunk)
        remaining = file.file.read()
        sha256.update(remaining)
        full_content = first_chunk + remaining
        size = len(full_content)
        
        if size > MAX_MEDIA_SIZE_BYTES:
            raise HTTPException(status_code=413, detail=f"File size exceeds allowable maximum ({MAX_MEDIA_SIZE_BYTES // (1024*1024)}MB)")

        # 1. Permanent Cloud Storage: Upload to Cloudinary if configured (e.g. Render / Cloud)
        if StorageService.is_cloudinary_configured():
            try:
                StorageService._init_cloudinary()
                import cloudinary.uploader
                resource_type = "video" if media_type == "video" else ("image" if media_type == "image" else "auto")
                upload_res = cloudinary.uploader.upload(
                    full_content,
                    folder=f"careops/{clean_subfolder}",
                    resource_type=resource_type,
                    unique_filename=True,
                    overwrite=False
                )
                secure_url = upload_res.get("secure_url") or upload_res.get("url")
                if secure_url:
                    return secure_url, sha256.hexdigest(), size, media_type
            except Exception as e:
                import logging
                logging.getLogger("careops.storage").error(f"Cloudinary upload failed: {e}. Falling back to local storage.", exc_info=True)

        # 2. Local File Storage Fallback (Local development or if Cloudinary not set)
        target_dir = Path(settings.UPLOAD_DIR) / clean_subfolder
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{detected_ext}"
        file_path = target_dir / filename
        
        with open(file_path, "wb") as f:
            f.write(full_content)
                
        relative_url = f"/uploads/{clean_subfolder}/{filename}"
        return relative_url, sha256.hexdigest(), size, media_type

    @staticmethod
    def save_base64_data(base64_data: str, subfolder: str = "evidence", default_ext: str = ".jpg") -> Tuple[str, str, int, str]:
        """
        Decodes and saves base64 data URI (e.g. data:image/jpeg;base64,... or data:video/mp4;base64,...).
        Performs binary magic bytes validation.
        Returns: (url, file_hash, file_size, media_type)
        """
        clean_subfolder = StorageService._sanitize_subfolder(subfolder)
        
        hint_ext = default_ext
        if "," in base64_data:
            header, encoded = base64_data.split(",", 1)
            if "image/png" in header:
                hint_ext = ".png"
            elif "image/webp" in header:
                hint_ext = ".webp"
            elif "image/jpeg" in header or "image/jpg" in header:
                hint_ext = ".jpg"
            elif "video/mp4" in header:
                hint_ext = ".mp4"
            elif "video/webm" in header:
                hint_ext = ".webm"
            elif "video/quicktime" in header:
                hint_ext = ".mov"
            elif "audio/webm" in header:
                hint_ext = ".webm"
            elif "audio/wav" in header:
                hint_ext = ".wav"
        else:
            encoded = base64_data
            
        try:
            file_bytes = base64.b64decode(encoded)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 media encoding.")
            
        size = len(file_bytes)
        if size > MAX_MEDIA_SIZE_BYTES:
            raise HTTPException(status_code=413, detail=f"Uploaded media exceeds maximum permitted size ({MAX_MEDIA_SIZE_BYTES // (1024*1024)}MB)")
            
        detected_ext, media_type = StorageService.inspect_and_validate_magic_bytes(file_bytes, fallback_ext=hint_ext)
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        # 1. Permanent Cloud Storage: Upload to Cloudinary if configured
        if StorageService.is_cloudinary_configured():
            try:
                StorageService._init_cloudinary()
                import cloudinary.uploader
                resource_type = "video" if media_type == "video" else ("image" if media_type == "image" else "auto")
                upload_res = cloudinary.uploader.upload(
                    file_bytes,
                    folder=f"careops/{clean_subfolder}",
                    resource_type=resource_type,
                    unique_filename=True,
                    overwrite=False
                )
                secure_url = upload_res.get("secure_url") or upload_res.get("url")
                if secure_url:
                    return secure_url, file_hash, size, media_type
            except Exception as e:
                import logging
                logging.getLogger("careops.storage").error(f"Cloudinary base64 upload failed: {e}. Falling back to local storage.", exc_info=True)

        # 2. Local File Storage Fallback
        target_dir = Path(settings.UPLOAD_DIR) / clean_subfolder
        target_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{detected_ext}"
        file_path = target_dir / filename
        
        with open(file_path, "wb") as f:
            f.write(file_bytes)
            
        relative_url = f"/uploads/{clean_subfolder}/{filename}"
        return relative_url, file_hash, size, media_type
