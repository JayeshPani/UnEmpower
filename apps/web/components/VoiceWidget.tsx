'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { API_URL } from '@/config/contracts';
import {
    isRecordingSupported, isTTSSupported,
    startRecording, stopRecording, isRecording,
    transcribeAudio,
    speak, stopSpeaking,
} from '@/lib/voice';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatAction {
    type: 'NAVIGATE' | 'HIGHLIGHT' | 'SCROLL_TO' | 'SUGGEST_INPUT';
    to?: string;
    targetId?: string;
    fieldId?: string;
    suggestedValue?: string;
    label?: string;
}

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

/* ------------------------------------------------------------------ */
/*  Action executor                                                    */
/* ------------------------------------------------------------------ */

function executeAction(action: ChatAction, router: ReturnType<typeof useRouter>) {
    switch (action.type) {
        case 'NAVIGATE':
            if (action.to) router.push(action.to);
            break;
        case 'HIGHLIGHT': {
            const el = document.getElementById(action.targetId || '');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('chat-highlight');
                setTimeout(() => el.classList.remove('chat-highlight'), 3000);
            }
            break;
        }
        case 'SCROLL_TO': {
            const el = document.getElementById(action.targetId || '');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
        }
        case 'SUGGEST_INPUT': {
            const el = document.getElementById(action.fieldId || '') as HTMLInputElement | null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                    nativeSetter.call(el, action.suggestedValue || '');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
                el.classList.add('chat-highlight');
                setTimeout(() => el.classList.remove('chat-highlight'), 3000);
            }
            break;
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VoiceWidget() {
    const [voiceState, setVoiceState] = useState<VoiceState>('idle');
    const [transcript, setTranscript] = useState('');
    const [reply, setReply] = useState('');
    const [actions, setActions] = useState<ChatAction[]>([]);
    const [error, setError] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [lang, setLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
    const [supported, setSupported] = useState(true);
    const [mounted, setMounted] = useState(false);

    const sessionIdRef = useRef<string>(`voice-${Date.now()}`);
    const lastActionRef = useRef<string | null>(null);

    const pathname = usePathname();
    const router = useRouter();
    const { address } = useAccount();

    useEffect(() => {
        setMounted(true);
        setSupported(isRecordingSupported());
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            stopSpeaking();
        };
    }, []);

    /* ── Full pipeline: audio blob → transcribe → chat → speak ── */
    const processAudio = useCallback(async (audioBlob: Blob) => {
        // Step 1: Transcribe
        setVoiceState('transcribing');
        setTranscript('');
        setReply('');
        setActions([]);
        setError('');

        let text = '';
        try {
            const result = await transcribeAudio(audioBlob, {
                apiUrl: API_URL,
                language: lang,
            });
            text = result.text;
            setTranscript(text);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Transcription failed';
            setError(msg);
            setVoiceState('idle');
            return;
        }

        if (!text.trim()) {
            setError('No speech detected. Please try again.');
            setVoiceState('idle');
            return;
        }

        // Step 2: Send to /chat
        setVoiceState('thinking');
        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: address || null,
                    message: text,
                    page: pathname,
                    context: {},
                    sessionId: sessionIdRef.current,
                    lastAction: lastActionRef.current,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ detail: 'Server error' }));
                throw new Error(errData.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const replyText = data.reply || 'I could not understand that.';
            const replyActions: ChatAction[] = data.actions || [];

            setReply(replyText);
            setActions(replyActions);

            // Auto-execute safe actions (HIGHLIGHT and SCROLL_TO)
            for (const action of replyActions) {
                if (action.type === 'HIGHLIGHT' || action.type === 'SCROLL_TO') {
                    executeAction(action, router);
                }
            }

            // Step 3: Speak the reply
            setVoiceState('speaking');
            if (isTTSSupported()) {
                speak(replyText, {
                    lang: lang === 'hi-IN' ? 'hi-IN' : 'en-US',
                    rate: 0.95,
                    onEnd: () => setVoiceState('idle'),
                });
            } else {
                // If TTS not available, just wait a moment then go idle
                setTimeout(() => setVoiceState('idle'), 2000);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Connection error';
            setError(msg);
            setVoiceState('idle');
        }
    }, [address, pathname, router, lang]);

    /* ── Start listening (recording) ── */
    const handleStartListening = useCallback(async () => {
        setError('');
        setTranscript('');
        setReply('');
        setActions([]);
        stopSpeaking();

        const started = await startRecording({
            onStart: () => {
                setVoiceState('listening');
            },
            onStop: (audioBlob) => {
                processAudio(audioBlob);
            },
            onError: (errMsg) => {
                setError(errMsg);
                setVoiceState('idle');
            },
        });

        if (!started) {
            // Error already handled in onError callback
        }
    }, [processAudio]);

    /* ── Stop recording (triggers onStop → processAudio) ── */
    const handleStopRecording = useCallback(() => {
        if (isRecording()) {
            stopRecording();
            // The onStop callback will trigger processAudio
        }
    }, []);

    /* ── Stop everything ── */
    const handleStop = () => {
        stopRecording();
        stopSpeaking();
        setVoiceState('idle');
    };

    /* ── Execute an action from a button click ── */
    const handleActionClick = (action: ChatAction) => {
        lastActionRef.current = `${action.type}:${action.to || action.targetId || ''}`;
        executeAction(action, router);
        if (action.type === 'NAVIGATE') {
            setIsOpen(false);
        }
    };

    if (!mounted) return null;

    /* ── Status label ── */
    const statusLabel = {
        idle: 'Tap mic to speak',
        listening: 'Recording... tap Done when finished',
        transcribing: 'Converting speech to text...',
        thinking: 'Getting guidance...',
        speaking: 'Speaking...',
    }[voiceState];

    const statusColor = {
        idle: 'rgba(163,163,163,.5)',
        listening: '#ef4444',
        transcribing: '#f59e0b',
        thinking: '#f59e0b',
        speaking: '#10b981',
    }[voiceState];

    /* ── Render ── */
    return (
        <>
            {/* Floating mic button */}
            <button
                onClick={() => {
                    if (!isOpen) {
                        setIsOpen(true);
                    } else {
                        handleStop();
                        setIsOpen(false);
                    }
                }}
                aria-label="Voice assistant"
                style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 92,
                    zIndex: 10000,
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: voiceState === 'listening'
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : voiceState === 'transcribing' || voiceState === 'thinking'
                            ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                            : voiceState === 'speaking'
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                    color: '#fff',
                    fontSize: 22,
                    cursor: 'pointer',
                    boxShadow: voiceState === 'listening'
                        ? '0 4px 24px rgba(239,68,68,.5), 0 0 0 4px rgba(239,68,68,.2)'
                        : '0 4px 24px rgba(59,130,246,.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all .3s',
                    animation: voiceState === 'listening' ? 'voicePulse 1.5s infinite' : 'none',
                }}
            >
                {voiceState === 'listening' ? (
                    <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        <span style={{ width: 4, height: 14, background: '#fff', borderRadius: 2, animation: 'voiceBar1 0.8s infinite' }} />
                        <span style={{ width: 4, height: 20, background: '#fff', borderRadius: 2, animation: 'voiceBar2 0.8s infinite' }} />
                        <span style={{ width: 4, height: 10, background: '#fff', borderRadius: 2, animation: 'voiceBar3 0.8s infinite' }} />
                    </span>
                ) : voiceState === 'transcribing' || voiceState === 'thinking' ? (
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9696;</span>
                ) : voiceState === 'speaking' ? '🔊' : '🎙'}
            </button>

            {/* Voice panel */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 92,
                        right: 92,
                        zIndex: 10000,
                        width: 360,
                        maxWidth: 'calc(100vw - 120px)',
                        borderRadius: 16,
                        background: '#0f0f1a',
                        border: `1px solid ${voiceState === 'listening' ? 'rgba(239,68,68,.3)' : 'rgba(99,102,241,.2)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 12px 48px rgba(0,0,0,.6)',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid rgba(255,255,255,.06)',
                        background: 'rgba(99,102,241,.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>🎙</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Voice Assistant</span>
                            <span style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                background: 'rgba(99,102,241,.15)', color: '#818cf8',
                            }}>
                                Groq Whisper
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* Language toggle */}
                            <button
                                onClick={() => setLang(l => l === 'en-IN' ? 'hi-IN' : 'en-IN')}
                                style={{
                                    padding: '3px 10px', borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,.12)',
                                    background: lang === 'hi-IN' ? 'rgba(245,158,11,.12)' : 'rgba(255,255,255,.04)',
                                    color: lang === 'hi-IN' ? '#f59e0b' : 'rgba(163,163,163,.8)',
                                    fontSize: 11, cursor: 'pointer', fontWeight: 600,
                                    transition: 'all .2s',
                                }}
                                title={lang === 'en-IN' ? 'Switch to Hindi' : 'Switch to English'}
                            >
                                {lang === 'en-IN' ? 'EN' : 'HI'}
                            </button>
                            <button
                                onClick={() => { handleStop(); setIsOpen(false); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'rgba(163,163,163,.6)', cursor: 'pointer',
                                    fontSize: 16, padding: '0 4px',
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 420, overflowY: 'auto' }}>
                        {!supported ? (
                            /* Unsupported browser */
                            <div style={{
                                textAlign: 'center', padding: 18,
                                background: 'rgba(245,158,11,.08)',
                                border: '1px solid rgba(245,158,11,.2)',
                                borderRadius: 10, fontSize: 13,
                                color: '#f59e0b', lineHeight: 1.5,
                            }}>
                                Voice recording is not supported in this browser.<br/>
                                Please use <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Firefox</strong>.<br/>
                                Or use the text chat instead.
                            </div>
                        ) : (
                            <>
                                {/* Status indicator */}
                                <div style={{
                                    textAlign: 'center', padding: '20px 12px',
                                    borderRadius: 12,
                                    background: voiceState === 'listening' ? 'rgba(239,68,68,.06)' :
                                                voiceState === 'transcribing' || voiceState === 'thinking' ? 'rgba(245,158,11,.06)' :
                                                voiceState === 'speaking' ? 'rgba(16,185,129,.06)' :
                                                'rgba(255,255,255,.02)',
                                    border: `1px solid ${
                                        voiceState === 'listening' ? 'rgba(239,68,68,.15)' :
                                        voiceState === 'transcribing' || voiceState === 'thinking' ? 'rgba(245,158,11,.15)' :
                                        voiceState === 'speaking' ? 'rgba(16,185,129,.15)' :
                                        'rgba(255,255,255,.06)'
                                    }`,
                                }}>
                                    {/* Visual waveform for recording */}
                                    {voiceState === 'listening' && (
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 10 }}>
                                            {[...Array(7)].map((_, i) => (
                                                <div key={i} style={{
                                                    width: 4, borderRadius: 2,
                                                    background: '#ef4444',
                                                    animation: `voiceBar${(i % 3) + 1} 0.${6 + i}s infinite`,
                                                    height: 12 + Math.random() * 16,
                                                }} />
                                            ))}
                                        </div>
                                    )}

                                    <div style={{
                                        fontSize: 12, fontWeight: 500, textTransform: 'uppercase',
                                        letterSpacing: 1,
                                        color: statusColor,
                                    }}>
                                        {statusLabel}
                                    </div>

                                    {/* Transcript preview */}
                                    {transcript && (
                                        <p style={{
                                            margin: '10px 0 0', fontSize: 14,
                                            color: 'rgba(255,255,255,.85)',
                                            fontStyle: 'normal',
                                            background: 'rgba(255,255,255,.04)',
                                            padding: '8px 12px',
                                            borderRadius: 8,
                                            textAlign: 'left',
                                        }}>
                                            &ldquo;{transcript}&rdquo;
                                        </p>
                                    )}
                                </div>

                                {/* Reply */}
                                {reply && (
                                    <div style={{
                                        padding: '14px 16px', borderRadius: 10,
                                        background: 'rgba(16,185,129,.04)',
                                        border: '1px solid rgba(16,185,129,.12)',
                                        fontSize: 13, lineHeight: 1.6,
                                        color: 'rgba(255,255,255,.88)',
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                            Assistant {voiceState === 'speaking' ? '(speaking...)' : ''}
                                        </div>
                                        {reply}
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div style={{
                                        padding: '12px 14px', borderRadius: 8,
                                        background: 'rgba(239,68,68,.08)',
                                        border: '1px solid rgba(239,68,68,.15)',
                                        fontSize: 12, color: '#ef4444',
                                    }}>
                                        {error}
                                    </div>
                                )}

                                {/* Action buttons */}
                                {actions.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(163,163,163,.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                            Next steps
                                        </div>
                                        {actions.map((action, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleActionClick(action)}
                                                style={{
                                                    padding: '14px 16px',
                                                    borderRadius: 10,
                                                    border: action.type === 'NAVIGATE'
                                                        ? '1px solid rgba(99,102,241,.3)'
                                                        : '1px solid rgba(16,185,129,.3)',
                                                    background: action.type === 'NAVIGATE'
                                                        ? 'rgba(99,102,241,.08)'
                                                        : 'rgba(16,185,129,.08)',
                                                    color: action.type === 'NAVIGATE' ? '#818cf8' : '#10b981',
                                                    fontSize: 14, fontWeight: 500,
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    transition: 'background .15s',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = action.type === 'NAVIGATE'
                                                        ? 'rgba(99,102,241,.18)' : 'rgba(16,185,129,.18)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = action.type === 'NAVIGATE'
                                                        ? 'rgba(99,102,241,.08)' : 'rgba(16,185,129,.08)';
                                                }}
                                            >
                                                <span style={{ fontSize: 20 }}>
                                                    {action.type === 'NAVIGATE' ? '→' : action.type === 'HIGHLIGHT' ? '◉' : '↓'}
                                                </span>
                                                <span>
                                                    {action.label || (action.type === 'NAVIGATE' ? `Go to ${action.to}` : action.type)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Controls */}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {voiceState === 'idle' && (
                                        <button
                                            onClick={handleStartListening}
                                            style={{
                                                flex: 1, padding: '14px',
                                                borderRadius: 10, border: 'none',
                                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                                color: '#fff', fontSize: 14, fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            }}
                                        >
                                            <span style={{ fontSize: 18 }}>🎙</span> Tap to Speak
                                        </button>
                                    )}
                                    {voiceState === 'listening' && (
                                        <button
                                            onClick={handleStopRecording}
                                            style={{
                                                flex: 1, padding: '14px',
                                                borderRadius: 10, border: 'none',
                                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                                color: '#fff', fontSize: 14, fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                animation: 'voicePulse 1.5s infinite',
                                            }}
                                        >
                                            <span style={{ fontSize: 16 }}>■</span> Done Speaking
                                        </button>
                                    )}
                                    {voiceState === 'speaking' && (
                                        <button
                                            onClick={() => { stopSpeaking(); setVoiceState('idle'); }}
                                            style={{
                                                flex: 1, padding: '14px',
                                                borderRadius: 10, border: 'none',
                                                background: 'rgba(16,185,129,.15)',
                                                color: '#10b981', fontSize: 14, fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            }}
                                        >
                                            <span style={{ fontSize: 16 }}>■</span> Stop Speaking
                                        </button>
                                    )}
                                    {(voiceState === 'transcribing' || voiceState === 'thinking') && (
                                        <div style={{
                                            flex: 1, padding: '14px',
                                            borderRadius: 10,
                                            background: 'rgba(245,158,11,.08)',
                                            color: '#f59e0b', fontSize: 14,
                                            textAlign: 'center', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        }}>
                                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9696;</span>
                                            {voiceState === 'transcribing' ? 'Transcribing...' : 'Getting answer...'}
                                        </div>
                                    )}
                                </div>

                                {/* Quick retry when there's a response */}
                                {voiceState === 'idle' && (transcript || reply) && (
                                    <button
                                        onClick={handleStartListening}
                                        style={{
                                            padding: '10px',
                                            borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,.08)',
                                            background: 'rgba(255,255,255,.03)',
                                            color: 'rgba(163,163,163,.6)',
                                            fontSize: 12, cursor: 'pointer',
                                            textAlign: 'center',
                                        }}
                                    >
                                        Ask another question...
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Global CSS for animations */}
            <style jsx global>{`
                @keyframes voicePulse {
                    0%, 100% { box-shadow: 0 4px 24px rgba(239,68,68,.4), 0 0 0 0 rgba(239,68,68,.3); }
                    50% { box-shadow: 0 4px 24px rgba(239,68,68,.6), 0 0 0 8px rgba(239,68,68,.0); }
                }
                @keyframes voiceBar1 {
                    0%, 100% { height: 8px; }
                    50% { height: 22px; }
                }
                @keyframes voiceBar2 {
                    0%, 100% { height: 16px; }
                    50% { height: 8px; }
                }
                @keyframes voiceBar3 {
                    0%, 100% { height: 12px; }
                    50% { height: 24px; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </>
    );
}
