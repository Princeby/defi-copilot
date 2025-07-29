"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prelude_1 = require("../../src/prelude");
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
describe('AddressSet', function () {
    let signer1;
    let signer2;
    let signer3;
    before(async function () {
        [signer1, signer2, signer3] = await hardhat_1.ethers.getSigners();
    });
    async function deployAddressSetMock() {
        const AddressSetMock = await hardhat_1.ethers.getContractFactory('AddressSetMock');
        const addressSetMock = await AddressSetMock.deploy();
        return { addressSetMock };
    }
    describe('length', function () {
        it('should get length 0', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            (0, expect_1.expect)(await addressSetMock.length()).to.be.equal('0');
        });
        it('should get length 1', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.length()).to.be.equal('1');
        });
    });
    describe('at', function () {
        it('should not get from empty set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await (0, expect_1.expect)(addressSetMock.at(0)).to.be.revertedWithCustomError(addressSetMock, 'IndexOutOfBounds');
            await (0, expect_1.expect)(addressSetMock.at(1)).to.be.revertedWithCustomError(addressSetMock, 'IndexOutOfBounds');
        });
        it('should not get index out of array length', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await (0, expect_1.expect)(addressSetMock.at(await addressSetMock.length())).to.be.revertedWithCustomError(addressSetMock, 'IndexOutOfBounds');
        });
        it('should get from set with 1 element', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.at(0)).to.be.equal(signer1.address);
            await (0, expect_1.expect)(addressSetMock.at(1)).to.be.revertedWithCustomError(addressSetMock, 'IndexOutOfBounds');
        });
        it('should get from set with several elements', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            (0, expect_1.expect)(await addressSetMock.at(0)).to.be.equal(signer1.address);
            (0, expect_1.expect)(await addressSetMock.at(1)).to.be.equal(signer2.address);
        });
    });
    describe('unsafeAt', function () {
        it('should get from empty set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(0)).to.be.equal(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(1)).to.be.equal(prelude_1.constants.ZERO_ADDRESS);
        });
        it('should get from set with 1 element', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(0)).to.be.equal(signer1.address);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(1)).to.be.equal(prelude_1.constants.ZERO_ADDRESS);
        });
        it('should get from set with several elements', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(0)).to.be.equal(signer1.address);
            (0, expect_1.expect)(await addressSetMock.unsafeAt(1)).to.be.equal(signer2.address);
        });
    });
    describe('contains', function () {
        it('should not contain in empty set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            (0, expect_1.expect)(await addressSetMock.contains(signer1)).to.be.false;
            (0, expect_1.expect)(await addressSetMock.contains(signer2)).to.be.false;
            (0, expect_1.expect)(await addressSetMock.contains(prelude_1.constants.ZERO_ADDRESS)).to.be.false;
        });
        it('should contain 1 address', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.contains(signer1)).to.be.true;
            (0, expect_1.expect)(await addressSetMock.contains(signer2)).to.be.false;
            (0, expect_1.expect)(await addressSetMock.contains(prelude_1.constants.ZERO_ADDRESS)).to.be.false;
        });
        it('should contains several addresses', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            (0, expect_1.expect)(await addressSetMock.contains(signer1)).to.be.true;
            (0, expect_1.expect)(await addressSetMock.contains(signer2)).to.be.true;
            (0, expect_1.expect)(await addressSetMock.contains(signer3)).to.be.false;
            (0, expect_1.expect)(await addressSetMock.contains(prelude_1.constants.ZERO_ADDRESS)).to.be.false;
        });
    });
    describe('add', function () {
        it('should add to empty set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            const isAdded = await addressSetMock.add.staticCall(signer1);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.contains(signer1)).to.be.equal(isAdded);
        });
        it('should not add element twice', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            (0, expect_1.expect)(await addressSetMock.add.staticCall(signer1)).to.be.false;
        });
        it('should add to set with 1 element', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            const isAdded = await addressSetMock.add.staticCall(signer2);
            await addressSetMock.add(signer2);
            (0, expect_1.expect)(await addressSetMock.contains(signer2)).to.be.equal(isAdded);
        });
        it('should not add element twice to set with 1 element', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            (0, expect_1.expect)(await addressSetMock.add.staticCall(signer2)).to.be.false;
        });
    });
    describe('remove', function () {
        it('should not remove from empty set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            const isRemoved = await addressSetMock.remove.staticCall(signer1);
            (0, expect_1.expect)(isRemoved).to.be.false;
        });
        it('should remove from set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            const isRemoved = await addressSetMock.remove.staticCall(signer1);
            await addressSetMock.remove(signer1);
            (0, expect_1.expect)(isRemoved).to.be.true;
            (0, expect_1.expect)(await addressSetMock.contains(signer1)).to.be.false;
        });
        it('should not remove element which is not in set', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            const isRemoved = await addressSetMock.remove.staticCall(signer2);
            (0, expect_1.expect)(isRemoved).to.be.false;
        });
        it('should remove from set and keep other elements', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            const isRemoved = await addressSetMock.remove.staticCall(signer1);
            await addressSetMock.remove(signer1);
            (0, expect_1.expect)(isRemoved).to.be.true;
            (0, expect_1.expect)(await addressSetMock.get()).to.be.deep.equal([signer2.address]);
        });
    });
    describe('multiple add/remove', function () {
        it('should add and remove multiple times', async function () {
            const { addressSetMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployAddressSetMock);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            await addressSetMock.remove(signer2);
            await addressSetMock.remove(signer1);
            await addressSetMock.add(signer1);
            await addressSetMock.add(signer2);
            await addressSetMock.remove(signer2);
            await addressSetMock.remove(signer1);
        });
    });
});
