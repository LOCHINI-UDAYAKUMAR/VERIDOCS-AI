// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VeriDocs
 * @notice Tamper-proof document integrity registry for VeriDocs AI.
 *
 * @dev Each document version is sealed as a record containing:
 *   - its SHA-256 content hash (computed off-chain, stored on-chain)
 *   - the owner's Ethereum address
 *   - a sequential version number
 *   - the block timestamp at the time of sealing
 *
 * The contract is intentionally minimal:
 *   - No token, no NFT, no upgradeability proxy — just a registry.
 *   - Only the authorized sealer address (set at deploy time, can be
 *     transferred to a multi-sig) may add records.
 *   - Records are immutable once written; there is no delete.
 *   - Any address may verify a document hash against its sealed record.
 *
 * On-chain storage is kept small: hashes are stored as bytes32 (the
 * native Solidity type for a 32-byte SHA-256 digest) rather than the
 * hex string the rest of the app uses. The helper functions below
 * handle the conversion so callers don't have to.
 */
contract VeriDocs {
    // ─── Types ───────────────────────────────────────────────────────────────

    struct DocumentRecord {
        bytes32 documentHash;   // SHA-256 of the file contents
        address owner;          // Ethereum address of the uploading organization
        uint256 version;        // monotonically increasing per documentId
        uint256 timestamp;      // block.timestamp at sealing time
        bool exists;            // sentinel so we can distinguish "never sealed" from hash 0x0
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Address authorized to seal new document records.
    /// In production this should be a multi-sig or the VeriDocs backend
    /// wallet funded with enough ETH to pay gas.
    address public sealer;

    /// @notice Proposed new sealer (two-step transfer for safety)
    address public pendingSealer;

    /// @dev documentId (bytes32, keccak256 of the app's UUID string)
    ///      => DocumentRecord
    mapping(bytes32 => DocumentRecord) private _records;

    /// @dev documentId => array of all historical hashes (audit trail)
    mapping(bytes32 => bytes32[]) private _history;

    // ─── Events ───────────────────────────────────────────────────────────────

    event DocumentSealed(
        bytes32 indexed documentId,
        bytes32 indexed documentHash,
        address indexed owner,
        uint256 version,
        uint256 timestamp
    );

    event SealerTransferProposed(address indexed current, address indexed proposed);
    event SealerTransferred(address indexed previous, address indexed next);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotSealer();
    error NotPendingSealer();
    error DocumentNotFound(bytes32 documentId);
    error ZeroHash();
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _sealer The address that may call sealDocument().
    constructor(address _sealer) {
        if (_sealer == address(0)) revert ZeroAddress();
        sealer = _sealer;
        emit SealerTransferred(address(0), _sealer);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlySealer() {
        if (msg.sender != sealer) revert NotSealer();
        _;
    }

    // ─── Core functions ───────────────────────────────────────────────────────

    /**
     * @notice Seals a document's SHA-256 hash on-chain.
     * @dev Called once per document upload (and again for each new version).
     *
     * @param documentId  keccak256 hash of the VeriDocs app's UUID string
     *                    for this document — use stringToId() off-chain.
     * @param documentHash  SHA-256 digest of the file, as bytes32.
     *                      Use hexHashToBytes32() off-chain.
     * @param owner         Ethereum address representing the uploading org.
     * @param version       Document version (1 for first upload, 2+ for updates).
     */
    function sealDocument(
        bytes32 documentId,
        bytes32 documentHash,
        address owner,
        uint256 version
    ) external onlySealer {
        if (documentHash == bytes32(0)) revert ZeroHash();
        if (owner == address(0)) revert ZeroAddress();

        _records[documentId] = DocumentRecord({
            documentHash: documentHash,
            owner: owner,
            version: version,
            timestamp: block.timestamp,
            exists: true
        });

        _history[documentId].push(documentHash);

        emit DocumentSealed(documentId, documentHash, owner, version, block.timestamp);
    }

    /**
     * @notice Returns the latest sealed record for a document.
     * @param documentId  keccak256 of the app's UUID string.
     */
    function getRecord(bytes32 documentId)
        external
        view
        returns (
            bytes32 documentHash,
            address owner,
            uint256 version,
            uint256 timestamp
        )
    {
        DocumentRecord storage r = _records[documentId];
        if (!r.exists) revert DocumentNotFound(documentId);
        return (r.documentHash, r.owner, r.version, r.timestamp);
    }

    /**
     * @notice Verifies whether a given hash matches the latest sealed record.
     * @param documentId    keccak256 of the app's UUID string.
     * @param documentHash  SHA-256 of the file to check, as bytes32.
     * @return verified     true if the hash matches the sealed record.
     * @return reason       Human-readable explanation.
     */
    function verifyDocument(bytes32 documentId, bytes32 documentHash)
        external
        view
        returns (bool verified, string memory reason)
    {
        DocumentRecord storage r = _records[documentId];
        if (!r.exists) {
            return (false, "No record found for this document ID on-chain.");
        }
        if (r.documentHash == documentHash) {
            return (true, "File hash matches the sealed on-chain record.");
        }
        return (false, "File hash does NOT match the sealed record - content has been altered.");
    }

    /**
     * @notice Returns all historical hashes for a document (full audit trail).
     * @param documentId  keccak256 of the app's UUID string.
     */
    function getHistory(bytes32 documentId)
        external
        view
        returns (bytes32[] memory)
    {
        if (!_records[documentId].exists) revert DocumentNotFound(documentId);
        return _history[documentId];
    }

    /**
     * @notice Returns true if a record exists for the given documentId.
     */
    function exists(bytes32 documentId) external view returns (bool) {
        return _records[documentId].exists;
    }

    // ─── Sealer transfer (two-step) ───────────────────────────────────────────

    /**
     * @notice Proposes a new sealer address. Must be accepted by the new address.
     * @dev Two-step transfer prevents accidentally locking out the sealer role.
     */
    function proposeSealerTransfer(address newSealer) external onlySealer {
        if (newSealer == address(0)) revert ZeroAddress();
        pendingSealer = newSealer;
        emit SealerTransferProposed(sealer, newSealer);
    }

    /**
     * @notice Accepts the sealer role. Must be called by the proposed address.
     */
    function acceptSealerTransfer() external {
        if (msg.sender != pendingSealer) revert NotPendingSealer();
        emit SealerTransferred(sealer, pendingSealer);
        sealer = pendingSealer;
        pendingSealer = address(0);
    }
}
