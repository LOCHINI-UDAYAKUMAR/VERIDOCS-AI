/**
 * Full test suite for the VeriDocs smart contract.
 * Uses ganache (in-process Ethereum) + ethers.js — no Hardhat download needed.
 * Run with: npm run test:contracts
 * Requires: npm run compile:sol first
 */

const { ethers } = require("ethers");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const artifactPath = path.join(__dirname, "../../artifacts/contracts/VeriDocs.sol/VeriDocs.json");
if (!fs.existsSync(artifactPath)) throw new Error("Run `npm run compile:sol` first.");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

const CALL_GAS = { gasLimit: 300_000 }; // enough for any single state-changing call
const DEPLOY_GAS = { gasLimit: 2_000_000 }; // enough for constructor + code deployment 

function bytes32(hex) { return "0x" + hex.padStart(64, "0"); }
function docId(uuid)  { return ethers.keccak256(ethers.toUtf8Bytes(uuid)); }

const HA = bytes32("a".repeat(64));
const HB = bytes32("b".repeat(64));
const HC = bytes32("c".repeat(64));
const DOCID = docId("550e8400-e29b-41d4-a716-446655440000");
const UNKID = docId("ffffffff-ffff-ffff-ffff-ffffffffffff");

// Private keys for 4 deterministic test wallets
const PK = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];

async function assertReverts(promise) {
  try {
    const result = await promise;
    if (result && result.wait) await result.wait();
    assert.fail("Expected revert — transaction succeeded");
  } catch (e) {
    if (e.message && e.message.includes("Expected revert")) throw e;
  }
}

