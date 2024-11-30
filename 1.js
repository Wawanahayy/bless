const fs = require('fs').promises;

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

// Fungsi delay
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data
        .split('\n')
        .map(token => token.trim())
        .filter(token => token.length > 0); // Hanya token yang valid
}

// Fungsi untuk mengambil IP Address
async function fetchIpAddress() {
    const fetch = await loadFetch();
    const response = await fetch(ipServiceUrl);
    const data = await response.json();
    return data.ip;
}

// Mengambil data node untuk setiap akun
async function getNodeData(authToken) {
    const nodesUrl = `${apiBaseUrl}/nodes`;

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
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);

        if (validNodes.length === 0) {
            console.error(`[${new Date().toISOString()}] No valid node found for token: ${authToken}`);
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        return { nodeId: node.pubKey, hardwareId: node.hardwareId };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching node data for token: ${authToken}:`, error);
        return null; // Mengembalikan null jika terjadi error
    }
}

// Fungsi untuk melakukan ping dengan menggunakan nodeId, hardwareId, dan authToken
async function pingNode(nodeId, hardwareId, authToken) {
    const fetch = await loadFetch();
    const pingUrl = `${apiBaseUrl}/ping`;

    try {
        const response = await fetch(pingUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                nodeId,
                hardwareId
            }),
        });

        if (!response.ok) {
            console.error(`[${new Date().toISOString()}] Ping failed for token: ${authToken}, NodeId: ${nodeId}`);
        } else {
            console.log(`[${new Date().toISOString()}] Ping successful for token: ${authToken}, NodeId: ${nodeId}`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error pinging node for token: ${authToken}, NodeId: ${nodeId}`, error);
    }
}

// Fungsi utama untuk menjalankan semua akun
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account with authToken: ${authToken}`);

            // Validasi token sebelum memproses
            if (!authToken) {
                console.error(`[${new Date().toISOString()}] Skipping invalid or empty token.`);
                continue;
            }

            const nodeData = await getNodeData(authToken);
            if (!nodeData) {
                console.error(`[${new Date().toISOString()}] Skipping account due to failure in fetching node data.`);
            } else {
                const { nodeId, hardwareId } = nodeData;
                console.log(`[${new Date().toISOString()}] Retrieved NodeId: ${nodeId}, HardwareId: ${hardwareId}`);

                // Lakukan ping setelah mengambil NodeId dan HardwareId
                await pingNode(nodeId, hardwareId, authToken);
            }

            // Menunggu 3 detik setelah memproses setiap akun
            if (i < authTokens.length - 1) {
                console.log(`[${new Date().toISOString()}] Waiting for 3 seconds before processing next account...`);
                await delay(3000); // Menunggu 3 detik
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully`);

        // Setelah semua akun diproses, lakukan ping ke semua akun
        console.log(`[${new Date().toISOString()}] All accounts have been pinged.`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred:`, error);
    }
}

runAll();
