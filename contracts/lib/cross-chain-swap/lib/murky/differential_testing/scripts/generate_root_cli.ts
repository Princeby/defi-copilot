import MerkleTree from './merkle-tree';
// The ethers import is correct.
import { ethers } from 'ethers';
import { toBuffer } from 'ethereumjs-util';

// FIX 1: The 'utils' namespace is removed in ethers v6.
// We now access the default AbiCoder instance this way.
const encoder = ethers.AbiCoder.defaultAbiCoder();

const num_leaves = process.argv[2];
const encoded_leaves = process.argv[3];

const decoded_data = encoder.decode([`bytes32[${num_leaves}]`], encoded_leaves)[0];

// FIX 2: Added the ': string' type annotation to the parameter 'b'.
// This resolves the "implicitly has an 'any' type" error.
var dataAsBuffer = decoded_data.map((b: string) => toBuffer(b));

const tree = new MerkleTree(dataAsBuffer);

// FIX 3: Use the corrected 'encoder' variable to encode the output.
process.stdout.write(encoder.encode(['bytes32'], [tree.getRoot()]));