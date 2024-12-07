const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalk = require('chalk');
const readline = require('readline');
const config = require('./config');

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrls = [
    "https://tight-block-2413.txlabs.workers.dev",
    "https://api64.ipify.org?format=json"
];
let useProxy;

const colors = {
    reset: chalk.reset,
    bright: chalk.bold,
    dim: chalk.dim,
    dynamic: (hex) => chalk.hex(hex),
    success: chalk.greenBright,
    error: chalk.redBright,
    warning: chalk.yellowBright,
    info: chalk.cyanBright,
    header: chalk.hex('#FFD700'),
    timestamp: chalk.hex('#4682B4'),
    id: chalk.hex('#FF69B4'),
    ip: chalk.hex('#9370DB'),
};

function logStyled(message, style = colors.info, prefix = '', suffix = '') {
    console.log(`${colors.timestamp(`[${new Date().toISOString()}]`)} ${prefix}${style(message)}${suffix}`);
}

function logSection(title) {
    console.log(colors.dim('────────────────────────────────────────────'));
    console.log(colors.header(`📌 ${title}`));
    console.log(colors.dim('────────────────────────────────────────────'));
}

function displayHeader() {
    console.log(colors.header('╔════════════════════════════════════════╗'));
    console.log(colors.header('║              WELCOME TO                ║'));
    console.log(colors.header('║           JAWA PRIDE AIRDROP           ║'));
    console.log(colors.header('║                                        ║'));
    console.log(colors.header('╚════════════════════════════════════════╝'));
    console.log();
}

async function promptUseProxy() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        rl.question('Apakah menggunakan proxy? (y/n): ', answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}

async function loadFetch() {
    const fetch = require('node-fetch');
    return fetch;
}

// Mengambil IP dengan fallback
async function fetchIpAddressWithFallback(fetch, agent) {
    for (const url of ipServiceUrls) {
        try {
            const response = await fetch(url, { agent });
            const data = await response.json();
            logStyled(`IP address ditemukan: ${data.ip}`, colors.ip, `🔗 Sumber: ${url}`, ' ✅');
            return data.ip;
        } catch (error) {
            logStyled(`Layanan IP gagal: ${error.message} (Sumber: ${url})`, colors.error, '', ' ❌');
        }
    }
    throw new Error("Semua layanan IP tidak tersedia");
}

// Mengelola pendaftaran node
async function registerNode(nodeId, hardwareId, ipAddress, proxy, authToken) {
    const fetch = await loadFetch();
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;

    logSection('Pendaftaran Node');
    logStyled(`Node ID: ${nodeId}`, colors.id, '', ' ⏳');
    try {
        const response = await fetch(registerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ ipAddress, hardwareId }),
            agent,
        });
        const data = await response.json();
        logStyled(`Pendaftaran node berhasil`, colors.success);
        return data;
    } catch (error) {
        logStyled(`Pendaftaran gagal: ${error.message}`, colors.error);
        throw error;
    }
}

// Memulai sesi
async function startSession(nodeId, proxy, authToken) {
    const fetch = await loadFetch();
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    const sessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;

    logSection('Memulai Sesi');
    logStyled(`Memulai sesi node: ${nodeId}`, colors.id, '', ' ⏳');
    try {
        const response = await fetch(sessionUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
            agent,
        });
        const data = await response.json();
        logStyled(`Sesi berhasil dimulai - Sesi ID: ${data.sessionId}`, colors.success);
        return data;
    } catch (error) {
        logStyled(`Sesi gagal dimulai: ${error.message}`, colors.error);
        throw error;
    }
}

async function pingNode(nodeId, proxy, authToken) {
    const fetch = await loadFetch();
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;

    logStyled(`Ping node: ${nodeId}`, colors.id, '', ' ⏳');
    try {
        const response = await fetch(pingUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
            agent,
        });
        const data = await response.json();
        logStyled(`Ping berhasil`, colors.success);
        return data;
    } catch (error) {
        logStyled(`Ping gagal: ${error.message}`, colors.error);
        throw error;
    }
}

// Proses node secara tidak terbatas
async function processNode(node, proxy, ipAddress, authToken) {
    logSection('Tugas Node');
    let pingCount = 0;

    try {
        await registerNode(node.nodeId, node.hardwareId, ipAddress, proxy, authToken);
        await startSession(node.nodeId, proxy, authToken);

        setInterval(async () => {
            try {
                await pingNode(node.nodeId, proxy, authToken);
                pingCount++;
                logStyled(`Jumlah ping berhasil: ${pingCount}`, colors.info);
            } catch (error) {
                logStyled(`Ping gagal: ${error.message}`, colors.warning);
            }
        }, 60000);
    } catch (error) {
        logStyled(`Tugas node gagal: ${error.message}`, colors.error);
        throw error;
    }
}

async function runAll() {
    displayHeader();
    useProxy = await promptUseProxy();

    for (const user of config) {
        for (const node of user.nodes) {
            const proxy = useProxy ? node.proxy : null;
            try {
                const ipAddress = proxy
                    ? await fetchIpAddressWithFallback(await loadFetch(), proxy ? new HttpsProxyAgent(proxy) : null)
                    : null;

                await processNode(node, proxy, ipAddress, user.usertoken);
            } catch (error) {
                logStyled(`Node ${node.nodeId} dilewati: ${error.message}`, colors.error);
            }
        }
    }
}

runAll();
