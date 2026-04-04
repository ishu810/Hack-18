import { Travel } from '../models/travel.model.js';
import { ChatOpenAI } from '@langchain/openai';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildItineraryPrompt } from '../utils/itineraryPrompt.js';
import { computeRoute as computeRouteService } from '../services/routing/routing.service.js';
import axios from 'axios';

const FALLBACK_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';
const GEOAPIFY_BASE_URL = 'https://api.geoapify.com';

const getGeoapifyKey = () => {
  const raw = process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '';
  return raw.trim();
};

const maskKey = (value = '') => {
  const key = String(value || '').trim();
  if (!key) return '[missing]';
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

const llm = new ChatOpenAI({
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7
});

const getTripDaysFromDates = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return 1;
  if (dates.length === 1) return 1;

  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Math.max(1, dates.length);
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diffDays);
};

const normalizePlaceName = (value = '') => value
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\b(the|a|an)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toRad = (value) => (value * Math.PI) / 180;

const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const val = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(val), Math.sqrt(1 - val));
};

const getPlaceCoords = (place) => {
  const lat = toFiniteNumber(place?.lat);
  const lng = toFiniteNumber(place?.lng ?? place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const splitEvenly = (items = [], parts = 1) => {
  const count = Math.max(1, Number(parts) || 1);
  const buckets = Array.from({ length: count }, () => []);
  if (!items.length) return buckets;

  items.forEach((item, index) => {
    buckets[index % count].push(item);
  });

  return buckets;
};

const orderPlacesByNearest = (places = []) => {
  if (!Array.isArray(places) || places.length <= 2) return [...places];

  const remaining = [...places];
  const ordered = [remaining.shift()];

  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    const currentCoords = getPlaceCoords(current);
    if (!currentCoords) {
      ordered.push(remaining.shift());
      continue;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const candidateCoords = getPlaceCoords(candidate);
      if (!candidateCoords) return;
      const dist = distanceKm(currentCoords, candidateCoords);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return ordered;
};

