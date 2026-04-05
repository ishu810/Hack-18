export const buildTravelPlacesPrompt = ({ origin, destination, stops, days }) => {
  const stopText = Array.isArray(stops) && stops.length ? stops.join(', ') : 'none';
  const totalDays = Number(days) || 1;

  let placeCountInstruction = 'Generate 6 candidate places.';
  let durationPriorityInstruction =
    'Balance iconic highlights and secondary attractions based on trip pace.';

  if (totalDays <= 2) {
    placeCountInstruction = 'Generate 5 candidate places.';
    durationPriorityInstruction =
      'Trip is very short: include must-see, high-value highlights so the user can select based on their preferences.';
  } else if (totalDays <= 4) {
    placeCountInstruction = 'Generate 4 to 6 candidate places.';
    durationPriorityInstruction =
      'Trip is short to medium: prioritize top attractions first, then include only a few secondary places.';
  } else if (totalDays <= 7) {
    placeCountInstruction = 'Generate 6 to 8 candidate places.';
    durationPriorityInstruction =
      'Trip is medium length: include all major attractions and a reasonable mix of secondary places.';
  } else {
    placeCountInstruction = 'Generate 8 to 12 candidate places.';
    durationPriorityInstruction =
      'Trip is long: include major attractions plus diverse secondary/hidden-gem places.';
  }

  return `You are a travel planning assistant. The user is traveling from ${origin} to ${destination} in ${days} day(s). ` +
    `Intermediate stops: ${stopText}.\n\n` +
    `${placeCountInstruction} to visit in or near ${destination} and along the route (including stops). ` +
    `${durationPriorityInstruction}\n` +
    `Return strictly valid JSON array (no additional text) of objects with these keys: ` +
    `name, type, location, best_visit_reason, imageUrl.\n` +
    `• name: the place name\n` +
    `• type: category (e.g., Historical, Sightseeing, Nature, Museum)\n` +
    `• location: city or area (e.g., Udaipur, Kota, Agra)\n` +
    `• best_visit_reason: why this place is recommended for this trip\n` +
    `• imageUrl: photo URL if known, otherwise empty string\n\n` +
    `Examples:\n` +
    `[{\n` +
    `  "name": "Bagore ki Haveli",\n` +
    `  "type": "Museum",\n` +
    `  "location": "Udaipur",\n` +
    `  "best_visit_reason": "cultural performances and traditional architecture",\n` +
    `  "imageUrl": ""\n` +
    `}, {\n` +
    `  "name": "Kumbhalgarh Fort",\n` +
    `  "type": "Historical",\n` +
    `  "location": "Near Udaipur",\n` +
    `  "best_visit_reason": "largest fort wall after Great Wall of China with panoramic views",\n` +
    `  "imageUrl": ""\n` +
    `}]\n\n` +
    `Do not include explanation or additional text. Only output the JSON array.`;
};