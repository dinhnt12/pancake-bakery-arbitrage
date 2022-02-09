require('dotenv').config();
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const abis = require('./abis');
const { mainnet: addresses } = require('./addresses');
const Flashswap = require('./build/contracts/Flashswap.json');

const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.BSC_WSS)
);
const { address: admin } = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY)

// we need pancakeSwap
const pancakeFactory = new web3.eth.Contract(
    abis.pancakeFactory.pancakeFactory,
    addresses.pancake.factory
);
const pancakeRouter = new web3.eth.Contract(
    abis.pancakeRouter.pancakeRouter,
    addresses.pancake.router
);

// we need bakerySwap
/* const bakeryFactory = new web3.eth.Contract(
    abis.bakeryFactory.bakeryFactory,
    addresses.bakery.factory
);
const bakeryRouter = new web3.eth.Contract(
    abis.bakeryRouter.bakeryRouter,
    addresses.bakery.router
); */

// use ApeSwap instead of bakerySwap
const apeFactory = new web3.eth.Contract(
    abis.apeFactory.apeFactory,
    addresses.ape.factory
);
const apeRouter = new web3.eth.Contract(
    abis.apeRouter.apeRouter,
    addresses.ape.router
);

var inT = '0x4c923E7D44284e4BD19ec78d8590Af8AB76c9dDC'  //ABC
var outT = '0x9b1687605f5FaaAf7B5c91Ade20BA2fa527f8C19'  // BUSD

const WBNB = inT;
const fromTokens = ['ABC'];
const fromToken = [
    inT // WBNB
];
const fromTokenDecimals = [18];

const toTokens = ['BUSD'];
const toToken = [
    outT // BUSD
];
const toTokenDecimals = [18];
const amount = process.env.BNB_AMOUNT;

const init = async () => {
    const networkId = await web3.eth.net.getId();

    const flashswap = new web3.eth.Contract(
        Flashswap.abi,
        Flashswap.networks[networkId].address
    );

    let onTrading = false;

    let subscription = web3.eth.subscribe('newBlockHeaders', (error, result) => {
        if (!error) {
            // console.log(result);
            return;
        }
        console.error(error);
    })
    .on("connected", subscriptionId => {
        console.log(`You are connected on ${subscriptionId}`);
    })
    .on('data', async block => {
        if (onTrading) return
        console.log('-------------------------------------------------------------');
        console.log(`New block received. Block # ${block.number}`);
        console.log(`GasLimit: ${block.gasLimit} and Timestamp: ${block.timestamp}`);

        onTrading = true;

        for (let i = 0; i < fromTokens.length; i++) {
            for (let j = 0; j < toTokens.length; j++) {
                console.log(`Trading ${toTokens[j]}/${fromTokens[i]} ...`);

                const pairAddress = await pancakeFactory.methods.getPair(fromToken[i], toToken[j]).call();
                console.log(`pairAddress ${toTokens[j]}/${fromTokens[i]} is ${pairAddress}`);
                const unit0 = await new BigNumber(amount);
                const amount0 = await new BigNumber(unit0).shiftedBy(fromTokenDecimals[i]);
                console.log(`Input amount of ${fromTokens[i]}: ${unit0.toString()}`);

                // The quote currency needs to be WBNB
                let tokenIn, tokenOut;
                if (fromToken[i] === WBNB) {
                    tokenIn = fromToken[i];
                    tokenOut = toToken[j];
                } else if (toToken[j] === WBNB) {
                    tokenIn = toToken[j];
                    tokenOut = fromToken[i];
                } else {
                    return;
                }

                // The quote currency is not WBNB
                if (typeof tokenIn === 'undefined') {
                    return;
                }

                // call getAmountsOut in PancakeSwap
                const amounts = await pancakeRouter.methods.getAmountsOut(amount0, [tokenIn, tokenOut]).call();
                const unit1 = await new BigNumber(amounts[1]).shiftedBy(-toTokenDecimals[j]);
                const amount1 = await new BigNumber(amounts[1]);
                console.log(`
                    Buying token at PancakeSwap DEX
                    =================
                    tokenIn: ${unit0.toString()} ${fromTokens[i]}
                    tokenOut: ${unit1.toString()} ${toTokens[j]}
                `);

                // call getAmountsOut in ApeSwap
                const amounts2 = await apeRouter.methods.getAmountsOut(amount1, [tokenOut, tokenIn]).call();
                const unit2 = await new BigNumber(amounts2[1]).shiftedBy(-fromTokenDecimals[i]);
                const amount2 = await new BigNumber(amounts2[1]);
                console.log(`
                    Buying back token at ApeSwap DEX
                    =================
                    tokenOut: ${unit1.toString()} ${toTokens[j]}
                    tokenIn: ${unit2.toString()} ${fromTokens[i]}
                `);

                let profit = await new BigNumber(amount2).minus(amount0);

                // if (profit > 0) {
                if (true) {
                const tx = flashswap.methods.startArbitrage(
                        tokenIn,
                        tokenOut,
                        amount0,
                        0
                    );

                    /* const [gasPrice, gasCost] = await Promise.all([
                        web3.eth.getGasPrice(),
                        tx.estimateGas({from: admin}),
                    ]); */

                    let gasPrice = 5000000000; // 5Gwei
                    let gasCost  = 510000;

                    const txCost = await web3.utils.toBN(gasCost) * web3.utils.toBN(gasPrice);
                    profit = await new BigNumber(profit).minus(txCost);

                    // if (profit > 0) {
                    if (true) {
                        console.log(`Block # ${block.number}: Arbitrage opportunity found! Expected profit: ${profit}`);
                        const data = tx.encodeABI();
                        const txData = {
                            from: admin,
                            to: flashswap.options.address,
                            data,
                            gas: gasCost,
                            gasPrice: gasPrice,
                        };
                        const receipt = await web3.eth.sendTransaction(txData);
                        console.log(`Transaction hash: ${receipt.transactionHash}`);
                    } else {
                        console.log('Transaction cost did not cover profits');
                    }
                } else {
                    console.log(`Block # ${block.number}: Arbitrage opportunity not found! Expected profit: ${profit}`);
                }
            }
        }
    })
    .on('error', error => {
        console.log(error);
    });
}

init();
