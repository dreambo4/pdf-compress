pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
    file: null,
    arrayBuffer: null,
    pageCount: 0,
    compressedBlob: null,
};

const els = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    originalSize: document.getElementById('originalSize'),
    pageCount: document.getElementById('pageCount'),
    settings: document.getElementById('settings'),
    qualityGroup: document.getElementById('qualityGroup'),
    targetGroup: document.getElementById('targetGroup'),
    scaleGroup: document.getElementById('scaleGroup'),
    autoScaleInfo: document.getElementById('autoScaleInfo'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    scaleSlider: document.getElementById('scaleSlider'),
    scaleValue: document.getElementById('scaleValue'),
    scaleHint: document.getElementById('scaleHint'),
    targetSize: document.getElementById('targetSize'),
    targetUnit: document.getElementById('targetUnit'),
    compressBtn: document.getElementById('compressBtn'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    result: document.getElementById('result'),
    resultOriginal: document.getElementById('resultOriginal'),
    resultCompressed: document.getElementById('resultCompressed'),
    resultSaved: document.getElementById('resultSaved'),
    resultDetail: document.getElementById('resultDetail'),
    resultSettings: document.getElementById('resultSettings'),
    downloadBtn: document.getElementById('downloadBtn'),
    resetBtn: document.getElementById('resetBtn'),
};

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getTargetBytes() {
    const value = parseFloat(els.targetSize.value) || 0;
    const unit = els.targetUnit.value;
    return unit === 'MB' ? value * 1024 * 1024 : value * 1024;
}

function updateProgress(percent, text) {
    els.progressFill.style.width = percent + '%';
    if (text) els.progressText.textContent = text;
}

els.uploadArea.addEventListener('click', () => els.fileInput.click());

els.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.uploadArea.classList.add('dragover');
});

els.uploadArea.addEventListener('dragleave', () => {
    els.uploadArea.classList.remove('dragover');
});

els.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    els.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        handleFile(file);
    } else {
        alert('請選擇 PDF 檔案');
    }
});

els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

els.qualitySlider.addEventListener('input', (e) => {
    els.qualityValue.textContent = e.target.value;
});

function getScaleHint(scale) {
    if (scale < 1.0) return '(模糊,只適合縮圖)';
    if (scale < 1.5) return '(螢幕瀏覽夠用)';
    if (scale < 2.0) return '(一般使用,看得清楚)';
    if (scale < 2.5) return '(列印 A4 品質)';
    if (scale < 3.0) return '(高細節保留)';
    return '(超清晰,檔案最大)';
}

els.scaleSlider.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    els.scaleValue.textContent = scale.toFixed(1);
    els.scaleHint.textContent = getScaleHint(scale);
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'quality') {
            els.qualityGroup.hidden = false;
            els.targetGroup.hidden = true;
            els.scaleGroup.hidden = false;
            els.autoScaleInfo.hidden = true;
        } else {
            els.qualityGroup.hidden = true;
            els.targetGroup.hidden = false;
            els.scaleGroup.hidden = true;
            els.autoScaleInfo.hidden = false;
        }
    });
});

els.compressBtn.addEventListener('click', startCompression);
els.downloadBtn.addEventListener('click', downloadCompressed);
els.resetBtn.addEventListener('click', resetAll);

async function handleFile(file) {
    state.file = file;
    state.arrayBuffer = await file.arrayBuffer();

    els.fileName.textContent = file.name;
    els.originalSize.textContent = formatBytes(file.size);

    try {
        const pdf = await pdfjsLib.getDocument({
            data: state.arrayBuffer.slice(0),
        }).promise;
        state.pageCount = pdf.numPages;
        els.pageCount.textContent = state.pageCount + ' 頁';
    } catch (err) {
        alert('無法讀取 PDF 檔案:' + err.message);
        return;
    }

    els.fileInfo.hidden = false;
    els.settings.hidden = false;
    els.result.hidden = true;
    els.progress.hidden = true;
}

async function renderPageToJpeg(pdf, pageNum, scale, quality) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => blob.arrayBuffer().then(resolve),
            'image/jpeg',
            quality
        );
    });
}

async function compressOnce(scale, quality, progressBase, progressRange) {
    const pdf = await pdfjsLib.getDocument({
        data: state.arrayBuffer.slice(0),
    }).promise;

    const newPdf = await PDFLib.PDFDocument.create();

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const jpegBytes = await renderPageToJpeg(pdf, i, scale, quality);
        const jpegImage = await newPdf.embedJpg(jpegBytes);

        const pdfPage = newPdf.addPage([viewport.width, viewport.height]);
        pdfPage.drawImage(jpegImage, {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
        });

        const pct = progressBase + (i / pdf.numPages) * progressRange;
        updateProgress(pct, `處理第 ${i} / ${pdf.numPages} 頁...`);
    }

    const bytes = await newPdf.save();
    return new Blob([bytes], { type: 'application/pdf' });
}

