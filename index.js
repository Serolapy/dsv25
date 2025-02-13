import VkBot from 'node-vk-bot-api';
import Scene from 'node-vk-bot-api/lib/scene.js';
import Session from 'node-vk-bot-api/lib/session.js';
import Stage from 'node-vk-bot-api/lib/stage.js';
import Markup from 'node-vk-bot-api/lib/markup.js';

import fetch from 'node-fetch';
import { FormData } from 'node-fetch';
import fs from 'fs';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import generator from './image/generator.js';

export default function startBot (config, database){
	const MAX_LENGTH_TEXT = 200;			// максимальное количество символов в валентинке
	const bot = new VkBot({
		token: config.tokenValues.kupidon,
		confirmation: config.tokenValues.kupidon_confirmation,
	});
	const profbot = new VkBot({
		token: config.tokenValues.profcom,
		confirmation: config.tokenValues.profcom_confirmation,
	});
	
	const scene = new Scene('valentinki',
		async (ctx) => {
			try{
				ctx.scene.next();
				ctx.reply('Начинаем заполнение валентинки. Вставьте ссылку на пользователя, которому вы хотите отправить валентинку. Пример ссылки: https://vk.com/vladi6008');
			} catch (error) {
				console.error('Ошибка работе бота:', error);
				await ctx.reply('Произошла ошибка. Попробуйте заполнить валентинку снова.');
				ctx.scene.leave();
			}
		  },
		  async (ctx) => {
			try{
			let username;
		
			try{
				username = ctx.message.text.match(/(?:vk\.com\/(?:id)?|@)([a-zA-Z0-9_.]+)/)[1];
			}
			catch(err){
				ctx.scene.step = 1;
				ctx.reply('Произошла ошибка. Проверьте ссылку и попробуйте ещё раз');
				return
			}
			const users = await bot.execute("users.get", {user_ids:username})
			if (!users.length){
				ctx.scene.step = 1;
				ctx.reply('Пользователь не найден. Проверьте ссылку и попробуйте ещё раз');
				return
			}
			const user = users[0];
			await bot.sendMessage(ctx.message.from_id, `Пользователь найден: это ${user.last_name} ${user.first_name}`);
		
			try{
				const can_write = await profbot.execute("messages.setActivity", {user_id: user.id, type: 'typing'});
			}
			catch(err){
				ctx.scene.leave();
				ctx.reply('Упс... Мы не можем отправить валентинку этому пользователю, поскольку он ни разу не писал сообщения в сообществе Профкома студентов ПсковГУ. Для того, чтобы мы могли доставить валентинку, её получатель должен разрешить ссобщения от сообщества или написать что-то в ЛС');
				return
			}
			  ctx.session.to = user.id;
		
			  ctx.scene.next();
			  ctx.reply(`Теперь напишите текст валентинки. Учтите, что текст валентинки не должен превышать ${MAX_LENGTH_TEXT} символов. Можно использовать только буквы латинского и кириллического алфавитов, цифры, а также знаки препинания`);
			} catch (error) {
				console.error('Ошибка работе бота:', error);
				await ctx.reply('Произошла ошибка. Попробуйте снова.');
				ctx.scene.leave();
			}
			},
		  async (ctx) => {
			try{
			if (ctx.message.text.length > MAX_LENGTH_TEXT){
				ctx.scene.step = 2;
				ctx.reply(`Вы превысили количество допустимых символов: (${MAX_LENGTH_TEXT}). Напишите текст валентинки ещё раз.`);
				return
			}

			const regex = /^[а-яА-Я0-9\s\.,!?-]+$/;
			if (! regex.test(ctx.message.text)){
				ctx.scene.step = 2;
				ctx.reply(`Вы использовали недопустимые символы. Напишите текст валентинки ещё раз.`);
				return
			}	  		
			ctx.session.text = ctx.message.text;

			ctx.scene.next();
			  ctx.reply(`Как вы хотите отправить валентинку?`, null, Markup.keyboard([
				Markup.button('Анонимно', 'primary'),
				Markup.button('Не анонимно', 'secondary')
			]).oneTime());
		} catch (error) {
			console.error('Ошибка работе бота:', error);
			await ctx.reply('Произошла ошибка. Попробуйте снова.');
			ctx.scene.leave();
		}
		  },
		  async (ctx) => {
			try{
			switch(ctx.message.text){
				case 'Анонимно':
					ctx.session.anon = true;
					break;
				case 'Не анонимно':
					ctx.session.anon = false;
					break;
				default:
					ctx.scene.step = 3;
					ctx.reply(`Пожалуйста, воспользуйтесь кнопками`, null, Markup.keyboard([
						Markup.button('Анонимно', 'primary'),
						Markup.button('Не анонимно', 'secondary')
					]).oneTime());
					return
			};
		
			
			const canvas = await generator(ctx.session.text);
			if (!canvas){
				ctx.reply(`Произошла ошибка при создании валентинки. Напишите текст валентинки ещё раз, сделайте его поменьше.`);
				return
			}
			const temp_name = `./temp/valentine_${ctx.message.peer_id}_${Date.now()}.png`;
			const buffer = canvas.toBuffer("image/png");
			fs.writeFileSync(temp_name, buffer);


			const uploadServer = await bot.execute('photos.getMessagesUploadServer', { peer_id: ctx.message.peer_id });
			const formData = new FormData();

let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
// Добавляем файл в FormData как поток
formData.append('photo', blob, 'valentine.png');

const response_upload_data = await fetch(uploadServer.upload_url, {
    method: 'POST',
    body: formData
});
			const upload_data = await response_upload_data.json();
			const data = await bot.execute('photos.saveMessagesPhoto', {
				photo: upload_data.photo,
				server: upload_data.server,
				hash: upload_data.hash
			});
			ctx.scene.next();
			ctx.session.temp_name = temp_name;

			const users = await bot.execute("users.get", {user_ids: ctx.session.to})
			const user = users[0];
			
			await bot.execute('messages.send', {
				peer_id: ctx.message.peer_id,
				message: `Отправляем эту валентинку пользователю @id${user.id} (${user.first_name} ${user.last_name})${ctx.session.anon ? ' анонимно' : ', указав вас как автора'}?`,
				attachment: `photo${data[0].owner_id}_${data[0].id}`,
				random_id: Math.floor(Math.random() * 1000000),
				keyboard: Markup.keyboard([
					Markup.button('Да', 'positive'),
					Markup.button('Нет', 'negative')
				]).oneTime()
			})
		} catch (error) {
			console.error('Ошибка работе бота:', error);
			await ctx.reply('Произошла ошибка. Попробуйте снова.');
			ctx.scene.leave();
		}
		},
		async (ctx) => {
			try{
			switch(ctx.message.text){
				case 'Да':
					const users = await bot.execute("users.get", {user_ids: ctx.message.from_id})
					const user = users[0];

					const uploadServer = await profbot.execute('photos.getMessagesUploadServer', { peer_id: ctx.message.peer_id });
					const formData = new FormData();
					const temp_name = ctx.session.temp_name;
					// Получаем информацию о файле

// let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

// Добавляем файл в FormData как поток
formData.append('photo', blob, 'valentine.png');

const response_upload_data = await fetch(uploadServer.upload_url, {
    method: 'POST',
    body: formData
});
					const upload_data = await response_upload_data.json();
					const data = await profbot.execute('photos.saveMessagesPhoto', {
						photo: upload_data.photo,
						server: upload_data.server,
						hash: upload_data.hash
					});
				
					await profbot.execute('messages.send', {
						peer_id: ctx.session.to,
						message: `💌 Вам пришла ${ctx.session.anon ? 'анонимная' : ''} валентинка${ctx.session.anon ? '' : ` от пользователя @id${user.id} (${user.first_name} ${user.last_name})`}.`,
						attachment: `photo${data[0].owner_id}_${data[0].id}`,
						random_id: Math.floor(Math.random() * 1000000),
						keyboard: JSON.stringify({
							inline: true,
							buttons: [
							  [
								{
								  action: {
									type: "open_link",
									link: "https://vk.me/event224602951",
									label: "Отправить свою валентинку",
								  },
								},
							  ],
							],
						})
					});

					ctx.reply(`Валентинка отправлена!`, null, Markup.keyboard([
						Markup.button('Отправить новую валентинку', 'primary'),
					]).oneTime());
					ctx.scene.step = 0;
					fs.rmSync(temp_name);
					break;
				case 'Нет':
					ctx.reply(`Отправка валентинки отменена`, null, Markup.keyboard([
						Markup.button('Отправить новую валентинку', 'primary'),
					]).oneTime());
					ctx.scene.step = 0;
					fs.rmSync(temp_name);
					break;
				default:
					ctx.scene.step = 4;
					ctx.reply(`Пожалуйста, воспользуйтесь кнопками`, null, Markup.keyboard([
						Markup.button('Да', 'positive'),
						Markup.button('Нет', 'negative')
					]).oneTime());
					return
			};
			ctx.scene.step = 0;
			
		}
		catch (error) {
			console.error('Ошибка работе бота:', error);
			await ctx.reply('Произошла ошибка. Попробуйте снова.');
			ctx.scene.leave();
		}
	} 
	);
	const session = new Session();
	const stage = new Stage(scene);
	
	bot.use(session.middleware());
	bot.use(stage.middleware());
	
	
	bot.on(async (ctx) => {
		const message = ctx.message;
	
		//если нажал на кнопку
		if (message['payload']){
			let payload = JSON.parse(message['payload']);
		
			switch(payload.action){
				case 'valent_start':
					ctx.scene.enter('valentinki')
					break;
				
			}
		}
		else{
			const markup = Markup.keyboard([
				Markup.button({
					action: {
						type: 'text',
						label: 'Отправить валентинку',
						payload: JSON.stringify({
							action: 'valent_start'
						})
					}
				})
			]);
			ctx.reply('Привет! Выбери действие:', null, markup.oneTime());
		}	
	});
	
	const plugin = new classes.Plugin(config);

	plugin.router.all('/kupidon', bot.webhookCallback);
	plugin.router.all('/profkom', profbot.webhookCallback);
	
	return plugin
}