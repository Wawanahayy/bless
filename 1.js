const fs = require('fs').promises;
const axios = require('axios');
const os = require('os');

// Fungsi untuk memuat `node-fetch` secara dinamis
async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

// Fungsi delay untuk menunggu beberapa waktu
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    try {
        const data = await fs.readFile('user.txt', 'utf-8');
        return data.split('\n').map(token => token.trim()).filter(Boolean);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error membaca file user.txt:`, error);
        throw error;
    }
}

// Mengambil data node untuk setiap akun
async function getNodeData(authToken, retryCount = 3) {
    const nodesUrl = `${apiBaseUrl}/nodes`;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            console.log(`[${new Date().toISOString()}] Fetching node information for token: ${authToken}, Attempt: ${attempt}`);
            const fetch = await loadFetch();
            const response = await fetch(nodesUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);

            if (validNodes.length === 0) {
                console.warn(`[${new Date().toISOString()}] No valid node found for token: ${authToken}`);
                continue;
            }

            const { pubKey: nodeId, hardwareId } = validNodes[0];
            console.log(`[${new Date().toISOString()}] Node data retrieved: Node ID: ${nodeId}, Hardware ID: ${hardwareId}`);
            return { nodeId, hardwareId };
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching node data for token ${authToken}:`, error);

            if (attempt < retryCount) {
                console.log(`[${new Date().toISOString()}] Retrying in 5 seconds...`);
                await delay(5000);
            } else {
                console.error(`[${new Date().toISOString()}] Max retry attempts reached for token ${authToken}`);
                throw error;
            }
        }
    }
}

// Mendaftar node untuk setiap akun
async function registerNode(nodeId, hardwareId, authToken) {
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    const ipAddress = await fetchIpAddress();

    console.log(`[${new Date().toISOString()}] Registering node with IP: ${ipAddress}, Hardware ID: ${hardwareId}`);

    try {
        const fetch = await loadFetch();
        const response = await fetch(registerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ ipAddress, hardwareId }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error during registration! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[${new Date().toISOString()}] Registration successful for node ${nodeId}:`, data);
        return data;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during node registration for token ${authToken}:`, error);
        throw error;
    }
}

// Memulai sesi untuk node
async function startSession(nodeId, authToken) {
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;

    console.log(`[${new Date().toISOString()}] Starting session for node ${nodeId}`);
    try {
        const fetch = await loadFetch();
        const response = await fetch(startSessionUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error during start session! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[${new Date().toISOString()}] Session started successfully for node ${nodeId}:`, data);
        return data;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error starting session for node ${nodeId}:`, error);
        throw error;
    }
}

// Fungsi utama untuk menjalankan semua proses
async function runAll() {
    try {
        const authTokens = await readAuthTokens();
        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account ${i + 1}/${authTokens.length}: Token: ${authToken}`);

            const { nodeId, hardwareId } = await getNodeData(authToken);
            await registerNode(nodeId, hardwareId, authToken);
            await startSession(nodeId, authToken);

            // Delay antar akun
            if (i < authTokens.length - 1) {
                console.log(`[${new Date().toISOString()}] Waiting 3 seconds before processing the next account...`);
                await delay(3000);
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred:`, error);
    }
}

// Menjalankan fungsi utama
runAll();
