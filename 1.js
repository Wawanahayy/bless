const fs = require('fs').promises;
const axios = require('axios');
const os = require('os');

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

// Mengambil IP address
async function fetchIpAddress() {
    const fetch = await loadFetch();
    const response = await fetch(ipServiceUrl);
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP fetch response:`, data);
    return data.ip;
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim());
}

// Mengambil data node untuk setiap akun
async function getNodeData(authToken) {
    const nodesUrl = `${apiBaseUrl}/nodes`;
    console.log(`[${new Date().toISOString()}] Fetching node information for token: ${authToken}...`);

    try {
        const fetch = await loadFetch();
        const response = await fetch(nodesUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[${new Date().toISOString()}] Data fetched successfully for token: ${authToken}`);

        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);
        if (validNodes.length === 0) {
            console.error(`[${new Date().toISOString()}] No valid node found for token: ${authToken}`);
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        const nodeId = node.pubKey;
        const hardwareId = node.hardwareId;
        console.log(`[${new Date().toISOString()}] Retrieved Node ID (pubKey): ${nodeId}, Hardware ID: ${hardwareId}`);

        return { nodeId, hardwareId };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching node data for token: ${authToken}:`, error);
        console.log(`[${new Date().toISOString()}] Retrying in 5 seconds...`);
        await delay(5000);
        return getNodeData(authToken);
    }
}

// Mendaftar node untuk setiap akun
async function registerNode(nodeId, hardwareId, authToken) {
    const fetch = await loadFetch();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    const ipAddress = await fetchIpAddress(); // Memanggil fungsi fetchIpAddress
    console.log(`[${new Date().toISOString()}] Registering node with IP: ${ipAddress}, Hardware ID: ${hardwareId}`);

    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ ipAddress, hardwareId })
    });

    const textResponse = await response.text();
    let data;
    try {
        data = JSON.parse(textResponse);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to parse JSON for token ${authToken}. Response text:`, textResponse);
        throw error;
    }

    console.log(`[${new Date().toISOString()}] Registration response for token ${authToken}:`, data);
    return data;
}

// Fungsi utama untuk menjalankan semua akun secara paralel dengan delay
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi
        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account with authToken: ${authToken}`);

            const { nodeId, hardwareId } = await getNodeData(authToken); // Ambil data node untuk setiap token
            console.log(`[${new Date().toISOString()}] Retrieved NodeId: ${nodeId}, HardwareId: ${hardwareId}`);

            const registrationResponse = await registerNode(nodeId, hardwareId, authToken); // Registrasi node
            console.log(`[${new Date().toISOString()}] Node registration completed for token ${authToken}. Response:`, registrationResponse);

            // Delay 3 detik antar akun
            if (i < authTokens.length - 1) {
                console.log(`[${new Date().toISOString()}] Waiting for 3 seconds before processing next account...`);
                await delay(3000);
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred:`, error);
    }
}

runAll();
