const BACKEND = 'http://localhost:5000';

const setResult = (message) => {
    document.getElementById('result').textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
};

const getElement = id => document.getElementById(id);

const renderPlaceSelection = (tripId, places) => {
    const container = document.getElementById('placeSelection');
    container.innerHTML = '<h2>Select Places</h2>';

    const list = document.createElement('div');
    console.log('DEBUG places list', places);
    places.forEach((place, i) => {
        const row = document.createElement('div');
        row.style = 'margin-bottom: 6px;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = place.name;
        checkbox.checked = true;
        checkbox.dataset.lat = place.lat || '';
        checkbox.dataset.lon = place.lon || '';
        checkbox.dataset.location = place.location || '';
        checkbox.dataset.bestVisitReason = place.best_visit_reason || place.bestVisitReason || '';
        checkbox.dataset.imageUrl = place.imageUrl || place.image_url || '';

        const img = document.createElement('img');
        const rawUrl = place.imageUrl || place.image_url || '';
        const seed = `${place.name || 'place'}-${place.location || 'location'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place';
        const fallbackUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/800`;
        img.src = rawUrl && rawUrl.startsWith('http') ? rawUrl : fallbackUrl;
        img.alt = place.name;
        img.style = 'width: 300px; height: 180px; object-fit: cover; margin-left: 8px; border-radius: 4px;';
        img.onerror = () => { img.src = fallbackUrl; };

        const info = document.createElement('div');
        info.style = 'margin-left: 8px;';
        info.innerHTML = `
          <strong>Name:</strong> ${place.name}<br>
          <strong>Type:</strong> ${place.type || 'Unknown'}<br>
          <strong>Location:</strong> ${place.location || 'Unknown'}<br>
          <strong>Best visit reason:</strong> ${place.best_visit_reason || place.bestVisitReason || 'No reason provided'}<br>
                    <strong>Image:</strong> <a href="${(place.imageUrl || place.image_url || fallbackUrl)}" target="_blank">View</a>
        `;

        row.appendChild(checkbox);
        row.appendChild(img);
        row.appendChild(info);
        list.appendChild(row);
    });

    const button = document.createElement('button');
    button.textContent = 'Generate Itinerary';
    button.type = 'button';
    button.style = 'margin-top: 15px; padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; width: auto;';
    button.onmouseover = () => { button.style.background = '#218838'; };
    button.onmouseout = () => { button.style.background = '#28a745'; };
    
    button.onclick = async (e) => {
        e.preventDefault();
        button.disabled = true;
        button.textContent = 'Generating...';
        
        try {
            const selectedPlaces = Array.from(list.querySelectorAll('input[type=checkbox]:checked')).map(cb => ({
                name: cb.value,
                location: cb.dataset.location || '',
                best_visit_reason: cb.dataset.bestVisitReason || '',
                imageUrl: cb.dataset.imageUrl || ''
            }));

            if (!selectedPlaces.length) {
                setResult('❌ Please select at least one place.');
                button.disabled = false;
                button.textContent = 'Generate Itinerary';
                return;
            }

            console.log('✅ Selected places:', selectedPlaces);
            console.log('🔄 Step 1: Sending selected places to backend...');
            
            const selectResp = await fetch(`${BACKEND}/api/travel/${tripId}/select`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedPlaces })
            });
            
            const selectData = await selectResp.json();
            
            if (!selectResp.ok) {
                console.error('❌ Select failed:', selectResp.status, selectData);
                setResult(`❌ Select places failed: ${selectData.message || selectResp.statusText}`);
                button.disabled = false;
                button.textContent = 'Generate Itinerary';
                return;
            }
            
            if (!selectData.success) {
                console.error('❌ Backend error:', selectData);
                setResult(`❌ ${selectData.message || 'Select places failed'}`);
                button.disabled = false;
                button.textContent = 'Generate Itinerary';
                return;
            }

            console.log('✅ Places selected. Status:', selectData.trip?.status);
            console.log('🔄 Step 2: Generating itinerary...');
            
            const itineraryResp = await fetch(`${BACKEND}/api/travel/${tripId}/itinerary`);
            const itineraryData = await itineraryResp.json();
            
            if (!itineraryResp.ok) {
                console.error('❌ Itinerary failed:', itineraryResp.status, itineraryData);
                setResult(`❌ Itinerary failed (${itineraryResp.status}): ${itineraryData.message}\n\n${JSON.stringify(itineraryData)}`);
                button.disabled = false;
                button.textContent = 'Generate Itinerary';
                return;
            }
            
            if (!itineraryData.success) {
                console.error('❌ Error:', itineraryData);
                setResult(`❌ ${itineraryData.message || 'Itinerary generation failed'}`);
                button.disabled = false;
                button.textContent = 'Generate Itinerary';
                return;
            }

            console.log('✅ Itinerary generated successfully');
            renderItinerary(itineraryData.itinerary);
            button.textContent = '✓ Done!';
            setResult('✅ Itinerary generated successfully!');
        } catch (error) {
            console.error('❌ Exception:', error);
            setResult('❌ Error: ' + error.message);
            button.disabled = false;
            button.textContent = 'Generate Itinerary';
        }
    };

    container.appendChild(list);
    container.appendChild(button);
};

