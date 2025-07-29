"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployAndGetContract = deployAndGetContract;
exports.timeIncreaseTo = timeIncreaseTo;
exports.deployContract = deployContract;
exports.deployContractFromBytecode = deployContractFromBytecode;
exports.trackReceivedTokenAndTx = trackReceivedTokenAndTx;
exports.fixSignature = fixSignature;
exports.signMessage = signMessage;
exports.countInstructions = countInstructions;
exports.getEthPrice = getEthPrice;
require("@nomicfoundation/hardhat-ethers"); // required to populate the HardhatRuntimeEnvironment with ethers
const hardhat_1 = __importStar(require("hardhat"));
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const node_fetch_1 = __importDefault(require("node-fetch"));
const prelude_1 = require("./prelude");
/**
 * @category utils
 * @notice Deploys a contract with optional Etherscan verification.
 * @param options Deployment options. Default values:
 *    - deploymentName: contractName
 *    - skipVerify: false
 *    - skipIfAlreadyDeployed: true
 *    - log: true
 *    - waitConfirmations: 1 on dev chains, 6 on others
 * @returns The deployed contract instance.
 */
async function deployAndGetContract(options) {
    // Set default values for options
    const { contractName, constructorArgs, deployments, deployer, deploymentName = contractName, skipVerify = false, skipIfAlreadyDeployed = true, gasPrice, maxPriorityFeePerGas, maxFeePerGas, log = true, waitConfirmations = prelude_1.constants.DEV_CHAINS.includes(hardhat_1.default.network.name) ? 1 : 6, } = options;
    /**
     * Deploys contract and tries to verify it on Etherscan if requested.
     * @remarks
     * If the contract is deployed on a dev chain, verification is skipped.
     * @returns Deployed contract instance
     */
    const { deploy } = deployments;
    const deployOptions = {
        args: constructorArgs,
        from: deployer,
        contract: contractName,
        skipIfAlreadyDeployed,
        gasPrice: gasPrice?.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
        maxFeePerGas: maxFeePerGas?.toString(),
        log,
        waitConfirmations,
    };
    const deployResult = await deploy(deploymentName, deployOptions);
    if (!(skipVerify || prelude_1.constants.DEV_CHAINS.includes(hardhat_1.default.network.name))) {
        await hardhat_1.default.run('verify:verify', {
            address: deployResult.address,
            constructorArguments: constructorArgs,
        });
    }
    else {
        console.log('Skipping verification');
    }
    return await hardhat_1.ethers.getContractAt(contractName, deployResult.address);
}
/**
 * @category utils
 * @notice Advances the blockchain time to a specific timestamp for testing purposes.
 * @param seconds Target time in seconds or string format to increase to.
 */
async function timeIncreaseTo(seconds) {
    const delay = 1000 - new Date().getMilliseconds();
    await new Promise((resolve) => setTimeout(resolve, delay));
    await hardhat_network_helpers_1.time.increaseTo(seconds);
}
/**
 * @category utils
 * @notice Deploys a contract given a name and optional constructor parameters.
 * @param name The contract name.
 * @param parameters Constructor parameters for the contract.
 * @returns The deployed contract instance.
 */
async function deployContract(name, parameters = []) {
    const ContractFactory = await hardhat_1.ethers.getContractFactory(name);
    const instance = await ContractFactory.deploy(...parameters);
    await instance.waitForDeployment();
    return instance;
}
/**
 * @category utils
 * @notice Deploys a contract from bytecode, useful for testing and deployment of minimal proxies.
 * @param abi Contract ABI.
 * @param bytecode Contract bytecode.
 * @param parameters Constructor parameters.
 * @param signer Optional signer object.
 * @returns The deployed contract instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deployContractFromBytecode(abi, bytecode, parameters = [], signer) {
    const ContractFactory = await hardhat_1.ethers.getContractFactory(abi, bytecode, signer);
    const instance = await ContractFactory.deploy(...parameters);
    await instance.waitForDeployment();
    return instance;
}
/**
 * @category utils
 * @notice Tracks token balance changes and transaction receipts for specified wallet addresses during test scenarios.
 * It could be used recursively for multiple tokens via specific `txPromise` function.
 * @param provider JSON RPC provider or custom provider object.
 * @param token Token contract instance or ETH address constants.
 * @param wallet Wallet address to track.
 * @param txPromise Function returning a transaction promise.
 * @param args Arguments for the transaction promise function.
 * @returns Tuple of balance change and transaction receipt.
 */
