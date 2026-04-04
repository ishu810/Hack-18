import mongoose from 'mongoose';

const itineraryActivitySchema = new mongoose.Schema({
  title: { type: String, default: '' },
  time: { type: String, default: '' },
  duration_min: { type: Number, default: 0 },
  description: { type: String, default: '' },
  type: { type: String, default: '' },
  location: { type: String, default: '' }
}, { _id: false });

const itineraryTravelSchema = new mongoose.Schema({
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  duration: { type: String, default: '' },
  mode: { type: String, default: '' },
  note: { type: String, default: '' }
}, { _id: false });

const itineraryFoodSchema = new mongoose.Schema({
  meal: { type: String, default: '' },
  place: { type: String, default: '' },
  type: { type: String, default: '' }
}, { _id: false });

const itineraryDiningSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  cuisine: { type: String, default: '' },
  area: { type: String, default: '' },
  best_for: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  price_level: { type: Number, default: 0 },
  googleMapsUrl: { type: String, default: '' },
  vicinity: { type: String, default: '' },
  placeId: { type: String, default: '' },
  distanceKm: { type: Number, default: 0 },
  isOpenNow: { type: Boolean, default: false }
}, { _id: false });

const itineraryStaySchema = new mongoose.Schema({
  area: { type: String, default: '' },
  type: { type: String, default: '' },
  reason: { type: String, default: '' },
  name: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  price_level: { type: Number, default: 0 },
  googleMapsUrl: { type: String, default: '' },
  vicinity: { type: String, default: '' },
  placeId: { type: String, default: '' }
}, { _id: false });

const itineraryStayOptionSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  area: { type: String, default: '' },
  type: { type: String, default: '' },
  reason: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  price_level: { type: Number, default: 0 },
  googleMapsUrl: { type: String, default: '' },
  vicinity: { type: String, default: '' },
  placeId: { type: String, default: '' },
  distanceKm: { type: Number, default: 0 }
}, { _id: false });

const itineraryDaySchema = new mongoose.Schema({
  day: { type: Number, default: 1 },
  city: { type: String, default: '' },
  theme: { type: String, default: '' },
  weather: { type: String, default: '' },
  weather_note: { type: String, default: '' },
  activities: { type: [itineraryActivitySchema], default: [] },
  travel: { type: itineraryTravelSchema, default: null },
  food: { type: [itineraryFoodSchema], default: [] },
  dining_places: { type: [itineraryDiningSchema], default: [] },
  stay_options: { type: [itineraryStayOptionSchema], default: [] },
  local_explorations: { type: [String], default: [] },
  stay: { type: itineraryStaySchema, default: null },
  tips: { type: [String], default: [] },
  summary: { type: String, default: '' }
}, { _id: false });

const travelSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
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
    type: String,
    required: true
  }],
  candidatePlaces: [{
    name: { type: String, default: '' },
    type: { type: String, default: 'unknown' },
    location: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    rating: { type: Number, default: null },
    popularity: { type: Number, default: null },
    best_visit_reason: { type: String, default: '' },
    imageUrl: { type: String, default: '' }
  }],
  selectedPlaces: [{
    name: { type: String, default: '' },
    type: { type: String, default: 'unknown' },
    location: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    rating: { type: Number, default: null },
    popularity: { type: Number, default: null },
    best_visit_reason: { type: String, default: '' },
    imageUrl: { type: String, default: '' }
  }],
  itinerary: {
    itinerary: {
      type: [itineraryDaySchema],
      default: []
    },
    total_estimated_cost: {
      type: Number,
      default: 0
    },
    packing_tips: {
      type: [String],
      default: []
    },
    best_time_to_visit: {
      type: String,
      default: ''
    }
  },
  status: {
    type: String,
    enum: ['planning', 'places_generated', 'places_selected', 'itinerary_generated'],
    default: 'planning'
  }
}, { timestamps: true });

export const Travel = mongoose.model('Travel', travelSchema);