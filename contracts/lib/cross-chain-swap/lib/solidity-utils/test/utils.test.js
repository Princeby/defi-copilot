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
const prelude_1 = require("../src/prelude");
const utils_1 = require("../src/utils");
const expect_1 = require("../src/expect");
const hardhat_1 = __importStar(require("hardhat"));
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const ethers_1 = require("ethers");
describe('timeIncreaseTo', function () {
    const precision = 2;
    async function shouldIncrease(secs) {
        const timeBefore = await prelude_1.time.latest();
        await (0, utils_1.timeIncreaseTo)(timeBefore + secs);
        const timeAfter = await prelude_1.time.latest();
        (0, expect_1.expect)(timeAfter).to.be.gt(timeBefore);
        (0, expect_1.expect)(timeAfter - timeBefore).to.be.lte(secs + precision);
        (0, expect_1.expect)(timeAfter - timeBefore).to.be.gte(secs);
    }
    it('should be increased on 1000 sec', async function () {
        await shouldIncrease(1000);
    });
    it('should be increased on 2000 sec', async function () {
        await shouldIncrease(2000);
    });
    it('should be increased on 1000000 sec', async function () {
        await shouldIncrease(1000000);
    });
    it('should be thrown with increase time to a moment in the past', async function () {
        await (0, expect_1.expect)(shouldIncrease(-1000)).to.be.rejectedWith(/Timestamp \d+ is lower than the previous block's timestamp \d+/);
    });
});
describe('fixSignature', function () {
    it('should not be fixed geth sign', async function () {
        const signature = '0xb453386b73ba5608314e9b4c7890a4bd12cc24c2c7bdf5f87778960ff85c56a8520dabdbea357fc561120dd2625bd8a904f35bdb4b153cf706b6ff25bb0d898d1c';
        (0, expect_1.expect)(signature).equal((0, utils_1.fixSignature)(signature));
    });
    it('should be fixed ganache sign', async function () {
        const signature = '0x511fafdf71306ff89a063a76b52656c18e9a7d80d19e564c90f0126f732696bb673cde46003aad0ccb6dab2ca91ae38b82170824b0725883875194b273f709b901';
        const v = parseInt(signature.slice(130, 132), 16) + 27;
        const vHex = v.toString(16);
        (0, expect_1.expect)(signature.slice(0, 130) + vHex).equal((0, utils_1.fixSignature)(signature));
    });
});
describe('utils', function () {
    let signer1;
    let signer2;
    before(async function () {
        [signer1, signer2] = await hardhat_1.ethers.getSigners();
    });
    describe('signMessage', function () {
        it('should be signed 0x message', async function () {
            (0, expect_1.expect)(await signer1.signMessage('0x')).equal(await (0, utils_1.signMessage)(signer1));
        });
        it('should be signed 32 bytes random bytes', async function () {
            const message = (0, ethers_1.randomBytes)(32);
            (0, expect_1.expect)(await signer1.signMessage(message)).equal(await (0, utils_1.signMessage)(signer1, message));
        });
        it('should be signed string -> Uint8Array -> hex string -> Uint8Array', async function () {
            const message = (0, ethers_1.hexlify)((0, ethers_1.toUtf8Bytes)('Test message'));
            (0, expect_1.expect)(await signer1.signMessage((0, ethers_1.getBytes)(message))).equal(await (0, utils_1.signMessage)(signer1, (0, ethers_1.getBytes)(message)));
        });
        it('should be signed string -> Uint8Array -> hex string', async function () {
            const message = (0, ethers_1.hexlify)((0, ethers_1.toUtf8Bytes)('Test message'));
            (0, expect_1.expect)(await signer1.signMessage(message)).equal(await (0, utils_1.signMessage)(signer1, message));
        });
    });
    async function deployUSDT() {
        const TokenMock = await hardhat_1.ethers.getContractFactory('TokenMock');
        const usdt = await TokenMock.deploy('USDT', 'USDT');
        await usdt.mint(signer1, (0, prelude_1.ether)('1000'));
        return { usdt };
    }
    describe('trackReceivedTokenAndTx', function () {
        it('should be tracked ERC20 Transfer', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const [received, tx] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.transfer(signer2, (0, prelude_1.ether)('1')));
            (0, expect_1.expect)(received).to.be.equal((0, prelude_1.ether)('1'));
            (0, expect_1.expect)(tx.from).equal(signer1.address);
            (0, expect_1.expect)(tx.to).equal(await usdt.getAddress());
            (0, expect_1.expect)(tx.logs.length).equal(1);
            (0, expect_1.expect)(tx.logs[0].eventName).equal('Transfer');
            (0, expect_1.expect)(tx.logs[0].data.length).equal(66);
        });
        it('should be tracked ERC20 Approve', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const [received, tx] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.approve(signer2, (0, prelude_1.ether)('1')));
            (0, expect_1.expect)(received).to.be.equal('0');
            (0, expect_1.expect)(tx.from).equal(signer1.address);
            (0, expect_1.expect)(tx.to).equal(await usdt.getAddress());
            (0, expect_1.expect)(tx.logs.length).equal(1);
            (0, expect_1.expect)(tx.logs[0].eventName).equal('Approval');
            (0, expect_1.expect)(tx.logs[0].data.length).equal(66);
        });
    });
    describe('trackReceivedToken', function () {
        it('should be tracked ERC20 Transfer', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const [received] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.transfer(signer2, (0, prelude_1.ether)('1')));
            (0, expect_1.expect)(received).to.be.equal((0, prelude_1.ether)('1'));
        });
        it('should be tracked ERC20 Approve', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const [received] = await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.approve(signer2, (0, prelude_1.ether)('1')));
            (0, expect_1.expect)(received).to.be.equal('0');
        });
    });
    describe('countInstructions', function () {
        it('should be counted ERC20 Transfer', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const tx = (await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.transfer(signer2, (0, prelude_1.ether)('1'))))[1];
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.logs[0].transactionHash, ['STATICCALL', 'CALL', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 0, 2, 2,
                ]);
            }
        });
        it('should be counted ERC20 Approve', async function () {
            const { usdt } = await (0, hardhat_network_helpers_1.loadFixture)(deployUSDT);
            const tx = (await (0, utils_1.trackReceivedTokenAndTx)(hardhat_1.ethers.provider, usdt, signer2.address, () => usdt.approve(signer2, (0, prelude_1.ether)('1'))))[1];
            if (hardhat_1.default.__SOLIDITY_COVERAGE_RUNNING === undefined) {
                (0, expect_1.expect)(await (0, utils_1.countInstructions)(hardhat_1.ethers.provider, tx.logs[0].transactionHash, ['STATICCALL', 'CALL', 'SSTORE', 'SLOAD'])).to.be.deep.equal([
                    0, 0, 1, 0,
                ]);
            }
        });
    });
    describe('deployContract', function () {
        it('should be deploy new contract instance', async function () {
            const token = await (0, utils_1.deployContract)('TokenMock', ['SomeToken', 'STM']);
            (0, expect_1.expect)(await token.getAddress()).to.be.not.eq(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await token.name()).to.be.eq('SomeToken');
        });
        it('should be using without arguments', async function () {
            const weth = await (0, utils_1.deployContract)('WETH');
            (0, expect_1.expect)(await weth.getAddress()).to.be.not.eq(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await weth.name()).to.be.eq('Wrapped Ether');
        });
    });
    describe('deployContractFromBytecode', function () {
        it('should deploy new contract instance', async function () {
            const contractArtifact = await hardhat_1.default.artifacts.readArtifact('TokenMock');
            const token = await (0, utils_1.deployContractFromBytecode)(contractArtifact.abi, contractArtifact.bytecode, ['SomeToken', 'STM']);
            (0, expect_1.expect)(await token.getAddress()).to.be.not.eq(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await token.name()).to.be.eq('SomeToken');
        });
        it('can be used without arguments', async function () {
            const contractArtifact = await hardhat_1.default.artifacts.readArtifact('WETH');
            const weth = await (0, utils_1.deployContractFromBytecode)(contractArtifact.abi, contractArtifact.bytecode);
            (0, expect_1.expect)(await weth.getAddress()).to.be.not.eq(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await weth.name()).to.be.eq('Wrapped Ether');
        });
    });
    describe('deployAndGetContract', function () {
        it('should deploy new contract instance', async function () {
            const tokenName = 'SomeToken';
            // If hardhat-deploy `deploy` function logs need to be displayed, add HARDHAT_DEPLOY_LOG = 'true' to the .env file
            const token = await (0, utils_1.deployAndGetContract)({
                contractName: 'TokenMock',
                constructorArgs: [tokenName, 'STM'],
                deployments: hardhat_1.deployments,
                deployer: signer1.address,
                skipIfAlreadyDeployed: false,
                skipVerify: true,
            });
            (0, expect_1.expect)(await token.getAddress()).to.be.not.eq(prelude_1.constants.ZERO_ADDRESS);
            (0, expect_1.expect)(await token.name()).to.be.eq(tokenName);
        }); //.timeout(200000);  If this test needs to be run on a test chain, the timeout should be increased
    });
    describe('getEthPrice', function () {
        it('should return ETH price', async function () {
            (0, expect_1.expect)(await (0, utils_1.getEthPrice)()).to.be.gt(0);
        });
        it('should return BNB price', async function () {
            (0, expect_1.expect)(await (0, utils_1.getEthPrice)('BNB')).to.be.gt(0);
        });
        it('should throw error with incorrect token symbol', async function () {
            await (0, expect_1.expect)((0, utils_1.getEthPrice)('INVALID_SYMBOL')).to.be.rejectedWith('Failed to parse price from Coinbase API');
        });
    });
});
