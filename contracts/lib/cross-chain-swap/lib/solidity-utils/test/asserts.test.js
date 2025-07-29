"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = require("../src/expect");
describe('assertRoughlyEqualValues', function () {
    it('should be work with expected = actual, any relativeDiff', async function () {
        (0, expect_1.assertRoughlyEqualValues)(1000000, 1000000, 0.000001);
    });
    it('should be work with expected = actual, relativeDiff = 0', async function () {
        (0, expect_1.assertRoughlyEqualValues)(1000000, 1000000, 0);
    });
    it('should be work with diff between expected and actual less than relativeDiff * expected', async function () {
        (0, expect_1.assertRoughlyEqualValues)(1000001, 1000000, 1.000001);
    });
    it('should be work with negative diff between expected and actual less than relativeDiff * expected', async function () {
        (0, expect_1.assertRoughlyEqualValues)(1000000, 1000001, 0.000001);
    });
    it('should be work with diff between expected and actual equals to relativeDiff', async function () {
        (0, expect_1.assertRoughlyEqualValues)(1000000, 1000001, 1);
    });
    it('works on negative', async function () {
        (0, expect_1.assertRoughlyEqualValues)(-1000001, -1000000, 1.000001);
    });
    it('different signs throws', async function () {
        (0, expect_1.expect)(() => (0, expect_1.assertRoughlyEqualValues)(1000001, -1000000, 1.000001)).throws();
    });
    it('should be thrown with expected != actual with relativeDiff = 0', async function () {
        (0, expect_1.expect)(() => (0, expect_1.assertRoughlyEqualValues)(1000000, 1000001, 0)).throws();
    });
    it('should be thrown with expected > actual more than relativeDiff * expected', async function () {
        (0, expect_1.expect)(() => (0, expect_1.assertRoughlyEqualValues)(1000001, 1000000, 0.0000001)).throws();
    });
    it('should be thrown with expected < actual more than relativeDiff * expected', async function () {
        (0, expect_1.expect)(() => (0, expect_1.assertRoughlyEqualValues)(1000000, 1000001, 0.0000001)).throws();
    });
});
