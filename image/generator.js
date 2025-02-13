
import { createCanvas, registerFont, Image } from 'canvas';

const PATH_TO_IMG = 'plugins/dsv25/image/img.png';
const PATH_TO_FONT = 'plugins/dsv25/image/font.ttf';
import fs from 'fs'

registerFont(PATH_TO_FONT, { family: 'Font' });

export default async function(text) {
    try {
        const img = await loadImage(PATH_TO_IMG);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, img.width, img.height);

        // разбиваем текст на линии по знакам переноса
        const rows_1 = text.split('\n');
        const rows_2 = [];
        let textSize;

        for (const maxWidth of [13, 18, 28]){
            // перебираем всевозможные длины строк

            const lines = [];
            for (const row of rows_1){
                // смотрим, сможем ли мы разделить строки так, чтобы количество строк не превышало нужного значения

                const words = row.split(' ');
                let currentLine = '';

                words.forEach(word => {
                    if (currentLine.length + word.length <= maxWidth) {
                        // если ширина строки + ширина слова не выходят за рамки, вставляем слово на строку
                        currentLine += word + ' ';
                    } else if (word.length <= maxWidth){
                        // иначе если ширина самого слова не выходит за рамки, записываем старую строку, а слово переносим на новую
                        lines.push(currentLine.trim());
                        currentLine = word + ' ';
                    }
                    else {
                        // если ширина слова больше границы строки
                        const word_rows = word.match(new RegExp(`.{1,${maxWidth}}`, 'g'));
                        lines.push(currentLine.trim());
                        lines.push(...word_rows);
                        currentLine = '';
                    }
                });
            
                if (currentLine.trim() !== '') {
                    lines.push(currentLine.trim());
                }
            }

            // проверяем, попали ли в количество допустимых строк во всех, кроме последнего
            if (
                maxWidth == 13 && lines.length > 5 || 
                maxWidth == 18 && lines.length > 7
            ){
                continue;
            }

            if (maxWidth == 28 && lines.length > 11){
                /**
                 * ОШИБКА - текст слишком большой
                 */
                return null
            }

            // дошли до сюда — круто, мы попали в размер
            rows_2.push(...lines);
            switch (maxWidth){
                case 13: textSize = 79; break;
                case 18: textSize = 55; break;
                case 28: textSize = 35; break;
            }
            break;
        } 
        
        if (rows_2.length == 0){
            return null
        }
        ctx.font = `${textSize}px Font`;
        ctx.fillStyle = '#862523';

        // Центрирование текста по горизонтали
        const frameWidth = 575; // ширина рамки
        const frameHeight = 641; // высота рамки
        const frameTopRightX = 978; // x-координата правого верхнего угла рамки
        const frameTopRightY = 32;  // y-координата правого верхнего угла рамки
        const frameCenterX = frameTopRightX - frameWidth / 2; // Центр рамки по горизонтали
        const frameCenterY = frameTopRightY + frameHeight / 2; // Центр рамки по вертикали

        // Отрисовка текста
        rows_2.forEach((line, index) => {
            const lineWidth = ctx.measureText(line).width;
            const x = frameCenterX - lineWidth / 2;
            const y = frameCenterY - textSize * rows_2.length / 2 + index * textSize;
            ctx.fillText(line, x, y);
        });

        // let out = fs.createWriteStream('./text.png')
        // , stream = canvas.pngStream();
        // stream.on('data', function(chunk){
        //     out.write(chunk);
        // });
        // stream.on('end', function(){
        //     console.log('saved png');
        // });
        // const imageUrl = canvas.toDataURL();
        return canvas;
    } catch (error) {
        return null;
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject();
        img.src = src;
    });
}