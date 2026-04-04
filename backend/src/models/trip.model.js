import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  origin: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  stops: [{
    type: String
  }],
  budget: {
    type: Number,
    required: true
  },
  dates: [{
    type: String // e.g., "2026-05-10"
  }],
candidatePlaces: [{
  name: { type: String, default: '' },
  type: { type: String, default: 'unknown' },
  lat: { type: Number, default: 0 },
  lon: { type: Number, default: 0 }
}],

  selectedPlaces: [{
    name: String,
    lat: Number,
    lon: Number
  }],
  itinerary: [{
    day: Number,
    place: String,
    reason: String,
    activities: [String],
    weather: String
  }],
  travelAdvice: [String],
  estimatedBudget: {
    accommodation: Number,
    food: Number,
    transport: Number,
    activities: Number,
    total: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Trip = mongoose.model('Trip', tripSchema);