const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function getGoogleAuthUrl() {
  return `${API_BASE_URL}/api/auth/google`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export function loginUser(payload) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function registerUser(payload) {
  return apiRequest('/api/user/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser() {
  return apiRequest('/api/auth/me', {
    method: 'GET',
  });
}

export function logoutUser() {
  return apiRequest('/api/user/logout', {
    method: 'POST',
  });
}

export function createTrip(payload) {
  return apiRequest('/api/travel/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generatePlaces(tripId) {
  return apiRequest(`/api/travel/${tripId}/places`, {
    method: 'GET',
  });
}

export function selectPlaces(tripId, selectedPlaces) {
  return apiRequest(`/api/travel/${tripId}/select`, {
    method: 'PUT',
    body: JSON.stringify({ selectedPlaces }),
  });
}

export function generateItinerary(tripId) {
  return apiRequest(`/api/travel/${tripId}/itinerary`, {
    method: 'GET',
  });
}

export function computeRoute(payload) {
  return apiRequest('/api/travel/route/compute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getFlightCost(payload) {
  return apiRequest('/api/travel/flight-cost', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getTransportCost({ from, to, fromLat, fromLng, toLat, toLng }) {
  return apiRequest('/api/travel/transport-cost', {
    method: 'POST',
    body: JSON.stringify({ from, to, fromLat, fromLng, toLat, toLng }),
  });
}

export async function fetchBudgetEstimate(tripId, payload = {}) {
  const hasPayload = Boolean(payload && Object.keys(payload).length > 0);

  return apiRequest(`/api/travel/${tripId}/budget`, {
    method: hasPayload ? 'POST' : 'GET',
    ...(hasPayload ? { body: JSON.stringify(payload) } : {}),
  });
}

export function getTravelHistory(userId) {
  return apiRequest(`/api/${userId}`);
}
