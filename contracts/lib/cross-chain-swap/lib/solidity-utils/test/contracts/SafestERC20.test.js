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
Object.defineProperty(exports, "__esModule", { value: true });
const prelude_1 = require("../../src/prelude");
const expect_1 = require("../../src/expect");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_1 = __importStar(require("hardhat"));
const ethers_1 = require("ethers");
const permit2_sdk_1 = require("@uniswap/permit2-sdk");
const utils_1 = require("../../src/utils");
const Permit = [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
];
describe('SafeERC20', function () {
    let owner;
    let spender;
    let SafeERC20Wrapper;
    let SafeWETHWrapper;
    before(async function () {
        [owner, spender] = await hardhat_1.ethers.getSigners();
        SafeERC20Wrapper = await hardhat_1.ethers.getContractFactory('SafeERC20Wrapper');
        SafeWETHWrapper = await hardhat_1.ethers.getContractFactory('SafeWETHWrapper');
    });
    async function deployWrapperSimple() {
        const wrapper = await SafeERC20Wrapper.deploy(spender);
        await wrapper.waitForDeployment();
        return { wrapper };
    }
    async function deployWrapperFalseMock() {
        const ERC20ReturnFalseMock = await hardhat_1.ethers.getContractFactory('ERC20ReturnFalseMock');
        const falseMock = await ERC20ReturnFalseMock.deploy();
        await falseMock.waitForDeployment();
        const wrapper = await SafeERC20Wrapper.deploy(falseMock);
        await wrapper.waitForDeployment();
        return { wrapper };
    }
    async function deployPermit2Mock() {
        const Permit2ReturnTrueMock = await hardhat_1.ethers.getContractFactory('Permit2ReturnTrueMock');
        const permit2Mock = await Permit2ReturnTrueMock.deploy();
        await permit2Mock.waitForDeployment();
        return { permit2Mock };
    }
    async function deployWrapperTrueMock() {
        const ERC20ReturnTrueMock = await hardhat_1.ethers.getContractFactory('ERC20ReturnTrueMock');
        const trueMock = await ERC20ReturnTrueMock.deploy();
        await trueMock.waitForDeployment();
        const wrapper = await SafeERC20Wrapper.deploy(trueMock);
        await wrapper.waitForDeployment();
        return { wrapper };
    }
    async function deployWrapperNoReturnMock() {
        const ERC20NoReturnMock = await hardhat_1.ethers.getContractFactory('ERC20NoReturnMock');
        const noReturnMock = await ERC20NoReturnMock.deploy();
        await noReturnMock.waitForDeployment();
        const wrapper = await SafeERC20Wrapper.deploy(noReturnMock);
        await wrapper.waitForDeployment();
        return { wrapper };
    }
    async function deployWrapperZeroApprove() {
        const ERC20ThroughZeroApprove = await hardhat_1.ethers.getContractFactory('ERC20ThroughZeroApprove');
        const zeroApprove = await ERC20ThroughZeroApprove.deploy();
        await zeroApprove.waitForDeployment();
        const wrapper = await SafeERC20Wrapper.deploy(zeroApprove);
        await wrapper.waitForDeployment();
        return { wrapper };
    }
    async function deployPermitNoRevertAndSign() {
        const ERC20PermitNoRevertMock = await hardhat_1.ethers.getContractFactory('ERC20PermitNoRevertMock');
        const token = await ERC20PermitNoRevertMock.deploy();
        await token.waitForDeployment();
        const wrapper = await SafeERC20Wrapper.deploy(token);
        await wrapper.waitForDeployment();
        const chainId = await token.getChainId();
        const domain = {
            name: 'ERC20PermitNoRevertMock',
            version: '1',
            chainId,
            verifyingContract: await token.getAddress(),
        };
        const data = {
            owner: owner.address,
            spender: spender.address,
            value: '42',
            nonce: '0',
            deadline: prelude_1.constants.MAX_UINT256,
        };
        //console.log(data);
        const signature = ethers_1.Signature.from(await owner.signTypedData(domain, { Permit }, data));
        return { token, wrapper, data, signature };
    }
    async function deployWrapperWETH() {
        const WETH = await hardhat_1.ethers.getContractFactory('WETH');
        const weth = await WETH.deploy();
        await weth.waitForDeployment();
        const wrapper = await SafeWETHWrapper.deploy(weth);
        await wrapper.waitForDeployment();
        return { weth, wrapper };
    }
    async function deployWrapperWETHAndDeposit() {
        const { weth, wrapper } = await deployWrapperWETH();
        await wrapper.deposit({ value: (0, prelude_1.ether)('1') });
        return { weth, wrapper };
    }
    async function deployERC20WithSafeBalance() {
        const WETH = await hardhat_1.ethers.getContractFactory('WETH');
        const weth = await WETH.deploy();
        await weth.waitForDeployment();
        const ERC20WithSafeBalance = await hardhat_1.ethers.getContractFactory('ERC20WithSafeBalance');
        const wrapper = await ERC20WithSafeBalance.deploy(weth);
        await wrapper.waitForDeployment();
        return { weth, wrapper };
    }
    describe('with address that has no contract code', function () {
        shouldRevertOnAllCalls({
            transfer: 'SafeTransferFailed',
            transferFrom: 'SafeTransferFromFailed',
            approve: 'ForceApproveFailed',
            changeAllowance: '',
        }, deployWrapperSimple);
    });
    describe('with token that returns false on all calls', function () {
        shouldRevertOnAllCalls({
            transfer: 'SafeTransferFailed',
            transferFrom: 'SafeTransferFromFailed',
            approve: 'ForceApproveFailed',
        }, deployWrapperFalseMock);
    });
    describe('with token that returns true on all calls', function () {
        shouldOnlyRevertOnErrors(deployWrapperTrueMock);
    });
    describe('with token that returns no boolean values', function () {
        shouldOnlyRevertOnErrors(deployWrapperNoReturnMock);
    });
    describe('non-zero to non-zero approval forbidden', function () {
        it('zero to non-zero approval should pass', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperZeroApprove);
            await wrapper.approve(100);
        });
        it('non-zero to non-zero approval should pass', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperZeroApprove);
            await wrapper.approve(100);
            await wrapper.approve(100);
        });
        it('non-zero to zero to non-zero approval should pass', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperZeroApprove);
            await wrapper.approve(100);
            await wrapper.approve(0);
            await wrapper.approve(100);
        });
    });
    describe('safeBalanceOf', function () {
        it('should be cheaper than balanceOf', async function () {
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployERC20WithSafeBalance);
                const tx = await wrapper.balanceOf.populateTransaction(owner);
                const response = await owner.sendTransaction(tx);
                const gasUsed = (await response.wait()).gasUsed;
                const safeTx = await wrapper.safeBalanceOf.populateTransaction(owner);
                const safeRequest = await owner.sendTransaction(safeTx);
                const safeGasUsed = (await safeRequest.wait()).gasUsed;
                (0, expect_1.expect)(gasUsed).gt(safeGasUsed);
                console.log(`balanceOf:safeBalanceOf gasUsed - ${gasUsed.toString()}:${safeGasUsed.toString()}`);
            }
        });
    });
    describe("with token that doesn't revert on invalid permit", function () {
        it('accepts owner signature', async function () {
            const { token, wrapper, data, signature } = await (0, hardhat_network_helpers_1.loadFixture)(deployPermitNoRevertAndSign);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('0');
            (0, expect_1.expect)(await token.allowance(owner, spender)).to.equal('0');
            await wrapper.permit(data.owner, data.spender, data.value, data.deadline, signature.v, signature.r, signature.s);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('1');
            (0, expect_1.expect)(await token.allowance(owner, spender)).to.equal(data.value);
        });
        it('revert on reused signature', async function () {
            const { token, wrapper, data, signature } = await (0, hardhat_network_helpers_1.loadFixture)(deployPermitNoRevertAndSign);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('0');
            // use valid signature and consume nounce
            await wrapper.permit(data.owner, data.spender, data.value, data.deadline, signature.v, signature.r, signature.s);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('1');
            // invalid call does not revert for this token implementation
            await token.permit(data.owner, data.spender, data.value, data.deadline, signature.v, signature.r, signature.s);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('1');
            // ignore invalid call when called through the SafeERC20 library
            await wrapper.permit(data.owner, data.spender, data.value, data.deadline, signature.v, signature.r, signature.s);
            (0, expect_1.expect)(await token.nonces(owner)).to.equal('1');
        });
        it('revert on invalid signature', async function () {
            const { token, wrapper, data } = await (0, hardhat_network_helpers_1.loadFixture)(deployPermitNoRevertAndSign);
            // signature that is not valid for owner
            const invalidSignature = {
                v: 27,
                r: '0x71753dc5ecb5b4bfc0e3bc530d79ce5988760ed3f3a234c86a5546491f540775',
                s: '0x0049cedee5aed990aabed5ad6a9f6e3c565b63379894b5fa8b512eb2b79e485d',
            };
            // invalid call does not revert for this token implementation
            await token.permit(data.owner, data.spender, data.value, data.deadline, invalidSignature.v, invalidSignature.r, invalidSignature.s);
            // ignores call revert when called through the SafeERC20 library
            await wrapper.permit(data.owner, data.spender, data.value, data.deadline, invalidSignature.v, invalidSignature.r, invalidSignature.s);
        });
    });
    describe('IWETH methods', function () {
        it('should deposit tokens', async function () {
            const { weth, wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperWETH);
            const [received, tx] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, weth, await wrapper.getAddress(), () => wrapper.deposit({ value: (0, prelude_1.ether)('1') }));
            (0, expect_1.expect)(received).to.be.equal((0, prelude_1.ether)('1'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.logs[0].transactionHash, ['STATICCALL', 'CALL', 'MSTORE', 'MLOAD', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 1, 6, 1, 1, 2,
                ]);
            }
        });
        it('should be cheap on deposit 0 tokens', async function () {
            const { weth, wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperWETH);
            const tx = (await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, weth, await wrapper.getAddress(), () => wrapper.deposit()))[1];
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.hash, ['STATICCALL', 'CALL', 'MSTORE', 'MLOAD', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 0, 1, 0, 0, 1,
                ]);
            }
        });
        it('should withdrawal tokens on withdraw', async function () {
            const { weth, wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperWETHAndDeposit);
            const [received] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, weth, await wrapper.getAddress(), () => wrapper.withdraw((0, prelude_1.ether)('0.5')));
            (0, expect_1.expect)(received).to.be.equal(-(0, prelude_1.ether)('0.5'));
        });
        it('should withdrawal tokens on withdrawTo', async function () {
            const { weth, wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperWETHAndDeposit);
            const spenderBalanceBefore = await hardhat_1.ethers.provider.getBalance(spender);
            const [received, tx] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, weth, await wrapper.getAddress(), () => wrapper.withdrawTo((0, prelude_1.ether)('0.5'), spender));
            (0, expect_1.expect)(received).to.be.equal(-(0, prelude_1.ether)('0.5'));
            (0, expect_1.expect)(await hardhat_1.ethers.provider.getBalance(spender)).to.be.equal(spenderBalanceBefore + (0, prelude_1.ether)('0.5'));
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.hash, ['STATICCALL', 'CALL'])).to.be.deep.equal([
                    0, 3,
                ]);
            }
        });
        it('should be cheap on withdrawTo to self', async function () {
            const { weth, wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(deployWrapperWETHAndDeposit);
            const tx = (await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, weth, await wrapper.getAddress(), () => wrapper.withdrawTo((0, prelude_1.ether)('0.5'), wrapper)))[1];
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.hash, ['STATICCALL', 'CALL'])).to.be.deep.equal([
                    0, 2,
                ]);
            }
        });
    });
    function shouldRevertOnAllCalls(reasons, fixture) {
        it('reverts on transfer', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await (0, expect_1.expect)(wrapper.transfer()).to.be.revertedWithCustomError(wrapper, reasons.transfer);
        });
        it('reverts on transferFrom', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await (0, expect_1.expect)(wrapper.transferFrom()).to.be.revertedWithCustomError(wrapper, reasons.transferFrom);
        });
        it('reverts on approve', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await (0, expect_1.expect)(wrapper.approve(0)).to.be.revertedWithCustomError(wrapper, reasons.approve);
        });
        it('reverts on increaseAllowance', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            if (reasons.changeAllowance === '') {
                await (0, expect_1.expect)(wrapper.increaseAllowance(0)).to.be.reverted;
            }
            else {
                await (0, expect_1.expect)(wrapper.increaseAllowance(0)).to.be.revertedWithCustomError(wrapper, reasons.approve);
            }
        });
        it('reverts on decreaseAllowance', async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            if (reasons.changeAllowance === '') {
                await (0, expect_1.expect)(wrapper.decreaseAllowance(0)).to.be.reverted;
            }
            else {
                await (0, expect_1.expect)(wrapper.decreaseAllowance(0)).to.be.revertedWithCustomError(wrapper, reasons.approve);
            }
        });
    }
    function shouldOnlyRevertOnErrors(fixture) {
        it("doesn't revert on transfer", async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await wrapper.transfer();
        });
        it("doesn't revert on transferFrom", async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await wrapper.transferFrom();
        });
        it("doesn't revert on transferFromUniversal, permit2", async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            const { permit2Mock } = await deployPermit2Mock();
            const code = await hardhat_1.ethers.provider.getCode(permit2Mock);
            await hardhat_1.ethers.provider.send('hardhat_setCode', [permit2_sdk_1.PERMIT2_ADDRESS, code]);
            await wrapper.transferFromUniversal(true);
        });
        it("doesn't revert on transferFromUniversal, no permit2", async function () {
            const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
            await wrapper.transferFromUniversal(false);
        });
        describe('approvals', function () {
            describe('with zero allowance', function () {
                it("doesn't revert when approving a non-zero allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.approve(100);
                });
                it("doesn't revert when approving a zero allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.approve(0);
                });
                it("doesn't revert when increasing the allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.increaseAllowance(10);
                });
                it('reverts when decreasing the allowance', async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await (0, expect_1.expect)(wrapper.decreaseAllowance(10)).to.be.revertedWithCustomError(wrapper, 'SafeDecreaseAllowanceFailed');
                });
            });
            describe('with non-zero allowance', function () {
                it("doesn't revert when approving a non-zero allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.setAllowance(100);
                    await wrapper.approve(20);
                });
                it("doesn't revert when approving a zero allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.setAllowance(100);
                    await wrapper.approve(0);
                });
                it("doesn't revert when increasing the allowance", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.setAllowance(100);
                    await wrapper.increaseAllowance(10);
                });
                it("doesn't revert when decreasing the allowance to a positive value", async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.setAllowance(100);
                    await wrapper.decreaseAllowance(50);
                });
                it('reverts when decreasing the allowance to a negative value', async function () {
                    const { wrapper } = await (0, hardhat_network_helpers_1.loadFixture)(fixture);
                    await wrapper.setAllowance(100);
                    await (0, expect_1.expect)(wrapper.decreaseAllowance(200)).to.be.revertedWithCustomError(wrapper, 'SafeDecreaseAllowanceFailed');
                });
            });
        });
    }
});
