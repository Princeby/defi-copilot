"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../src/expect");
const permit_1 = require("../src/permit");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe('Permit library', function () {
    let signer1;
    before(async function () {
        [signer1] = await hardhat_1.ethers.getSigners();
    });
    async function deployTokens() {
        const ERC20PermitMock = await hardhat_1.ethers.getContractFactory('ERC20PermitMock');
        const DaiLikePermitMock = await hardhat_1.ethers.getContractFactory('DaiLikePermitMock');
        const chainId = Number((await hardhat_1.ethers.provider.getNetwork()).chainId);
        const erc20PermitMock = await ERC20PermitMock.deploy('USDC', 'USDC', signer1, 100n);
        const daiLikePermitMock = await DaiLikePermitMock.deploy('DAI', 'DAI', signer1, 100n);
        return { erc20PermitMock, daiLikePermitMock, chainId };
    }
    it('should be trimmed', async function () {
        (0, expect_1.expect)((0, permit_1.trim0x)('0x123456')).to.be.equal('123456');
    });
    it('should not be changed', async function () {
        (0, expect_1.expect)((0, permit_1.trim0x)('123456')).to.be.equal('123456');
    });
    it('should correctly build data for permit', async function () {
        const { erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const name = await erc20PermitMock.name();
        const data = (0, permit_1.buildData)(name, '1', chainId, await erc20PermitMock.getAddress(), signer1.address, signer1.address, '1', '1');
        (0, expect_1.expect)(data).to.be.deep.equal({
            types: {
                Permit: permit_1.Permit,
            },
            domain: {
                name,
                version: '1',
                chainId: 31337,
                verifyingContract: await erc20PermitMock.getAddress(),
            },
            message: {
                owner: signer1.address,
                spender: signer1.address,
                value: '1',
                nonce: '1',
                deadline: permit_1.defaultDeadline,
            },
        });
    });
    it('should correctly build data for dai-like permit', async function () {
        const { daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const name = await daiLikePermitMock.name();
        const data = (0, permit_1.buildDataLikeDai)(name, '1', chainId, await daiLikePermitMock.getAddress(), signer1.address, signer1.address, '1', true);
        (0, expect_1.expect)(data).to.be.deep.equal({
            types: {
                Permit: permit_1.DaiLikePermit,
            },
            domain: {
                name,
                version: '1',
                chainId: 31337,
                verifyingContract: await daiLikePermitMock.getAddress(),
            },
            message: {
                holder: signer1.address,
                spender: signer1.address,
                nonce: '1',
                allowed: true,
                expiry: permit_1.defaultDeadline,
            },
        });
    });
    it('should concat target with prefixed data', async function () {
        (0, expect_1.expect)((0, permit_1.withTarget)('0x123456', '0x123456')).to.be.equal('0x123456123456');
    });
    it('should concat target with raw data', async function () {
        (0, expect_1.expect)((0, permit_1.withTarget)('0x123456', '123456')).to.be.equal('0x123456123456');
    });
});
