require("@nomicfoundation/hardhat-toolbox-viem");
// Load .env / .env.local the same way Next.js does, so deploy keys can live in .env.local.
require("@next/env").loadEnvConfig(__dirname);

const key = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = key ? [key.startsWith("0x") ? key : `0x${key}`] : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts,
    },
  },
};
