"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonceType = void 0;
exports.buildBySigTraits = buildBySigTraits;
exports.hashBySig = hashBySig;
exports.signSignedCall = signSignedCall;
const hardhat_1 = require("hardhat");
const prelude_1 = require("./prelude");
/**
 * Enum defining types of nonces.
 */
var NonceType;
(function (NonceType) {
    NonceType[NonceType["Account"] = 0] = "Account";
    NonceType[NonceType["Selector"] = 1] = "Selector";
    NonceType[NonceType["Unique"] = 2] = "Unique";
})(NonceType || (exports.NonceType = NonceType = {}));
/**
 * Builds traits for {bySig} contract by combining params.
 * @param nonceType The type of nonce to use. Default is NonceType.Account.
 * @param deadline The deadline for the message. Default is 0.
 * @param relayer The relayer address. Default is the zero address.
 * @param nonce The nonce. Default is 0.
 * @returns A bigint representing the combined traits.
 * @throws Error if provided with invalid parameters.
 */
function buildBySigTraits({ nonceType = NonceType.Account, deadline = 0, relayer = prelude_1.constants.ZERO_ADDRESS.toString(), nonce = 0, } = {}) {
    if (nonceType > 3) {
        throw new Error('Wrong nonce type, it should be less than 4');
    }
    if (deadline > 0xffffffffff) {
        throw new Error('Wrong deadline, it should be less than 0xffffffff');
    }
    if (relayer.length > 42) {
        throw new Error('Wrong relayer address, it should be less than 42 symbols');
    }
    if (nonce > 0xffffffffffffffffffffffffffffffffn) {
        throw new Error('Wrong nonce, it should not be more than 128 bits');
    }
    return (BigInt(nonceType) << 254n) +
        (BigInt(deadline) << 208n) +
        ((BigInt(relayer) & 0xffffffffffffffffffffn) << 128n) +
        BigInt(nonce);
}
/**
 * Computes the EIP-712 hash for a given bySig call.
 * @param name The user readable name of EIP-712 domain.
 * @param version The version of the EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param verifyingContract The Ethereum address of the contract that will verify the signature. This ties the signature to a specific contract.
 * @param sig The data to be signed.
 * @returns The EIP-712 hash of the fully encoded data.
 */
function hashBySig(name, version, chainId, verifyingContract, sig) {
    const domain = { name, version, chainId, verifyingContract };
    const types = {
        SignedCall: [
            { name: 'traits', type: 'uint256' },
            { name: 'data', type: 'bytes' },
        ],
    };
    return hardhat_1.ethers.TypedDataEncoder.hash(domain, types, sig);
}
/**
 * Signs a given data for {bySig} contract call using EIP-712 standard.
 * @param name The user readable name of EIP-712 domain.
 * @param version The version of the EIP-712 domain.
 * @param chainId The unique identifier for the blockchain network.
 * @param verifyingContract The Ethereum address of the contract that will verify the signature. This ties the signature to a specific contract.
 * @param signer The wallet or signer to sign the data.
 * @param signedCall The call data to be signed, consisting of traits and data.
 * @returns A Promise that resolves to the signature.
 */
function signSignedCall(name, version, chainId, verifyingContract, signer, signedCall) {
    return signer.signTypedData({ name, version, chainId, verifyingContract }, { SignedCall: [{ name: 'traits', type: 'uint256' }, { name: 'data', type: 'bytes' }] }, signedCall);
}
