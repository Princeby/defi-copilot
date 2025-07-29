"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../src/expect");
const permit_1 = require("../src/permit");
const prelude_1 = require("../src/prelude");
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
        const PermitableMockFactory = await hardhat_1.ethers.getContractFactory('PermitableMock');
        const ERC20PermitMockFactory = await hardhat_1.ethers.getContractFactory('ERC20PermitMock');
        const DaiLikePermitMockFactory = await hardhat_1.ethers.getContractFactory('DaiLikePermitMock');
        const USDCLikePermitMockFactory = await hardhat_1.ethers.getContractFactory('USDCLikePermitMock');
        const SafeERC20Factory = await hardhat_1.ethers.getContractFactory('SafeERC20');
        const IsValidSignatureMockFactory = await hardhat_1.ethers.getContractFactory('ERC1271WalletMock');
        const chainId = Number((await hardhat_1.ethers.provider.getNetwork()).chainId);
        const permitableMock = await PermitableMockFactory.deploy();
        const erc20PermitMock = await ERC20PermitMockFactory.deploy('USDC', 'USDC', signer1, 100n);
        const daiLikePermitMock = await DaiLikePermitMockFactory.deploy('DAI', 'DAI', signer1, 100n);
        const usdcLikePermitMock = await USDCLikePermitMockFactory.deploy('USDCP', 'USDCP', signer1, 100n);
        const safeERC20 = await SafeERC20Factory.attach(permitableMock);
        const isValidSignatureMock = await IsValidSignatureMockFactory.deploy(signer1);
        return { permitableMock, erc20PermitMock, daiLikePermitMock, usdcLikePermitMock, safeERC20, isValidSignatureMock, chainId };
    }
    it('should be permitted for IERC20Permit', async function () {
        const { permitableMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitableMock.getAddress(), value.toString());
        await permitableMock.mockPermit(erc20PermitMock, permit);
        (0, expect_1.expect)(await erc20PermitMock.nonces(signer1)).to.be.equal('1');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1, permitableMock)).to.be.equal(value);
    });
    it('should be permitted for IERC20Permit (compact)', async function () {
        const { permitableMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitableMock.getAddress(), value.toString(), prelude_1.constants.MAX_UINT256.toString(), true);
        await permitableMock.mockPermitCompact(erc20PermitMock, permit);
        (0, expect_1.expect)(await erc20PermitMock.nonces(signer1)).to.be.equal('1');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1, permitableMock)).to.be.equal(value);
    });
    it('should be permitted for IERC20Permit with deadline less than max int', async function () {
        const { permitableMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
        const block = await hardhat_1.ethers.provider.getBlock(blockNumber);
        const deadline = block ? block.timestamp + 1000 : 6421990892; // 03 Jul 2173 00:00:00 GMT+0000
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitableMock.getAddress(), value.toString(), deadline.toString());
        await permitableMock.mockPermit(erc20PermitMock, permit);
        (0, expect_1.expect)(await erc20PermitMock.nonces(signer1)).to.be.equal('1');
        (0, expect_1.expect)(await erc20PermitMock.allowance(signer1, permitableMock)).to.be.equal(value);
    });
    it('should be not permitted for IERC20Permit with deadline less than current block', async function () {
        const { permitableMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const blockNumber = await hardhat_1.ethers.provider.getBlockNumber();
        const block = await hardhat_1.ethers.provider.getBlock(blockNumber);
        const deadline = block ? block.timestamp - 1000 : 1000;
        const permit = await (0, permit_1.getPermit)(signer1, erc20PermitMock, '1', chainId, await permitableMock.getAddress(), value.toString(), deadline.toString());
        await (0, expect_1.expect)(permitableMock.mockPermit(erc20PermitMock, permit)).to.be.revertedWithCustomError(erc20PermitMock, 'ERC2612ExpiredSignature');
    });
    it('should not be permitted for IERC20Permit', async function () {
        const { permitableMock, erc20PermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const name = await erc20PermitMock.name();
        const nonce = await erc20PermitMock.nonces(signer1);
        const data = (0, permit_1.buildData)(name, '1', chainId, await erc20PermitMock.getAddress(), signer1.address, signer2.address, value.toString(), nonce.toString());
        const signature = await signer1.signTypedData(data.domain, data.types, data.message);
        const { v, r, s } = hardhat_1.ethers.Signature.from(signature);
        // spender is signer1 but in signature spender was signer2
        const permit = (0, permit_1.cutSelector)(erc20PermitMock.interface.encodeFunctionData('permit', [
            signer1.address,
            signer1.address,
            value,
            permit_1.defaultDeadline,
            v,
            r,
            s,
        ]));
        await (0, expect_1.expect)(permitableMock.mockPermit(erc20PermitMock, permit)).to.be.revertedWithCustomError(erc20PermitMock, 'ERC2612InvalidSigner');
    });
    it('should be permitted for IDaiLikePermit', async function () {
        const { permitableMock, daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermitLikeDai)(signer1, daiLikePermitMock, '1', chainId, await permitableMock.getAddress(), true);
        await permitableMock.mockPermit(daiLikePermitMock, permit);
        (0, expect_1.expect)(await daiLikePermitMock.nonces(signer1)).to.be.equal('1');
        (0, expect_1.expect)(await daiLikePermitMock.allowance(signer1, permitableMock)).to.be.equal(prelude_1.constants.MAX_UINT128);
    });
    it('should be permitted for IPermit2', async function () {
        const { permitableMock, daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permitContract = await (0, permit_1.permit2Contract)();
        const permit = await (0, permit_1.getPermit2)(signer1, await daiLikePermitMock.getAddress(), chainId, signer2.address, prelude_1.constants.MAX_UINT128);
        await permitableMock.mockPermit(daiLikePermitMock, permit);
        const allowance = await permitContract.allowance(signer1, daiLikePermitMock, signer2);
        (0, expect_1.expect)(allowance.amount).to.equal(prelude_1.constants.MAX_UINT128);
        (0, expect_1.expect)(allowance.nonce).to.equal(1);
    });
    it('should be permitted for IPermit2, compact', async function () {
        const { permitableMock, daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permitContract = await (0, permit_1.permit2Contract)();
        const permit = await (0, permit_1.getPermit2)(signer1, await daiLikePermitMock.getAddress(), chainId, await permitableMock.getAddress(), prelude_1.constants.MAX_UINT128, true);
        await permitableMock.mockPermitCompact(daiLikePermitMock, permit);
        const allowance = await permitContract.allowance(signer1, daiLikePermitMock, permitableMock);
        (0, expect_1.expect)(allowance.amount).to.equal(prelude_1.constants.MAX_UINT128);
        (0, expect_1.expect)(allowance.nonce).to.equal(1);
    });
    it('should be permitted for IDaiLikePermit (compact)', async function () {
        const { permitableMock, daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const permit = await (0, permit_1.getPermitLikeDai)(signer1, daiLikePermitMock, '1', chainId, await permitableMock.getAddress(), true, prelude_1.constants.MAX_UINT256.toString(), true);
        await permitableMock.mockPermitCompact(daiLikePermitMock, permit);
        (0, expect_1.expect)(await daiLikePermitMock.nonces(signer1)).to.be.equal('1');
        (0, expect_1.expect)(await daiLikePermitMock.allowance(signer1, permitableMock)).to.be.equal(prelude_1.constants.MAX_UINT128);
    });
    it('should not be permitted for IDaiLikePermit', async function () {
        const { permitableMock, daiLikePermitMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const name = await daiLikePermitMock.name();
        const nonce = await daiLikePermitMock.nonces(signer1);
        const data = (0, permit_1.buildDataLikeDai)(name, '1', chainId, await daiLikePermitMock.getAddress(), signer1.address, signer2.address, nonce.toString(), true);
        const signature = await signer1.signTypedData(data.domain, data.types, data.message);
        const { v, r, s } = hardhat_1.ethers.Signature.from(signature);
        // spender is signer1 but in signature spender was signer2
        const permit = (0, permit_1.cutSelector)(daiLikePermitMock.interface.encodeFunctionData('permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)', [signer1.address, signer1.address, nonce, permit_1.defaultDeadline.toString(), true, v, r, s]));
        await (0, expect_1.expect)(permitableMock.mockPermit(daiLikePermitMock, permit)).to.be.revertedWith('Dai/invalid-permit');
    });
    it('should be permitted for IERC7597Permit', async function () {
        const { permitableMock, usdcLikePermitMock, isValidSignatureMock, chainId } = await (0, hardhat_network_helpers_1.loadFixture)(deployTokens);
        const owner = await isValidSignatureMock.getAddress();
        const permit = await (0, permit_1.getPermitLikeUSDC)(owner, signer1, usdcLikePermitMock, '1', chainId, await permitableMock.getAddress(), value.toString());
        await permitableMock.mockPermit(usdcLikePermitMock, permit);
        (0, expect_1.expect)(await usdcLikePermitMock.nonces(owner)).to.be.equal(1);
        (0, expect_1.expect)(await usdcLikePermitMock.allowance(owner, permitableMock)).to.be.equal(value);
    });
});
