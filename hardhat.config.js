require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-gas-reporter");

try {
  require("dotenv").config({ path: ".env.local" });
} catch (e) {}

const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || "0x" + "0".repeat(64);
const RPC_URL_SEPOLIA = process.env.BLOCKCHAIN_RPC_SEPOLIA || "";
const RPC_URL_POLYGON = process.env.BLOCKCHAIN_RPC_POLYGON || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    hardhat: { chainId: 31337 },
    sepolia: {
      url: RPC_URL_SEPOLIA,
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64) ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    polygon: {
      url: RPC_URL_POLYGON || "https://polygon-rpc.com",
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64) ? [PRIVATE_KEY] : [],
      chainId: 137,
    },
    mainnet: {
      url: process.env.BLOCKCHAIN_RPC_MAINNET || "",
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64) ? [PRIVATE_KEY] : [],
      chainId: 1,
    },
  },

  gasReporter: {
    enabled: true,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },

  paths: {
    sources: "./contracts",
    tests: "./test/blockchain",
    cache: "./cache/hardhat",
    artifacts: "./artifacts",
  },
};
