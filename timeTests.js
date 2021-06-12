import ethers from "ethers";
import chalk from "chalk";
import dotenv from "dotenv";
import figlet from "figlet";
import ora from "ora";
import {performance} from 'perf_hooks'

dotenv.config();

console.clear();
// Pretty and big text
console.log(
	figlet.textSync("Mordecai Bot", {
		font: "doom",
		width: 80,
	})
);

// Load our configs and set stuff
const loadingspinner = ora(chalk.green("Loading configs"));
loadingspinner.start();
console.time('load_configs')
const data = {
	WBNB: process.env.WBNB_CONTRACT, //wbnb
	to_PURCHASE: process.env.TO_PURCHASE, // token that you will purchase = BUSD for test '0xe9e7cea3dedca5984780bafc599bd69add087d56'
	AMOUNT_OF_WBNB: process.env.AMOUNT_OF_WBNB, // how much you want to buy in WBNB
	factory: process.env.FACTORY, //PancakeSwap V2 factory
	router: process.env.ROUTER, //PancakeSwap V2 router
	recipient: process.env.YOUR_ADDRESS, //your wallet address,
	Slippage: process.env.SLIPPAGE, //in Percentage
	gasPrice: process.env.GWEI, //in gwei
	gasLimit: process.env.GAS_LIMIT, //at least 21000
	minBnb: process.env.MIN_LIQUIDITY_ADDED, //min liquidity added
};

let initialLiquidityDetected = false;
let jmlBnb = 0;

const bscTestnetUrl = "https://data-seed-prebsc-1-s1.binance.org:8545/"
const bscMainnetUrl = "https://bsc-dataseed.binance.org"; //https://bsc-dataseed1.defibit.io/ https://bsc-dataseed.binance.org/
const wss = "wss://bsc-ws-node.nariox.org:443"; //RECOMMENDED
const mnemonic = process.env.YOUR_MNEMONIC; //your memonic;
const tokenIn = data.WBNB;
const tokenOut = data.to_PURCHASE;

//const provider = new ethers.providers.JsonRpcProvider(bscTestnetUrl);
const provider = new ethers.providers.WebSocketProvider(wss); //RECOMMENDED
const wallet = new ethers.Wallet(mnemonic);
const account = wallet.connect(provider);

const factory = new ethers.Contract(
	data.factory,
	[
		"event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
		"function getPair(address tokenA, address tokenB) external view returns (address pair)",
	],
	account
);

const router = new ethers.Contract(
	data.router,
	[
		"function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
		"function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
	],
	account
);

const abi = [
	// Read-Only Functions
	"function balanceOf(address owner) view returns (uint256)",
	"function decimals() view returns (uint8)",
	"function symbol() view returns (string)",
	// Write Functions
	"function approve(address spender, uint amount) public returns(bool)",
];
const erc = new ethers.Contract(data.WBNB, abi, account);
const tokenSwap = new ethers.Contract(data.to_PURCHASE, abi, provider);
let inSymbol = await erc.symbol();
let inDecimal = await erc.decimals();
let outSymbol = await tokenSwap.symbol();
let outDecimal = await tokenSwap.decimals();

//onsole.log(chalk.green.inverse("Loading complete!"));
loadingspinner.succeed();
console.timeEnd('load_configs')
console.time('load_funcs')
async function checkLiq(pairAddressx) {
	const pairBNBvalue = await erc.balanceOf(pairAddressx);
	jmlBnb = ethers.utils.formatEther(pairBNBvalue);
	//console.log(`Liquidity value: ${jmlBnb}`);
	return jmlBnb;
}

async function checkGains() {
	let balance = await checkBalance(tokenSwap);
	console.log(
		chalk.green("\nToken Balance: ") +
		chalk.yellow(ethers.utils.formatUnits(balance, outDecimal)) +
		" " +
		outSymbol +
		"\n"
	);
	process.exit()
}

async function checkBalance(token) {
	let balance = await token.balanceOf(data.recipient);
	return balance;
}

