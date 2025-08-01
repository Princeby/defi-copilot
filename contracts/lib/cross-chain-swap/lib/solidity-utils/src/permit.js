"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaiLikePermit = exports.Permit = exports.EIP712Domain = exports.defaultDeadlinePermit2 = exports.defaultDeadline = exports.TypedDataVersion = void 0;
exports.trim0x = trim0x;
exports.cutSelector = cutSelector;
exports.domainSeparator = domainSeparator;
exports.buildData = buildData;
exports.buildDataLikeDai = buildDataLikeDai;
exports.permit2Contract = permit2Contract;
exports.getPermit = getPermit;
exports.getPermit2 = getPermit2;
exports.getPermitLikeDai = getPermitLikeDai;
exports.getPermitLikeUSDC = getPermitLikeUSDC;
exports.withTarget = withTarget;
exports.compressPermit = compressPermit;
exports.decompressPermit = decompressPermit;
const eth_sig_util_1 = require("@metamask/eth-sig-util");
const prelude_1 = require("./prelude");
const ethers_1 = require("ethers");
require("@nomicfoundation/hardhat-ethers"); // required to populate the HardhatRuntimeEnvironment with ethers
const hardhat_1 = require("hardhat");
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const permit2_json_1 = require("./permit2.json");
exports.TypedDataVersion = eth_sig_util_1.SignTypedDataVersion.V4;
exports.defaultDeadline = prelude_1.constants.MAX_UINT256;
exports.defaultDeadlinePermit2 = prelude_1.constants.MAX_UINT48;
exports.EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
];
exports.Permit = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
];
exports.DaiLikePermit = [
    { name: 'holder', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'allowed', type: 'bool' },
];
/**
 * @category permit
 * @dev Removes the '0x' prefix from a string. If no '0x' prefix is found, returns the original string.
 * @param bigNumber The number (as a bigint or string) from which to remove the '0x' prefix.
 * @return The string without the '0x' prefix.
 */
function trim0x(bigNumber) {
    const s = bigNumber.toString();
    if (s.startsWith('0x')) {
        return s.substring(2);
    }
    return s;
}
/**
 * @category permit
 * @dev Trims the method selector from transaction data, removing the first 8 characters (4 bytes of hexable string) after '0x' prefix.
 * @param data The transaction data string from which to trim the selector.
 * @return The trimmed selector string.
 */
function cutSelector(data) {
    const hexPrefix = '0x';
    return hexPrefix + data.substring(hexPrefix.length + 8);
}
/**
 * @category permit
 * @dev Generates a domain separator for EIP-712 structured data using the provided parameters.
 * @param name The user readable name of EIP-712 domain.
 * @param version The version of the EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param verifyingContract The Ethereum address of the contract that will verify the signature. This ties the signature to a specific contract.
 * @return The domain separator as a hex string.
 */
function domainSeparator(name, version, chainId, verifyingContract) {
    return ('0x' +
        eth_sig_util_1.TypedDataUtils.hashStruct('EIP712Domain', { name, version, chainId, verifyingContract }, { EIP712Domain: exports.EIP712Domain }, exports.TypedDataVersion).toString('hex'));
}
/**
 * @category permit
 * @dev Constructs structured data for EIP-2612 permit function, including types, domain, and message with details about the permit.
 * @param name The user readable name of signing EIP-712 domain
 * @param version The version of the signing EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param verifyingContract The Ethereum address of the contract that will verify the signature. This ties the signature to a specific contract.
 * @param owner The Ethereum address of the token owner granting permission to spend tokens on their behalf.
 * @param spender The Ethereum address of the party being granted permission to spend tokens on behalf of the owner.
 * @param value The amount of tokens the spender is permitted to spend.
 * @param nonce An arbitrary number used once to prevent replay attacks. Typically, this is the number of transactions sent by the owner.
 * @param deadline The timestamp until which the permit is valid. This provides a window of time in which the permit can be used.
 */
function buildData(name, version, chainId, verifyingContract, owner, spender, value, nonce, deadline = exports.defaultDeadline.toString()) {
    return {
        types: { Permit: exports.Permit },
        domain: { name, version, chainId, verifyingContract },
        message: { owner, spender, value, nonce, deadline },
    };
}
/**
 * @category permit
 * @dev Prepares structured data similar to the Dai permit function, including types, domain, and message with permit details.
 * @param name The user readable name of signing EIP-712 domain
 * @param version The version of the signing EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param verifyingContract The Ethereum address of the contract that will verify the signature. This ties the signature to a specific contract.
 * @param holder The address of the token holder who is giving permission, establishing the source of the funds.
 * @param spender The address allowed to spend tokens on behalf of the holder, essentially the recipient of the permit.
 * @param nonce An arbitrary number used once to prevent replay attacks. Typically, this is the number of transactions sent by the owner.
 * @param allowed A boolean indicating whether the spender is allowed to spend the tokens, providing a clear permit status.
 * @param expiry The time until which the permit is valid, offering a window during which the spender can use the permit.
 * @return Structured data prepared for a Dai-like permit function.
 */
