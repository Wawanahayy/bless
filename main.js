const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";
let useProxy;
const MAX_PING_ERRORS = 3;
const pingInterval = 120000;
const restartDelay = 240000;
const processRestartDelay = 30000;

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

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const text = await response.text();
        console.error(`[${new Date().toISOString()}] Gagal parsing JSON. Respon teks:`, text);
        throw new Error(`Respon JSON tidak valid: ${text}`);
    }

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

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const text = await response.text();
        console.error(`[${new Date().toISOString()}] Gagal parsing JSON. Respon teks:`, text);
        throw new Error(`Respon JSON tidak valid: ${text}`);
    }

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

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const text = await response.text();
        console.error(`[${new Date().toISOString()}] Gagal parsing JSON. Respon teks:`, text);
        pingErrorCount[nodeId] = (pingErrorCount[nodeId] || 0) + 1;
        throw new Error(`Respon JSON tidak valid: ${text}`);
    }

    if (!data.status) {
        console.error(`[${new Date().toISOString()}] 'status' hilang dalam respon data:`, data);
        pingErrorCount[nodeId] = (pingErrorCount[nodeId] || 0) + 1;
        throw new Error(`'status' hilang dalam respon data: ${JSON.stringify(data)}`);
    }

    console.log(`[${new Date().toISOString()}] Status respon ping: ${data.status.toUpperCase()}, NodeID: ${nodeId}, Proxy: ${proxyInfo}, IP: ${ipAddress}`);
    pingErrorCount[nodeId] = 0;
    return data;
}

async function displayHeader() {
    console.log("Mengunduh dan menjalankan skrip display...");
    const { exec } = await import('child_process');
    exec("curl -s https://raw.githubusercontent.com/Wawanahayy/JawaPride-all.sh/refs/heads/main/display.sh | bash");
}

const activeNodes = new Set();
const nodeIntervals = new Map();

async function processNode(node, agent, ipAddress, authToken) {
    const pingErrorCount = {};
    let intervalId = null;

    while (true) {
        try {
            if (activeNodes.has(node.nodeId)) {
                console.log(`[${new Date().toISOString()}] Node ${node.nodeId} sedang diproses.`);
                return;
            }

            activeNodes.add(node.nodeId);
            console.log(`[${new Date().toISOString()}] Memproses nodeId: ${node.nodeId}, hardwareId: ${node.hardwareId}, IP: ${ipAddress}`);

            const registrationResponse = await registerNode(node.nodeId, node.hardwareId, ipAddress, agent, authToken);
            console.log(`[${new Date().toISOString()}] Registrasi node selesai untuk nodeId: ${node.nodeId}. Respon:`, registrationResponse);

            const startSessionResponse = await startSession(node.nodeId, agent, authToken);
            console.log(`[${new Date().toISOString()}] Sesi dimulai untuk nodeId: ${node.nodeId}. Respon:`, startSessionResponse);

            console.log(`[${new Date().toISOString()}] Mengirim ping awal untuk nodeId: ${node.nodeId}`);
            await pingNode(node.nodeId, agent, ipAddress, authToken, pingErrorCount);

            if (!nodeIntervals.has(node.nodeId)) {
                intervalId = setInterval(async () => {
                    try {
                        console.log(`[${new Date().toISOString()}] Mengirim ping untuk nodeId: ${node.nodeId}`);
                        await pingNode(node.nodeId, agent, ipAddress, authToken, pingErrorCount);
                    } catch (error) {
                        console.error(`[${new Date().toISOString()}] Kesalahan saat ping: ${error.message}`);

                        pingErrorCount[node.nodeId] = (pingErrorCount[node.nodeId] || 0) + 1;
                        if (pingErrorCount[node.nodeId] >= MAX_PING_ERRORS) {
                            clearInterval(nodeIntervals.get(node.nodeId));
                            nodeIntervals.delete(node.nodeId);
                            activeNodes.delete(node.nodeId);
                            console.error(`[${new Date().toISOString()}] Ping gagal ${MAX_PING_ERRORS} kali berturut-turut untuk nodeId: ${node.nodeId}. Memulai ulang...`);
                            await new Promise(resolve => setTimeout(resolve, processRestartDelay));
                            await processNode(node, agent, ipAddress, authToken);
                        }
                        throw error;
                    }
                }, pingInterval);
                nodeIntervals.set(node.nodeId, intervalId);
            }

            break;

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Terjadi kesalahan untuk nodeId: ${node.nodeId}, memulai ulang proses dalam 50 detik: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, restartDelay));
        } finally {
            activeNodes.delete(node.nodeId);
        }
    }
}

async function runAll(initialRun = true) {
    try {
        if (initialRun) {
            await displayHeader();
            useProxy = await promptUseProxy();
        }

        // Perulangan untuk semua node dalam konfigurasi
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

process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Exception tak tertangkap: ${error.message}`);
    runAll(false);
});

runAll();
