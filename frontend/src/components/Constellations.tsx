'use client';

import { useState } from 'react';
import { API_ENDPOINTS } from '@/config/api';

interface Props {
  onClose?: () => void;
  detectedCentroids?: Array<[number, number]>;
  onConstellationMatch?: (result: any) => void;
  onRequestDetection?: () => Promise<Array<[number, number]> | null>;
}

export default function Constellations({ onClose, detectedCentroids, onConstellationMatch, onRequestDetection }: Props) {
  const [constellationName, setConstellationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleSearch = async () => {
    if (!constellationName.trim()) {
      setError('Please enter a constellation name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Determinar qué centroids usar
      let centroidsToUse = detectedCentroids;

      // Si no hay centroids detectados, ejecutar detección primero
      if ((!centroidsToUse || centroidsToUse.length === 0) && onRequestDetection) {
        console.log('⚠️ No stars detected, running detection first...');
        const detectedCents = await onRequestDetection();

        if (!detectedCents || detectedCents.length === 0) {
          setError('Failed to detect stars. Please try running detection manually.');
          setLoading(false);
          return;
        }

        centroidsToUse = detectedCents;
        console.log(`✅ Detection completed: ${detectedCents.length} stars found`);
      }

      const response = await fetch(API_ENDPOINTS.constellationSearch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          constellation_name: constellationName,
          detected_centroids: centroidsToUse || [],
        }),
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const data = await response.json();
      setResult(data);
      console.log('Constellation search result:', data);

      // Notificar al componente padre si hay un match exitoso
      if (data.success && onConstellationMatch) {
        onConstellationMatch(data);
      }
    } catch (err) {
      console.error('Constellation search error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDrawOwn = async () => {
    setLoading(true);
    setError(null);

    try {
      // Determinar qué centroids usar
      let centroidsToUse = detectedCentroids;

      // Si no hay centroids detectados, ejecutar detección primero
      if ((!centroidsToUse || centroidsToUse.length === 0) && onRequestDetection) {
        console.log('⚠️ No stars detected, running detection first...');
        const detectedCents = await onRequestDetection();

        if (!detectedCents || detectedCents.length === 0) {
          setError('Failed to detect stars. Please try running detection manually.');
          setLoading(false);
          return;
        }

        centroidsToUse = detectedCents;
        console.log(`✅ Detection completed: ${detectedCents.length} stars found`);
      }

      const response = await fetch(API_ENDPOINTS.constellationDraw, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detected_centroids: centroidsToUse || [],
        }),
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const data = await response.json();
      setResult(data);
      console.log('Draw constellation result:', data);

      // Notificar al componente padre si hay un match exitoso
      if (data.success && onConstellationMatch) {
        onConstellationMatch(data);
      }
    } catch (err) {
      console.error('Draw constellation error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="absolute top-[408px] left-4 z-[1100] w-64 bg-black/90 border border-cyan-500/30 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.2)]">
      {/* Header */}
      <div className="p-2.5 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="text-cyan-400 font-mono font-bold text-xs flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></div>
          CONSTELLATIONS
        </div>
        {onClose && (
          <button
            onClick={handleClose}
            className="text-cyan-400/60 hover:text-cyan-400 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-2.5 space-y-2.5">
        {/* Constellation Name Input */}
        <div>
          <label className="text-cyan-400/70 text-[10px] font-mono block mb-1.5">
            Constellation Name
          </label>
          <input
            type="text"
            value={constellationName}
            onChange={(e) => setConstellationName(e.target.value)}
            placeholder="e.g., Orion, Ursa Major..."
            className="w-full py-2 px-3 bg-black/50 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-mono placeholder:text-cyan-400/30 focus:outline-none focus:border-cyan-500/60 transition-all"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />
        </div>

        {/* Info: No stars detected */}
        {(!detectedCentroids || detectedCentroids.length === 0) && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-[9px] text-yellow-400 font-mono">
            ⚠️ No stars detected yet. Detection will run automatically.
          </div>
        )}

        {/* Info: Stars detected */}
        {detectedCentroids && detectedCentroids.length > 0 && (
          <div className="p-2 bg-green-500/10 border border-green-500/30 rounded text-[9px] text-green-400 font-mono">
            ✓ {detectedCentroids.length} stars detected and ready
          </div>
        )}

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={loading || !constellationName.trim()}
          className="w-full py-2 bg-cyan-500/20 border border-cyan-500/50 rounded text-cyan-400 text-[11px] font-mono hover:bg-cyan-500/30 transition-all disabled:opacity-50 font-bold"
        >
          {loading ? '⟳ SEARCHING...' : '🔍 SEARCH'}
        </button>

        {/* Draw Your Own Button */}
        <button
          onClick={handleDrawOwn}
          disabled={loading}
          className="w-full py-2 bg-purple-500/20 border border-purple-500/50 rounded text-purple-400 text-[11px] font-mono hover:bg-purple-500/30 transition-all disabled:opacity-50 font-bold"
        >
          {loading ? '⟳ PROCESSING...' : '✏️ DRAW YOUR OWN'}
        </button>

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400 font-mono">
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-2">
            <div className="text-[9px] font-mono text-cyan-400/60 p-2 bg-black/50 border border-cyan-500/30 rounded">
              {result.success ? (
                <>
                  <div className="text-green-400 font-bold mb-2">✓ Match Found!</div>
                  {result.constellation_index !== undefined && result.constellation_index !== null && (
                    <div className="p-1.5 mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-[8px] text-yellow-400">
                      🖼️ Constellation image displayed in top-right corner
                    </div>
                  )}
                  {result.constellation_name && (
                    <div className="flex justify-between mb-1">
                      <span>Name:</span>
                      <span className="text-cyan-400 font-bold">{result.constellation_name}</span>
                    </div>
                  )}
                  {result.inliers_count && (
                    <div className="flex justify-between mb-1">
                      <span>Inliers:</span>
                      <span className="text-cyan-400 font-bold">
                        {result.inliers_count}/{result.total_points} ({(result.inliers_ratio * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  {result.rotation_angle !== undefined && (
                    <div className="flex justify-between mb-1">
                      <span>Rotation:</span>
                      <span className="text-cyan-400 font-bold">{result.rotation_angle}°</span>
                    </div>
                  )}
                  {result.scale !== undefined && (
                    <div className="flex justify-between mb-1">
                      <span>Scale:</span>
                      <span className="text-cyan-400 font-bold">{result.scale.toFixed(2)}x</span>
                    </div>
                  )}
                  {result.position && (
                    <div className="flex justify-between">
                      <span>Position:</span>
                      <span className="text-cyan-400 font-bold">
                        ({result.position[0].toFixed(0)}, {result.position[1].toFixed(0)})
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-red-400 font-bold">
                  ✗ {result.message || 'No match found'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