function buildDataLikeDai(name, version, chainId, verifyingContract, holder, spender, nonce, allowed, expiry = exports.defaultDeadline.toString()) {
    return {
        types: { Permit: exports.DaiLikePermit },
        domain: { name, version, chainId, verifyingContract },
        message: { holder, spender, nonce, expiry, allowed },
    };
}
/**
 * @category permit
 * @dev Ensures contract code is set for a given address and returns a contract instance.
 * @return The contract instance of IPermit2.
 */
async function permit2Contract() {
    if ((await hardhat_1.ethers.provider.getCode(permit2_sdk_1.PERMIT2_ADDRESS)) === '0x') {
        await hardhat_1.ethers.provider.send('hardhat_setCode', [permit2_sdk_1.PERMIT2_ADDRESS, permit2_json_1.bytecode]);
    }
    return hardhat_1.ethers.getContractAt('IPermit2', permit2_sdk_1.PERMIT2_ADDRESS);
}
/**
 * @category permit
 * @notice Generates a permit signature for ERC20 tokens with EIP-2612 standard.
 * @param owner The wallet or signer issuing the permit.
 * @param permitContract The contract object with ERC20Permit type and token address for which the permit creating.
 * @param tokenVersion The version of the token's EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param spender The address allowed to spend the tokens.
 * @param value The amount of tokens the spender is allowed to use.
 * @param deadline Time until when the permit is valid.
 * @param compact Indicates if the permit should be compressed.
 * @return A signed permit string.
 */
async function getPermit(owner, permitContract, tokenVersion, chainId, spender, value, deadline = exports.defaultDeadline.toString(), compact = false) {
    const nonce = await permitContract.nonces(owner);
    const name = await permitContract.name();
    const data = buildData(name, tokenVersion, chainId, await permitContract.getAddress(), owner.address, spender, value, nonce.toString(), deadline);
    const signature = await owner.signTypedData(data.domain, data.types, data.message);
    const { v, r, s } = ethers_1.Signature.from(signature);
    const permitCall = cutSelector(permitContract.interface.encodeFunctionData('permit', [owner.address, spender, value, deadline, v, r, s]));
    return compact ? compressPermit(permitCall) : decompressPermit(compressPermit(permitCall), prelude_1.constants.ZERO_ADDRESS, owner.address, spender);
}
/**
 * @category permit
 * @notice Creates a permit for spending tokens on Permit2 standard contracts.
 * @param owner The wallet or signer issuing the permit.
 * @param token The address of the token for which the permit is creates.
 * @param chainId The unique identifier for the blockchain network.
 * @param spender The address allowed to spend the tokens.
 * @param amount The amount of tokens the spender is allowed to use.
 * @param compact Indicates if the permit should be compressed.
 * @param expiration The time until when the permit is valid for Permit2.
 * @param sigDeadline Deadline for the signature to be considered valid.
 * @return A signed permit string specific to Permit2 contracts.
 */
async function getPermit2(owner, token, chainId, spender, amount, compact = false, expiration = exports.defaultDeadlinePermit2, sigDeadline = exports.defaultDeadlinePermit2) {
    const permitContract = await permit2Contract();
    const nonce = (await permitContract.allowance(owner, token, spender)).nonce;
    const details = {
        token,
        amount,
        expiration,
        nonce,
    };
    const permitSingle = {
        details,
        spender,
        sigDeadline,
    };
    const data = permit2_sdk_1.AllowanceTransfer.getPermitData(permitSingle, await permitContract.getAddress(), chainId);
    const sig = ethers_1.Signature.from(await owner.signTypedData(data.domain, data.types, data.values));
    const permitCall = cutSelector(permitContract.interface.encodeFunctionData('permit', [owner.address, permitSingle, sig.r + trim0x(sig.yParityAndS)]));
    return compact ? compressPermit(permitCall) : decompressPermit(compressPermit(permitCall), token, owner.address, spender);
}
/**
 * @category permit
 * @notice Generates a Dai-like permit signature for tokens.
 * @param holder The wallet or signer issuing the permit.
 * @param permitContract The contract object with ERC20PermitLikeDai type and token address for which the permit creating.
 * @param tokenVersion The version of the token's EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param spender The address allowed to spend the tokens.
 * @param allowed Boolean indicating whether the spender is allowed to spend.
 * @param expiry Time until when the permit is valid.
 * @param compact Indicates if the permit should be compressed.
 * @return A signed permit string in Dai-like format.
 */