async function compressToTarget(targetBytes) {
    const scaleSteps = [3.0, 2.5, 2.0, 1.5, 1.2, 1.0, 0.8, 0.6];
    const qualitySteps = [0.95, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15];

    const totalSteps = scaleSteps.length + qualitySteps.length;
    let stepIndex = 0;

    const nextProgress = () => {
        const base = (stepIndex / totalSteps) * 100;
        const range = (1 / totalSteps) * 100;
        stepIndex++;
        return { base, range };
    };

    let bestResult = null;
    let smallestResult = null;

    const tryCompress = async (scale, quality, label) => {
        const { base, range } = nextProgress();
        updateProgress(base, label);
        const blob = await compressOnce(scale, quality, base, range);

        if (!smallestResult || blob.size < smallestResult.blob.size) {
            smallestResult = { blob, scale, quality };
        }

        if (blob.size <= targetBytes) {
            if (!bestResult || scale > bestResult.scale ||
                (scale === bestResult.scale && quality > bestResult.quality)) {
                bestResult = { blob, scale, quality };
            }
            return true;
        }
        return false;
    };

    for (const scale of scaleSteps) {
        const ok = await tryCompress(
            scale,
            0.95,
            `掃描清晰度 ${scale}x(品質 95%)...`
        );
        if (ok) {
            break;
        }
    }

    if (bestResult) {
        const baseScale = bestResult.scale;
        const higherScales = scaleSteps.filter((s) => s > baseScale);

        for (const scale of higherScales.reverse()) {
            for (const quality of qualitySteps) {
                if (quality >= 0.95) continue;
                const ok = await tryCompress(
                    scale,
                    quality,
                    `嘗試更高清晰度 ${scale}x(品質 ${Math.round(quality * 100)}%)...`
                );
                if (ok) {
                    break;
                }
            }
            if (bestResult.scale > baseScale) break;
        }
    } else {
        const lowestScale = scaleSteps[scaleSteps.length - 1];
        for (const quality of qualitySteps) {
            const ok = await tryCompress(
                lowestScale,
                quality,
                `降低品質嘗試(清晰度 ${lowestScale}x, 品質 ${Math.round(quality * 100)}%)...`
            );
            if (ok) {
                break;
            }
        }
    }

    return bestResult || smallestResult;
}

async function startCompression() {
    els.compressBtn.disabled = true;
    els.progress.hidden = false;
    els.result.hidden = true;
    updateProgress(0, '準備中...');

    const mode = document.querySelector('input[name="mode"]:checked').value;

    try {
        let blob;
        let usedScale;
        let usedQuality;

        if (mode === 'quality') {
            usedScale = parseFloat(els.scaleSlider.value);
            usedQuality = parseInt(els.qualitySlider.value) / 100;
            blob = await compressOnce(usedScale, usedQuality, 0, 100);
        } else {
            const targetBytes = getTargetBytes();
            if (targetBytes <= 0) {
                alert('請輸入有效的目標大小');
                els.compressBtn.disabled = false;
                els.progress.hidden = true;
                return;
            }
            const result = await compressToTarget(targetBytes);
            blob = result.blob;
            usedScale = result.scale;
            usedQuality = result.quality;
        }

        state.compressedBlob = blob;
        showResult(blob, usedScale, usedQuality, mode);
    } catch (err) {
        alert('壓縮失敗:' + err.message);
        console.error(err);
    } finally {
        els.compressBtn.disabled = false;
    }
}

function showResult(blob, usedScale, usedQuality, mode) {
    const original = state.file.size;
    const compressed = blob.size;
    const saved = original - compressed;
    const savedPercent = ((saved / original) * 100).toFixed(1);

    els.resultOriginal.textContent = formatBytes(original);
    els.resultCompressed.textContent = formatBytes(compressed);

    if (saved > 0) {
        els.resultSaved.textContent = `-${savedPercent}%`;
        els.resultSaved.classList.remove('highlight');
        els.resultSaved.classList.add('success');
    } else {
        els.resultSaved.textContent = `+${Math.abs(savedPercent)}%`;
        els.resultSaved.classList.remove('success');
        els.resultSaved.classList.add('highlight');
    }

    if (mode === 'target' && usedScale != null) {
        els.resultSettings.textContent =
            `清晰度 ${usedScale.toFixed(1)}x、品質 ${Math.round(usedQuality * 100)}%`;
        els.resultDetail.hidden = false;
    } else {
        els.resultDetail.hidden = true;
    }

    els.progress.hidden = true;
    els.result.hidden = false;
    els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function downloadCompressed() {
    if (!state.compressedBlob) return;

    const url = URL.createObjectURL(state.compressedBlob);
    const a = document.createElement('a');
    const originalName = state.file.name.replace(/\.pdf$/i, '');
    a.href = url;
    a.download = `${originalName}_compressed.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetAll() {
    state.file = null;
    state.arrayBuffer = null;
    state.pageCount = 0;
    state.compressedBlob = null;

    els.fileInput.value = '';
    els.fileInfo.hidden = true;
    els.settings.hidden = true;
    els.progress.hidden = true;
    els.result.hidden = true;
}
