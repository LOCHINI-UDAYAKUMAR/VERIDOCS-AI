import crypto from 'crypto';
import getDb from './db';

/**
 * VeriDocs uses a local, append-only SHA-256 hash chain to simulate the
 * "Module 8: Blockchain Verification Layer" described in the spec.
 *
 * Each document version becomes a "block". A block's hash is a function of:
 *   - the document's own SHA-256 content hash
 *   - the previous block's hash (chain linkage)
 *   - owner, version, timestamp
 *
 * This gives the same tamper-evidence guarantee a private blockchain would
 * give for this use case (any edit to historical data breaks the chain),
 * without requiring an external Ethereum node. To swap in a *real* chain,
 * replace `appendBlock` with a call to a deployed smart contract (see
 * README -> "Going to production") and keep the same function signature.
 */

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256String(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function computeBlockHash({ documentHash, previousBlockHash, timestamp, ownerId, version }) {
  return sha256String(`${documentHash}|${previousBlockHash}|${timestamp}|${ownerId}|${version}`);
}

export function getLatestBlock() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM chain_blocks ORDER BY idx DESC LIMIT 1').get();
  return row || null;
}

const GENESIS_HASH = sha256String('VERIDOCS_GENESIS_BLOCK');

export function appendBlock({ documentId, documentHash, ownerId, version }) {
  const db = getDb();
  const prev = getLatestBlock();
  const previousBlockHash = prev ? prev.blockHash : GENESIS_HASH;
  const timestamp = new Date().toISOString();
  const blockHash = computeBlockHash({ documentHash, previousBlockHash, timestamp, ownerId, version });

  const stmt = db.prepare(`
    INSERT INTO chain_blocks (documentId, documentHash, previousBlockHash, blockHash, timestamp, ownerId, version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(documentId, documentHash, previousBlockHash, blockHash, timestamp, ownerId, version);
  return { idx: info.lastInsertRowid, documentHash, previousBlockHash, blockHash, timestamp };
}

// Recomputes the entire chain from genesis and verifies no block was altered.
export function verifyChainIntegrity() {
  const db = getDb();
  const blocks = db.prepare('SELECT * FROM chain_blocks ORDER BY idx ASC').all();
  let expectedPrev = GENESIS_HASH;
  for (const b of blocks) {
    if (b.previousBlockHash !== expectedPrev) {
      return { valid: false, brokenAtIndex: b.idx };
    }
    const recomputed = computeBlockHash({
      documentHash: b.documentHash,
      previousBlockHash: b.previousBlockHash,
      timestamp: b.timestamp,
      ownerId: b.ownerId,
      version: b.version
    });
    if (recomputed !== b.blockHash) {
      return { valid: false, brokenAtIndex: b.idx };
    }
    expectedPrev = b.blockHash;
  }
  return { valid: true, blockCount: blocks.length };
}

// Verifies a specific document's current file hash against its recorded block.
export function verifyDocumentAgainstChain(documentId, currentHash) {
  const db = getDb();
  const block = db.prepare(
    'SELECT * FROM chain_blocks WHERE documentId = ? ORDER BY idx DESC LIMIT 1'
  ).get(documentId);
  if (!block) return { verified: false, reason: 'No blockchain record found for this document.' };
  const matches = block.documentHash === currentHash;
  return {
    verified: matches,
    reason: matches ? 'Current file hash matches the immutable ledger record.' : 'File hash does NOT match the ledger record — content has been altered since it was sealed.',
    block
  };
}
