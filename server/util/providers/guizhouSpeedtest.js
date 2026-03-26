import crypto from 'node:crypto';
import axios from 'axios';

const PREFIX = 'speedInternal-';
const SECRET = 'h2y1ir33nebnh3pfjm2b2hxncocwxeqj-';
const SOURCE_ID = 'speedInternal';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function generateAuth(timestamp) {
    const raw = `${PREFIX}${SECRET}${timestamp}`;
    const md5Upper = crypto.createHash('md5').update(raw, 'utf8').digest('hex').toUpperCase();
    return Buffer.from(md5Upper, 'utf8').toString('base64');
}

class GuizhouTester {
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.lastTimestamp = Date.now();
        this.base64Hash = generateAuth(this.lastTimestamp);

        this.calcTime = 200;
        this.totalTestTime = 15000;
        this.lostDataTime = 2;
        this.minLostDataTime = 3;
        this.maxDataTime = 10;
        this.avgMaxProportion = 0.96;
        this.startAvgProportion = 0.99;
        this.endAvgProportion = 1.0;
        this.useConfig = 1;
        this.allDownTime = 20;
        this.wifiLossConfig = 1;
        this.wifiLossRate = 0.15;
        this.wifiMaxLossValue = 100;
        this.standardValue = 0.9;
        this.wifiOptRate = 0.3;
        this.allocationThreadNum = 6;
        this.nodeFileSize = 30720;

