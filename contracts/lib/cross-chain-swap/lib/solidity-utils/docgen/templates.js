"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneInchTemplates = oneInchTemplates;
const path_1 = __importDefault(require("path"));
/**
 * @category Docgen
 * @notice A helper method to get the path to the templates folder.
 * @returns The the path to templates folder.
 */
function oneInchTemplates() {
    return path_1.default.normalize(path_1.default.join(__dirname, '../../docgen/templates'));
}
