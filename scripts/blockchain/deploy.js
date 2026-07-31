/**
 * Deploys the VeriDocs contract and writes the resulting address +
 * ABI to lib/contractArtifact.json so the rest of the app can import
 * it without any build step.
 *
 * Usage:
 *
 *   # Local Hardhat node (start node first in another terminal):
 *   npx hardhat node
 *   npx hardhat run scripts/blockchain/deploy.js --network localhost
 *
 *   # Sepolia testnet (set BLOCKCHAIN_PRIVATE_KEY + BLOCKCHAIN_RPC_SEPOLIA in .env.local):
 *   npx hardhat run scripts/blockchain/deploy.js --network sepolia
 *
 *   # Polygon mainnet:
 *   npx hardhat run scripts/blockchain/deploy.js --network polygon
 *
 * After deployment:
 *   1. lib/contractArtifact.json is updated automatically.
 *   2. Add CONTRACT_ADDRESS=<address> to .env.local.
 *   3. Set BLOCKCHAIN_PROVIDER=ethereum in .env.local to switch the
 *      live pipeline from the SQLite hash-chain to the real contract.
 *   4. Optionally verify on Etherscan/Polygonscan:
 *      npx hardhat verify --network sepolia <address> <sealer-address>
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying VeriDocs to network: ${network.name}`);
  console.log(`Deployer address:  ${deployer.address}`);
  console.log(
    `Deployer balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`
  );

  // The sealer is the deployer by default. In production, change this to
  // a dedicated hot-wallet address funded with gas, or a multi-sig.
  const sealerAddress = process.env.BLOCKCHAIN_SEALER_ADDRESS || deployer.address;
  console.log(`Sealer address:    ${sealerAddress}`);

  const VeriDocs = await ethers.getContractFactory("VeriDocs");
  const contract = await VeriDocs.deploy(sealerAddress);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`\n✓ VeriDocs deployed at: ${contractAddress}`);

  // Get the ABI from the compiled artifact
  const artifactPath = path.join(
    __dirname,
    "../../artifacts/contracts/VeriDocs.sol/VeriDocs.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  // Write a slim artifact file the app can import directly
  const appArtifact = {
    address: contractAddress,
    network: network.name,
    chainId: network.config.chainId || (await ethers.provider.getNetwork()).chainId,
    deployedAt: new Date().toISOString(),
    sealer: sealerAddress,
    abi: artifact.abi,
  };

  const outPath = path.join(__dirname, "../../lib/contractArtifact.json");
  fs.writeFileSync(outPath, JSON.stringify(appArtifact, null, 2));
  console.log(`✓ Artifact written to lib/contractArtifact.json`);

  console.log(`\nNext steps:`);
  console.log(`  1. Add to .env.local:`);
  console.log(`       CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`       BLOCKCHAIN_PROVIDER=ethereum`);
  console.log(`       BLOCKCHAIN_RPC_URL=<your RPC URL>`);
  console.log(`       BLOCKCHAIN_PRIVATE_KEY=<sealer private key>`);
  console.log(`  2. Run: npm run build && npm start`);
  console.log(
    `  3. Verify on explorer: npx hardhat verify --network ${network.name} ${contractAddress} ${sealerAddress}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
