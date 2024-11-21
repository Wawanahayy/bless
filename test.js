const fs = require('fs').promises;
const axios = require('axios');
const os = require('os');

// Fungsi untuk memuat fetch secara dinamis
async function loadFetch() {
    const fetch = await import('node-fetch').then(module => module.default);
    return fetch;
}

const apiBaseUrl = "https://gateway-run.bls.dev/api/v1";
const ipServiceUrl = "https://tight-block-2413.txlabs.workers.dev";

// Fungsi untuk delay
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk membaca akun dari file user.txt
async function readAccountsFromFile() {
    try {
        const data = await fs.readFile('user.txt', 'utf-8');
        const accounts = data.split('\n').map(account => account.trim()).filter(account => account !== ''); // Menghapus akun kosong
        return accounts;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error reading accounts file:`, error);
        return []; // Mengembalikan array kosong jika ada kesalahan
    }
}

// Fungsi untuk membaca auth token
async function readAuthToken(accountIndex) {
    const data = await fs.readFile('user.txt', 'utf-8');
    const tokens = data.split('\n'); // Memecah data berdasarkan baris
    const token = tokens[accountIndex]?.trim();  // Menggunakan optional chaining untuk menghindari undefined
    if (!token) {
        throw new Error(`Token untuk akun di indeks ${accountIndex} tidak ditemukan atau kosong.`);
    }
    return token;
}

// Fungsi untuk mengambil data node
async function getNodeData(authToken) {
    const nodesUrl = `${apiBaseUrl}/nodes`;
    console.log(`[${new Date().toISOString()}] Fetching node information...`);

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
        console.log(`[${new Date().toISOString()}] Data fetched successfully:`, data);
        
        const validNodes = data.filter(node => node.pubKey.length >= 48 && node.pubKey.length <= 55);
        if (validNodes.length === 0) {
            console.error(`[${new Date().toISOString()}] No valid node found with pubKey length between 48 and 55 characters.`);
            throw new Error("No valid node found.");
        }
        
        const node = validNodes[0];
        const nodeId = node.pubKey;
        const hardwareId = node.hardwareId;
        console.log(`[${new Date().toISOString()}] Retrieved Node ID (pubKey): ${nodeId}, Hardware ID: ${hardwareId}`);
        
        return { nodeId, hardwareId };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching node data:`, error);
        console.log(`[${new Date().toISOString()}] Retrying in 5 seconds...`);
        await delay(5000); 
        return getNodeData(authToken); 
    }
}

// Fungsi untuk mendaftar node
async function registerNode(nodeId, hardwareId) {
    const fetch = await loadFetch();
    const authToken = await readAuthToken();
    const registerUrl = `${apiBaseUrl}/nodes/${nodeId}`;
    const ipAddress = await fetchIpAddress();
    console.log(`[${new Date().toISOString()}] Registering node with IP: ${ipAddress}, Hardware ID: ${hardwareId}`);
    
    const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ ipAddress, hardwareId })
    });

    const textResponse = await response.text(); 
    let data;
    try {
        data = JSON.parse(textResponse); 
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to parse JSON. Response text:`, textResponse);
        throw error;
    }
    
    console.log(`[${new Date().toISOString()}] Registration response:`, data);
    return data;
}

// Fungsi untuk memulai sesi
async function startSession(nodeId) {
    const fetch = await loadFetch();
    const authToken = await readAuthToken();
    const startSessionUrl = `${apiBaseUrl}/nodes/${nodeId}/start-session`;
    console.log(`[${new Date().toISOString()}] Starting session for node ${nodeId}, it might take a while...`);
    
    const response = await fetch(startSessionUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] Start session response:`, data);
    return data;
}

// Fungsi untuk mem-ping node
async function pingNode(nodeId) {
    const fetch = await loadFetch();
    const chalk = await import('chalk');
    const authToken = await readAuthToken();
    const pingUrl = `${apiBaseUrl}/nodes/${nodeId}/ping`;
    console.log(`[${new Date().toISOString()}] Pinging node ${nodeId}`);
    
    const response = await fetch(pingUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`
        }
    });
    
    const data = await response.json();
    const lastPing = data.pings[data.pings.length - 1].timestamp;
    const logMessage = `[${new Date().toISOString()}] Ping response, ID: ${chalk.default.green(data._id)}, NodeID: ${chalk.default.green(data.nodeId)}, Last Ping: ${chalk.default.yellow(lastPing)}`;
    console.log(logMessage);
    
    return data;
}

// Fungsi untuk mem-ping dengan retry
async function pingNodeWithRetry(nodeId) {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            return await pingNode(nodeId);
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
                console.error(`[${new Date().toISOString()}] Max retries reached for nodeId: ${nodeId}`);
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Fungsi untuk mendapatkan alamat IP
async function fetchIpAddress() {
    const fetch = await loadFetch();
    const response = await fetch(ipServiceUrl);
    const data = await response.json();
    console.log(`[${new Date().toISOString()}] IP fetch response:`, data);
    return data.ip;
}

// Fungsi untuk menjalankan skrip loading
async function loading_step() {
    console.log("Mengunduh dan menjalankan skrip display...");
    
    const url = "https://raw.githubusercontent.com/Wawanahayy/JawaPride-all.sh/refs/heads/main/display.sh";
    try {
        const response = await axios.get(url);
        const scriptContent = response.data;
        
        await fs.writeFile("display.sh", scriptContent);
        
        const { exec } = require('child_process');
        exec('bash display.sh', (err, stdout, stderr) => {
            if (err) {
                console.error(`[${new Date().toISOString()}] Error saat menjalankan skrip:`, err);
                return;
            }
            console.log(`[${new Date().toISOString()}] Skrip berjalan dengan sukses:`);
            console.log(stdout);
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error saat mengunduh skrip:`, error);
    }
}

// Fungsi utama untuk menjalankan semua akun
async function runAllForAccounts() {
    const accounts = await readAccountsFromFile(); // Membaca akun dari file secara otomatis
    if (accounts.length === 0) {
        console.error(`[${new Date().toISOString()}] No accounts found in the file.`);
        return; // Jika tidak ada akun, hentikan eksekusi
    }

    for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
        const account = accounts[accountIndex];
        try {
            console.log(`[${new Date().toISOString()}] Running for ${account}...`);
            await loading_step();
            const authToken = await readAuthToken(accountIndex);
            const { nodeId, hardwareId } = await getNodeData(authToken);
            console.log(`[${new Date().toISOString()}] Retrieved NodeId: ${nodeId}, HardwareId: ${hardwareId}`);
            
            const registrationResponse = await registerNode(nodeId, hardwareId);
            console.log(`[${new Date().toISOString()}] Node registration completed. Response:`, registrationResponse);
            
            const startSessionResponse = await startSession(nodeId);
            console.log(`[${new Date().toISOString()}] Session started. Response:`, startSessionResponse);
            
            console.log(`[${new Date().toISOString()}] Sending initial ping...`);
            await pingNodeWithRetry(nodeId);
            
            console.log(`[${new Date().toISOString()}] Finished processing for ${account}.`);
            await delay(1500);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error during processing for ${account}:`, error);
        }
    }
}

runAllForAccounts(); // Mulai menjalankan untuk semua akun secara otomatis.
