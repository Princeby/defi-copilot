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
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = __importStar(require("hardhat"));
const chai_1 = __importDefault(require("chai"));
const mocha_chai_jest_snapshot_1 = require("mocha-chai-jest-snapshot");
chai_1.default.use((0, mocha_chai_jest_snapshot_1.jestSnapshotPlugin)());
describe('StringUtil', function () {
    const uint256TestValue = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const uint128TestValue = '0x00000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    const veryLongArray = '0xFFFFFFFFFFFFFFAFAFAFBCBCBCBCBDEDED' + 'AA'.repeat(50);
    const extremelyLongArray = '0x' + '0F'.repeat(1000);
    const emptyBytes = '0x';
    const singleByte = '0xAF';
    const randomBytes = '0x01DE89FFF130ADEAAD';
    const sameBytesShort = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const sameBytesLong = '0x' + 'AA'.repeat(1000);
    async function deployStringUtilTest() {
        const StringUtilTest = await hardhat_1.ethers.getContractFactory('StringUtilTest');
        const stringUtilTest = await StringUtilTest.deploy();
        return { stringUtilTest };
    }
    describe('Validity', function () {
        it('Uint 256', () => test(uint256TestValue));
        it('Uint 128', () => test(uint128TestValue));
        it('Very long byte array', () => testBytes(veryLongArray));
        it('Extremely long byte array', () => testBytes(extremelyLongArray));
        it('Empty bytes', () => testBytes(emptyBytes));
        it('Single byte', () => testBytes(singleByte));
        it('Random bytes', () => testBytes(randomBytes));
        it('Same bytes short', () => testBytes(sameBytesShort));
        it('Same bytes long', () => testBytes(sameBytesLong));
        async function test(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const result = await stringUtilTest.toHex(value);
            const naiveResult = await stringUtilTest.toHexNaive(value);
            (0, expect_1.expect)(result).to.be.equal(value);
            (0, expect_1.expect)(result).to.be.equal(naiveResult);
        }
        async function testBytes(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const result = await stringUtilTest.toHexBytes(value);
            const naiveResult = await stringUtilTest.toHexNaiveBytes(value);
            (0, expect_1.expect)(result).to.be.equal(value);
            (0, expect_1.expect)(result).to.be.equal(naiveResult);
        }
    });
    describe('Gas usage', function () {
        before(function () {
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING) {
                this.skip();
            }
        });
        it('Uint 256', () => testGasUint256(uint256TestValue));
        it('Uint 256 naive', () => testGasNaiveUint256(uint256TestValue));
        it('Uint 256 as bytes', () => testGasBytes(uint256TestValue));
        it('Uint 256 as bytes naive', () => testGasNaiveBytes(uint256TestValue));
        it('Uint 128', () => testGasUint256(uint128TestValue));
        it('Uint 128 naive', () => testGasNaiveUint256(uint128TestValue));
        it('Very long byte array gas', () => testGasBytes(veryLongArray));
        it('Very long byte array gas naive', () => testGasNaiveBytes(veryLongArray));
        it('Extremely long byte array gas', () => testGasBytes(extremelyLongArray));
        it('Extremely long byte array gas naive', () => testGasNaiveBytes(extremelyLongArray));
        it('Empty bytes', () => testGasBytes(emptyBytes));
        it('Empty bytes naive', () => testGasNaiveBytes(emptyBytes));
        it('Single byte', () => testGasBytes(singleByte));
        it('Single byte naive', () => testGasNaiveBytes(singleByte));
        it('Compare gas usage Uint256', () => compareGasUint256(uint256TestValue));
        it('Compare gas usage Uint256 as bytes', () => compareGasBytes(uint256TestValue));
        it('Compare gas usage Uint128', () => compareGasUint256(uint128TestValue));
        it('Compare gas usage very long byte array', () => compareGasBytes(veryLongArray));
        it('Compare gas usage extremly long byte array', () => compareGasBytes(extremelyLongArray));
        it('Compare gas usage empty bytes', () => compareGasBytes(emptyBytes));
        it('Compare gas usage single byte', () => compareGasBytes(singleByte));
        async function testGasUint256(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHex.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        }
        async function testGasBytes(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHexBytes.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        }
        async function testGasNaiveUint256(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHexNaive.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        }
        async function testGasNaiveBytes(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHexNaiveBytes.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        }
        async function compareGasUint256(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHex.send(value)).wait();
            const naiveTx = await (await stringUtilTest.toHexNaive.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).to.be.lessThan(naiveTx.gasUsed);
        }
        async function compareGasBytes(value) {
            const { stringUtilTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployStringUtilTest);
            const tx = await (await stringUtilTest.toHexBytes.send(value)).wait();
            const naiveTx = await (await stringUtilTest.toHexNaiveBytes.send(value)).wait();
            (0, expect_1.expect)(tx.gasUsed).to.be.lessThan(naiveTx.gasUsed);
        }
    });
});