async function trackReceivedTokenAndTx(provider, token, wallet, txPromise, ...args) {
    const tokenAddress = 'address' in token ? token.address : await token.getAddress();
    const isETH = tokenAddress === prelude_1.constants.ZERO_ADDRESS || tokenAddress === prelude_1.constants.EEE_ADDRESS;
    const getBalance = 'balanceOf' in token ? token.balanceOf.bind(token) : provider.getBalance.bind(provider);
    const preBalance = await getBalance(wallet);
    const txResponse = await txPromise(...args);
    const txReceipt = 'wait' in txResponse ? await txResponse.wait() : txResponse[1];
    const txFees = wallet.toLowerCase() === txReceipt.from.toLowerCase() && isETH
        ? txReceipt.gasUsed * txReceipt.gasPrice
        : 0n;
    const postBalance = await getBalance(wallet);
    return [postBalance - preBalance + txFees, 'wait' in txResponse ? txReceipt : txResponse];
}
/**
 * @category utils
 * @notice Corrects the ECDSA signature 'v' value according to Ethereum's standard.
 * @param signature The original signature string.
 * @returns The corrected signature string.
 */
function fixSignature(signature) {
    // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
    // signature malleability if version is 0/1
    // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
    let v = parseInt(signature.slice(130, 132), 16);
    if (v < 27) {
        v += 27;
    }
    const vHex = v.toString(16);
    return signature.slice(0, 130) + vHex;
}
/**
 * @category utils
 * @notice Signs a message with a given signer and fixes the signature format.
 * @param signer Signer object or wallet instance.
 * @param messageHex The message to sign, in hex format.
 * @returns The signed message string.
 */
async function signMessage(signer, messageHex = '0x') {
    return fixSignature(await signer.signMessage(messageHex));
}
/**
 * @category utils
 * @notice Counts the occurrences of specified EVM instructions in a transaction's execution trace.
 * @param provider JSON RPC provider or custom provider object.
 * @param txHash Transaction hash to analyze.
 * @param instructions Array of EVM instructions (opcodes) to count.
 * @returns Array of instruction counts.
 */
async function countInstructions(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
provider, txHash, instructions) {
    const trace = await provider.send('debug_traceTransaction', [txHash]);
    const str = JSON.stringify(trace);
    return instructions.map((instr) => {
        return str.split('"' + instr.toUpperCase() + '"').length - 1;
    });
}
/**
 * @category utils
 * @notice Retrieves the current USD price of ETH or another specified native token.
 * This helper function is designed for use in test environments to maintain stability against market fluctuations.
 * It fetches the current price of ETH (or a specified native token for side chains) in USD from the Coinbase API to
 * ensure that tests remain stable and unaffected by significant market price fluctuations when token price is
 * important part of test.
 * @param nativeTokenSymbol The symbol of the native token for which the price is being fetched, defaults to 'ETH'.
 * @return The price of the specified native token in USD, scaled by 1e18 to preserve precision.
 */
async function getEthPrice(nativeTokenSymbol = 'ETH') {
    const response = await (0, node_fetch_1.default)(`https://api.coinbase.com/v2/prices/${nativeTokenSymbol}-USD/spot`);
    let amount = 0n;
    try {
        amount = BigInt(parseFloat((await response.json()).data.amount) * 1e18);
    }
    catch {
        throw new Error('Failed to parse price from Coinbase API');
    }
    return amount;
}
