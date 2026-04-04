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
    type: String 
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
tripSchema.pre('save', function(next) {
  const budget = this.estimatedBudget;
  
  if (budget) {
    this.estimatedBudget.total = 
      (budget.accommodation || 0) + 
      (budget.food || 0) + 
      (budget.transport || 0) + 
      (budget.activities || 0);
  }

  next();
});

export const Trip = mongoose.model('Trip', tripSchema);