async function buyAction() {
	if (initialLiquidityDetected === true) {
		console.log("Won't buy because already bought");
		return null;
	}

	console.log("Ready to buy");
	const spinnertx = ora("Waiting for tx success");
	spinnertx.spinner = "dots8Bit";
	try {
		initialLiquidityDetected = true;
		//We buy x amount of the new token for our wbnb
		const amountIn = ethers.utils.parseEther(data.AMOUNT_OF_WBNB);
		const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);

		//Our execution price will be a bit different, we need some flexbility
		const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

		console.log(
			chalk.green.inverse(`Buying Token \n`) +
			`
        =================
        tokenIn: ${ethers.utils
          .formatEther(amountIn)
          .toString()} ${tokenIn} [${inSymbol}]
        tokenOut: ${ethers.utils
          .formatUnits(amountOutMin, outDecimal)
          .toString()} ${tokenOut} [${outSymbol}]
        =================`
		);

		console.log("Processing Transaction.....");
		console.log(
			chalk.yellow(`amountIn: ${ethers.utils.formatEther(amountIn)}`)
		);
		console.log(
			chalk.yellow(
				`amountOutMin: ${ethers.utils.formatUnits(amountOutMin, outDecimal)}`
			)
		);
		console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
		console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
		console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
		console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
		console.log(chalk.yellow(`data.gasPrice: ${ethers.utils.formatUnits(`${data.gasPrice}`, "gwei")} BNB (${data.gasPrice} Gwei)`));
		console.log(chalk.yellow(`data.slippage: ${data.Slippage}%\n`))

		const tx = await router.swapExactTokensForTokens(
			amountIn,
			amountOutMin,
			[tokenIn, tokenOut],
			data.recipient,
			Date.now() + 1000 * 60 * 5, // 5 minutes
			{
				gasLimit: data.gasLimit,
				gasPrice: ethers.utils.parseUnits(`${data.gasPrice}`, "gwei"),
				nonce: null, // Set you want buy at where position in blocks
			}
		);

		spinnertx.start();
		const receipt = await tx.wait();
		if (receipt.status) {
			spinnertx.succeed();
		}
		console.log(
			`Transaction receipt : https://www.bscscan.com/tx/${receipt.logs[1].transactionHash}\n`
		);
		console.log(chalk.red(`gasUsed: ${parseInt(receipt['gasUsed']['_hex'], 16)} Units`));
		console.log(chalk.red(`Transaction fee: ${(parseInt(receipt['gasUsed']['_hex'], 16) * ethers.utils.formatUnits(`${data.gasPrice}`, "gwei")).toFixed(8)} BNB`))
		console.log(chalk.magenta(`Total amount: ${ethers.utils.formatUnits(`${receipt['logs']['1']['data']}`, outDecimal)} [${outSymbol}]`))
		checkGains();
	} catch (err) {
		let error = JSON.parse(JSON.stringify(err));
		spinnertx.fail(`Error caused by :
						{
						reason: ${error.reason},
						code: ${error.code},
						transactionHash: ${error.transactionHash},
						message: Please check your BNB/WBNB balance, maybe its due because insufficient balance or approve your token manually on pancakeSwap
						}`);
		console.log(error);
	}
}

const spinner = ora();

async function run() {
	checkBalance(erc).then(function (result) {
			console.log(
				chalk.green("Wallet balance: ") +
				chalk.yellow(ethers.utils.formatEther(result) + " WBNB\n")
			);
		}).then(function () {
			console.log(chalk.yellow("TokenIn:  " + "[WBNB] - " + tokenIn));
			console.log(
				chalk.magenta("TokenOut: " + "[" + outSymbol + "] - " + tokenOut + "\n")
			);
		});
	/* console.log("Before Approve");
	const valueToapprove = ethers.utils.parseUnits("0.1", "ether");
	const txA = await erc.approve(router.address, valueToapprove, {
		gasPrice: ethers.utils.parseUnits(`${data.gasPrice}`, "gwei"),
		gasLimit: "162445",
	});
	console.log("After Approve");
	const receipt = await txA.wait(); 
	//console.log(receipt); */
	let ok = false;
	let pairAddressx = await factory.getPair(tokenIn, tokenOut);
	do {
		pairAddressx = await factory.getPair(tokenIn, tokenOut);
		console.log(chalk.cyan(`pairAddress: ${pairAddressx}`));
		if (pairAddressx !== null && pairAddressx !== undefined) {
			// console.log("pairAddress.toString().indexOf('0x0000000000000')", pairAddress.toString().indexOf('0x0000000000000'));
			if (pairAddressx.toString().indexOf("0x0000000000000") > -1) {
				console.log(
					chalk.red(`pairAddress ${pairAddressx} not detected. Auto restart`)
				);
			} else {
				ok = true;
			}
		}
	} while (!ok);
	let haveLiq = false;
	while (!haveLiq) {
		await checkLiq(pairAddressx).then(function (liqValue) {;
			haveLiq = liqValue > data.minBnb;
			if (!spinner.isSpinning) {
				spinner.start(
					`Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n`
				);
			} else {
				spinner.text(
					`Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n`
				)
			}
		});
	}
	spinner.succeed();
	buyAction();
}

