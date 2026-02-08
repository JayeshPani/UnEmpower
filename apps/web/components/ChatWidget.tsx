'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { API_URL } from '@/config/contracts';

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

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    actions?: ChatAction[];
    timestamp: number;
}

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
                // Use native setter to trigger React onChange
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
/*  Quick suggestions                                                  */
/* ------------------------------------------------------------------ */

const QUICK_SUGGESTIONS = [
    'What should I do next?',
    'How do I get a loan?',
    'Explain work proofs',
    'Help with manager portal',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const pathname = usePathname();
    const router = useRouter();
    const { address } = useAccount();

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
    }, [isOpen]);

    // Send message
    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const userMsg: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            text: text.trim(),
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: address || null,
                    message: text.trim(),
                    page: pathname,
                    context: {},
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Server error' }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();

            const assistantMsg: Message = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                text: data.reply || 'Sorry, I could not process that.',
                actions: data.actions || [],
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            const errorMsg: Message = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                text: err instanceof Error ? err.message : 'Connection error. Is the API running?',
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsTyping(false);
        }
    }, [address, pathname]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleActionClick = (action: ChatAction) => {
        executeAction(action, router);
        // If it's a navigate action, close the chat
        if (action.type === 'NAVIGATE') setIsOpen(false);
    };

    /* ── Render ── */
    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Help chat"
                style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 10000,
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    color: '#fff',
                    fontSize: 24,
                    cursor: 'pointer',
                    boxShadow: '0 4px 24px rgba(124,58,237,.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform .2s, box-shadow .2s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 6px 32px rgba(124,58,237,.6)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(124,58,237,.4)';
                }}
            >
                {isOpen ? '✕' : '?'}
            </button>

            {/* Chat panel */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 92,
                        right: 24,
                        zIndex: 10000,
                        width: 380,
                        maxWidth: 'calc(100vw - 48px)',
                        height: 520,
                        maxHeight: 'calc(100vh - 120px)',
                        borderRadius: 16,
                        background: '#0f0f1a',
                        border: '1px solid rgba(167,139,250,.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 12px 48px rgba(0,0,0,.6)',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(255,255,255,.06)',
                        background: 'rgba(167,139,250,.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#10b981',
                            boxShadow: '0 0 6px rgba(16,185,129,.4)',
                        }} />
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>UnEmpower Assistant</div>
                            <div style={{ fontSize: 11, color: 'rgba(163,163,163,.6)' }}>
                                Ask anything about the platform
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{
                                marginLeft: 'auto', background: 'none', border: 'none',
                                color: 'rgba(163,163,163,.6)', cursor: 'pointer', fontSize: 18,
                                padding: '0 4px',
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px 16px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        {messages.length === 0 && !isTyping && (
                            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                                <div style={{ fontSize: 32, marginBottom: 12 }}>?</div>
                                <p style={{ color: 'rgba(163,163,163,.8)', fontSize: 14, margin: '0 0 16px' }}>
                                    Hi! I can help you navigate the app, explain features, and guide you through actions.
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                                    {QUICK_SUGGESTIONS.map(q => (
                                        <button
                                            key={q}
                                            onClick={() => sendMessage(q)}
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: 20,
                                                border: '1px solid rgba(167,139,250,.2)',
                                                background: 'rgba(167,139,250,.06)',
                                                color: '#a78bfa',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                                transition: 'background .15s',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,.15)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(167,139,250,.06)')}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map(msg => (
                            <div key={msg.id} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '85%',
                                    padding: '10px 14px',
                                    borderRadius: msg.role === 'user'
                                        ? '14px 14px 4px 14px'
                                        : '14px 14px 14px 4px',
                                    background: msg.role === 'user'
                                        ? 'linear-gradient(135deg, #7c3aed, #6d28d9)'
                                        : 'rgba(255,255,255,.05)',
                                    border: msg.role === 'user'
                                        ? 'none'
                                        : '1px solid rgba(255,255,255,.06)',
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                    color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,.85)',
                                }}>
                                    {msg.text}
                                </div>

                                {/* Action buttons */}
                                {msg.actions && msg.actions.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                        {msg.actions.map((action, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleActionClick(action)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(16,185,129,.3)',
                                                    background: 'rgba(16,185,129,.08)',
                                                    color: '#10b981',
                                                    fontSize: 12,
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    transition: 'background .15s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,.2)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,.08)')}
                                            >
                                                {action.type === 'NAVIGATE' && '→'}
                                                {action.type === 'HIGHLIGHT' && '◉'}
                                                {action.type === 'SCROLL_TO' && '↓'}
                                                {action.type === 'SUGGEST_INPUT' && '✎'}
                                                {action.label || action.type}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '10px 14px',
                                borderRadius: '14px 14px 14px 4px',
                                background: 'rgba(255,255,255,.05)',
                                border: '1px solid rgba(255,255,255,.06)',
                                alignSelf: 'flex-start',
                                maxWidth: '85%',
                            }}>
                                <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0s', width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
                                <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.2s', width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
                                <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.4s', width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form
                        onSubmit={handleSubmit}
                        style={{
                            padding: '12px 16px',
                            borderTop: '1px solid rgba(255,255,255,.06)',
                            display: 'flex',
                            gap: 8,
                        }}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask something..."
                            disabled={isTyping}
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,.08)',
                                background: 'rgba(255,255,255,.03)',
                                color: '#fff',
                                fontSize: 13,
                                outline: 'none',
                            }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(167,139,250,.4)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)')}
                        />
                        <button
                            type="submit"
                            disabled={isTyping || !input.trim()}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 10,
                                border: 'none',
                                background: input.trim() ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(255,255,255,.06)',
                                color: '#fff',
                                fontSize: 14,
                                cursor: input.trim() ? 'pointer' : 'default',
                                opacity: input.trim() ? 1 : 0.4,
                                transition: 'opacity .2s',
                            }}
                        >
                            ↑
                        </button>
                    </form>
                </div>
            )}

            {/* Inline CSS for animations */}
            <style jsx global>{`
                @keyframes chatDot {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1.2); }
                }
                .chat-highlight {
                    outline: 2px solid #a78bfa !important;
                    outline-offset: 2px !important;
                    box-shadow: 0 0 20px rgba(167,139,250,.4) !important;
                    transition: outline .3s, box-shadow .3s !important;
                    animation: chatGlow 1.5s ease-in-out 2 !important;
                }
                @keyframes chatGlow {
                    0%, 100% { box-shadow: 0 0 10px rgba(167,139,250,.2); }
                    50% { box-shadow: 0 0 30px rgba(167,139,250,.6); }
                }
            `}</style>
        </>
    );
}
