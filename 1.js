const fs = require('fs').promises;
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsAgent } = require('https-proxy-agent');
const { HttpAgent } = require('http-proxy-agent');

// Fungsi delay untuk menunggu beberapa waktu
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim()).filter(token => token.length > 0);  // Filter empty tokens
}

// Membaca proxy dari file proxy.txt
async function readProxies() {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    return data.split('\n').map(proxy => proxy.trim()).filter(proxy => proxy.length > 0);  // Filter empty proxies
}


// Fungsi untuk mendapatkan konfigurasi proxy
function getProxyConfig(proxy) {
    const [protocol, rest] = proxy.split('://');
    const [auth, host] = rest.split('@');
    const [username, password] = auth.split(':');
    const [ip, port] = host.split(':');

    let agent;
    const proxyUrl = `${protocol}://${ip}:${port}`;

    if (protocol === 'http' || protocol === 'https') {
        agent = new axios.Agent({ 
            protocol: `${protocol}:`, 
            host: ip, 
            port: parseInt(port),
            auth: { username, password }
        });
    } else if (protocol === 'socks5') {
        agent = new SocksProxyAgent(proxyUrl);
    } else {
        throw new Error(`Unsupported proxy protocol: ${protocol}`);
    }

    return { httpAgent: agent, httpsAgent: agent };
}

// Mengambil data node untuk setiap akun
// Mengambil data node untuk setiap akun
async function getNodeData(authToken, proxy) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const nodesUrl = `${apiBaseUrl}/nodes`;

    const proxyConfig = getProxyConfig(proxy); // Konfigurasi proxy

    try {
        const response = await axios.get(nodesUrl, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            ...proxyConfig // Tambahkan konfigurasi proxy pada permintaan
        });

        const data = response.data;
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);

        if (validNodes.length === 0) {
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        return { nodeId: node.pubKey, hardwareId: node.hardwareId };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching node data for token: ${error.message}`);
        console.error(error.stack); // Log stack trace untuk debugging
        return null;
    }
}

// Fungsi untuk ping node dengan benar
async function pingNode(nodeId, hardwareId, authToken, accountIndex, proxy) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const pingUrl = `${apiBaseUrl}/ping`;

    const proxyConfig = getProxyConfig(proxy); // Konfigurasi proxy

    try {
        const response = await axios.post(pingUrl, {
            nodeId,
            hardwareId,
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            ...proxyConfig // Tambahkan konfigurasi proxy pada permintaan
        });

        console.log(`[${new Date().toISOString()}] Ping successful for token: (Account ${accountIndex}) | NodeId: ${nodeId}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed for token: (Account ${accountIndex}) | NodeId: ${nodeId}`);
    }
}

// Fungsi utama untuk menjalankan semua akun secara paralel dengan delay antar akun
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi
        const proxies = await readProxies(); // Membaca proxy dari proxy.txt

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            const proxy = proxies[i % proxies.length]; // Pilih proxy berdasarkan urutan

            console.log(`[${new Date().toISOString()}] Processing account ${i + 1} with token`);

            const nodeData = await getNodeData(authToken, proxy);
            if (nodeData) {
                const { nodeId, hardwareId } = nodeData;
                await pingNode(nodeId, hardwareId, authToken, i + 1, proxy); // Lakukan ping setelah mengambil NodeId dan HardwareId
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
        await runAll(); // Call it again after delay (this can be adjusted if you need an exit condition)
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred: ${error.message}`);
        console.error(error.stack); // Menampilkan stack trace untuk debugging lebih lanjut
    }
}

runAll();