async function getPermitLikeDai(holder, permitContract, tokenVersion, chainId, spender, allowed, expiry = exports.defaultDeadline.toString(), compact = false) {
    const nonce = await permitContract.nonces(holder);
    const name = await permitContract.name();
    const data = buildDataLikeDai(name, tokenVersion, chainId, await permitContract.getAddress(), holder.address, spender, nonce.toString(), allowed, expiry);
    const signature = await holder.signTypedData(data.domain, data.types, data.message);
    const { v, r, s } = ethers_1.Signature.from(signature);
    const permitCall = cutSelector(permitContract.interface.encodeFunctionData('permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)', [holder.address, spender, nonce, expiry, allowed, v, r, s]));
    return compact ? compressPermit(permitCall) : decompressPermit(compressPermit(permitCall), prelude_1.constants.ZERO_ADDRESS, holder.address, spender);
}
/**
 * @category permit
 * @notice Generates a ERC-7597 permit signature for tokens.
 * @param owner Contract with isValidSignature function.
 * @param signer The wallet or signer issuing the permit.
 * @param permitContract The contract object with ERC7597Permit type and token address for which the permit creating.
 * @param tokenVersion The version of the token's EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param spender The address allowed to spend the tokens.
 * @param value The amount of tokens the spender is allowed to use.
 * @param deadline Time until when the permit is valid.
 * @return A signed permit string in ERC7597Permit format.
 */
async function getPermitLikeUSDC(owner, signer, permitContract, tokenVersion, chainId, spender, value, deadline = exports.defaultDeadline.toString()) {
    const nonce = await permitContract.nonces(owner);
    const name = await permitContract.name();
    const data = buildData(name, tokenVersion, chainId, await permitContract.getAddress(), owner, spender, value, nonce.toString(), deadline);
    const signature = await signer.signTypedData(data.domain, data.types, data.message);
    const { v, r, s } = ethers_1.Signature.from(signature);
    const signatureBytes = hardhat_1.ethers.solidityPacked(['bytes32', 'bytes32', 'uint8'], [r, s, v]);
    return cutSelector(permitContract.interface.encodeFunctionData('permit(address,address,uint256,uint256,bytes)', [owner, spender, value, deadline, signatureBytes]));
}
/**
 * @category permit
 * @notice Concatenates a target address with data, trimming the '0x' prefix from the data.
 * @param target The target address or value to prepend.
 * @param data The data string to be concatenated after trimming.
 * @return A concatenated string of target and data.
 */
function withTarget(target, data) {
    return target.toString() + trim0x(data);
}
/**
 * @category permit
 * @notice Compresses a permit function call to a shorter format based on its type.
 *   Type         | EIP-2612 | DAI | Permit2
 *   Uncompressed |    224   | 256 | 352
 *   Compressed   |    100   |  72 | 96
 * @param permit The full permit function call string.
 * @return A compressed permit string.
 */
function compressPermit(permit) {
    const abiCoder = hardhat_1.ethers.AbiCoder.defaultAbiCoder();
    switch (permit.length) {
        case 450: {
            // IERC20Permit.permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s)
            const args = abiCoder.decode(['address owner', 'address spender', 'uint256 value', 'uint256 deadline', 'uint8 v', 'bytes32 r', 'bytes32 s'], permit);
            // Compact IERC20Permit.permit(uint256 value, uint32 deadline, uint256 r, uint256 vs)
            return '0x' + args.value.toString(16).padStart(64, '0') +
                (args.deadline.toString() === prelude_1.constants.MAX_UINT256.toString() ? '00000000' : (args.deadline + 1n).toString(16).padStart(8, '0')) +
                BigInt(args.r).toString(16).padStart(64, '0') +
                (((args.v - 27n) << 255n) | BigInt(args.s)).toString(16).padStart(64, '0');
        }
        case 514: {
            // IDaiLikePermit.permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)
            const args = abiCoder.decode(['address holder', 'address spender', 'uint256 nonce', 'uint256 expiry', 'bool allowed', 'uint8 v', 'bytes32 r', 'bytes32 s'], permit);
            // Compact IDaiLikePermit.permit(uint32 nonce, uint32 expiry, uint256 r, uint256 vs)
            return '0x' + args.nonce.toString(16).padStart(8, '0') +
                (args.expiry.toString() === prelude_1.constants.MAX_UINT256.toString() ? '00000000' : (args.expiry + 1n).toString(16).padStart(8, '0')) +
                BigInt(args.r).toString(16).padStart(64, '0') +
                (((args.v - 27n) << 255n) | BigInt(args.s)).toString(16).padStart(64, '0');
        }
        case 706: {
            // IPermit2.permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature)
            const args = abiCoder.decode(['address owner', 'address token', 'uint160 amount', 'uint48 expiration', 'uint48 nonce', 'address spender', 'uint256 sigDeadline', 'bytes signature'], permit);
            // Compact IPermit2.permit(uint160 amount, uint32 expiration, uint32 nonce, uint32 sigDeadline, uint256 r, uint256 vs)
            return '0x' + args.amount.toString(16).padStart(40, '0') +
                (args.expiration.toString() === prelude_1.constants.MAX_UINT48.toString() ? '00000000' : (args.expiration + 1n).toString(16).padStart(8, '0')) +
                args.nonce.toString(16).padStart(8, '0') +
                (args.sigDeadline.toString() === prelude_1.constants.MAX_UINT48.toString() ? '00000000' : (args.sigDeadline + 1n).toString(16).padStart(8, '0')) +
                BigInt(args.signature).toString(16).padStart(128, '0');
        }
        case 202:
        case 146:
        case 194:
            throw new Error('Permit is already compressed');
        default:
            throw new Error('Invalid permit length');
    }
}
/**
 * @category permit
 * @notice Decompresses a compressed permit function call back to its original full format.
 * @param permit The compressed permit function call string.
 * @param token The token address involved in the permit (for Permit2 type).
 * @param owner The owner address involved in the permit.
 * @param spender The spender address involved in the permit.
 * @return The decompressed permit function call string.
 */
