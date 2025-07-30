// fund.ts
import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  const wallet = new ethers.Wallet(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    provider
  );

  const usdcAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const accessAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const spender = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
  const relayer = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  const abi = [
    'function transfer(address to, uint256 amount)',
    'function approve(address spender, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)',
  ];

  const usdcContract = new ethers.Contract(usdcAddress, abi, wallet);
  const accessContract = new ethers.Contract(accessAddress, abi, wallet);

  // Get current nonce
  let nonce = await wallet.getNonce();

  // Transfer tokens to relayer
  await usdcContract.transfer(relayer, ethers.parseUnits('1000', 6), { nonce: nonce++ });
  await accessContract.transfer(relayer, ethers.parseUnits('1000', 18), { nonce: nonce++ });

  // Approve TestEscrowFactory
  await usdcContract.approve(spender, ethers.parseUnits('1000', 6), { nonce: nonce++ });
  await accessContract.approve(spender, ethers.parseUnits('1000', 18), { nonce: nonce++ });

  // Verify balances
  const usdcBalance = await usdcContract.balanceOf(relayer);
  const accessBalance = await accessContract.balanceOf(relayer);

  console.log(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  console.log(`Access Balance: ${ethers.formatUnits(accessBalance, 18)} ACCESS`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
