import '@typechain/hardhat';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-gas-reporter';
import 'hardhat-deploy';
import '@nomicfoundation/hardhat-verify'; // This plugin adds the 'etherscan' config property
import 'solidity-docgen';
require('solidity-coverage');
import dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import { HardhatNetworkUserConfig } from 'hardhat/types';
import { Networks, getNetwork } from './hardhat-setup';

// By importing this, we ensure the HardhatUserConfig is correctly extended
import type { EtherscanConfig } from '@nomicfoundation/hardhat-verify/src/types';

dotenv.config();

declare module 'hardhat/types/runtime' {
    interface HardhatRuntimeEnvironment {
        __SOLIDITY_COVERAGE_RUNNING?: boolean | undefined;
    }
}

const networkSetup = new Networks();

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.25',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            evmVersion: (networkSetup.networks[getNetwork()] as HardhatNetworkUserConfig)?.hardfork || 'cancun',
            viaIR: true,
        },
    },
    // The 'etherscan' property is now fully typed and recognized.
    etherscan: networkSetup.etherscan,
    networks: networkSetup.networks,
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

export default config;