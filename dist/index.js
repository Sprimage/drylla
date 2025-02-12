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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("@oyl/sdk");
const bitcoin = __importStar(require("bitcoinjs-lib"));
const drylla_1 = __importDefault(require("./drylla"));
require("dotenv/config");
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)("Drylla");
async function main() {
    try {
        const provider = new sdk_1.Provider({
            url: 'https://mainnet.sandshrew.io',
            version: 'v2',
            projectId: process.env.SANDSHREW_PROJECT_ID,
            network: bitcoin.networks.bitcoin,
            networkType: 'mainnet',
        });
        const mnemonic = process.env.WALLET_MNEMONIC;
        if (!mnemonic) {
            throw new Error('WALLET_MNEMONIC environment variable is required');
        }
        const account = await (0, sdk_1.mnemonicToAccount)({
            mnemonic,
            opts: {
                network: provider.network,
            },
        });
        const privateKeys = (0, sdk_1.getWalletPrivateKeys)({
            mnemonic: mnemonic,
            opts: {
                network: account.network,
            },
        });
        const signer = new sdk_1.Signer(account.network, {
            taprootPrivateKey: privateKeys.taproot.privateKey,
            segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
            nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
            legacyPrivateKey: privateKeys.legacy.privateKey,
        });
        const feeMultiplier = process.env.FEE_MULTIPLIER !== undefined ? parseInt(process.env.FEE_MULTIPLIER) : undefined;
        const minter = new drylla_1.default(account, provider, signer, feeMultiplier);
        minter.startMinting();
        logger.info('Drylla initialized successfully');
        process.on('SIGINT', () => {
            logger.info('Shutting down drylla...');
            process.exit(0);
        });
    }
    catch (error) {
        logger.error('Error initializing drylla', { error });
        process.exit(1);
    }
}
main().catch(error => {
    logger.error('Unhandled error in main', { error });
    process.exit(1);
});
