"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = require("hardhat");
describe('RevertReasonParser', function () {
    async function deployRevertReasonParserTest() {
        const RevertReasonParserTest = await hardhat_1.ethers.getContractFactory('RevertReasonParserTest');
        const revertReasonParserTest = await RevertReasonParserTest.deploy();
        return { revertReasonParserTest };
    }
    it('should be parsed as Unknown (Invalid revert reason)', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testParseWithThrow();
    });
    it('should be parsed as empty Error', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testEmptyStringRevert();
    });
    it('should be parsed as Error', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testNonEmptyRevert();
    });
    it('should be parsed as Unknown', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testEmptyRevert();
    });
    it('should be parsed as Panic', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testAssertion();
    });
    it('should be parsed as Error with long string', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await revertReasonParserTest.testLongStringRevert();
    });
    it('should be reverted in _test()', async function () {
        const { revertReasonParserTest } = await (0, hardhat_network_helpers_1.loadFixture)(deployRevertReasonParserTest);
        await (0, expect_1.expect)(revertReasonParserTest.testWithThrow()).to.be.revertedWithCustomError(revertReasonParserTest, 'TestDidNotThrow');
    });
});
