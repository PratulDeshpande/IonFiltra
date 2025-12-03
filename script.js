// --- APP STATE MANAGEMENT ---
let currentUser = null;
let currentLocation = null;
let dashboardInterval = null;

// Simple router to switch views
function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    // Show target view
    const targetView = document.getElementById(viewId);
    if(targetView) {
        targetView.classList.remove('hidden');
    }

    // Post-navigation logic
    if (viewId === 'dashboard') {
        startDashboard();
    } else {
        stopDashboard();
    }
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value || 'Operator';
    currentUser = username;
    
    // Update UI with user info
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('user-info').classList.add('flex');
    document.getElementById('username-display').textContent = username;

    navigateTo('location-select');
}

function selectLocation(locationName) {
    currentLocation = locationName;

    // Update UI with location
    const locDisplay = document.getElementById('location-display');
    locDisplay.textContent = locationName;
    locDisplay.classList.remove('hidden');
    
    navigateTo('dashboard');
}

// --- DASHBOARD LOGIC (INTEGRATED FROM YOUR CODE) ---
const chartInstances = {};
const statusDot = document.getElementById('status-dot');
const lastUpdatedSpan = document.getElementById('last-updated');

function getISTTimestamp() {
    const options = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    return new Date().toLocaleTimeString('en-IN', options);
}

// Wrap your fetch in a start/stop controller so it only runs when on dashboard
function startDashboard() {
    if (!dashboardInterval) {
        // Initial fetch immediately
        fetchSensorData();
        // Then poll every 5s
        dashboardInterval = setInterval(fetchSensorData, 5000);
    }
}

function stopDashboard() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
}

