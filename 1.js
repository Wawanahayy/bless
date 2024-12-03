const fs = require('fs').promises;
const axios = require('axios');
const readline = require('readline');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

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
        try {
            const proxyAgent = proxy.startsWith('socks5')
                ? new SocksProxyAgent(proxy)
                : new HttpsProxyAgent(proxy);
            axiosConfig.httpAgent = proxyAgent;
            axiosConfig.httpsAgent = proxyAgent;
        } catch (err) {
            console.error(`Invalid proxy format for proxy: ${proxy}`);
            return null;
        }
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

        console.log(`[${new Date().toISOString()}] Ping successful for token: (Account) | NodeId: ${nodeId}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed for token: ${authToken}, NodeId: ${nodeId}:`, error.message);
    }
}

// Fungsi utama untuk menjalankan semua akun secara paralel dengan delay antar akun
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi
        const proxyAnswers = [];

        // Pertanyaan terkait proxy untuk setiap akun
        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            const answer = await askQuestion(`Do you want to use a proxy for Account ${i + 1}? (yes/no): `);
            proxyAnswers.push(answer.trim().toLowerCase() === 'yes');
        }

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            const useProxy = proxyAnswers[i];

            console.log(`[${new Date().toISOString()}] Processing account ${i + 1} with token`);

            let proxy = null;
            if (useProxy) {
                const proxyInput = await askQuestion(`Please enter the proxy for Account ${i + 1} (format: socks5://user:password@ip:port): `);
                proxy = proxyInput.trim();
            }

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
        runAll(); // Mulai lagi ping untuk semua akun
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred: ${error.message}`);
    } finally {
        rl.close();
    }
}

runAll();
