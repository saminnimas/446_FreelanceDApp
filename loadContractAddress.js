/* Helpers to load the contract ABI and address (ESM).
   Use via: import { getContractABI, getContractAddress, loadContract } from './temp.js';
*/

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadContractData() {
  try {
    const jsonUrl = new URL('./build/contracts/FreelanceMarketplace.json', import.meta.url).href;
    const mod = await import(jsonUrl, { assert: { type: 'json' } });
    return mod.default ?? mod;
  } catch (e) {
    try {
      const jsonPath = path.join(__dirname, 'build', 'contracts', 'FreelanceMarketplace.json');
      const txt = await fs.readFile(jsonPath, 'utf8');
      return JSON.parse(txt);
    } catch (err) {
      throw new Error('Could not load FreelanceMarketplace.json via import or fs: ' + e.message + ' / ' + err.message);
    }
  }
}

export async function getContractABI() {
  const data = await loadContractData();
  return data.abi;
}

export async function getContractAddress(networkId = 5777) {
  const data = await loadContractData();
  const networks = data.networks || {};
  const address = networks[networkId]?.address || networks[String(networkId)]?.address || Object.values(networks)[0]?.address;
  if (!address) {
    console.warn(`No contract address found for network ${networkId}. Available networks: ${Object.keys(networks).join(', ')}`);
    return null;
  }
  return address;
}

export async function loadContract(networkId = 5777) {
  const [abi, address] = await Promise.all([getContractABI(), getContractAddress(networkId)]);
  return { abi, address };
}

// CLI check: run only when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      const { abi, address } = await loadContract();
      console.log('Loaded contract address:', address);
    } catch (e) {
      console.error('Failed loading contract info:', e.message);
      process.exitCode = 1;
    }
  })();
}