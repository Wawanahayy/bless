const fs = require('fs').promises;
const axios = require('axios');
const readline = require('readline');
const SocksProxyAgent = require('axios-socks5-agent'); // Import untuk SOCKS5 Proxy

// Fungsi delay untuk menunggu beberapa waktu
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Membaca semua token otentikasi dari file
async function readAuthTokens() {
    const data = await fs.readFile('user.txt', 'utf-8');
    return data.split('\n').map(token => token.trim()).filter(token => token.length > 0);  // Filter empty tokens
}

// Membaca daftar proxy dari file
async function readProxyList() {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    return data.split('\n').map(proxy => proxy.trim()).filter(proxy => proxy.length > 0);
}

// Fungsi untuk membuat konfigurasi axios dengan atau tanpa proxy SOCKS5
function getAxiosConfig(authToken, proxy) {
    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };

    const config = {
        headers: headers
    };

    if (proxy) {
        // Parsing SOCKS5 proxy dari format "socks5://username:password@ip:port"
        const proxyUrl = new URL(proxy);
        const agent = new SocksProxyAgent(proxy);
        config.httpsAgent = agent; // Menggunakan SOCKS5 proxy dengan axios
    }

    return config;
}

// Mengambil data node untuk setiap akun
async function getNodeData(authToken, proxy) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const nodesUrl = `${apiBaseUrl}/nodes`;

    try {
        const config = getAxiosConfig(authToken, proxy);
        const response = await axios.get(nodesUrl, config);

        const data = response.data;
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);

        if (validNodes.length === 0) {
            throw new Error("No valid node found.");
        }

        const node = validNodes[0];
        return { nodeId: node.pubKey, hardwareId: node.hardwareId };
    } catch (error) {
        console.error(`Error fetching node data for token`);
        return null;
    }
}

// Fungsi untuk ping node dengan benar
async function pingNode(nodeId, hardwareId, authToken, accountIndex, proxy) {
    const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
    const pingUrl = `${apiBaseUrl}/ping`;

    try {
        const config = getAxiosConfig(authToken, proxy);
        const response = await axios.post(pingUrl, {
            nodeId,
            hardwareId,
        }, config);

        console.log(`[${new Date().toISOString()}] Ping successful for token: (Account ${accountIndex}) | NodeId: ${nodeId}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Ping failed for token: (Account ${accountIndex}) | NodeId: ${nodeId}`);
    }
}

// Fungsi untuk menanyakan apakah ingin menggunakan proxy
async function askUseProxy(accountIndex) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`Do you want to use a proxy for Account ${accountIndex}? (y/n): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

// Fungsi utama untuk menjalankan semua akun secara paralel dengan delay antar akun
async function runAll() {
    try {
        const authTokens = await readAuthTokens(); // Membaca semua token otentikasi
        const proxies = await readProxyList(); // Membaca daftar proxy
        let proxyIndex = 0; // Indeks untuk proxy (jika digunakan)

        for (let i = 0; i < authTokens.length; i++) {
            const authToken = authTokens[i];
            console.log(`[${new Date().toISOString()}] Processing account ${i + 1} with token`);

            const useProxy = await askUseProxy(i + 1); // Tanyakan apakah menggunakan proxy untuk akun ini
            const proxy = useProxy && proxies[proxyIndex] ? proxies[proxyIndex] : null; // Pilih proxy jika tersedia dan diinginkan

            const nodeData = await getNodeData(authToken, proxy);
            if (nodeData) {
                const { nodeId, hardwareId } = nodeData;
                await pingNode(nodeId, hardwareId, authToken, i + 1, proxy); // Lakukan ping dengan proxy jika dipilih
            }

            // Menunggu 3 detik setelah memproses setiap akun
            if (i < authTokens.length - 1) {
                await delay(3000); // Menunggu 3 detik sebelum melanjutkan ke akun berikutnya
            }

            // Jika menggunakan proxy, beralih ke proxy berikutnya di daftar
            if (useProxy) {
                proxyIndex = (proxyIndex + 1) % proxies.length; // Mengatur proxy berikutnya dari daftar
            }
        }

        console.log(`[${new Date().toISOString()}] All accounts processed successfully`);

        // Menunggu 5 menit setelah setiap ping selesai, sebelum melanjutkan ke ping berikutnya
        console.log(`[${new Date().toISOString()}] Waiting for 5 minutes before next ping...`);
        await delay(5 * 60 * 1000); // Delay 5 menit untuk ping berikutnya

        console.log(`[${new Date().toISOString()}] Restarting ping for next round...`);
        await runAll(); // Call it again after delay (this can be adjusted if you need an exit condition)
    } catch (error) {
        console.error(`[${new Date().toISOString()}] An error occurred`);
    }
}

runAll();
