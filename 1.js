const fs = require('fs').promises;
const axios = require('axios');

// Fungsi delay untuk menunggu beberapa waktu
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim());
}

// Mengambil data node untuk setiap akun
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
        console.error(`Error fetching node data for token: ${authToken}:`, error);
        return null;
    }
}

// Fungsi untuk ping node dengan benar
async function pingNode(nodeId, hardwareId, authToken) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const pingUrl = `${apiBaseUrl}/ping`;

    try {
        // Pastikan token dikirim dengan format yang benar dalam header
        const response = await axios.post(pingUrl, {
            nodeId,
            hardwareId,
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,  // Format yang benar
                'Content-Type': 'application/json',
            }
        });

        console.log(`[${new Date().toISOString()}] Ping successful for token: ${authToken}, NodeId: ${nodeId}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed for token: ${authToken}, NodeId: ${nodeId}:`, error);
    }
}


// Fungsi utama untuk menjalankan semua akun secara paralel dengan delay antar akun
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account with authToken: ${authToken}`);

            const nodeData = await getNodeData(authToken);
            if (nodeData) {
                const { nodeId, hardwareId } = nodeData;
                await pingNode(nodeId, hardwareId, authToken); // Lakukan ping setelah mengambil NodeId dan HardwareId
            }

            // Menunggu 3 detik setelah memproses setiap akun
            if (i < authTokens.length - 1) {
                await delay(3000); // Menunggu 3 detik sebelum melanjutkan ke akun berikutnya
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully`);
        
        // Menunggu 5 menit setelah setiap ping selesai, sebelum melanjutkan ke ping berikutnya
        console.log(`[${new Date().toISOString()}] Waiting for 5 minutes before next ping...`);
        await delay(5 * 60 * 1000); // Delay 5 menit untuk ping berikutnya

        console.log(`[${new Date().toISOString()}] Restarting ping for next round...`);
        runAll(); // Mulai lagi ping untuk semua akun
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred:`, error);
    }
}

runAll();