const renderItinerary = (itinerary) => {
    const c = document.getElementById('itineraryResult');
    c.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.style = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;';
    header.innerHTML = `
        <h2 style="margin: 0 0 10px 0;">✈️ Your Complete Itinerary</h2>
        <p style="margin: 0; font-size: 14px; opacity: 0.9;">Best time to visit: ${itinerary.best_time_to_visit || 'Check weather forecast'}</p>
    `;
    c.appendChild(header);

    // Days itinerary
    if (itinerary.itinerary && Array.isArray(itinerary.itinerary)) {
        itinerary.itinerary.forEach(day => {
            const dayDiv = document.createElement('div');
            dayDiv.style = 'background: #f9f9f9; border-left: 4px solid #667eea; padding: 15px; margin-bottom: 15px; border-radius: 4px;';
            
            let dayHTML = `<h3 style="margin-top: 0; color: #333;">📅 Day ${day.day}: ${day.city} - ${day.theme}</h3>`;
            
            // Weather
            if (day.weather) {
                dayHTML += `<div style="background: #e3f2fd; padding: 8px; border-radius: 4px; margin-bottom: 10px; font-size: 14px;">
                    🌤️ <strong>Weather:</strong> ${day.weather} ${day.weather_note ? `- ${day.weather_note}` : ''}
                </div>`;
            }

            // Travel segment
            if (day.travel && day.travel.from) {
                dayHTML += `<div style="background: #fff3e0; padding: 8px; margin-bottom: 10px; border-radius: 4px; font-size: 13px;">
                    🚗 <strong>Travel:</strong> ${day.travel.from} → ${day.travel.to} (${day.travel.duration} by ${day.travel.mode})
                    ${day.travel.note ? `<br>💡 ${day.travel.note}` : ''}
                </div>`;
            }

            // Activities
            if (day.activities && day.activities.length > 0) {
                dayHTML += `<div style="margin-bottom: 10px;">
                    <strong style="color: #667eea;">🎯 Activities:</strong>`;
                day.activities.forEach(activity => {
                    dayHTML += `<div style="margin-top: 6px; padding: 8px; background: white; border-left: 2px solid #764ba2; margin-left: 10px; font-size: 13px;">
                        <strong>${activity.title}</strong> (${activity.time})<br>
                        📍 ${activity.location} | ⏱️ ${activity.duration_min} min<br>
                        ${activity.description}
                    </div>`;
                });
                dayHTML += `</div>`;
            }

            // Food
            if (day.food && day.food.length > 0) {
                dayHTML += `<div style="margin-bottom: 10px; font-size: 13px;">
                    <strong style="color: #667eea;">🍽️ Food:</strong>`;
                day.food.forEach(f => {
                    dayHTML += `<div style="margin-left: 10px;">🍴 ${f.meal}: ${f.place} (${f.type} cuisine)</div>`;
                });
                dayHTML += `</div>`;
            }

            // Stay
            if (day.stay) {
                dayHTML += `<div style="background: #f3e5f5; padding: 8px; margin-bottom: 10px; border-radius: 4px; font-size: 13px;">
                    🏨 <strong>Stay:</strong> ${day.stay.area} (${day.stay.type}) - ${day.stay.reason}
                </div>`;
            }

            // Tips
            if (day.tips && day.tips.length > 0) {
                dayHTML += `<div style="font-size: 13px; margin-bottom: 10px;">
                    <strong style="color: #667eea;">💡 Tips:</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">`;
                day.tips.forEach(tip => {
                    dayHTML += `<li>${tip}</li>`;
                });
                dayHTML += `</ul></div>`;
            }

            // Summary
            if (day.summary) {
                dayHTML += `<div style="background: #e8f5e9; padding: 8px; border-radius: 4px; font-size: 13px; font-style: italic;">
                    📝 ${day.summary}
                </div>`;
            }

            dayDiv.innerHTML = dayHTML;
            c.appendChild(dayDiv);
        });
    }

    // Packing tips
    if (itinerary.packing_tips && itinerary.packing_tips.length > 0) {
        const packingDiv = document.createElement('div');
        packingDiv.style = 'background: #fff9c4; padding: 15px; border-radius: 4px; margin-bottom: 15px; margin-top: 20px;';
        packingDiv.innerHTML = `<h4 style="margin-top: 0; color: #f57f17;">🎒 Packing Tips:</h4>
            <ul style="margin: 10px 0; padding-left: 20px;">
                ${itinerary.packing_tips.map(tip => `<li>${tip}</li>`).join('')}
            </ul>`;
        c.appendChild(packingDiv);
    }

    // Total cost
    if (itinerary.total_estimated_cost) {
        const totalDiv = document.createElement('div');
        totalDiv.style = 'background: #c8e6c9; padding: 15px; border-radius: 4px; text-align: center; font-weight: bold; font-size: 18px; margin-top: 20px;';
        totalDiv.innerHTML = `💰 Total Estimated Cost: ₹${itinerary.total_estimated_cost}`;
        c.appendChild(totalDiv);
    }
};

getElement('travelForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const origin = getElement('origin').value;
    const destination = getElement('destination').value;
    const stops = getElement('stops').value.split(',').map(s => s.trim()).filter(Boolean);
    const budget = parseFloat(getElement('budget').value);
    const dates = getElement('dates').value.split(',').map(d => d.trim()).filter(Boolean);

    const data = { origin, destination, stops, budget, dates };

    try {
        setResult('Creating trip...');
        const response = await fetch(`${BACKEND}/api/travel/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (!result.success) {
            setResult(result.message || 'Trip creation failed.');
            return;
        }

        const tripId = result.trip._id;
        setResult('Trip created. Loading places...');

        const placesResp = await fetch(`${BACKEND}/api/travel/${tripId}/places`);
        const placesData = await placesResp.json();

        if (!placesData.success) {
            setResult(placesData.message || 'Places generation failed.');
            return;
        }

        renderPlaceSelection(tripId, placesData.places);
        setResult('Places loaded. Select and generate itinerary.');
    } catch (error) {
        setResult('Error: ' + error.message);
    }
});