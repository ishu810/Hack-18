import axios from "axios";

const BASE_URL = "http://localhost:5000/api/travel";

const runTest = async () => {
  try {
    // 🔹 Create Trip
    const createRes = await axios.post(`${BASE_URL}/create`, {
      origin: "Lucknow",
      destination: "Udaipur",
      stops: ["Agra"],
      budget: 300000,
      dates: ["2026-04-11", "2026-04-12"],
    });

    console.log("CREATE RESPONSE:");
    console.log(createRes.data);

    const tripId = createRes.data.trip._id;

    // 🔹 Get Places
    const placesRes = await axios.get(`${BASE_URL}/${tripId}/places`);

    console.log("\nPLACES RESPONSE:");
    console.log(JSON.stringify(placesRes.data, null, 2));

    // 🔹 Select Places
    const selectedPlaces = placesRes.data.candidatePlaces.slice(0, 3);
    const selectRes = await axios.post(`${BASE_URL}/${tripId}/select`, {
      selectedPlaces: selectedPlaces
    });

    console.log("\nSELECT RESPONSE:");
    console.log(selectRes.data);

    // 🔹 Generate Itinerary
    const itineraryRes = await axios.get(`${BASE_URL}/${tripId}/itinerary`);

    console.log("\nITINERARY RESPONSE:");
    console.log(JSON.stringify(itineraryRes.data, null, 2));

  } catch (error) {
    console.error("ERROR:");
    console.error(error.response?.data || error.message);
  }
};

runTest();