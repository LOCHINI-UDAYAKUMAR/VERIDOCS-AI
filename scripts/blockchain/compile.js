/**
 * Compiles contracts/VeriDocs.sol using the bundled solc npm package —
 * no Hardhat compiler download or internet access required.
 *
 * Usage: npm run compile:sol
 * Output: artifacts/contracts/VeriDocs.sol/VeriDocs.json
 */

const solc = require('solc');
const fs = require('fs');
const path = require('path');

const contractPath = path.join(__dirname, '../../contracts/VeriDocs.sol');
const src = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'VeriDocs.sol': { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
  },
};

console.log('Compiling contracts/VeriDocs.sol...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === 'error');
  if (errors.length) {
    console.error('Compilation errors:');
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  output.errors.forEach((e) => console.warn('Warning:', e.message));
}

const contract = output.contracts['VeriDocs.sol']['VeriDocs'];
const outDir = path.join(__dirname, '../../artifacts/contracts/VeriDocs.sol');
fs.mkdirSync(outDir, { recursive: true });

const artifact = {
  contractName: 'VeriDocs',
  abi: contract.abi,
  bytecode: '0x' + contract.evm.bytecode.object,
  deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
};

const outPath = path.join(outDir, 'VeriDocs.json');
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

console.log(`✓ Compiled successfully`);
console.log(`  ABI entries:   ${artifact.abi.length}`);
console.log(`  Bytecode size: ${Math.round(artifact.bytecode.length / 2)} bytes`);
console.log(`  Output:        ${outPath}`);
