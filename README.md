# Hack1 Travel Planner

Operation RoundTable is a travel planning platform that helps users build multi-city journeys, generate itineraries, review route options, estimate budgets, and inspect map-based route previews. The application combines a React frontend with a Node.js backend and integrates external services for routing, places, weather, authentication, and media enrichment.

## Key Capabilities

- Journey planning with origin, destination, and intermediate stops.
- Route preview with map visualization and ordered checkpoints.
- Itinerary generation with day-wise activities, transit, food, and stay recommendations.
- Budget estimation and per-day budget breakdown.
- Weather-aware itinerary guidance.
- Google-based venue and routing enrichment.
- Authentication flow with Google OAuth support.

## Tech Stack

- Frontend: React, Vite, React Router, Tailwind CSS, Framer Motion, Leaflet
- Backend: Node.js, Express, MongoDB, Mongoose, LangChain
- External services: Google Maps / Places, OpenCage, WeatherAPI, Cloudinary, OpenAI

## Project Structure

- `frontend/` - React application
- `backend/` - API server and travel planning logic

## Prerequisites

- Node.js 18 or later
- npm
- MongoDB instance
- Required API keys for the enabled integrations

## Environment Variables

Create a `.env` file in the backend directory and configure the required values for your environment.

### Backend

- `PORT` - API server port
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Token signing secret
- `GOOGLE_CLIENT_ID` - Google OAuth client id
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_CALLBACK_URL` - Google OAuth redirect URL
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_MAPS_API_KEY` or `GOOGLE_API_KEY` - Google routing key
- `GOOGLE_PLACES_API_KEY` - Google Places API key
- `GEOAPIFY_API_KEY` or `GEOAPIFY_KEY` - Geocoding fallback key
- `WEATHERAPI_KEY` or `WEATHER_API_KEY` - Weather service key
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `ROUTING_PROVIDER` - Optional routing provider override (`google` or `geoapify`)

### Frontend

- `VITE_API_URL` - Backend base URL, for example `http://localhost:5000`
- `VITE_OPENCAGE_API_KEY` - OpenCage geocoding key used by the UI

## Installation

Install dependencies for both applications separately:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Running the Application

Start the backend first, then launch the frontend.

### Backend

```bash
cd backend
npm run dev
```

### Frontend

```bash
cd frontend
npm run dev
```

By default, Vite runs on `http://localhost:5173` and the backend runs on the port defined in `PORT`.

## Available Scripts

### Frontend

- `npm run dev` - Start the Vite development server
- `npm run build` - Build the production bundle
- `npm run lint` - Run ESLint
- `npm run preview` - Preview the production build locally

### Backend

- `npm run dev` - Start the backend with Nodemon

## Usage Overview

1. Create a journey by selecting origin, destination, dates, budget, and optional stops.
2. Review the generated route preview.
3. Adjust route points, transport preferences, and checkpoint order if needed.
4. Generate the itinerary and review day-wise activities, weather, and budget estimates.

## Notes

- The route preview depends on the configured routing provider and Google Maps credentials when enabled.
- Some itinerary and venue features rely on external APIs; incomplete configuration may reduce the quality of generated content.
- For local development, ensure the frontend `VITE_API_URL` points to the backend server.

## License

No license has been specified for this project.