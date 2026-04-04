import axios from 'axios';

async function run() {
  try {
    const create = await axios.post('http://localhost:5000/api/travel/create', {
      origin: 'Lucknow',
      destination: 'Kota',
      stops: ['Agra', 'Mathura'],
      budget: 300000,
      dates: ['2026-04-11', '2026-04-12']
    });

    console.log('TRIP CREATED', create.data.trip._id);

    const url = `http://localhost:5000/api/travel/${create.data.trip._id}/places`;
    const places = await axios.get(url);
    console.log('PLACES RESPONSE');
    console.log(JSON.stringify(places.data, null, 2));
  } catch (e) {
    console.error('ERR', e.response?.status, e.response?.data || e.message);
  }
}

run();