/**
 * Voice utilities — Recording (MediaRecorder) + TTS (SpeechSynthesis)
 *
 * STT uses Groq Whisper via the backend /voice/transcribe endpoint.
 * TTS uses browser's SpeechSynthesis API (offline, free).
 *
 * No webkitSpeechRecognition — that causes "network error" on many setups.
 */

/* ------------------------------------------------------------------ */
/*  Feature detection                                                  */
/* ------------------------------------------------------------------ */

export function isRecordingSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export function isTTSSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.speechSynthesis;
}

/* ------------------------------------------------------------------ */
/*  Audio Recording via MediaRecorder                                  */
/* ------------------------------------------------------------------ */

let _mediaRecorder: MediaRecorder | null = null;
let _audioChunks: Blob[] = [];
let _stream: MediaStream | null = null;

export interface RecordingCallbacks {
    onStart?: () => void;
    onStop?: (audioBlob: Blob) => void;
    onError?: (error: string) => void;
}

export async function startRecording(callbacks: RecordingCallbacks = {}): Promise<boolean> {
    if (!isRecordingSupported()) {
        callbacks.onError?.('Microphone recording not supported in this browser.');
        return false;
    }

    // Stop any existing recording
    stopRecording();

    try {
        _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
        const msg = err?.name === 'NotAllowedError'
            ? 'Microphone permission denied. Please allow mic access.'
            : err?.name === 'NotFoundError'
                ? 'No microphone found.'
                : `Microphone error: ${err?.message || 'unknown'}`;
        callbacks.onError?.(msg);
        return false;
    }

    _audioChunks = [];

    // Prefer webm/opus, fall back to whatever the browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

    try {
        _mediaRecorder = mimeType
            ? new MediaRecorder(_stream, { mimeType })
            : new MediaRecorder(_stream);
    } catch {
        callbacks.onError?.('Failed to create audio recorder.');
        _cleanupStream();
        return false;
    }

    _mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            _audioChunks.push(event.data);
        }
    };

    _mediaRecorder.onstop = () => {
        const blob = new Blob(_audioChunks, { type: _mediaRecorder?.mimeType || 'audio/webm' });
        _audioChunks = [];
        _cleanupStream();
        callbacks.onStop?.(blob);
    };

    _mediaRecorder.onerror = () => {
        callbacks.onError?.('Recording error occurred.');
        _cleanupStream();
    };

    _mediaRecorder.start();
    callbacks.onStart?.();
    return true;
}

export function stopRecording(): void {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
        try {
            _mediaRecorder.stop();
        } catch { /* ignore */ }
    } else {
        _cleanupStream();
    }
}

export function isRecording(): boolean {
    return _mediaRecorder?.state === 'recording';
}

function _cleanupStream(): void {
    if (_stream) {
        _stream.getTracks().forEach(track => track.stop());
        _stream = null;
    }
    _mediaRecorder = null;
}

/* ------------------------------------------------------------------ */
/*  Transcribe via backend (Groq Whisper)                              */
/* ------------------------------------------------------------------ */

export interface TranscribeOptions {
    apiUrl: string;       // e.g. "http://localhost:8000"
    language?: string;    // e.g. "en-IN" or "hi-IN"
}

export interface TranscribeResult {
    text: string;
    language?: string;
}

export async function transcribeAudio(
    audioBlob: Blob,
    options: TranscribeOptions
): Promise<TranscribeResult> {
    const formData = new FormData();

    // Determine extension from blob type
    const ext = audioBlob.type.includes('webm') ? 'webm'
        : audioBlob.type.includes('mp4') ? 'mp4'
            : audioBlob.type.includes('ogg') ? 'ogg'
                : 'webm';

    formData.append('audio', audioBlob, `recording.${ext}`);

    if (options.language) {
        formData.append('language', options.language);
    }

    const resp = await fetch(`${options.apiUrl}/voice/transcribe`, {
        method: 'POST',
        body: formData,
    });

    if (!resp.ok) {
        let detail = 'Transcription failed';
        try {
            const err = await resp.json();
            detail = err.detail || detail;
        } catch { /* ignore */ }
        throw new Error(detail);
    }

    return await resp.json();
}

/* ------------------------------------------------------------------ */
/*  TTS — Text-to-Speech (browser built-in)                           */
/* ------------------------------------------------------------------ */

export interface TTSOptions {
    lang?: string;       // default 'en-IN'
    rate?: number;       // 0.5–2, default 1
    pitch?: number;      // 0–2, default 1
    onEnd?: () => void;
}

let _currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, options: TTSOptions = {}): boolean {
    if (!isTTSSupported()) {
        options.onEnd?.();
        return false;
    }

    // Cancel any current speech
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || 'en-IN';
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;

    // Try to find a matching voice
    const voices = speechSynthesis.getVoices();
    const lang = utterance.lang.toLowerCase();
    const match = voices.find(v => v.lang.toLowerCase() === lang) ||
                  voices.find(v => v.lang.toLowerCase().startsWith(lang.split('-')[0]));
    if (match) utterance.voice = match;

    utterance.onend = () => {
        _currentUtterance = null;
        options.onEnd?.();
    };
    utterance.onerror = () => {
        _currentUtterance = null;
        options.onEnd?.();
    };

    _currentUtterance = utterance;
    speechSynthesis.speak(utterance);
    return true;
}

export function stopSpeaking(): void {
    if (isTTSSupported()) {
        speechSynthesis.cancel();
    }
    _currentUtterance = null;
}

export function isSpeaking(): boolean {
    if (!isTTSSupported()) return false;
    return speechSynthesis.speaking;
}
