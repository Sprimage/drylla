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
const sdk_1 = require("@oyl/sdk");
const cron = __importStar(require("node-cron"));
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)("Drylla");
class Drylla {
    constructor(account, provider, signer, feeMultiplier = 1) {
        this.lastBlockHeight = 0;
        this.isProcessing = false;
        this.activelyMinting = false;
        this.waitingNotified = false;
        this.account = account;
        this.provider = provider;
        this.signer = signer;
        this.feeMulti = feeMultiplier;
    }
    async getCurrentBlockHeight() {
        try {
            const blockInfo = await this.provider.esplora._call('esplora_blocks:tip:height', []);
            return blockInfo;
        }
        catch (error) {
            logger.error('Error getting current block height');
            logger.error(error);
            throw error;
        }
    }
    async getFeeRate() {
        try {
            const feeEstimates = await this.provider.esplora.getFeeEstimates();
            // Use the 1-block fee rate for fast confirmation
            return Number(feeEstimates['1'].toFixed(0)) * this.feeMulti;
        }
        catch (error) {
            logger.error('Error getting fee estimates');
            logger.error(error);
            throw error;
        }
    }
    async executeDieselMint() {
        if (this.isProcessing) {
            logger.info('Another mint operation is in progress, skipping...');
            return;
        }
        this.isProcessing = true;
        try {
            const currentBlockHeight = await this.getCurrentBlockHeight();
            if (currentBlockHeight <= this.lastBlockHeight) {
                if (!this.waitingNotified) {
                    logger.info('Waiting for new block...');
                    this.waitingNotified = true;
                }
                this.isProcessing = false;
                return;
            }
            logger.info('Checking block');
            logger.info({ height: currentBlockHeight });
            this.lastBlockHeight = currentBlockHeight;
            this.waitingNotified = false;
            // Get the fee rate for fast confirmation
            const feeRate = await this.getFeeRate();
            logger.info('Current fee rate');
            logger.info(feeRate);
            // Get account UTXOs for minting
            const { accountSpendableTotalUtxos, accountSpendableTotalBalance, accountPendingTotalBalance } = await sdk_1.utxo.accountUtxos({
                account: this.account,
                provider: this.provider,
            });
            logger.info('Current Account balance');
            logger.info(accountSpendableTotalBalance);
            if (accountSpendableTotalBalance < 10000) {
                if (this.activelyMinting || accountPendingTotalBalance > 10000) {
                    //sandshrew takes a while to update balances
                    await (0, sdk_1.timeout)(60000);
                    this.activelyMinting = true;
                    this.lastBlockHeight = this.lastBlockHeight - 1;
                    this.isProcessing = false;
                    return;
                }
                logger.error('Insufficient balance for minting');
                this.isProcessing = false;
                return;
            }
            // Prepare mint calldata [2, 0, 77] for minting
            const calldata = [BigInt(2), BigInt(0), BigInt(77)];
            const result = await sdk_1.alkanes.execute({
                gatheredUtxos: {
                    utxos: accountSpendableTotalUtxos,
                    totalAmount: accountSpendableTotalBalance,
                },
                account: this.account,
                calldata,
                provider: this.provider,
                feeRate,
                signer: this.signer,
            });
            logger.info('Mint transaction executed');
            logger.info({
                txid: result.txId,
                blockHeight: currentBlockHeight
            });
            this.activelyMinting = true;
        }
        catch (error) {
            logger.error('Error executing DIESEL mint');
            logger.error(error);
        }
        finally {
            this.isProcessing = false;
        }
    }
    startMinting() {
        // Check for new blocks every 10 seconds
        cron.schedule('*/10 * * * * *', () => {
            this.executeDieselMint().catch(error => {
                logger.error('Error in minting schedule');
                logger.error(error);
            });
        });
        logger.info('Drylla started successfully');
    }
}
exports.default = Drylla;
