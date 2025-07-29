"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.should = exports.config = exports.expect = exports.assert = exports.AssertionError = exports.Assertion = void 0;
exports.assertRoughlyEqualValues = assertRoughlyEqualValues;
const chai_1 = require("chai");
Object.defineProperty(exports, "Assertion", { enumerable: true, get: function () { return chai_1.Assertion; } });
Object.defineProperty(exports, "AssertionError", { enumerable: true, get: function () { return chai_1.AssertionError; } });
Object.defineProperty(exports, "assert", { enumerable: true, get: function () { return chai_1.assert; } });
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return chai_1.expect; } });
Object.defineProperty(exports, "config", { enumerable: true, get: function () { return chai_1.config; } });
Object.defineProperty(exports, "should", { enumerable: true, get: function () { return chai_1.should; } });
/**
 * @category expect
 * @dev Asserts that two values are roughly equal within a specified relative difference.
 * This function is useful for cases where precision issues might cause direct comparisons to fail.
 * @param expected The expected value as a string, number, or bigint.
 * @param actual The actual value obtained, to compare against the expected value.
 * @param relativeDiff The maximum allowed relative difference between the expected and actual values.
 * The relative difference is calculated as the absolute difference divided by the expected value,
 * ensuring that the actual value is within this relative difference from the expected value.
 * @notice This function will revert with a message if the values are of different signs
 * or if the actual value deviates from the expected by more than the specified relative difference.
 */
function assertRoughlyEqualValues(expected, actual, relativeDiff) {
    let expectedBN = BigInt(expected);
    let actualBN = BigInt(actual);
    (0, chai_1.expect)(expectedBN * actualBN).to.be.gte(0, 'Values are of different sign');
    if (expectedBN < 0)
        expectedBN = -expectedBN;
    if (actualBN < 0)
        actualBN = -actualBN;
    let multiplerNumerator = relativeDiff;
    let multiplerDenominator = 1n;
    while (!Number.isInteger(multiplerNumerator)) {
        multiplerDenominator = multiplerDenominator * 10n;
        multiplerNumerator *= 10;
    }
    const diff = expectedBN > actualBN ? expectedBN - actualBN : actualBN - expectedBN;
    const treshold = (expectedBN * BigInt(multiplerNumerator)) / multiplerDenominator;
    if (diff > treshold) {
        (0, chai_1.expect)(actualBN).to.be.equal(expectedBN, `${actual} != ${expected} with ${relativeDiff} precision`);
    }
}
