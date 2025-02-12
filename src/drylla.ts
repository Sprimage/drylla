import { alkanes, Account, Provider, Signer, utxo, timeout } from '@oyl/sdk';
import * as cron from 'node-cron';
import { createLogger } from "./logger";

const logger = createLogger("Drylla");

class Drylla {
  private account: Account;
  private provider: Provider;
  private signer: Signer;
  private lastBlockHeight: number = 0;
  private isProcessing: boolean = false;
  private activelyMinting: boolean = false
  private waitingNotified: boolean = false;
  private feeMulti: number;

  constructor(account: Account, provider: Provider, signer: Signer, feeMultiplier: number = 1) {
    this.account = account;
    this.provider = provider;
    this.signer = signer;
    this.feeMulti = feeMultiplier
  }

  private async getCurrentBlockHeight(): Promise<number> {
    try {
      const blockInfo = await this.provider.esplora._call('esplora_blocks:tip:height', []);
      return blockInfo;
    } catch (error) {
      logger.error('Error getting current block height');
      logger.error(error)
      throw error;
    }
  }

  private async getFeeRate(): Promise<number> {
    try {
      const feeEstimates = await this.provider.esplora.getFeeEstimates();
      // Use the 1-block fee rate for fast confirmation
      return Number(feeEstimates['1'].toFixed(0)) * this.feeMulti;
    } catch (error) {
      logger.error('Error getting fee estimates');
      logger.error(error)
      throw error;
    }
  }

  private async executeDieselMint() {
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

      

      const { accountSpendableTotalUtxos, accountSpendableTotalBalance, accountPendingTotalBalance } = await utxo.accountUtxos({
        account: this.account,
        provider: this.provider,
      });
      

      logger.info('Current Account balance');
      logger.info(accountSpendableTotalBalance);

      if (accountSpendableTotalBalance < 10000) {
        if (this.activelyMinting || accountPendingTotalBalance > 10000) {
          //sandshrew takes a while to update balances
          await timeout(10000);
          this.activelyMinting = true
          this.lastBlockHeight = this.lastBlockHeight - 1
          this.isProcessing = false;
          return;
        }
        logger.error('Insufficient balance for minting');
        this.isProcessing = false;
        return;
      }

      // Prepare mint calldata [2, 0, 77] for minting
      const calldata = [BigInt(2), BigInt(0), BigInt(77)];


      const result = await alkanes.execute({
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
      this.activelyMinting = true

    } catch (error) {
      logger.error('Error executing DIESEL mint');
      logger.error(error)
    } finally {
      this.isProcessing = false;
    }
  }

  public startMinting() {
    // Check for new blocks every 10 seconds
    cron.schedule('*/10 * * * * *', () => {
      this.executeDieselMint().catch(error => {
        logger.error('Error in minting schedule');
        logger.error(error)
      });
    });

    logger.info('Drylla started successfully');
  }
}

export default Drylla;