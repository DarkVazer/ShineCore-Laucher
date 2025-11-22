// download-util.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Логирование
console.log('DownloadUtil module loaded');

class DownloadUtil {
    constructor(logger) {
        this.logger = logger || {
            info: () => {},
            warn: console.warn,
            error: console.error
        };
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    _getRequestModule(url) {
        return url.startsWith('https://') ? https : http;
    }

    async downloadFileWithRetry(url, filePath, expectedSha1 = null) {
        if (fs.existsSync(filePath) && expectedSha1) {
            const hash = await this.calculateSha1(filePath);
            if (hash === expectedSha1) return true;
        }

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await this.downloadFile(url, filePath);
                if (expectedSha1) {
                    const hash = await this.calculateSha1(filePath);
                    if (hash === expectedSha1) return true;
                    this.logger.warn(`SHA1 mismatch: ${path.basename(filePath)}`);
                }
                return true;
            } catch (error) {
                this.logger.warn(`Download failed (${attempt}/${this.maxRetries}): ${url}`);
                if (attempt === this.maxRetries) throw error;
                await this.sleep(this.retryDelay * attempt);
            }
        }
    }

    downloadFile(url, filePath) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(filePath));
            const client = this._getRequestModule(url);

            client.get(url, { timeout: 30000 }, (response) => {
                if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
                    return this.downloadFile(response.headers.location, filePath)
                        .then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                }

                const fileStream = fs.createWriteStream(filePath);
                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });

                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => {});
                    reject(err);
                });
            }).on('error', reject);
        });
    }

    // ВОТ ЭТОТ МЕТОД БЫЛ ПОТЕРЯН — ВОЗВРАЩАЕМ!
    async downloadParallel(files, concurrency = 8, onProgress = null) {
        let completed = 0;
        const total = files.length;
        const failed = [];

        const queue = [...files];
        const workers = [];

        const worker = async () => {
            while (queue.length > 0) {
                const file = queue.shift();
                if (!file) break;

                try {
                    await this.downloadFileWithRetry(file.url, file.path, file.sha1);
                    completed++;
                    if (onProgress) {
                        onProgress(completed, total, file);
                    }
                } catch (error) {
                    this.logger.error(`Failed: ${file.name || path.basename(file.path)}`, error);
                    failed.push(file);
                }
            }
        };

        for (let i = 0; i < concurrency; i++) {
            workers.push(worker());
        }

        await Promise.all(workers);
        return { completed, total, failed };
    }

    async fetchJson(url) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const data = await this._fetchJson(url);
                return data;
            } catch (error) {
                this.logger.warn(`JSON fetch failed (${attempt}/${this.maxRetries}): ${url}`);
                if (attempt === this.maxRetries) throw error;
                await this.sleep(this.retryDelay * attempt);
            }
        }
    }

    _fetchJson(url) {
        return new Promise((resolve, reject) => {
            const client = this._getRequestModule(url);

            client.get(url, { timeout: 30000 }, (response) => {
                if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
                    return this._fetchJson(response.headers.location).then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                }

                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`JSON parse error: ${e.message}`));
                    }
                });
            }).on('error', reject);
        });
    }

    async calculateSha1(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('data', d => hash.update(d));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = DownloadUtil;