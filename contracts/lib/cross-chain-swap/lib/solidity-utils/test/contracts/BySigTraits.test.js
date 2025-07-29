"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prelude_1 = require("../../src/prelude");
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
const bySig_1 = require("../../src/bySig");
describe('BySigTraits', function () {
    async function deployAddressArrayMock() {
        const BySigTraits = await hardhat_1.ethers.getContractFactory('BySigTraitsMock');
        const bySigTraitsMock = await BySigTraits.deploy();
        return { bySigTraitsMock };
    }
    describe('nonceType', function () {
        it('should return nonce type for Account', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ nonceType: bySig_1.NonceType.Account });
            (0, expect_1.expect)(await bySigTraitsMock.nonceType(value)).to.be.equal(bySig_1.NonceType.Account);
        });
        it('should return nonce type for Selector', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ nonceType: bySig_1.NonceType.Selector });
            (0, expect_1.expect)(await bySigTraitsMock.nonceType(value)).to.be.equal(bySig_1.NonceType.Selector);
        });
        it('should return nonce type for Selector', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ nonceType: bySig_1.NonceType.Unique });
            (0, expect_1.expect)(await bySigTraitsMock.nonceType(value)).to.be.equal(bySig_1.NonceType.Unique);
        });
        it('should revert with unsupported nonce', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ nonceType: 3 });
            await (0, expect_1.expect)(bySigTraitsMock.nonceType(value)).to.be.revertedWithCustomError(bySigTraitsMock, 'WrongNonceType');
        });
    });
    describe('deadline', function () {
        it('should return correct deadline', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value1 = (0, bySig_1.buildBySigTraits)({ deadline: 1 });
            (0, expect_1.expect)(await bySigTraitsMock.deadline(value1)).to.be.equal(1);
            const value2 = (0, bySig_1.buildBySigTraits)({ deadline: 100 });
            (0, expect_1.expect)(await bySigTraitsMock.deadline(value2)).to.be.equal(100);
            const value3 = (0, bySig_1.buildBySigTraits)({ deadline: 0xffffffff });
            (0, expect_1.expect)(await bySigTraitsMock.deadline(value3)).to.be.equal(0xffffffff);
        });
    });
    describe('isRelayerAllowed', function () {
        it('should be allowed with non-setted relayer', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)();
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, bySigTraitsMock)).to.be.equal(true);
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, prelude_1.constants.EEE_ADDRESS)).to.be.equal(true);
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, prelude_1.constants.ZERO_ADDRESS)).to.be.equal(true);
        });
        it('should be allowed with setted relayer', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ relayer: prelude_1.constants.EEE_ADDRESS });
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, prelude_1.constants.EEE_ADDRESS)).to.be.equal(true);
        });
        it('should be allowed with setted only 80-bits of relayer address', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const relayer = prelude_1.constants.ZERO_ADDRESS.substring(0, 22) + (await bySigTraitsMock.getAddress()).substring(22, 42);
            const value = (0, bySig_1.buildBySigTraits)({ relayer });
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, bySigTraitsMock)).to.be.equal(true);
        });
        it('should be denied with setted another relayer', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ relayer: prelude_1.constants.EEE_ADDRESS });
            (0, expect_1.expect)(await bySigTraitsMock.isRelayerAllowed(value, bySigTraitsMock)).to.be.equal(false);
        });
    });
    describe('nonce', function () {
        it('should return correct nonce', async function () {
            const { bySigTraitsMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressArrayMock);
            const value = (0, bySig_1.buildBySigTraits)({ nonce: 1024 });
            (0, expect_1.expect)(await bySigTraitsMock.nonce(value)).to.be.equal(1024);
        });
    });
});
