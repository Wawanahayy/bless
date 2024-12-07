const fs = require('fs').promises;
const axios = require('axios');

// Fungsi delay
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca token dari file user.txt
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim()).filter(token => token.length > 0);
}

// Mengambil data node
async function getNodeData(authToken) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const nodesUrl = `${apiBaseUrl}/nodes`;

    try {
        const response = await axios.get(nodesUrl, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            }
        });

        const data = response.data;
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);
        
        if (validNodes.length === 0) {
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        return { nodeId: node.pubKey, hardwareId: node.hardwareId };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching node data for token`);
        return null;
    }
}

// Memulai sesi node
async function startNodeSession(nodeId, authToken) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start`;

    try {
        const response = await axios.post(startSessionUrl, {}, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            }
        });

        console.log(`[${new Date().toISOString()}] Node session started for NodeId: ${nodeId}`);
        return response.data;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to start node session for NodeId: ${nodeId}`);
        return null;
    }
}

// Fungsi Ping Node
async function pingNode(nodeId, hardwareId, authToken, accountIndex) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const pingUrl = `${apiBaseUrl}/ping`;

    try {
        await axios.post(pingUrl, { nodeId, hardwareId }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            }
        });

        console.log(`[${new Date().toISOString()}] Ping successful (Account ${accountIndex}) | NodeId: ${nodeId}`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed (Account ${accountIndex}) | NodeId: ${nodeId}`);
    }
}

// Fungsi utama
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token dari file

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account ${i + 1}`);

            // Ambil data node
            const nodeData = await getNodeData(authToken);
            if (nodeData) {
                const { nodeId, hardwareId } = nodeData;

                // Memulai sesi node
                await startNodeSession(nodeId, authToken);

                // Ping node
                await pingNode(nodeId, hardwareId, authToken, i + 1);
            }

            // Delay 3 detik antar akun
            if (i < authTokens.length - 1) {
                await delay(3000);
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully`);
        console.log(`[${new Date().toISOString()}] Waiting for 5 minutes before next round...`);
        
        // Delay 5 menit sebelum mengulang proses
        await delay(5 * 60 * 1000);
        await runAll(); // Panggil ulang fungsi
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred: ${error.message}`);
    }
}

// Menjalankan proses utama
runAll();
