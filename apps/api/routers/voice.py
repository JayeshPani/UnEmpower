"""
Voice Router — Groq Whisper-powered speech-to-text transcription.

POST /voice/transcribe  — upload audio, get text transcript back.
"""

import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

from settings import get_settings

router = APIRouter(prefix="/voice", tags=["voice"])


class TranscribeResponse(BaseModel):
    text: str
    language: Optional[str] = None


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
):
    """
    Transcribe an audio file using Groq Whisper API.

    Accepts any common audio format (webm, wav, mp3, ogg, m4a).
    Returns the transcript text.
    """
    settings = get_settings()
    api_key = settings.GROQ_API_KEY

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Voice transcription not configured. GROQ_API_KEY is missing.",
        )

    # Read the uploaded audio
    audio_bytes = await audio.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Limit to 25 MB (Groq limit)
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25 MB)")

    # Determine file extension from content type or filename
    filename = audio.filename or "audio.webm"
    if not any(filename.endswith(ext) for ext in [".webm", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".flac"]):
        filename = "audio.webm"

    # Build multipart form for Groq Whisper API
    files = {
        "file": (filename, audio_bytes, audio.content_type or "audio/webm"),
    }
    data = {
        "model": "whisper-large-v3-turbo",
        "response_format": "json",
    }
    if language:
        # Map language codes: en-IN -> en, hi-IN -> hi
        lang_code = language.split("-")[0] if "-" in language else language
        data["language"] = lang_code

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files=files,
                data=data,
            )

        if resp.status_code != 200:
            error_detail = "Transcription failed"
            try:
                err_body = resp.json()
                error_detail = err_body.get("error", {}).get("message", error_detail)
            except Exception:
                error_detail = resp.text[:200]
            print(f"  [VOICE] Groq Whisper error: {resp.status_code} — {error_detail}")
            raise HTTPException(status_code=502, detail=f"Transcription service error: {error_detail}")

        result = resp.json()
        transcript = result.get("text", "").strip()

        if not transcript:
            raise HTTPException(status_code=422, detail="No speech detected in the audio")

        print(f"  [VOICE] Transcribed: '{transcript[:80]}...' lang={language}")

        return TranscribeResponse(
            text=transcript,
            language=language,
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Transcription timed out. Try a shorter recording.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"  [VOICE] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Voice transcription failed unexpectedly.")