describe("VeriDocs Contract", function () {
  let ganache, provider, deployer, sealerW, orgW, strangerW, contract;

  beforeEach(async function () {
    // Fresh ganache + wallets for every test — eliminates all nonce issues
    const ganacheLib = require("ganache");
    ganache = ganacheLib.server({
      wallet: { accounts: PK.map(pk => ({ secretKey: pk, balance: "0x1BC16D674EC800000" })) },
      logging: { quiet: true },
    });
    await ganache.listen(18547);
    provider  = new ethers.JsonRpcProvider("http://127.0.0.1:18547");
    [deployer, sealerW, orgW, strangerW] = PK.map(pk => new ethers.Wallet(pk, provider));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    contract = await factory.deploy(await sealerW.getAddress(), DEPLOY_GAS);
    await contract.waitForDeployment();
  });

  afterEach(async function () {
    try { await ganache.close(); } catch (e) {}
  });

  const s = () => contract.connect(sealerW);
  const r = () => contract.connect(strangerW);
  const orgAddr = () => orgW.getAddress();

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets sealer address correctly", async function () {
      assert.equal((await contract.sealer()).toLowerCase(), (await sealerW.getAddress()).toLowerCase());
    });

    it("reverts when deployed with zero sealer address", async function () {
      const f = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
      try {
        const c = await f.deploy(ethers.ZeroAddress, DEPLOY_GAS);
        await c.waitForDeployment(); // this throws because status=0
        assert.fail("Expected deployment to revert");
      } catch (e) {
        if (e.message && e.message.includes("Expected deployment")) throw e;
        // Any other error means the constructor reverted — pass
      }
    });
  });

  // ── sealDocument ────────────────────────────────────────────────────────────
  describe("sealDocument", function () {
    it("emits DocumentSealed event", async function () {
      const tx = await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS);
      const receipt = await tx.wait();
      const ev = receipt.logs.find(l => { try { return contract.interface.parseLog(l)?.name === "DocumentSealed"; } catch { return false; } });
      assert.ok(ev, "DocumentSealed not emitted");
      assert.equal(contract.interface.parseLog(ev).args.documentHash, HA);
    });

    it("stores hash, owner, and version", async function () {
      await (await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS)).wait();
      const [hash, owner, version] = await contract.getRecord(DOCID);
      assert.equal(hash, HA);
      assert.equal(owner.toLowerCase(), (await orgAddr()).toLowerCase());
      assert.equal(version.toString(), "1");
    });

    it("allows updating to a new version", async function () {
      await (await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS)).wait();
      await (await s().sealDocument(DOCID, HB, await orgAddr(), 2, CALL_GAS)).wait();
      const [hash, , version] = await contract.getRecord(DOCID);
      assert.equal(hash, HB);
      assert.equal(version.toString(), "2");
    });

    it("reverts when called by a non-sealer", async function () {
      await assertReverts(r().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS));
    });

    it("reverts when documentHash is zero", async function () {
      await assertReverts(s().sealDocument(DOCID, ethers.ZeroHash, await orgAddr(), 1, CALL_GAS));
    });

    it("reverts when owner is zero address", async function () {
      await assertReverts(s().sealDocument(DOCID, HA, ethers.ZeroAddress, 1, CALL_GAS));
    });
  });

  // ── getRecord ───────────────────────────────────────────────────────────────
  describe("getRecord", function () {
    it("reverts for an unsealed document", async function () {
      await assertReverts(contract.getRecord(UNKID));
    });
  });

  // ── verifyDocument ──────────────────────────────────────────────────────────
  describe("verifyDocument", function () {
    beforeEach(async function () {
      await (await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS)).wait();
    });

    it("returns true for matching hash", async function () {
      const [v, reason] = await contract.verifyDocument(DOCID, HA);
      assert.ok(v);
      assert.ok(reason.includes("matches"));
    });

    it("returns false for non-matching hash (tampered file)", async function () {
      const [v, reason] = await contract.verifyDocument(DOCID, HB);
      assert.ok(!v);
      assert.ok(reason.includes("does NOT match"));
    });

    it("returns false for unknown document", async function () {
      const [v] = await contract.verifyDocument(UNKID, HA);
      assert.ok(!v);
    });
  });

  // ── getHistory ──────────────────────────────────────────────────────────────
  describe("getHistory", function () {
    it("returns all historical hashes in order", async function () {
      const oa = await orgAddr();
      await (await s().sealDocument(DOCID, HA, oa, 1, CALL_GAS)).wait();
      await (await s().sealDocument(DOCID, HB, oa, 2, CALL_GAS)).wait();
      await (await s().sealDocument(DOCID, HC, oa, 3, CALL_GAS)).wait();
      const h = await contract.getHistory(DOCID);
      assert.equal(h.length, 3);
      assert.equal(h[0], HA); assert.equal(h[1], HB); assert.equal(h[2], HC);
    });

    it("reverts for unknown document", async function () {
      await assertReverts(contract.getHistory(UNKID));
    });
  });

  // ── exists ──────────────────────────────────────────────────────────────────
  describe("exists", function () {
    it("returns false before sealing", async function () {
      assert.ok(!(await contract.exists(DOCID)));
    });
    it("returns true after sealing", async function () {
      await (await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS)).wait();
      assert.ok(await contract.exists(DOCID));
    });
  });

  // ── Sealer transfer ─────────────────────────────────────────────────────────
  describe("Sealer transfer (two-step)", function () {
    it("completes a two-step transfer correctly", async function () {
      const stAddr = await strangerW.getAddress();
      await (await s().proposeSealerTransfer(stAddr, CALL_GAS)).wait();
      assert.equal((await contract.pendingSealer()).toLowerCase(), stAddr.toLowerCase());
      await (await contract.connect(strangerW).acceptSealerTransfer(CALL_GAS)).wait();
      assert.equal((await contract.sealer()).toLowerCase(), stAddr.toLowerCase());
      assert.equal(await contract.pendingSealer(), ethers.ZeroAddress);
    });

    it("reverts if non-sealer proposes transfer", async function () {
      await assertReverts(r().proposeSealerTransfer(await strangerW.getAddress(), CALL_GAS));
    });

    it("reverts if wrong address accepts transfer", async function () {
      await (await s().proposeSealerTransfer(await strangerW.getAddress(), CALL_GAS)).wait();
      await assertReverts(contract.connect(orgW).acceptSealerTransfer(CALL_GAS));
    });

    it("new sealer can seal after transfer", async function () {
      const stAddr = await strangerW.getAddress();
      await (await s().proposeSealerTransfer(stAddr, CALL_GAS)).wait();
      await (await contract.connect(strangerW).acceptSealerTransfer(CALL_GAS)).wait();
      const tx = await contract.connect(strangerW).sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS);
      const receipt = await tx.wait();
      assert.ok(receipt.status === 1);
    });

    it("old sealer cannot seal after transfer", async function () {
      const stAddr = await strangerW.getAddress();
      await (await s().proposeSealerTransfer(stAddr, CALL_GAS)).wait();
      await (await contract.connect(strangerW).acceptSealerTransfer(CALL_GAS)).wait();
      await assertReverts(s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS));
    });
  });

  // ── Gas estimates ───────────────────────────────────────────────────────────
  describe("Gas estimates", function () {
    it("reports gas used for sealDocument (informational)", async function () {
      const tx = await s().sealDocument(DOCID, HA, await orgAddr(), 1, CALL_GAS);
      const receipt = await tx.wait();
      const used = Number(receipt.gasUsed);
      console.log(`      sealDocument gas used: ${used.toLocaleString()} (~$${(used * 10e9 * 2000 / 1e18).toFixed(4)} at 10gwei/$2000 ETH)`);
      assert.ok(used < 500_000, `Unexpected gas spike: ${used}`);
    });
  });
});