async function fetchSensorData() {
    // IMPORTANT: Ensure this URL is reachable from the browser
    const apiUrl = 'http://localhost:3000/api/data'; 
    
    try {
        // Using a timeout to avoid hanging indefinitely if localhost isn't running
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();

        if (result.success) {
            processData(result.data);
            statusDot.classList.remove('bg-red-500');
            statusDot.classList.add('bg-neon');
            statusDot.classList.add('shadow-[0_0_10px_#76ff03]'); // Neon glow
            lastUpdatedSpan.textContent = `Live | Last sync: ${getISTTimestamp()}`;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Dashboard connection error:', error);
        statusDot.classList.remove('bg-neon', 'shadow-[0_0_10px_#76ff03]');
        statusDot.classList.add('bg-red-500');
        lastUpdatedSpan.textContent = `Offline - Retrying...`;
        
        // OPTIONAL: DEMO MODE DATA IF SERVER FAILS
        // Uncomment below to see dashboard working without backend
        // generateMockData(); 
    }
}

function processData(allData) {
    const dataByDevice = allData.reduce((acc, reading) => {
        const deviceId = reading.device_id;
        if (!acc[deviceId]) acc[deviceId] = [];
        acc[deviceId].push(reading);
        return acc;
    }, {});
    
    const grid = document.getElementById('dashboard-grid');
    if (Object.keys(dataByDevice).length > 0 && grid.querySelector('.col-span-full')) {
        grid.innerHTML = ''; // Clear "waiting" message once data arrives
    }

    for (const deviceId in dataByDevice) {
        updateDeviceCard(deviceId, dataByDevice[deviceId]);
    }
}

function createDeviceCard(deviceId) {
    const grid = document.getElementById('dashboard-grid');
    if (document.getElementById(`device-card-${deviceId}`)) return;

    const card = document.createElement('div');
    // UPDATED: Using Tailwind classes for the card
    card.className = 'glass rounded-2xl overflow-hidden shadow-xl flex flex-col animate-fade-in';
    card.id = `device-card-${deviceId}`;
    card.innerHTML = `
        <div class="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <h2 class="text-xl font-bold text-white flex items-center">
                <i class="ph ph-cpu text-neon mr-2"></i> ${deviceId}
            </h2>
                <span class="text-xs px-2 py-1 rounded-full bg-cyan-900/30 text-cyan-400 border border-cyan-900/50">Active</span>
        </div>
        <div class="p-6">
            <div class="relative h-[300px] mb-6">
                <canvas id="chart-${deviceId}"></canvas>
            </div>
            <div class="overflow-y-auto max-h-[250px] rounded-xl border border-white/10">
                <table class="w-full text-sm text-left">
                    <thead class="text-xs text-gray-400 uppercase bg-dark-900/80 sticky top-0 backdrop-blur-md">
                        <tr>
                            <th class="px-4 py-3">Temp (°C)</th>
                            <th class="px-4 py-3">Humidity (%)</th>
                            <th class="px-4 py-3">Pressure (hPa)</th>
                            <th class="px-4 py-3">Time</th>
                        </tr>
                    </thead>
                    <tbody id="table-body-${deviceId}" class="divide-y divide-white/5 text-gray-300"></tbody>
                </table>
            </div>
        </div>`;
    grid.appendChild(card);
    createChart(deviceId);
}

function updateDeviceCard(deviceId, data) {
    createDeviceCard(deviceId);
    
    const tableBody = document.getElementById(`table-body-${deviceId}`);
    // Keep only last 50 records for performance if desired, or all of them
    const recentData = data.slice(-50).reverse(); // Show newest first in table

    tableBody.innerHTML = '';
    recentData.forEach(reading => {
        const row = tableBody.insertRow();
        row.className = "hover:bg-white/5 transition-colors"; // Hover effect for rows
        const options = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        const formattedTimestamp = new Date(reading.timestamp).toLocaleString('en-IN', options);
        
        // Add some color coding to values if they are high (optional predictive maintenance visual cue)
        const tempClass = reading.temperature > 80 ? 'text-red-400 font-bold' : '';

        row.innerHTML = `
            <td class="px-4 py-3 ${tempClass}">${reading.temperature}</td>
            <td class="px-4 py-3">${reading.humidity}</td>
            <td class="px-4 py-3">${reading.pressure}</td>
            <td class="px-4 py-3 text-gray-500">${formattedTimestamp}</td>
        `;
    });

    const chart = chartInstances[deviceId];
    if (chart) {
        // For chart, we might want chronological order
        const chronoData = [...data]; // assume data comes in order, if not sort it by timestamp
        chart.data.labels = chronoData.map(r => new Date(r.timestamp));
        chart.data.datasets[0].data = chronoData.map(r => r.temperature);
        chart.data.datasets[1].data = chronoData.map(r => r.humidity);
        chart.update('none'); // 'none' for performance, avoids re-animating every update
    }
}

function createChart(deviceId) {
    const ctx = document.getElementById(`chart-${deviceId}`).getContext('2d');
    
    // UPDATED: More modern chart styling
    Chart.defaults.color = '#9ca3af'; // Tailwind gray-400
    Chart.defaults.font.family = 'Inter';

    chartInstances[deviceId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#ff5252', // Red-ish
                backgroundColor: 'rgba(255, 82, 82, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0, // Cleaner look without dots everywhere
                pointHitRadius: 10
            }, {
                label: 'Humidity (%)',
                data: [],
                borderColor: '#00bcd4', // Cyan
                backgroundColor: 'rgba(0, 188, 212, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, boxWidth: 6 }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13 },
                    bodyFont: { size: 13 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    border: { dash: [4, 4] }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    border: { display: false }
                }
            }
        }
    });
}

// --- DEMO DATA GENERATOR (Optional fallback) ---
function generateMockData() {
        // This just fakes data if your localhost isn't running so you can see the UI
    console.warn("Generating MOCK data for demo purposes because localhost failed.");
    const now = new Date();
    const mockData = [
        { device_id: 'ESP32_Filter_A1', temperature: (60 + Math.random() * 5).toFixed(1), humidity: (40 + Math.random() * 2).toFixed(1), pressure: 1012, timestamp: now.toISOString() },
        { device_id: 'ESP32_Filter_B2', temperature: (55 + Math.random() * 5).toFixed(1), humidity: (45 + Math.random() * 2).toFixed(1), pressure: 1015, timestamp: now.toISOString() }
    ];
    processData(mockData);
    statusDot.className = 'w-3 h-3 rounded-full bg-yellow-500'; // Yellow for demo mode
    lastUpdatedSpan.textContent = `Demo Mode active`;
}