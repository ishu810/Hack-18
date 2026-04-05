import axios from "axios";

const base = "http://localhost:5000";
const stamp = Date.now();
const email = `e2e_${stamp}@mail.com`;
const password = "Pass@12345";
const username = `e2e_${stamp}`;

async function run() {
  const result = { steps: [] };
  try {
    const registerRes = await axios.post(`${base}/api/user/register`, { username, email, password, role: "ranger" });
    result.steps.push({ step: "register", status: registerRes.status, ok: registerRes.data?.success === true });

    const loginRes = await axios.post(`${base}/api/user/login`, { email, password });
    const token = loginRes.data?.accessToken;
    result.steps.push({ step: "login", status: loginRes.status, token: !!token });

    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const createRes = await axios.post(`${base}/api/travel/create`, {
      origin: "Lucknow",
      destination: "Udaipur",
      stops: ["Agra"],
      budget: 50000,
      dates: ["2026-05-01", "2026-05-03"]
    }, auth);

    const tripId = createRes.data?.trip?._id || createRes.data?.data?._id;
    result.steps.push({ step: "create_trip", status: createRes.status, tripId: !!tripId, tripIdValue: tripId || null });

    const listRes = await axios.get(`${base}/api/history`, auth);
    result.steps.push({ step: "history_list", status: listRes.status, count: listRes.data?.count ?? (listRes.data?.data || []).length });

    const byStatusRes = await axios.get(`${base}/api/history/status/planning`, auth);
    result.steps.push({ step: "history_status", status: byStatusRes.status, count: (byStatusRes.data?.data || []).length });

    const byIdRes = await axios.get(`${base}/api/history/${tripId}`, auth);
    result.steps.push({ step: "history_by_id", status: byIdRes.status, hasData: !!byIdRes.data?.data });

    const itineraryRes = await axios.get(`${base}/api/history/${tripId}/itinerary`, auth);
    result.steps.push({ step: "history_itinerary", status: itineraryRes.status, hasItineraryField: itineraryRes.data?.data !== undefined });

    let unauthorizedPassed = false;
    try {
      await axios.get(`${base}/api/history`);
    } catch (err) {
      unauthorizedPassed = err.response?.status === 401;
    }
    result.steps.push({ step: "history_auth_guard", ok: unauthorizedPassed });

    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, message: error.message, status: error.response?.status, data: error.response?.data, partial: result }, null, 2));
    process.exitCode = 1;
  }
}

run();
