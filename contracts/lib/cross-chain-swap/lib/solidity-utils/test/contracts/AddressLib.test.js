"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
describe('AddressLib', function () {
    let signer;
    before(async function () {
        [signer] = await hardhat_1.ethers.getSigners();
    });
    async function deployAddressLibMock() {
        const AddressLibMock = await hardhat_1.ethers.getContractFactory('AddressLibMock');
        const addressLibMock = await AddressLibMock.deploy();
        const flags = [1n << 160n, 1n << 192n, 1n << 255n];
        return { addressLibMock, flags };
    }
    describe('get', function () {
        it('should return correct address not depending on flags', async function () {
            const { addressLibMock, flags } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressLibMock);
            (0, expect_1.expect)(await addressLibMock.get(signer.address)).to.be.equal(signer.address);
            for (const flag of flags) {
                (0, expect_1.expect)(await addressLibMock.get(BigInt(signer.address) | flag)).to.be.equal(signer.address);
            }
        });
    });
    describe('getFlag', function () {
        it('should return true when flag in Address', async function () {
            const { addressLibMock, flags } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressLibMock);
            for (const flag of flags) {
                (0, expect_1.expect)(await addressLibMock.getFlag(BigInt(signer.address) | flag, flag)).to.be.true;
                (0, expect_1.expect)(await addressLibMock.getFlag(BigInt(signer.address) | flag, 1n << 161n)).to.be.false;
            }
        });
    });
    describe('getUint32', function () {
        it('should return uint32 from Address with offset', async function () {
            const { addressLibMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressLibMock);
            const flag = (1n << 160n) + (1n << 193n);
            (0, expect_1.expect)(await addressLibMock.getUint32(BigInt(signer.address) | flag, 160)).to.be.equal(1);
            (0, expect_1.expect)(await addressLibMock.getUint32(BigInt(signer.address) | flag, 193)).to.be.equal(1);
        });
    });
    describe('getUint64', function () {
        it('should return uint64 from Address with offset', async function () {
            const { addressLibMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressLibMock);
            const flag = (1n << 160n) + (1n << 225n);
            (0, expect_1.expect)(await addressLibMock.getUint64(BigInt(signer.address) | flag, 160)).to.be.equal(1);
            (0, expect_1.expect)(await addressLibMock.getUint64(BigInt(signer.address) | flag, 225)).to.be.equal(1);
        });
    });
});
