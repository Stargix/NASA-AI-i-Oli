'use client';

import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
    id: string;
    type: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    images?: string[]; // Base64 images attached
    metadata?: {
        detections?: number;
        processingTime?: number;
    };
}

interface ChatPanelProps {
    messages: ChatMessage[];
    isLoading?: boolean;
    onClear?: () => void;
    isOpen: boolean;
    onToggle: () => void;
}

export default function ChatPanel({
    messages,
    isLoading = false,
    onClear,
    isOpen,
    onToggle
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Auto-scroll al final cuando hay nuevos mensajes
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Escuchar cambios de modo del Toolbox y minimizar si está en manual
    useEffect(() => {
        const handleModeChange = (event: CustomEvent) => {
            const mode = event.detail?.mode;
            if (mode === 'manual' && isOpen && !isExpanded) {
                // Minimizar el chat cuando el toolbox está en modo manual
                onToggle();
            }
        };

        window.addEventListener('toolboxModeChange' as any, handleModeChange as any);
        return () => {
            window.removeEventListener('toolboxModeChange' as any, handleModeChange as any);
        };
    }, [isOpen, isExpanded, onToggle]);

    const handleClearClick = () => {
        if (onClear) {
            onClear();
            setShowClearConfirm(false);
        }
    };

    const handleToggle = () => {
        // Si el chat se está abriendo y el toolbox está en modo manual, cambiar a auto
        if (!isOpen && typeof window !== 'undefined' && (window as any).toolboxMode === 'manual') {
            // Disparar evento para cambiar el toolbox a modo auto
            window.dispatchEvent(new CustomEvent('chatRequestAutoMode'));
        }
        onToggle();
    };

    return (
        <>
            {/* Backdrop for expanded mode */}
            {isExpanded && isOpen && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] transition-opacity duration-300"
                    onClick={() => setIsExpanded(false)}
                />
            )}

            {/* Toggle Button */}
            {!isExpanded && (
                <button
                    onClick={handleToggle}
                    className={`
            fixed right-4 bottom-[82px] z-[1001]
            p-2.5 rounded-lg border transition-all duration-300
            ${isOpen
                            ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                            : 'bg-black/80 border-cyan-500/30 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                        }
            backdrop-blur-md
          `}
                    title={isOpen ? 'Close chat' : 'Open chat history'}
                >
                    <svg
                        className="w-4 h-4 text-cyan-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                    </svg>
                    {messages.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-400 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                            {messages.length}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Panel */}
            <div
                className={`
          fixed z-[1000]
          bg-black/90 backdrop-blur-md
          border border-cyan-500/30 rounded-lg
          shadow-[0_0_30px_rgba(6,182,212,0.2)]
          transition-all duration-300 ease-in-out
          flex flex-col
          ${isExpanded
                        ? 'left-1/2 top-[calc(50%-20px)] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[calc(100vh-260px)] max-w-[90vw] max-h-[600px]'
                        : 'right-4 bottom-[130px] w-64 max-w-[calc(100vw-2rem)] h-[calc(100vh-300px)] max-h-[405px]'
                    }
          ${isOpen
                        ? 'opacity-100 scale-100'
                        : 'opacity-0 scale-95 pointer-events-none'
                    }
        `}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/30">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                        <h2 className={`text-cyan-400 font-mono font-bold tracking-wider ${isExpanded ? 'text-sm' : 'text-[11px]'}`}>
                            CHAT LOG
                        </h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {/* Expand/Collapse button */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1.5 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200"
                            title={isExpanded ? 'Minimize' : 'Expand'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isExpanded ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                )}
                            </svg>
                        </button>
                        {messages.length > 0 && onClear && !showClearConfirm && (
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="p-1.5 rounded text-cyan-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                title="Clear all messages"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (isExpanded) setIsExpanded(false);
                                onToggle();
                            }}
                            className="p-1.5 rounded text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Clear Confirmation Bar */}
                {showClearConfirm && (
                    <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between animate-fade-in">
                        <span className="text-red-400 font-mono text-[10px]">
                            Clear all {messages.length} messages?
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleClearClick}
                                className="px-2 py-1 rounded text-[9px] font-mono bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-all"
                            >
                                YES
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-2 py-1 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all"
                            >
                                NO
                            </button>
                        </div>
                    </div>
                )}

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 custom-scrollbar">
                    {messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                            <div className={`text-center text-cyan-400/40 font-mono ${isExpanded ? 'text-sm' : 'text-[10px]'}`}>
                                <svg className={`mx-auto mb-2 opacity-40 ${isExpanded ? 'w-16 h-16' : 'w-8 h-8'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p>No messages</p>
                                <p className={`mt-1 opacity-60 ${isExpanded ? 'text-xs' : 'text-[8px]'}`}>Ask a question below</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`
                    flex gap-2 animate-fade-in
                    ${message.type === 'user' ? 'justify-end' : 'justify-start'}
                  `}
                                >
                                    {/* Avatar/Icon */}
                                    {message.type === 'assistant' && (
                                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                        </div>
                                    )}

                                    {/* Message Content */}
                                    <div
                                        className={`
                      rounded-lg break-words
                      ${isExpanded ? 'max-w-[75%] px-3 py-2' : 'max-w-[80%] px-2 py-1.5'}
                      ${message.type === 'user'
                                                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-100'
                                                : message.type === 'system'
                                                    ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-200/80'
                                                    : 'bg-black/50 border border-cyan-500/20 text-cyan-50'
                                            }
                    `}
                                    >
                                        {/* Attached Images */}
                                        {message.images && message.images.length > 0 && (
                                            <div className="mb-1.5 grid grid-cols-2 gap-1">
                                                {message.images.map((img, idx) => (
                                                    <img
                                                        key={idx}
                                                        src={img}
                                                        alt={`Attachment ${idx + 1}`}
                                                        className="w-full h-12 object-cover rounded border border-cyan-500/30"
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* Message Text */}
                                        <p className={`font-mono leading-tight whitespace-pre-wrap ${isExpanded ? 'text-xs' : 'text-[10px]'}`}>
                                            {message.content}
                                        </p>

                                        {/* Metadata */}
                                        {message.metadata && (
                                            <div className={`mt-1 pt-1 border-t border-cyan-500/20 flex items-center gap-2 text-cyan-400/50 ${isExpanded ? 'text-[9px]' : 'text-[8px]'}`}>
                                                {message.metadata.detections !== undefined && (
                                                    <span>🎯 {message.metadata.detections}</span>
                                                )}
                                                {message.metadata.processingTime !== undefined && (
                                                    <span>⏱️ {message.metadata.processingTime}ms</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Timestamp */}
                                        <div className={`mt-0.5 font-mono ${isExpanded ? 'text-[9px]' : 'text-[8px]'} ${message.type === 'user' ? 'text-cyan-400/40' : 'text-cyan-400/30'
                                            }`}>
                                            {message.timestamp.toLocaleTimeString('es-ES', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>

                                    {message.type === 'user' && (
                                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-400/20 border border-cyan-400/50 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Loading indicator */}
                            {isLoading && (
                                <div className="flex gap-1.5 justify-start">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                                        <div className="w-2.5 h-2.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div>
                                    </div>
                                    <div className="bg-black/50 border border-cyan-500/20 rounded-lg px-2 py-1.5">
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                            <span className="w-1.5 h-1.5 bg-cyan-400/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Footer Stats */}
                <div className="px-3 py-1.5 border-t border-cyan-500/30 flex items-center justify-between text-[8px] font-mono text-cyan-400/40">
                    <span>{messages.length} msg{messages.length !== 1 ? 's' : ''}</span>
                    <span>READY</span>
                </div>
            </div>

            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(6, 182, 212, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(6, 182, 212, 0.5);
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
        </>
    );
}
