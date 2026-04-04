export const buildItineraryPrompt = ({ origin, destination, days: tripDays, selectedPlaces, budget, dates, routePlan }) => {
  const placesText = selectedPlaces.map(p => `${p.name} (${p.location})`).join(', ');
  const dateRange = dates.length > 0 ? `from ${dates[0]} to ${dates[dates.length - 1]}` : '';
  const routePlanText = routePlan
    ? JSON.stringify(routePlan, null, 2)
    : 'Not available';
  
  return `You are a professional travel planner. Create a detailed, day-wise itinerary for a trip.

TRIP DETAILS:
- Origin: ${origin}
- Destination: ${destination}
- Selected Places: ${placesText}
- Duration: ${tripDays} day(s) ${dateRange}
- Budget: ₹${budget}

ROUTE PLAN FROM GOOGLE MAPS:
${routePlanText}

INSTRUCTIONS (Be CONCISE to minimize tokens - use bullet points, short descriptions):
Generate a structured itinerary with EXACTLY ${tripDays} days. For each day, include:

1. Day number, city/area, and a short theme (e.g., "Nature & Culture")
2. Weather: expected condition (e.g., "Clear", "Rainy") - be realistic
3. Activities: 2-3 activities max with format: "Time: Activity Title | Duration: X min | Type: outdoor/indoor"
4. Travel: if moving between places, include "From→To | Duration | Transport | Note"
5. Food: 1-2 key meals recommended with restaurant type (e.g., "Lunch: Local cuisine near ${destination}")
6. Dining picks: 1-2 famous dining places with cuisine + what they are best known for
7. Local explorations: 1-2 lesser-known nearby local spots/gems
8. Stay area: 1 hotel area suggestion (e.g., "Near market area, mid-range hotels")
9. Tips: 2-3 concise travel tips (e.g., "Carry water", "Early start recommended")
10. Summary: 1 line summarizing the day

MANDATORY SEQUENCING RULES (VERY IMPORTANT):
- Follow the ROUTE PLAN order when it is available.
- If day city is different from previous day city, travel MUST be present and explicit.
- Write travel clearly as: from: "Previous City", to: "Current City".
- On transfer days, first activity title MUST start with: "After reaching <Current City>, ...".
- Do not combine city names in one field like "Mathura to Udaipur". Use separate from and to fields.
- Mention the route sequence clearly in summary, e.g., "Traveled from Mathura to Udaipur, then visited City Palace."

IMPORTANT:
- Be concise. Avoid long descriptions.
- Return ONLY valid JSON (no extra text before/after).
- Use simple, readable format.
- Keep each field brief to save tokens.
- Distribute selected places across days reasonably.
- Travel duration must be realistic and reflect actual distance between locations.

RESPONSE FORMAT (STRICTLY follow this JSON structure):
{
  "itinerary": [
    {
      "day": 1,
      "city": "City Name",
      "theme": "Theme/Category",
      "weather": "Clear/Rainy/Cloudy",
      "weather_note": "Brief impact on plans",
      "activities": [
        {
          "title": "Activity Name",
          "time": "9:00 AM - 11:00 AM",
          "duration_min": 120,
          "description": "Brief desc",
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
          "best_for": "Signature dish or dining experience"
        }
      ],
      "local_explorations": [
        "Local hidden gem 1",
        "Local hidden gem 2"
      ],
      "stay": {
        "area": "Recommended area",
        "type": "budget/mid-range/luxury",
        "reason": "Why this area"
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
