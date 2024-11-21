const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";
let config;
let useProxy;

const MAX_PING_ERRORS = 3;
const pingInterval = 120000;
const restartDelay = 240000;
const processRestartDelay = 30000;

async function loadConfig(filePath = 'config.json') {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Gagal membaca konfigurasi: ${error.message}`);
        process.exit(1);
    }
}

async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

async function promptUseProxy() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question('Apakah ingin menggunakan proxy? (y/n): ', answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

async function fetchIpAddress(fetch, agent) {
    const response = await fetch(ipServiceUrl, { agent });
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Respon IP fetch:`, data);
    return data.ip;
}

async function registerNode(nodeId, hardwareId, ipAddress, agent, authToken) {
    const fetch = await loadFetch();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    console.log(`[${new Date().toISOString()}] Mendaftarkan node dengan IP: ${ipAddress}, Hardware ID: ${hardwareId}`);
    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
            ipAddress,
            hardwareId
        }),
        agent
    });

    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Respon registrasi:`, data);
    return data;
}

async function startSession(nodeId, agent, authToken) {
    const fetch = await loadFetch();
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] Memulai sesi untuk node ${nodeId}, harap tunggu...`);
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });

    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Respon sesi mulai:`, data);
    return data;
}

async function pingNode(nodeId, agent, ipAddress, authToken, pingErrorCount) {
    const fetch = await loadFetch();
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    const proxyInfo = agent ? JSON.stringify(agent.proxy) : 'Tidak ada proxy';

    console.log(`[${new Date().toISOString()}] Ping node ${nodeId} menggunakan proxy ${proxyInfo}`);
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        },
        agent
    });

    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Status respon ping: ${data.status.toUpperCase()}, NodeID: ${nodeId}, Proxy: ${proxyInfo}, IP: ${ipAddress}`);
    pingErrorCount[nodeId] = 0;
    return data;
}

async function processNode(node, agent, ipAddress, authToken) {
    const pingErrorCount = {};

    while (true) {
        try {
            console.log(`[${new Date().toISOString()}] Memproses nodeId: ${node.nodeId}, hardwareId: ${node.hardwareId}, IP: ${ipAddress}`);

            await registerNode(node.nodeId, node.hardwareId, ipAddress, agent, authToken);
            await startSession(node.nodeId, agent, authToken);

            setInterval(async () => {
                await pingNode(node.nodeId, agent, ipAddress, authToken, pingErrorCount);
            }, pingInterval);

            break;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Terjadi kesalahan untuk nodeId: ${node.nodeId}, memulai ulang proses dalam 50 detik: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, restartDelay));
        }
    }
}

async function runAll(initialRun = true) {
    try {
        if (initialRun) {
            useProxy = await promptUseProxy();
        }

        for (const user of config) {
            for (const node of user.nodes) {
                const agent = useProxy ? new HttpsProxyAgent(node.proxy) : null;
                const ipAddress = useProxy ? await fetchIpAddress(await loadFetch(), agent) : null;

                processNode(node, agent, ipAddress, user.usertoken);
            }
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Terjadi kesalahan: ${error.message}`);
    }
}

(async () => {
    config = await loadConfig();
    await runAll();
})();
