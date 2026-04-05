import axios from "axios";

const BASE_URL = "http://localhost:5000/api/travel";

const runTest = async () => {
  try {
    // 🔹 Create Trip
    console.log("🟢 Creating trip...");
    const createRes = await axios.post(`${BASE_URL}/create`, {
      origin: "Lucknow",
      destination: "Udaipur",
      stops: ["Agra"],
      budget: 300000,
      dates: ["2026-04-11", "2026-04-12"],
    });

    const tripId = createRes.data.trip._id;
    console.log("✅ Trip created:", tripId);

    // 🔹 Get Places
    console.log("🟢 Getting places...");
    const placesRes = await axios.get(`${BASE_URL}/${tripId}/places`);
    console.log("✅ Places fetched:", placesRes.data.places.length, "places");

    // 🔹 Select Places
    console.log("🟢 Selecting places...");
    const selectedPlaces = placesRes.data.places.slice(0, 3);
    const selectRes = await axios.put(`${BASE_URL}/${tripId}/select`, {
      selectedPlaces: selectedPlaces
    });
    console.log("✅ Places selected:", selectRes.data.trip.status);

    // 🔹 Generate Itinerary
    console.log("🟢 Generating itinerary...");
    const itineraryRes = await axios.get(`${BASE_URL}/${tripId}/itinerary`);
    
    if (itineraryRes.data.success) {
      console.log("✅ Itinerary generated successfully!");
      console.log("📅 Days:", itineraryRes.data.itinerary.itinerary?.length || 0);
      console.log("\n🎯 Itinerary Preview:");
      
      itineraryRes.data.itinerary.itinerary?.slice(0, 1).forEach(day => {
        console.log(`\nDay ${day.day}: ${day.city} - ${day.theme}`);
        console.log(`Weather: ${day.weather}`);
        console.log(`Activities: ${day.activities?.length || 0}`);
        if (day.activities?.[0]) {
          console.log(`  - ${day.activities[0].title} (${day.activities[0].time})`);
        }
      });
      
      console.log("\n💰 Total Cost:", itineraryRes.data.itinerary.total_estimated_cost);
    } else {
      console.log("❌ Itinerary generation failed:", itineraryRes.data.message);
    }

  } catch (error) {
    console.error("❌ ERROR:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("Message:", error.message);
  }
};

console.log("🚀 Starting test...\n");
runTest().then(() => {
  console.log("\n✅ Test complete!");
  process.exit(0);
});