        this.basicInfo = {};
        this.speedTestNodes = [];
        this.serviceNew = [];
        this.addressNew = null;
        this.bdCode = null;
    }

    refreshAuth() {
        const now = Date.now();
        if (now - this.lastTimestamp >= 300000) {
            this.lastTimestamp = now;
            this.base64Hash = generateAuth(this.lastTimestamp);
        }
    }

    getHeaders(jsonType = false) {
        this.refreshAuth();
        const h = {
            authentication: this.base64Hash,
            sourceId: SOURCE_ID,
            timeStamp: String(this.lastTimestamp),
        };
        if (jsonType) h['Content-Type'] = 'application/json; charset=utf-8';
        return h;
    }

    async getSpeedConfig() {
        const { data } = await axios.get(
            `${this.baseUrl}/common/getSpeedConfig?deviceType=2`,
            { headers: this.getHeaders(), timeout: 10000 }
        );
        if (data?.code === 200 && data.data) {
            const c = data.data;
            if (c.lostDataTime != null) this.lostDataTime = parseInt(c.lostDataTime);
            if (c.minLostDataTime != null) this.minLostDataTime = parseInt(c.minLostDataTime);
            if (c.maxDataTime != null) this.maxDataTime = parseInt(c.maxDataTime);
            if (c.avgMaxProportion != null) this.avgMaxProportion = parseFloat(c.avgMaxProportion);
            if (c.startAvgProportion != null) this.startAvgProportion = parseFloat(c.startAvgProportion);
            if (c.endAvgProportion != null) this.endAvgProportion = parseFloat(c.endAvgProportion);
            if (c.useConfig != null) this.useConfig = parseInt(c.useConfig);
            if (c.allDownTime != null) this.allDownTime = parseInt(c.allDownTime);
            if (c.wifiLossConfig != null) this.wifiLossConfig = parseInt(c.wifiLossConfig);
            if (c.wifiLossRate != null) this.wifiLossRate = parseFloat(c.wifiLossRate);
            if (c.wifiMaxLossValue != null) this.wifiMaxLossValue = parseInt(c.wifiMaxLossValue);
            if (c.standardValue != null) this.standardValue = parseFloat(c.standardValue);
            if (c.wifiOptRate != null) this.wifiOptRate = parseFloat(c.wifiOptRate);
            if (c.allocationThreadNum != null) this.allocationThreadNum = parseInt(c.allocationThreadNum);
            if (c.nodeFileSize != null) this.nodeFileSize = parseInt(c.nodeFileSize);
        }
    }

    async getBasicInfo() {
        const { data } = await axios.post(
            `${this.baseUrl}/inter/speed/getAllNodeInfo`, null,
            { headers: this.getHeaders(), timeout: 10000 }
        );
        if (data?.code !== 200) throw new Error(`获取宽带基础信息失败: ${JSON.stringify(data)}`);
        this.basicInfo = data.data || {};
        this.bdCode = this.basicInfo.bdCode ? parseFloat(this.basicInfo.bdCode) : null;
    }

    async measureLatency(url, timeoutMs = 2000) {
        try {
            const start = Date.now();
            await axios.head(`${url}?ran=${Math.random()}`, {
                headers: this.getHeaders(),
                timeout: timeoutMs
            });
            return Date.now() - start;
        } catch {
            return 999999;
        }
    }

    async collectNodeDelays() {
        const nodeInfo = this.basicInfo.nodeInfo || [];
        if (!nodeInfo.length) throw new Error('无可用节点');

        const result = [];
        for (const node of nodeInfo) {
            const delay = await this.measureLatency(node.nodeDelayUrl, 2000);
            result.push({
                nodeName: node.nodeName,
                nodeIp: node.nodeIp,
                nodeUuid: node.nodeUuid,
                delay
            });
        }
        this.serviceNew = result;
        return result;
    }

    async getSpeedTestNodes(nodeInfo) {
        const { data } = await axios.post(
            `${this.baseUrl}/inter/speed/pushAllNodeInfo`,
            { uuid: this.basicInfo.uuid, nodeInfo },
            { headers: this.getHeaders(true), timeout: 15000 }
        );
        if (data?.code !== 200) throw new Error(`获取测速节点失败: ${JSON.stringify(data)}`);
        this.speedTestNodes = data.data?.nodeInfo || [];
        if (this.speedTestNodes.length) {
            this.addressNew = this.speedTestNodes[0].downloadUrl;
        }
    }

    // ---- Download ----

    async _downloadWorker(downloadUrl, state) {
        while (!state.stopped) {
            try {
                const url = `${downloadUrl}?fileSize=${this.nodeFileSize}&ran=${Math.random()}`;
                const resp = await fetch(url, {
                    headers: this.getHeaders(),
                    signal: state.abortController.signal,
                });
                const reader = resp.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done || state.stopped) break;
                        state.totalBytes += value.length;
                    }
                } finally {
                    try { reader.releaseLock(); } catch { /* ignore */ }
                }
            } catch {
                if (state.stopped) return;
                await sleep(100);
            }
        }
    }

    async startDownloadTest() {
        if (!this.speedTestNodes.length) throw new Error('speed_test_nodes is empty');

        const state = { totalBytes: 0, stopped: false, abortController: new AbortController() };

        const workers = [];
        for (const node of this.speedTestNodes) {
            if (!node.downloadUrl) continue;
            for (let i = 0; i < this.allocationThreadNum; i++) {
                workers.push(this._downloadWorker(node.downloadUrl, state));
            }
        }

        const sampleInterval = this.calcTime;
        const warmupSamples = this.lostDataTime * 5;
        const totalSamples = this.allDownTime * 5;
        const downloadCorrection = 1.04;

        let downloadVal = 0;
        let oldTotal = 0;
        let startTimeMs = null;
        const records = [];

        for (let sampleNum = 1; sampleNum <= totalSamples; sampleNum++) {
            await sleep(sampleInterval);
            const currentTotal = state.totalBytes;
            const delta = currentTotal - oldTotal;
            oldTotal = currentTotal;

            if (sampleNum < warmupSamples) continue;
            if (sampleNum === warmupSamples) {
                startTimeMs = Date.now();
                continue;
            }

            if (startTimeMs === null) startTimeMs = Date.now();

            downloadVal += delta;
            const elapsedMs = Date.now() - startTimeMs;
            if (elapsedMs <= 0) continue;

            // bytes/sec * correction
            let speedBps = downloadVal / elapsedMs * 1000 * downloadCorrection;

            if (this.wifiLossConfig === 1 && this.bdCode !== null) {
                const speedMbps = speedBps / 1000 / 125;
                const bd = this.bdCode;
                if (bd * this.standardValue > speedMbps && speedMbps > bd * this.wifiOptRate) {
                    const gapPct = Math.ceil((bd * this.standardValue - speedMbps) / bd * 100);
                    const compensationRate = Math.min(gapPct / 100, this.wifiLossRate);
                    let compensation = bd * compensationRate;
                    if (compensation > this.wifiMaxLossValue) compensation = this.wifiMaxLossValue;
                    speedBps += compensation * 1000 * 125;
                }
            }

            records.push(speedBps / 1000);

            const eaSpeed = Math.round(speedBps / 1000 / 125 * 100) / 100;
            process.stdout.write(`\r  下行实时速率: ${eaSpeed} Mb/s`);
        }

        console.log();

        state.stopped = true;
        try { state.abortController.abort(); } catch { /* ignore */ }
        await Promise.allSettled(workers);

        return records;
    }

    // ---- Upload ----

    async _uploadWorker(uploadUrl, state) {
        const uploadSize = 2 * 1024 * 1024;
        const uploadData = new Uint8Array(uploadSize);
        while (!state.stopped) {
            try {
                await fetch(`${uploadUrl}?r=${Math.random()}`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: uploadData,
                    signal: state.abortController.signal,
                });
                state.uploadedBytes += uploadSize;
            } catch {
                if (state.stopped) return;
                await sleep(100);
            }
        }
    }

    async startUploadTest() {
        if (!this.speedTestNodes.length) throw new Error('speed_test_nodes is empty');

        const state = { uploadedBytes: 0, stopped: false, abortController: new AbortController() };

        const workers = [];
        for (const node of this.speedTestNodes) {
            if (!node.uploadUrl) continue;
            for (let i = 0; i < this.allocationThreadNum; i++) {
                workers.push(this._uploadWorker(node.uploadUrl, state));
            }
        }

        await sleep(this.lostDataTime * 1000);
        state.uploadedBytes = 0;

        const sampleInterval = this.calcTime;
        const totalTestNum = Math.floor(this.totalTestTime / this.calcTime);
        const uploadCorrection = 1.048;
        const records = [];
        const startMs = Date.now();

        for (let i = 1; i <= totalTestNum; i++) {
            await sleep(sampleInterval);
            const elapsedMs = Date.now() - startMs;
            if (elapsedMs <= 0) continue;

            const speedRaw = state.uploadedBytes / elapsedMs * uploadCorrection;
            records.push(speedRaw);

            const speedMbps = Math.round(speedRaw / 125 * 100) / 100;
            process.stdout.write(`\r  上行实时速率: ${speedMbps} Mb/s`);
        }

        console.log();

        state.stopped = true;
        try { state.abortController.abort(); } catch { /* ignore */ }
        await Promise.allSettled(workers);

        return records;
    }

    // ---- Data processing ----

    trimRecords(records) {
        const sorted = [...records].sort((a, b) => a - b);
        const trimCount = 5 * this.minLostDataTime;
        return sorted.slice(trimCount);
    }

    findTopAverage(records) {
        const desc = [...records].sort((a, b) => b - a);
        const topN = Math.min(desc.length, this.maxDataTime);
        if (topN === 0) return 0;
        return desc.slice(0, topN).reduce((a, b) => a + b, 0) / topN;
    }

    applyConfigAdjustment(records) {
        if (!records.length || this.useConfig !== 1) return records;

        const topAvg = this.findTopAverage(records);
        const totalAvg = records.reduce((a, b) => a + b, 0) / records.length;

        return records.map(val => {
            if (totalAvg < topAvg * this.avgMaxProportion) {
                const factor = this.startAvgProportion +
                    Math.random() * (this.endAvgProportion - this.startAvgProportion);
                return topAvg * factor;
            }
            return val;
        });
    }

    querySpeedIpDelay() {
        if (!this.addressNew) return 999999;
        const match = this.addressNew.match(/([\d.]+)/);
        if (!match) return 999999;
        const nodeIp = match[1];
        const found = this.serviceNew.find(x => x.nodeIp === nodeIp);
        return found ? found.delay : 999999;
    }

    // ---- Main flow ----

    async run() {
        const overallStart = Date.now();

        console.log('[贵州联通] 获取测速配置...');
        await this.getSpeedConfig();

        console.log('[贵州联通] 获取宽带基础信息...');
        await this.getBasicInfo();
        console.log(`[贵州联通] IP: ${this.basicInfo.terminalIp}  签约带宽: ${this.basicInfo.bdCode}M`);

        console.log('[贵州联通] 测量候选节点延迟...');
        const nodes = await this.collectNodeDelays();
        for (const n of nodes) {
            console.log(`  ${n.nodeName}(${n.nodeIp}): ${n.delay}ms`);
        }

        console.log('[贵州联通] 获取正式测速节点...');
        await this.getSpeedTestNodes(nodes);

        console.log(`[贵州联通] 开始下行测速 (${this.allDownTime}s, ${this.allocationThreadNum} 并发/节点)...`);
        let downloadRecords = await this.startDownloadTest();
        downloadRecords = this.trimRecords(downloadRecords);
        let maxRate = 0, minRate = 0;
        if (downloadRecords.length) {
            maxRate = Math.max(...downloadRecords);
            minRate = Math.min(...downloadRecords);
        }
        downloadRecords = this.applyConfigAdjustment(downloadRecords);

        console.log(`[贵州联通] 开始上行测速 (${Math.floor(this.totalTestTime / 1000)}s, ${this.allocationThreadNum} 并发/节点)...`);
        let uploadRecords = await this.startUploadTest();
        uploadRecords = this.trimRecords(uploadRecords);

        const downMbps = downloadRecords.map(v => v / 125);
        const upMbps = uploadRecords.map(v => v / 125);

        const avgDown = downMbps.length
            ? downMbps.reduce((a, b) => a + b, 0) / downMbps.length : 0;
        const avgUp = upMbps.length
            ? upMbps.reduce((a, b) => a + b, 0) / upMbps.length : 0;

        const ping = this.querySpeedIpDelay();
        const elapsed = Date.now() - overallStart;

        console.log(`[贵州联通] 完成 - 下行: ${avgDown.toFixed(2)} Mbps, 上行: ${avgUp.toFixed(2)} Mbps, 延迟: ${ping}ms`);

        return {
            ping,
            jitter: null,
            download: parseFloat(avgDown.toFixed(2)),
            upload: parseFloat(avgUp.toFixed(2)),
            time: Math.round(elapsed / 1000),
            elapsed
        };
    }
}

export async function runGuizhouSpeedtest(baseUrl) {
    const tester = new GuizhouTester(baseUrl);
    return await tester.run();
}
