// checkBalance.ts
import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const relayer = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  const usdcAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const accessAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

  const abi = [
    'function balanceOf(address account) view returns (uint256)',
  ];

  const usdc = new ethers.Contract(usdcAddress, abi, provider);
  const access = new ethers.Contract(accessAddress, abi, provider);

  const usdcBalance = await usdc.balanceOf(relayer);
  const accessBalance = await access.balanceOf(relayer);
  const ethBalance = await provider.getBalance(relayer);

  console.log(`ETH: ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  console.log(`ACCESS: ${ethers.formatUnits(accessBalance, 18)} ACCESS`);
}

main().catch(console.error);
