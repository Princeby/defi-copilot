"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
describe('WethReceiver', function () {
    let signer1;
    before(async function () {
        [signer1] = await hardhat_1.ethers.getSigners();
    });
    async function deployMocks() {
        const EthSenderMock = await hardhat_1.ethers.getContractFactory('EthSenderMock');
        const ethSenderMock = await EthSenderMock.deploy();
        const WethReceiverMock = await hardhat_1.ethers.getContractFactory('WethReceiverMock');
        const wethReceiverMock = await WethReceiverMock.deploy(ethSenderMock);
        return { wethReceiverMock, ethSenderMock };
    }
    it('contract transfer', async function () {
        const { wethReceiverMock, ethSenderMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployMocks);
        await ethSenderMock.transfer(wethReceiverMock, { value: 100 });
    });
    it('normal transfer', async function () {
        const { wethReceiverMock } = await (0, hardhat_network_helpers_1.loadFixture)(deployMocks);
        await (0, expect_1.expect)(signer1.sendTransaction({ to: wethReceiverMock, value: 100 })).to.be.revertedWithCustomError(wethReceiverMock, 'EthDepositRejected');
    });
});
