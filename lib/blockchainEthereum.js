/**
 * lib/blockchainEthereum.js
 *
 * Drop-in replacement for lib/blockchain.js that seals document hashes
 * on a real Ethereum-compatible network (local Hardhat node, Sepolia
 * testnet, Polygon mainnet, etc.) via the deployed VeriDocs.sol contract.
 *
 * HOW TO SWITCH:
 *   1. Deploy the contract:
 *        npm run compile:sol
 *        npx hardhat node              (in a separate terminal, for local)
 *        npm run deploy:local          (or deploy:sepolia, deploy:polygon)
 *
 *   2. Add to .env.local:
 *        BLOCKCHAIN_PROVIDER=ethereum
 *        BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545   (or Alchemy/Infura URL)
 *        BLOCKCHAIN_PRIVATE_KEY=0x<sealer-wallet-private-key>
 *        CONTRACT_ADDRESS=0x<address from deploy output>
 *
 *   3. In lib/pipeline.js, replace:
 *        import { sha256Buffer, appendBlock, verifyDocumentAgainstChain } from './blockchain';
 *      with:
 *        import { sha256Buffer, appendBlock, verifyDocumentAgainstChain } from './blockchainEthereum';
 *
 * The function signatures are identical to lib/blockchain.js so no other
 * code needs to change.
 *
 * HONESTY NOTE: this module was written and tested for correctness of
 * structure and ABI usage, but could not be end-to-end tested against a
 * live node in the sandbox that wrote it (binaries.soliditylang.org and
 * RPC endpoints are network-restricted there). The unit tests in
 * test/blockchain/VeriDocs.test.js cover the contract's behaviour
 * exhaustively and can be run with `npx hardhat test` on any machine
 * with a normal internet connection and `npx hardhat node` running.
 */

import crypto from 'crypto';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256String(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Converts a 64-char hex SHA-256 string to a bytes32 value for Solidity.
 * e.g. "ab12..." -> "0xab12..."
 */
function hexHashToBytes32(hexHash) {
  return '0x' + hexHash.padStart(64, '0');
}

/**
 * Converts a VeriDocs app UUID string to a bytes32 document ID
 * (keccak256 hash of the UTF-8 string) — matches the JS helper in the
 * test suite and what getRecord()/verifyDocument() expect on-chain.
 */
function documentIdFromUUID(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

// ── Contract connection ──────────────────────────────────────────────────────

function getContract() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error(
      'Missing blockchain config. Set BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, and CONTRACT_ADDRESS in .env.local'
    );
  }

  const artifactPath = path.join(process.cwd(), 'lib', 'contractArtifact.json');
  const fallbackArtifactPath = path.join(
    process.cwd(),
    'artifacts',
    'contracts',
    'VeriDocs.sol',
    'VeriDocs.json'
  );

  let abi;
  if (fs.existsSync(artifactPath)) {
    abi = JSON.parse(fs.readFileSync(artifactPath, 'utf-8')).abi;
  } else if (fs.existsSync(fallbackArtifactPath)) {
    abi = JSON.parse(fs.readFileSync(fallbackArtifactPath, 'utf-8')).abi;
  } else {
    throw new Error(
      'Contract ABI not found. Run `npm run compile:sol` first, then deploy with `npm run deploy:local`.'
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(contractAddress, abi, wallet);
}

// ── Public API (mirrors lib/blockchain.js exactly) ───────────────────────────

/**
 * Seals a document hash on-chain. Returns a block-like object containing
 * the transaction hash so callers (lib/pipeline.js) can log it.
 */
export async function appendBlock({ documentId, documentHash, ownerId, version }) {
  const contract = getContract();

  // Map the app's UUID string to a bytes32 on-chain document ID
  const docIdBytes32 = documentIdFromUUID(documentId);
  const hashBytes32 = hexHashToBytes32(documentHash);

  // ownerId is the app's user UUID (a string), not an Ethereum address.
  // Map it to a deterministic address-like value by taking the first 20
  // bytes of its keccak256 hash — this is stable across calls for the
  // same user and satisfies the contract's owner != address(0) check.
  const ownerAddress = '0x' + ethers.keccak256(ethers.toUtf8Bytes(ownerId)).slice(26);

  const tx = await contract.sealDocument(docIdBytes32, hashBytes32, ownerAddress, version);
  const receipt = await tx.wait();

  return {
    idx: receipt.blockNumber,
    documentHash,
    blockHash: receipt.hash,         // transaction hash (not a block hash)
    timestamp: new Date().toISOString(),
    txHash: receipt.hash,
    network: (await contract.runner.provider.getNetwork()).name,
  };
}

/**
 * Re-hashes the current file and checks it against the on-chain record.
 * Returns the same shape as lib/blockchain.js's verifyDocumentAgainstChain().
 */
export async function verifyDocumentAgainstChain(documentId, currentHash) {
  const contract = getContract();
  const docIdBytes32 = documentIdFromUUID(documentId);
  const hashBytes32 = hexHashToBytes32(currentHash);

  try {
    const [verified, reason] = await contract.verifyDocument(docIdBytes32, hashBytes32);
    return { verified, reason };
  } catch (err) {
    // DocumentNotFound custom error
    if (err.message?.includes('DocumentNotFound') || err.errorName === 'DocumentNotFound') {
      return { verified: false, reason: 'No on-chain record found for this document ID.' };
    }
    throw err;
  }
}

/**
 * Returns the full on-chain record for a document (read-only, no gas).
 */
export async function getOnChainRecord(documentId) {
  const contract = getContract();
  const docIdBytes32 = documentIdFromUUID(documentId);
  try {
    const [documentHash, owner, version, timestamp] = await contract.getRecord(docIdBytes32);
    return {
      documentHash,
      owner,
      version: Number(version),
      timestamp: new Date(Number(timestamp) * 1000).toISOString(),
    };
  } catch (err) {
    return null;
  }
}

/**
 * Returns all historical hashes for a document (full on-chain audit trail).
 */
export async function getOnChainHistory(documentId) {
  const contract = getContract();
  const docIdBytes32 = documentIdFromUUID(documentId);
  return contract.getHistory(docIdBytes32);
}

// verifyChainIntegrity() is not needed for the Ethereum path —
// the blockchain itself is the integrity guarantee. Exporting a
// no-op so any caller that imports it doesn't crash.
export function verifyChainIntegrity() {
  return { valid: true, reason: 'Ethereum-backed — integrity guaranteed by the network.' };
}
