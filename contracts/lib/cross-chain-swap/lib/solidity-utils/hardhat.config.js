"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("@typechain/hardhat");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-gas-reporter");
require("hardhat-deploy");
require("@nomicfoundation/hardhat-verify");
require("solidity-docgen");
require('solidity-coverage'); // require because no TS typings available
const dotenv_1 = __importDefault(require("dotenv"));
const hardhat_setup_1 = require("./hardhat-setup");
dotenv_1.default.config();
const { networks, etherscan } = new hardhat_setup_1.Networks();
const config = {
    solidity: {
        version: '0.8.25',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            evmVersion: networks[(0, hardhat_setup_1.getNetwork)()]?.hardfork || 'cancun',
            viaIR: true,
        },
    },
    etherscan,
    networks,
    gasReporter: {
        enabled: true,
    },
    typechain: {
        target: 'ethers-v6',
    },
    docgen: {
        outputDir: 'docs/contracts',
        templates: 'docgen/templates',
        pages: 'files',
        exclude: ['tests'],
    },
};
exports.default = config;
