'use client';

import { useState, KeyboardEvent, useRef } from 'react';

interface QueryBoxProps {
    onQuery: (query: string, attachedImages?: File[]) => void;
    isLoading?: boolean;
}

export default function QueryBox({ onQuery, isLoading = false }: QueryBoxProps) {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [attachedImages, setAttachedImages] = useState<File[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = () => {
        if ((query.trim() || attachedImages.length > 0) && !isLoading) {
            onQuery(query.trim(), attachedImages);
            setQuery('');
            setAttachedImages([]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        setAttachedImages(prev => [...prev, ...imageFiles]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeImage = (index: number) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div
                onClick={handleContainerClick}
                className={`
                    relative bg-black/80 backdrop-blur-md border rounded-lg p-2
                    transition-all duration-500 ease-in-out cursor-text
                    ${isFocused
                        ? 'border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                        : 'border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    }
                `}
            >
                <div className="flex items-center gap-2">
                    {/* Botón para adjuntar imágenes */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                        }}
                        disabled={isLoading}
                        className="
                            flex-shrink-0 p-1.5 rounded
                            text-cyan-400/60 hover:text-cyan-400
                            hover:bg-cyan-500/10
                            transition-all duration-300
                            disabled:opacity-30 disabled:cursor-not-allowed
                        "
                        title="Attach images"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                        </svg>
                    </button>

                    {/* Input field */}
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="Query... (e.g., 'red star')"
                        disabled={isLoading}
                        className="
                            flex-1 bg-transparent border-none outline-none
                            text-cyan-400 placeholder-cyan-400/40
                            font-mono text-xs
                            disabled:opacity-50 disabled:cursor-not-allowed
                        "
                    />

                    {/* Submit button con icono de envío */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSubmit();
                        }}
                        disabled={(!query.trim() && attachedImages.length === 0) || isLoading}
                        className="
                            flex-shrink-0 p-1.5 rounded-full
                            text-cyan-400
                            hover:bg-cyan-500/20
                            hover:shadow-[0_0_15px_rgba(6,182,212,0.5)]
                            transition-all duration-300
                            disabled:opacity-30 disabled:cursor-not-allowed
                            disabled:hover:bg-transparent
                            disabled:hover:shadow-none
                        "
                        title="Send query"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div>
                        ) : (
                            <svg
                                className="w-4 h-4 rotate-90"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Imágenes adjuntadas */}
                {attachedImages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {attachedImages.map((file, index) => (
                            <div
                                key={index}
                                className="relative group bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1 flex items-center gap-1.5"
                            >
                                <svg
                                    className="w-3 h-3 text-cyan-400/60"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                                <span className="text-[9px] font-mono text-cyan-400/80 max-w-[80px] truncate">
                                    {file.name}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeImage(index);
                                    }}
                                    className="text-cyan-400/60 hover:text-red-400 transition-colors"
                                >
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Decorative elements */}
                <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"></div>
                <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"></div>
            </div>

            {/* Helper text - Compacto */}
            <div className="mt-1 px-2 flex items-center justify-between text-[8px] font-mono text-cyan-400/40">
                <div className="flex items-center gap-2">
                    <span className="flex items-center">
                        <span className="inline-block w-1.5 h-1.5 bg-cyan-400/40 rounded-full mr-1"></span>
                        Enter to send
                    </span>
                    {attachedImages.length > 0 && (
                        <span className="text-cyan-400/60">
                            {attachedImages.length} img{attachedImages.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div>
                    {query.length}/200
                </div>
            </div>

            {/* Example queries - Transición suave */}
            <div
                className={`
                    mt-3 px-2 transition-all duration-400 ease-in-out overflow-hidden
                    ${!query && !isLoading ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}
                `}
            >
                <div className="text-[10px] font-mono text-cyan-400/30 mb-2">EXAMPLE QUERIES:</div>
                <div className="flex flex-wrap gap-2">
                    {[
                        'red star next to blue star',
                        'bright cluster in center',
                        'nebula with dense gas',
                        'binary star system'
                    ].map((example, idx) => (
                        <button
                            key={idx}
                            onClick={() => setQuery(example)}
                            className="
                                px-3 py-1 rounded text-[10px] font-mono
                                bg-cyan-500/5 border border-cyan-500/20
                                text-cyan-400/50 hover:text-cyan-400/80
                                hover:bg-cyan-500/10 hover:border-cyan-500/30
                                transition-all duration-200
                            "
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
