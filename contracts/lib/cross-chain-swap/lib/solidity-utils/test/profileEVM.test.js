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
Object.defineProperty(exports, "__esModule", { value: true });
const prelude_1 = require("../src/prelude");
const expect_1 = require("../src/expect");
const profileEVM_1 = require("../src/profileEVM");
const hardhat_1 = __importStar(require("hardhat"));
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe('trace inspection', function () {
    let signer1;
    let signer2;
    before(async function () {
        [signer1, signer2] = await hardhat_1.ethers.getSigners();
    });
    async function deployUSDT() {
        const TokenMock = await hardhat_1.ethers.getContractFactory('TokenMock');
        const usdt = await TokenMock.deploy('USDT', 'USDT');
        await usdt.mint(signer1, (0, prelude_1.ether)('1000'));
        await usdt.mint(signer2, (0, prelude_1.ether)('1000'));
        return { usdt };
    }
    describe('profileEVM', function () {
        it('should be counted ERC20 Transfer', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.transfer(signer2, (0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, profileEVM_1.profileEVM)(hardhat_1.ethers.provider, txn.hash, ['STATICCALL', 'CALL', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 0, 2, 2,
                ]);
            }
        });
        it('should be counted ERC20 Approve', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.approve(signer2, (0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, profileEVM_1.profileEVM)(hardhat_1.ethers.provider, txn.hash, ['STATICCALL', 'CALL', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 0, 1, 0,
                ]);
            }
        });
    });
    describe('gasspectEVM', function () {
        it('should be counted ERC20 Transfer', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.transfer(signer2, (0, prelude_1.ether)('1'));
            (0, expect_1.expect)(await (0, profileEVM_1.gasspectEVM)(hardhat_1.ethers.provider, txn.hash)).to.be.deep.equal([
                '0-0-SLOAD = 2100',
                '0-0-SSTORE = 2900',
                '0-0-SLOAD = 2100',
                '0-0-SSTORE = 2900',
                '0-0-LOG3 = 1756',
            ]);
        });
        it('should be counted ERC20 Approve', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.approve(signer2, (0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, profileEVM_1.gasspectEVM)(hardhat_1.ethers.provider, txn.hash)).to.be.deep.equal(['0-0-SSTORE_I = 22100', '0-0-LOG3 = 1756']);
            }
        });
        it('should be counted ERC20 Transfer with minOpGasCost = 2000', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.transfer(signer2, (0, prelude_1.ether)('1'));
            (0, expect_1.expect)(await (0, profileEVM_1.gasspectEVM)(hardhat_1.ethers.provider, txn.hash, { minOpGasCost: 2000 })).to.be.deep.equal([
                '0-0-SLOAD = 2100',
                '0-0-SSTORE = 2900',
                '0-0-SLOAD = 2100',
                '0-0-SSTORE = 2900',
            ]);
        });
        it('should be counted ERC20 Transfer with args', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.transfer(signer2, (0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, profileEVM_1.gasspectEVM)(hardhat_1.ethers.provider, txn.hash, { args: true })).to.be.deep.equal([
                    '0-0-SLOAD(0x723077b8a1b173adc35e5f0e7e3662fd1208212cb629f9c128551ea7168da722) = 2100',
                    '0-0-SSTORE(0x723077b8a1b173adc35e5f0e7e3662fd1208212cb629f9c128551ea7168da722,0x00000000000000000000000000000000000000000000003627e8f712373c0000) = 2900',
                    '0-0-SLOAD(0x14e04a66bf74771820a7400ff6cf065175b3d7eb25805a5bd1633b161af5d101) = 2100',
                    '0-0-SSTORE(0x14e04a66bf74771820a7400ff6cf065175b3d7eb25805a5bd1633b161af5d101,0x00000000000000000000000000000000000000000000003643aa647986040000) = 2900',
                    '0-0-LOG3() = 1756',
                ]);
            }
        });
        it('should be counted ERC20 Transfer with res', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const txn = await usdt.transfer(signer2, (0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, profileEVM_1.gasspectEVM)(hardhat_1.ethers.provider, txn.hash, { res: true })).to.be.deep.equal([
                    '0-0-SLOAD:0x00000000000000000000000000000000000000000000003635c9adc5dea00000 = 2100',
                    '0-0-SSTORE = 2900',
                    '0-0-SLOAD:0x00000000000000000000000000000000000000000000003635c9adc5dea00000 = 2100',
                    '0-0-SSTORE = 2900',
                    '0-0-LOG3 = 1756',
                ]);
            }
        });
    });
});
