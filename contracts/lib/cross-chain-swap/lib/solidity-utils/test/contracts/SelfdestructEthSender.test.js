"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../../src/expect");
const prelude_1 = require("../../src/prelude");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
describe('SelfdestructEthSender', function () {
    let signer0;
    let signer1;
    before(async function () {
        [signer0, signer1] = await hardhat_1.ethers.getSigners();
    });
    async function deployMocks() {
        const EthSender = await hardhat_1.ethers.getContractFactory('SelfdestructEthSenderMock');
        const ethSender = await EthSender.deploy();
        return { ethSender };
    }
    it('should send Ethers with selfdestruct', async function () {
        const { ethSender } = await (0, hardhat_network_helpers_1.loadFixture)(deployMocks);
        const ethSenderAddress = await ethSender.getAddress();
        await signer0.sendTransaction({ to: ethSenderAddress, value: (0, prelude_1.ether)('1') });
        const receipt0 = await (await ethSender.transferBalance(signer1.address)).wait();
        console.log('send ethers without selfdestruct', receipt0.gasUsed.toString());
        await signer0.sendTransaction({ to: ethSenderAddress, value: (0, prelude_1.ether)('1') });
        const balanceOfAddr1 = await hardhat_1.ethers.provider.getBalance(signer1.address);
        const receipt1 = await (await ethSender.stopAndTransferBalance(signer1.address)).wait();
        console.log('send all ethers', receipt1.gasUsed.toString());
        (0, expect_1.expect)(await hardhat_1.ethers.provider.getBalance(signer1.address)).to.be.eq(balanceOfAddr1 + (0, prelude_1.ether)('1'));
        (0, expect_1.expect)(await hardhat_1.ethers.provider.getBalance(ethSenderAddress)).to.be.eq((0, prelude_1.ether)('0'));
        (0, expect_1.expect)(await hardhat_1.ethers.provider.getCode(ethSenderAddress)).to.be.not.eq('0x');
    });
});
