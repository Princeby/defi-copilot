"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../../src/expect");
const permit_1 = require("../../src/permit");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const value = 42n;
describe('Permitable', function () {
    let signer1;
    let signer2;
    before(async function () {
        [signer1, signer2] = await hardhat_1.ethers.getSigners();
    });
    async function deployTokens() {
        const PermitAndCallMockFactory = await hardhat_1.ethers.getContractFactory('PermitAndCallMock');
        const ERC20PermitMockFactory = await hardhat_1.ethers.getContractFactory('ERC20PermitMock');
        const chainId = Number((await hardhat_1.ethers.provider.getNetwork()).chainId);
        const permitAndCallMock = await PermitAndCallMockFactory.deploy();
        const erc20PermitMock = await ERC20PermitMockFactory.deploy('USDC', 'USDC', signer1, 100n);
        return { permitAndCallMock, erc20PermitMock, chainId };
    }
    it('should work with valid permit', async function () {
        const { permitAndCallMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), true);
        const tx = await permitAndCallMock.permitAndCall(erc20PermitMock.target + (0, permit_1.trim0x)(permit), (await permitAndCallMock.foo.populateTransaction()).data);
        await (0, expect_1.expect)(tx).to.emit(permitAndCallMock, 'FooCalled');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1.address, permitAndCallMock.target)).to.equal(value);
    });
    it('should work with invalid permit', async function () {
        const { permitAndCallMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const badPermit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '2', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), true);
        const tx = await permitAndCallMock.permitAndCall(erc20PermitMock.target + (0, permit_1.trim0x)(badPermit), (await permitAndCallMock.foo.populateTransaction()).data);
        await (0, expect_1.expect)(tx).to.emit(permitAndCallMock, 'FooCalled');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1.address, permitAndCallMock.target)).to.equal(0);
    });
    it('should work with nested permit', async function () {
        const { permitAndCallMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit1 = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), true);
        const permit2 = await (0, permit_1.getPermit)(signer2, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), false);
        const fooCall = (await permitAndCallMock.foo.populateTransaction()).data;
        const innerPermitCalldata = (await permitAndCallMock.permitAndCall.populateTransaction(erc20PermitMock.target + (0, permit_1.trim0x)(permit2), fooCall)).data;
        const tx = await permitAndCallMock.permitAndCall(erc20PermitMock.target + (0, permit_1.trim0x)(permit1), innerPermitCalldata);
        await (0, expect_1.expect)(tx).to.emit(permitAndCallMock, 'FooCalled');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1.address, permitAndCallMock.target)).to.equal(value);
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer2.address, permitAndCallMock.target)).to.equal(value);
    });
    it('should work with payable function', async function () {
        const { permitAndCallMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), true);
        const tx = await permitAndCallMock.permitAndCall(erc20PermitMock.target + (0, permit_1.trim0x)(permit), (await permitAndCallMock.payableFoo.populateTransaction()).data, { value: 1n });
        await (0, expect_1.expect)(tx).to.emit(permitAndCallMock, 'MsgValue').withArgs(1n);
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1.address, permitAndCallMock.target)).to.equal(value);
    });
    it('should work with payable function and nested permit', async function () {
        const { permitAndCallMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit1 = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), true);
        const permit2 = await (0, permit_1.getPermit)(signer2, erc20PermitMock, '1', chainId, await permitAndCallMock.getAddress(), value.toString(), 0x8fffffff.toString(), false);
        const fooCall = (await permitAndCallMock.payableFoo.populateTransaction()).data;
        const innerPermitCalldata = (await permitAndCallMock.permitAndCall.populateTransaction(erc20PermitMock.target + (0, permit_1.trim0x)(permit2), fooCall)).data;
        const tx = await permitAndCallMock.permitAndCall(erc20PermitMock.target + (0, permit_1.trim0x)(permit1), innerPermitCalldata, { value: 1n });
        await (0, expect_1.expect)(tx).to.emit(permitAndCallMock, 'MsgValue').withArgs(1n);
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1.address, permitAndCallMock.target)).to.equal(value);
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer2.address, permitAndCallMock.target)).to.equal(value);
    });
});
