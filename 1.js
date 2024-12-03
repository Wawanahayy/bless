const fs = require('fs').promises;
const axios = require('axios');
const readline = require('readline');

// Fungsi delay untuk menunggu beberapa waktu
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim());
}

// Fungsi untuk membaca input dari pengguna
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Fungsi untuk meminta input dan mengonfirmasi dengan yes/no
async function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Membaca proxy dari file proxy.txt
async function readProxy() {
    try {
        const proxyData = await fs.readFile('proxy.txt', 'utf-8');
        return proxyData.trim() ? proxyData.trim() : null;
    } catch (error) {
        console.error("Error reading proxy.txt:", error.message);
        return null;
    }
}

async function getNodeData(authToken, proxy = null) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const nodesUrl = `${apiBaseUrl}/nodes`;

    const axiosConfig = {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        }
    };

    // Jika menggunakan proxy
    if (proxy) {
        const SocksProxyAgent = require('axios-socks5-agent').default;
        const agent = new SocksProxyAgent(proxy);
        axiosConfig.httpAgent = agent;
        axiosConfig.httpsAgent = agent;
    }

    try {
        const response = await axios.get(nodesUrl, axiosConfig);
        const data = response.data;
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);

        if (validNodes.length === 0) {
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        return { nodeId: node.pubKey, hardwareId: node.hardwareId };
    } catch (error) {
        console.error(`Error fetching node data for token: ${authToken}:`, error.message);
        return null;
    }
}


// Fungsi untuk ping node dengan benar
async function pingNode(nodeId, hardwareId, authToken, proxy = null) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const pingUrl = `${apiBaseUrl}/ping`;

    const axiosConfig = {
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        }
    };

    // Jika menggunakan proxy
    if (proxy) {
        const SocksProxyAgent = require('axios-socks5-agent');
        const agent = new SocksProxyAgent(proxy);
        axiosConfig.httpAgent = agent;
        axiosConfig.httpsAgent = agent;
    }

    try {
        const response = await axios.post(pingUrl, {
            nodeId,
            hardwareId,
        }, axiosConfig);

        console.log(`[${new Date().toISOString()}] Ping successful for token: (Account) | NodeId: ${nodeId} | proxy: ${proxy ? 'ACTIVE' : 'NO'}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed for token: ${authToken}, NodeId: ${nodeId}:`, error.message);
    }
}

async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi
        const useProxy = await askQuestion("Do you want to use a proxy for all accounts? (yes/no): ");
        let proxy = null;

        // Jika menggunakan proxy, baca proxy dari file proxy.txt
        if (useProxy.trim().toLowerCase() === 'yes') {
            proxy = await readProxy();
            if (!proxy) {
                console.log("No proxy found in proxy.txt, proceeding without proxy.");
            }
        }

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account ${i + 1} with token`);

            const nodeData = await getNodeData(authToken, proxy);
            if (nodeData) {
                const { nodeId, hardwareId } = nodeData;
                await pingNode(nodeId, hardwareId, authToken, proxy); // Lakukan ping setelah mengambil NodeId dan HardwareId
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
        // Gunakan setInterval atau setTimeout untuk memulai ping lagi, bukan runAll secara rekursif
        setTimeout(runAll, 5 * 60 * 1000); // Menunggu 5 menit dan memulai lagi
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred: ${error.message}`);
    } finally {
        rl.close();
    }
}

runAll();
