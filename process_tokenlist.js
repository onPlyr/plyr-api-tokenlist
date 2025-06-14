const fs = require('fs').promises;
const axios = require('axios');
const sharp = require('sharp');
const chalk = require('chalk');
const ColorThief = require('colorthief');

// Function to mix two colors with a given ratio
function mixColors(color1, color2, ratio = 0.5) {
    // Convert hex to RGB
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    // Convert RGB to hex
    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    // Mix the colors
    const mixed = {
        r: rgb1.r * ratio + rgb2.r * (1 - ratio),
        g: rgb1.g * ratio + rgb2.g * (1 - ratio),
        b: rgb1.b * ratio + rgb2.b * (1 - ratio)
    };

    return rgbToHex(mixed.r, mixed.g, mixed.b);
}

async function downloadImage(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error(chalk.red(`Error downloading ${url}: ${error.message}`));
        return null;
    }
}

async function processImage(imageBuffer) {
    if (!imageBuffer) return {
        averageColor: '#000000',
        dominantColor1: '#000000',
        dominantColor2: '#ffffff'
    };

    try {
        // Create a temporary file for ColorThief
        const tempFile = `temp_${Date.now()}.png`;
        await fs.writeFile(tempFile, imageBuffer);

        // Get dominant colors using ColorThief
        const palette = await ColorThief.getPalette(tempFile, 2);
        const averageColor = await ColorThief.getColor(tempFile);

        // Clean up temp file
        await fs.unlink(tempFile);

        // Convert RGB arrays to hex colors
        const toHex = (rgb) => `#${rgb.map(x => x.toString(16).padStart(2, '0')).join('')}`;

        // Get dominant color
        const dominantColor1 = palette[0] ? toHex(palette[0]) : '#000000';
        
        // If second color is undefined, create a semi-transparent version of dominant color
        const dominantColor2 = palette[1] ? toHex(palette[1]) : mixColors(dominantColor1, '#ffffff', 0.1);

        return {
            averageColor: toHex(averageColor),
            dominantColor1,
            dominantColor2
        };
    } catch (error) {
        console.error(chalk.red(`Error processing image: ${error.message}`));
        return {
            averageColor: '#000000',
            dominantColor1: '#000000',
            dominantColor2: '#ffffff'
        };
    }
}

async function processTokenlist() {
    try {
        const tokenlistData = await fs.readFile('plyrapi.tokenlist.json', 'utf8');
        const tokenlist = JSON.parse(tokenlistData);

        console.log(chalk.blue('Processing tokens...'));

        for (let i = 0; i < tokenlist.tokens.length; i++) {
            const token = tokenlist.tokens[i];
            if (token.logoURI) {
                process.stdout.write(chalk.yellow(`Processing ${token.symbol} (${i + 1}/${tokenlist.tokens.length})... `));
                
                const imageBuffer = await downloadImage(token.logoURI);
                if (imageBuffer) {
                    const colors = await processImage(imageBuffer);
                    
                    // Create a new object with colors after logoURI
                    const newToken = {};
                    for (const key in token) {
                        newToken[key] = token[key];
                        if (key === 'logoURI') {
                            newToken['averageColor'] = colors.averageColor;
                            newToken['dominantColor1'] = colors.dominantColor1;
                            newToken['dominantColor2'] = colors.dominantColor2;
                        }
                    }
                    tokenlist.tokens[i] = newToken;
                    
                    console.log(chalk.green('Done!'));
                } else {
                    console.log(chalk.red('Failed to process image'));
                }
            }
        }

        // Save the updated tokenlist
        await fs.writeFile(
            'plyrapi.tokenlist.json',
            JSON.stringify(tokenlist, null, 4)
        );

        // Generate HTML preview
        const html = generateHtmlPreview(tokenlist.tokens);
        await fs.writeFile('token_colors.html', html);

        console.log(chalk.green('\nTokenlist processing completed successfully!'));
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
    }
}

function generateHtmlPreview(tokens) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Token Colors Preview</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                background: #f0f0f0;
            }
            .token-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
                padding: 20px;
            }
            .token-card {
                background: white;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .token-header {
                display: flex;
                align-items: center;
                margin-bottom: 15px;
            }
            .token-logo {
                width: 40px;
                height: 40px;
                margin-right: 10px;
            }
            .token-name {
                font-weight: bold;
                font-size: 1.1em;
            }
            .color-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            .color-item {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .color-label {
                font-size: 0.8em;
                margin-bottom: 5px;
                color: #666;
            }
            .color-box {
                width: 100%;
                height: 30px;
                border-radius: 4px;
            }
            .gradient-box {
                width: 100%;
                height: 30px;
                border-radius: 4px;
                background: linear-gradient(45deg, var(--color1), var(--color2));
            }
        </style>
    </head>
    <body>
        <div class="token-grid">
            ${tokens.map(token => `
                <div class="token-card">
                    <div class="token-header">
                        <img src="${token.logoURI}" class="token-logo" alt="${token.symbol}">
                        <div class="token-name">${token.symbol}</div>
                    </div>
                    <div class="color-grid">
                        <div class="color-item">
                            <div class="color-label">Average Color</div>
                            <div class="color-box" style="background-color: ${token.averageColor}"></div>
                        </div>
                        <div class="color-item">
                            <div class="color-label">Dominant Color 1</div>
                            <div class="color-box" style="background-color: ${token.dominantColor1}"></div>
                        </div>
                        <div class="color-item">
                            <div class="color-label">Dominant Color 2</div>
                            <div class="color-box" style="background-color: ${token.dominantColor2}"></div>
                        </div>
                        <div class="color-item">
                            <div class="color-label">Gradient (45°)</div>
                            <div class="gradient-box" style="--color1: ${token.dominantColor1}; --color2: ${token.dominantColor2}"></div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </body>
    </html>
    `;
}

processTokenlist(); 