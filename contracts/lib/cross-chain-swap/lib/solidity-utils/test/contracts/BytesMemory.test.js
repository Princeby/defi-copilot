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
const permit_1 = require("../../src/permit");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = __importStar(require("hardhat"));
const chai_1 = __importDefault(require("chai"));
const mocha_chai_jest_snapshot_1 = require("mocha-chai-jest-snapshot");
chai_1.default.use((0, mocha_chai_jest_snapshot_1.jestSnapshotPlugin)());
describe('BytesMemoryMock', function () {
    const bytes = '0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    async function deployBytesMemoryMockWithData() {
        const BytesMemoryMock = await hardhat_1.ethers.getContractFactory('BytesMemoryMock');
        const bytesMemoryMock = await BytesMemoryMock.deploy();
        const [pointer, length] = await bytesMemoryMock.wrap(bytes);
        return { bytesMemoryMock, data: { pointer, length } };
    }
    describe('wrap', function () {
        it('should return correct pointer and length of data', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const [pointer, length] = await bytesMemoryMock.wrap(bytes);
            (0, expect_1.expect)(pointer).to.be.equal(160n);
            (0, expect_1.expect)(length).to.be.equal((0, permit_1.trim0x)(bytes).length / 2);
        });
        it('should return correct pointer and length of empty data', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const [pointer, length] = await bytesMemoryMock.wrap('0x');
            (0, expect_1.expect)(pointer).to.be.equal(160n);
            (0, expect_1.expect)(length).to.be.equal(0);
        });
        it('should return correct pointer and length of data with non-default pointer', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const [pointer, length] = await bytesMemoryMock.wrapWithNonDefaultPointer(bytes, 1);
            (0, expect_1.expect)(pointer).to.be.equal(288);
            (0, expect_1.expect)(length).to.be.equal((0, permit_1.trim0x)(bytes).length / 2);
        });
    });
    describe('slice', function () {
        it('should revert with incorrect offset', async function () {
            const { bytesMemoryMock, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            await (0, expect_1.expect)(bytesMemoryMock.slice(data, data.pointer + 1n, 0)).to.be.revertedWithCustomError(bytesMemoryMock, 'OutOfBounds');
        });
        it('should revert with incorrect size', async function () {
            const { bytesMemoryMock, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            await (0, expect_1.expect)(bytesMemoryMock.slice(data, data.pointer, data.length + 1n)).to.be.revertedWithCustomError(bytesMemoryMock, 'OutOfBounds');
        });
        it('should revert with incorrect offset + size', async function () {
            const { bytesMemoryMock, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            await (0, expect_1.expect)(bytesMemoryMock.slice(data, data.pointer + data.length / 2n, data.length / 2n + 1n)).to.be.revertedWithCustomError(bytesMemoryMock, 'OutOfBounds');
        });
        it('should slice data', async function () {
            const { bytesMemoryMock, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            (0, expect_1.expect)(await bytesMemoryMock.slice(data, 10n, 20n)).to.be.deep.eq([data.pointer + 10n, 20n]);
        });
    });
    describe('unwrap', function () {
        it('should return correct bytes after wrap', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            (0, expect_1.expect)(await bytesMemoryMock.wrapAndUnwrap(bytes)).to.be.equal(bytes);
        });
        it('should return correct bytes after wrap with non-default pointer', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            (0, expect_1.expect)(await bytesMemoryMock.wrapWithNonDefaultPointerAndUnwrap(bytes, 10n)).to.be.equal(bytes);
        });
        it('should return correct bytes slice', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            (0, expect_1.expect)(await bytesMemoryMock.wrapWithSliceAndUnwrap(bytes, 16n, 10n)).to.be.equal('0x' + (0, permit_1.trim0x)(bytes).substring(32, 32 + 20));
        });
    });
    describe('Gas usage', function () {
        before(function () {
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING) {
                this.skip();
            }
        });
        it('unwrap 32 bytes', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const tx = await (await bytesMemoryMock.wrapAndUnwrap.send(bytes)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        });
        it('unwrap 33 bytes', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const tx = await (await bytesMemoryMock.wrapAndUnwrap.send(bytes + 'ff')).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        });
        it('unwrap 64 bytes', async function () {
            const { bytesMemoryMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const tx = await (await bytesMemoryMock.wrapAndUnwrap.send(bytes + (0, permit_1.trim0x)(bytes))).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        });
        it('slice', async function () {
            const { bytesMemoryMock, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployBytesMemoryMockWithData);
            const tx = await (await bytesMemoryMock.slice.send(data, 10n, 20n)).wait();
            (0, expect_1.expect)(tx.gasUsed).toMatchSnapshot();
        });
    });
});
