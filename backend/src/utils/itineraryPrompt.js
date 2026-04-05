export const buildItineraryPrompt = ({
  origin,
  destination,
  days: tripDays,
  selectedPlaces,
  groupedPlacesByDay = [],
  weatherByDay = [],
  budget,
  dates
}) => {
  const placesText = selectedPlaces.map(p => `${p.name} (${p.location})`).join(', ');
  const dateRange = dates.length > 0 ? `from ${dates[0]} to ${dates[dates.length - 1]}` : '';
  const groupedByDayText = (groupedPlacesByDay || [])
    .map((dayPlaces, index) => {
      const labels = (dayPlaces || []).map((place) => `${place.name} (${place.location})`).join(', ');
      return `Day ${index + 1}: ${labels || 'No fixed places'}`;
    })
    .join('\n');

  const dayCityPlanText = (groupedPlacesByDay || [])
    .map((dayPlaces, index) => {
      const city = (dayPlaces?.[0]?.location || destination || '').trim() || 'Unknown city';
      return `Day ${index + 1} city: ${city}`;
    })
    .join('\n');

  const weatherByDayText = (weatherByDay || [])
    .map((entry, index) => {
      if (!entry) return `Day ${index + 1}: Weather unavailable`;
      return `Day ${index + 1} (${entry.date || 'date not available'}) in ${entry.city || destination}: condition=${entry.condition || 'unknown'}, avg_temp_c=${entry.avg_temp_c ?? 'n/a'}, min_temp_c=${entry.min_temp_c ?? 'n/a'}, max_temp_c=${entry.max_temp_c ?? 'n/a'}, humidity=${entry.avg_humidity ?? 'n/a'}%, rain_chance=${entry.daily_chance_of_rain ?? 'n/a'}%, precip_mm=${entry.total_precip_mm ?? 'n/a'}, wind_kph=${entry.max_wind_kph ?? 'n/a'}, uv=${entry.uv ?? 'n/a'}, sunrise=${entry.sunrise || 'n/a'}, sunset=${entry.sunset || 'n/a'}, alerts=${entry.alerts_summary || 'none'}`;
    })
    .join('\n');
  
  // Cap daily activity density so the plan remains realistic.
  const totalPlaces = selectedPlaces.length;
  const activitiesPerDay = Math.min(3, Math.max(1, Math.ceil(totalPlaces / tripDays)));
  
  return `You are a professional travel planner. Create a detailed, day-wise itinerary for a trip.

TRIP DETAILS:
- Origin: ${origin}
- Destination: ${destination}
- Total Selected Places: ${totalPlaces} places to visit
- Selected Places: ${placesText}
- Duration: ${tripDays} day(s) ${dateRange}
- Budget: ₹${budget}

CRITICAL INSTRUCTION: YOU MUST DISTRIBUTE ALL ${totalPlaces} SELECTED PLACES across the itinerary. Do not skip any places. Each place must appear as an activity in the itinerary.

WEATHER INPUT YOU MUST USE (DO NOT INVENT OR REPLACE THESE VALUES):
${weatherByDayText}

FIXED DAY CITY PLAN (DO NOT CHANGE ORDER):
${dayCityPlanText}

MANDATORY NEARBY GROUPING (DO NOT VIOLATE):
${groupedByDayText}

GROUPING RULES:
- Keep each place on the day listed above.
- Do not move a day-1 place to day-2 or vice versa.
- Places listed under the same day are geographically close and should stay together.
- Avoid mixing very far places in the same day.
- Day numbering and city sequence are fixed by the day city plan above.

INSTRUCTIONS (Be CONCISE to minimize tokens - use bullet points, short descriptions):
Generate a structured itinerary with EXACTLY ${tripDays} days. For each day, include:

1. Day number, city/area, and a short theme (e.g., "Nature & Culture")
2. Weather: use the provided day-wise weather input
3. Activities: Include up to ${activitiesPerDay} activities (hard max 3 per day) with format: "Time: Activity Title | Duration: X min | Type: outdoor/indoor"
4. Travel: if moving between places, include "From→To | Duration | Transport | Note"
5. Intra-day transit: explicitly account for travel time between consecutive activities (A->B, B->C)
6. Food: 1-2 key meals recommended with restaurant type (e.g., "Lunch: Local cuisine near ${destination}")
7. Dining picks: 1-2 famous dining places with cuisine + what they are best known for
8) Stay options: include 1-3 hotel/hostel recommendations near the day city with a photo URL when possible
9) Local explorations: 1-2 lesser-known nearby local spots/gems
10) Stay area: 1 hotel area suggestion (e.g., "Near market area, mid-range hotels")
11) Tips: 2-3 concise travel tips (e.g., "Carry water", "Early start recommended")
12) Summary: 1 line summarizing the day

MANDATORY SEQUENCING RULES (VERY IMPORTANT):
- If day city is different from previous day city, travel MUST be present and explicit.
- Write travel clearly as: from: "Previous City", to: "Current City".
- On transfer days, first activity title MUST start with: "After reaching <Current City>, ...".
- Do not combine city names in one field like "Mathura to Udaipur". Use separate from and to fields.
- Mention the route sequence clearly in summary, e.g., "Traveled from Mathura to Udaipur, then visited City Palace."
- Do not create a day with long zig-zag jumps between far places.
- Activity time windows MUST include realistic travel gaps between places.
- If travel from one activity to the next is long (>= 60 min), reflect that in the next activity start time.
- Never keep fixed 1-hour gaps by default; adapt schedule using actual distance/transit context.

IMPORTANT:
- Be concise. Avoid long descriptions.
- Return ONLY valid JSON (no extra text before/after).
- Use simple, readable format.
- Keep each field brief to save tokens.
- Distribute selected places across days reasonably.
- For each day, weather and weather_note must match that day's weather input.
- Keep activity description short (one line).
- Write weather_note in 2 to 4 short sentences with practical advice.

RESPONSE FORMAT (STRICT JSON):
{
  "itinerary": [
    {
      "day": 1,
      "city": "City Name",
      "theme": "Theme/Category",
      "weather": "Clear/Rainy/Cloudy",
      "weather_note": "Short practical advisory",
      "weather_details": {
        "date": "YYYY-MM-DD",
        "condition": "Partly cloudy",
        "avg_temp_c": 0,
        "min_temp_c": 0,
        "max_temp_c": 0,
        "avg_humidity": 0,
        "daily_chance_of_rain": 0,
        "total_precip_mm": 0,
        "max_wind_kph": 0,
        "uv": 0,
        "sunrise": "6:12 AM",
        "sunset": "6:44 PM",
        "alerts_summary": "No severe alerts"
      },
      "activities": [
        {
          "title": "Activity Name",
          "time": "9:00 AM - 11:00 AM",
          "duration_min": 120,
          "description": "Short one-line reason to visit",
          "type": "outdoor/indoor",
          "location": "Specific area"
        }
      ],
      "travel": {
        "from": "City A",
        "to": "City B",
        "duration": "4.5 hours",
        "mode": "car/train/flight",
        "note": "Scenic route / Best by X time"
      },
      "food": [
        {
          "meal": "Breakfast/Lunch/Dinner",
          "place": "Restaurant/Area name",
          "type": "local/international"
        }
      ],
      "dining_places": [
        {
          "name": "Famous dining place",
          "cuisine": "Rajasthani/North Indian/Street Food",
          "area": "Neighborhood/Market",
          "best_for": "Signature dish or dining experience",
          "imageUrl": "https://...",
          "rating": 4.5,
          "price_level": 2,
          "googleMapsUrl": "https://..."
        }
      ],
      "stay_options": [
        {
          "name": "Hotel Name",
          "area": "Recommended area",
          "type": "hotel/hostel/guest house",
          "reason": "Why it fits the trip",
          "imageUrl": "https://...",
          "rating": 4.3,
          "price_level": 2,
          "googleMapsUrl": "https://..."
        }
      ],
      "local_explorations": [
        "Local hidden gem 1",
        "Local hidden gem 2"
      ],
      "stay": {
        "area": "Recommended area",
        "type": "budget/mid-range/luxury",
        "reason": "Why this area",
        "name": "Optional property name",
        "imageUrl": "https://...",
        "rating": 4.4,
        "price_level": 2,
        "googleMapsUrl": "https://..."
      },
      "tips": [
        "Tip 1",
        "Tip 2"
      ],
      "summary": "One-liner summary"
    }
  ],
  "total_estimated_cost": ${budget},
  "packing_tips": ["Tip1", "Tip2"],
  "best_time_to_visit": "Brief info"
}

Start generating now:`;
};