console.timeEnd('load_funcs')

//run();
console.time('wallet_balance')
checkBalance(erc).then(function (result) {
    console.log(
        chalk.green("Wallet balance: ") +
        chalk.yellow(ethers.utils.formatEther(result) + " WBNB\n")
    );
}).then(function () {
    console.log(chalk.yellow("TokenIn:  " + "[WBNB] - " + tokenIn));
    console.log(
        chalk.magenta("TokenOut: " + "[" + outSymbol + "] - " + tokenOut + "\n")
    );
}).then(function(){
    console.timeEnd('wallet_balance')
});
let pairAddressx = await factory.getPair(tokenIn, tokenOut);

console.time('check_liq')
let haveLiq = false
spinner.start(`Waiting for liquidity\n`);
// while (!haveLiq) {
//     console.time('inside')
//     let liqValue = await checkLiq(pairAddressx)
//     haveLiq = liqValue > data.minBnb;
//     spinner.text = `Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n`
//     console.timeEnd('inside')
// }
let liqValue = 0
let count = 1
let isSpinning = false
while (!haveLiq) {
	var t0 = performance.now()
	liqValue = await checkLiq(pairAddressx) //* (10 * count);
	haveLiq = liqValue > data.minBnb;
	if (!isSpinning) {
		spinner.start(
			`Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n`
		);
		isSpinning = true
	} else {
		spinner.text = `Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n  Refresh Rate: ${(performance.now() - t0).toFixed(2)}ms\n`
	}
	count += 1
}
// let today = new Date()
// var h = today.getHours();
// var m = today.getMinutes();
// var s = today.getSeconds();
console.time('time_to_buy')
spinner.succeed(`Waiting for liquidity\n  Liquidity value: ${liqValue} \n  Threshold: ${data.minBnb}\n  Refresh Rate: ${(performance.now() - t0).toFixed(2)}ms\n` );
console.timeEnd('check_liq')
console.time('buyAction_text')
const amountIn = ethers.utils.parseEther(0);
const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);

//Our execution price will be a bit different, we need some flexbility
const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

console.log(
	chalk.green.inverse(`Buying Token \n`) +
	`
=================
tokenIn: ${ethers.utils
	.formatEther(amountIn)
	.toString()} ${tokenIn} [${inSymbol}]
tokenOut: ${ethers.utils
	.formatUnits(amountOutMin, outDecimal)
	.toString()} ${tokenOut} [${outSymbol}]
=================`
);

console.log("Processing Transaction.....");
console.log(
	chalk.yellow(`amountIn: ${ethers.utils.formatEther(amountIn)}`)
);
console.log(
	chalk.yellow(
		`amountOutMin: ${ethers.utils.formatUnits(amountOutMin, outDecimal)}`
	)
);
console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
console.log(chalk.yellow(`data.gasPrice: ${ethers.utils.formatUnits(`${data.gasPrice}`, "gwei")} BNB (${data.gasPrice} Gwei)`));
console.log(chalk.yellow(`data.slippage: ${data.Slippage}%\n`))
console.timeEnd('buyAction_text')
console.time('buyAction_tx')
const tx = await router.swapExactTokensForTokens(
	amountIn,
	amountOutMin,
	[tokenIn, tokenOut],
	data.recipient,
	Date.now() + 1000 * 60 * 5, // 5 minutes
	{
		gasLimit: data.gasLimit,
		gasPrice: ethers.utils.parseUnits(`${data.gasPrice}`, "gwei"),
		nonce: null, // Set you want buy at where position in blocks
	}
);
console.timeEnd('buyAction_tx')
console.timeEnd('time_to_buy')
//process.exit()