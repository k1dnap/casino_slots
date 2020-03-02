const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const settings = require('./settings.json')
bet_amount = settings.bet_amount
spins_num = settings.spins_num
balance_limit = settings.balance_limit

console.log(bet_amount, spins_num, balance_limit)
balance = 0
bet = 0

let patterns = {
	starburst: [`starburst_mobile_html`],
	ted: [`BP_Ted`]
}
let models = {
	starburst: {
	}
}

let detectSlotOnPage = async (params={})=>{
	if(!params.page)throw 'no page passed'
	if(!params.browser)throw 'no browser passed'
	let page = params.page;
	let browser = params.browser;
	let frame = new Set();
	console.log('looking for slot on page')
	let frames = []
	await Promise.all( (await browser.pages()).map(page=>(page.frames()).map(el=>{
		el.page=page;
		frames.push(el)
	})))
	//add nested loop for frames
	//iterate over patterns + patterns[key] + frames
	for (let key in patterns){
		patterns[key].map(clue=>{
			frames.map(temp_frame=>{
				if (temp_frame._url.includes(clue) ){
					temp_frame.slot_type = key;
					// https://stackoverflow.com/questions/39419746/how-do-i-add-a-method-to-an-existing-object
					//add external functions to frame, such as spin, upBet, downBet
					frame.add(temp_frame)
				}
			})
		})
	}
	if (frame.size !== 1) {
		console.log('found '+ frame.size +' slots frame on page')
		return null;
	}
	frame = frame.values().next().value
	//add functions to frame
	console.log(`found `+ frame.slot_type + ` slot on page`)
	return frame;
}
let slotLoaded = async (params={})=>{
	if(!params.slot_frame) throw 'no frame passed'
	let slot_frame = params.slot_frame;
	if(slot_frame.slot_type === 'starburst'){
		let loaded;
		//loading bar
		while(!loaded){
			await new Promise(resolve=>setTimeout(resolve, 2000))	
			console.log('slot loading')
			loaded = await slot_frame.evaluate( ()=>{
				try {
					document.querySelector('.loader-bar__progress').style.width
					return null
				} catch (error) {
					return true
				}
			})
		}
		const el = await slot_frame.$('#gameWrapper')
			await slot_frame.evaluate(el => {
				visible = false
				document.querySelector('#gameWrapper').addEventListener('mouseover', function () {
					this.setAttribute('mouseover-worked', 'true')
					visible = true
				})
			}, el)
			let visible;
			while(!visible){
				await el.hover()
				await new Promise(resolve=>setTimeout(resolve, 1000))	
				console.log('slot is not visible')
				visible = await slot_frame.evaluate( ()=>{
					return visible
				})
			}
		console.log('slot visible and loaded')
		return;
	}
}
let closestNum = (nums, given_num) => {
	const set = new Set(nums)
	let i = 0
	while (true) {
		if (set.has(given_num - i)) return given_num - i
		if (set.has(given_num + i)) return given_num + i
		i++
	}
}
main = async()=>{
	let browser = await puppeteer.launch({
		headless:false,
		userDataDir: "./profile",
		args: [
			'--window-size=1024,700',
			'--disable-site-isolation-trials'
		],
	});
	let page = await browser.newPage();
	await page.setViewport({ width: 0, height: 0 })
	let slot_frame;

	//depr it 
	//and do like  
	//slot_frame = await detectSlotOnPage({page})
	while(!slot_frame) {
		slot_frame = await detectSlotOnPage({page, browser})
		if(slot_frame) {
			page = slot_frame.page
			break
		}
		await new Promise(resolve=>setTimeout(resolve, 5000))
	}
	await slotLoaded({slot_frame});

	//scroll to element
	await slot_frame.evaluate(()=>{
		document.querySelector('body').scrollIntoView()
	})
	await new Promise(resolve=>setTimeout(resolve, 1000))
	//get element from slot iframe itself
	let frame_element = await slot_frame.$('#gameWrapper')
	let page_coordinates = await frame_element.boundingBox()

	//starburst only code###
	let coordinates = {
		spin: [page_coordinates.x+page_coordinates.width*0.50,page_coordinates.y+page_coordinates.height*0.91],
		level_up: [page_coordinates.x+page_coordinates.width*0.33,page_coordinates.y+page_coordinates.height*0.91],
		level_down: [page_coordinates.x+page_coordinates.width*0.25,page_coordinates.y+page_coordinates.height*0.91],
		coin_up: [page_coordinates.x+page_coordinates.width*0.78,page_coordinates.y+page_coordinates.height*0.91],
		coin_down: [Math.round(page_coordinates.x+page_coordinates.width*0.67),page_coordinates.y+page_coordinates.height*0.91],
		continue_button: [page_coordinates.x+page_coordinates.width*0.4,page_coordinates.y+page_coordinates.height*0.91],
		continue_button2: [page_coordinates.x+page_coordinates.width*0.25,page_coordinates.y+page_coordinates.height*0.7]
	}
	let checkBalance = async()=>{
		balance = await slot_frame.evaluate(()=>{
			return document.querySelector('body').outerHTML.split('><span class="text">Cash: </span><span class="text value">')[1].split('</span')[0].split(',').join('').split('').splice(1).join('')
		})
	}
	let checkBet = async ()=>{
		bet = await slot_frame.evaluate(()=>{
			return document.querySelector('body').outerHTML.split('><span class="text">Bet: </span><span class="text value">')[1].split('</span')[0].split('').splice(1).join('')
		})
	}
	let resetBets = async ()=>{
		//# reset level
		for (let i of [...Array(9)]){
			// decrease level value
			await page.mouse.click(coordinates['level_down'][0],coordinates['level_down'][1])
			await new Promise(resolve=>setTimeout(resolve, 400))
		}
		console.log(`levels reseted`)
		//reset bets
		for (let i of [...Array(6)]){
			// decrease bet value
			await page.mouse.click(coordinates['coin_down'][0],coordinates['coin_down'][1])
			await new Promise(resolve=>setTimeout(resolve, 400))
		}
		console.log(`coins reseted`)
	}

	let bet_pattern = [];
	[0.1,0.2,0.5,1,2,5,10].map((coin, coin_index)=>{
		[...Array(10)].map( (level, level_index)=>{
			let obj = {}
			obj.value = Math.round((coin*(level_index+1)) * 100) / 100
			obj.index = [coin_index, level_index]
			bet_pattern.push(obj);
		})
	})
	sometemp = []
	bet_pattern.filter( el=>{
		if(sometemp.includes(el.value))return false
		sometemp.push(el.value)
		return true;
	})
	let setBet = async()=>{
		let num = closestNum(bet_pattern.map(el=>el.value), bet_amount)
		let pattern = bet_pattern.find(el=>el.value == num);

		//coins
		for (let i of [...Array(pattern.index[0])]){
			await page.mouse.click(coordinates['coin_up'][0],coordinates['coin_up'][1])
			await new Promise(resolve=>setTimeout(resolve, 400))
		}
		//level
		for (let i of [...Array(pattern.index[1])]){
			await page.mouse.click(coordinates['level_up'][0],coordinates['level_up'][1])
			await new Promise(resolve=>setTimeout(resolve, 400))
		}
	}
	let spin = async()=>{
		//click to spin
		await page.mouse.click(coordinates['spin'][0],coordinates['spin'][1])
		//wait till spinned
		let spinned;
		while(spinned !== true){
			await new Promise(resolve=>setTimeout(resolve, 250))
			await page.mouse.click(coordinates['continue_button2'][0],coordinates['continue_button2'][1])
			//if 3 sunflowers appear
			await new Promise(resolve=>setTimeout(resolve, 2000))
			for (let i in [...Array(5)]){
				await new Promise(resolve=>setTimeout(resolve, 200))
				await page.mouse.click(coordinates['continue_button2'][0],coordinates['continue_button2'][1])
			}
			await new Promise(resolve=>setTimeout(resolve, 1000))

			for (let i in [...Array(5)]){
				await new Promise(resolve=>setTimeout(resolve, 200))
				await page.mouse.click(coordinates['continue_button2'][0],coordinates['continue_button2'][1])
			}
			spinned = true;

		}
		//return
	}
	let clickContinue = async()=>{
		await page.mouse.click(coordinates['continue_button'][0],coordinates['continue_button'][1])
		await new Promise(resolve=>setTimeout(resolve, 400))
		await page.mouse.click(coordinates['continue_button2'][0],coordinates['continue_button2'][1])
		await new Promise(resolve=>setTimeout(resolve, 400))
	}
	
	// await page.mouse.click(522,466)
	// end of starburst code###
	console.log('clicking continue')
	await clickContinue();
	await resetBets();
	await setBet();
	await checkBet();
	await checkBalance();
	let starting_balance =  balance;
	success_spins = 0
	for (let i of [...Array(spins_num)]){
		// # check balance
		await checkBalance();
		if ((balance - bet) < balance_limit) {
			console.log(`next spin will break the balance limit`)
			break;
		}
		if (balance <= balance_limit) break;
		console.log('doing spin '+ (success_spins+1) +'/'+spins_num)
		await spin();
		success_spins++
	}
	await checkBalance();
	let details = 'starting balance: '+ starting_balance + ' | current_balance: ' + balance + ' | bet: '+bet+ ' | done ' +success_spins+ ' spins of '+spins_num;
	console.log(details)
	let template1 = JSON.stringify(details, null, 2)
	await fs.writeFile('./details.json', template1);
	await browser.close();
}
main();