function decompressPermit(permit, token, owner, spender) {
    const abiCoder = hardhat_1.ethers.AbiCoder.defaultAbiCoder();
    switch (permit.length) {
        case 202: {
            // Compact IERC20Permit.permit(uint256 value, uint32 deadline, uint256 r, uint256 vs)
            const args = {
                value: BigInt(permit.slice(0, 66)),
                deadline: BigInt('0x' + permit.slice(66, 74)),
                r: '0x' + permit.slice(74, 138),
                vs: BigInt('0x' + permit.slice(138, 202)),
            };
            // IERC20Permit.permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s)
            return abiCoder.encode(['address owner', 'address spender', 'uint256 value', 'uint256 deadline', 'uint8 v', 'bytes32 r', 'bytes32 s'], [
                owner,
                spender,
                args.value,
                args.deadline === 0n ? prelude_1.constants.MAX_UINT256 : args.deadline - 1n,
                (args.vs >> 255n) + 27n,
                args.r,
                '0x' + (args.vs & 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn).toString(16).padStart(64, '0'),
            ]);
        }
        case 146: {
            // Compact IDaiLikePermit.permit(uint32 nonce, uint32 expiry, uint256 r, uint256 vs)
            const args = {
                nonce: BigInt(permit.slice(0, 10)),
                expiry: BigInt('0x' + permit.slice(10, 18)),
                r: '0x' + permit.slice(18, 82),
                vs: BigInt('0x' + permit.slice(82, 146)),
            };
            // IDaiLikePermit.permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)
            return abiCoder.encode(['address holder', 'address spender', 'uint256 nonce', 'uint256 expiry', 'bool allowed', 'uint8 v', 'bytes32 r', 'bytes32 s'], [
                owner,
                spender,
                args.nonce,
                args.expiry === 0n ? prelude_1.constants.MAX_UINT256 : args.expiry - 1n,
                true,
                (args.vs >> 255n) + 27n,
                args.r,
                '0x' + (args.vs & 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn).toString(16).padStart(64, '0'),
            ]);
        }
        case 194: {
            // Compact IPermit2.permit(uint160 amount, uint32 expiration, uint32 nonce, uint32 sigDeadline, uint256 r, uint256 vs)
            const args = {
                amount: BigInt(permit.slice(0, 42)),
                expiration: BigInt('0x' + permit.slice(42, 50)),
                nonce: BigInt('0x' + permit.slice(50, 58)),
                sigDeadline: BigInt('0x' + permit.slice(58, 66)),
                r: '0x' + permit.slice(66, 130),
                vs: '0x' + permit.slice(130, 194),
            };
            // IPermit2.permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature)
            return abiCoder.encode(['address owner', 'address token', 'uint160 amount', 'uint48 expiration', 'uint48 nonce', 'address spender', 'uint256 sigDeadline', 'bytes signature'], [
                owner,
                token,
                args.amount,
                args.expiration === 0n ? prelude_1.constants.MAX_UINT48 : args.expiration - 1n,
                args.nonce,
                spender,
                args.sigDeadline === 0n ? prelude_1.constants.MAX_UINT48 : args.sigDeadline - 1n,
                args.r + trim0x(args.vs),
            ]);
        }
        case 450:
        case 514:
        case 706:
            throw new Error('Permit is already decompressed');
        default:
            throw new Error('Invalid permit length');
    }
}
