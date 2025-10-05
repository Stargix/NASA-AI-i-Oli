// API Configuration
// Change this URL based on environment

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '187.33.157.217';

// API Endpoints
export const API_ENDPOINTS = {
  starAnalysis: `${API_BASE_URL}/star_analysis`,
  chat: `${API_BASE_URL}/chat`,
  similarity: `${API_BASE_URL}/similarity`,
  constellationSearch: `${API_BASE_URL}/constellation/search`,
  constellationDraw: `${API_BASE_URL}/constellation/draw`,
  health: `${API_BASE_URL}/health`,
} as const;

export default API_BASE_URL;
