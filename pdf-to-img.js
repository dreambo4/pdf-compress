// PDF 轉圖片:每頁輸出 JPG,或所有頁面拼成一張長圖
// 共用 compress.js 提供的全域函式:formatBytes()、getScaleHint()

const p2iState = {
    file: null,
    arrayBuffer: null,
    // 轉出結果:{ name, blob, url } 陣列
    results: [],
};

const p2iEls = {
    uploadArea: document.getElementById('p2iUploadArea'),
    fileInput: document.getElementById('p2iFileInput'),
    fileInfo: document.getElementById('p2iFileInfo'),
    fileName: document.getElementById('p2iFileName'),
    pageCount: document.getElementById('p2iPageCount'),
    settings: document.getElementById('p2iSettings'),
    qualitySlider: document.getElementById('p2iQualitySlider'),
    qualityValue: document.getElementById('p2iQualityValue'),
    scaleSlider: document.getElementById('p2iScaleSlider'),
    scaleValue: document.getElementById('p2iScaleValue'),
    scaleHint: document.getElementById('p2iScaleHint'),
    convertBtn: document.getElementById('p2iConvertBtn'),
    progress: document.getElementById('p2iProgress'),
    progressFill: document.getElementById('p2iProgressFill'),
    progressText: document.getElementById('p2iProgressText'),
    result: document.getElementById('p2iResult'),
    resultSummary: document.getElementById('p2iResultSummary'),
    grid: document.getElementById('p2iGrid'),
    downloadAllBtn: document.getElementById('p2iDownloadAllBtn'),
    resetBtn: document.getElementById('p2iResetBtn'),
};

p2iEls.uploadArea.addEventListener('click', () => p2iEls.fileInput.click());

p2iEls.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    p2iEls.uploadArea.classList.add('dragover');
});

p2iEls.uploadArea.addEventListener('dragleave', () => {
    p2iEls.uploadArea.classList.remove('dragover');
});

p2iEls.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    p2iEls.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        p2iHandleFile(file);
    } else {
        alert('請選擇 PDF 檔案');
    }
});

p2iEls.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) p2iHandleFile(file);
});

p2iEls.qualitySlider.addEventListener('input', (e) => {
    p2iEls.qualityValue.textContent = e.target.value;
});

p2iEls.scaleSlider.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    p2iEls.scaleValue.textContent = scale.toFixed(1);
    p2iEls.scaleHint.textContent = getScaleHint(scale);
});

p2iEls.convertBtn.addEventListener('click', p2iStartConversion);
p2iEls.downloadAllBtn.addEventListener('click', p2iDownloadAll);
p2iEls.resetBtn.addEventListener('click', p2iResetAll);

function p2iUpdateProgress(percent, text) {
    p2iEls.progressFill.style.width = percent + '%';
    if (text) p2iEls.progressText.textContent = text;
}

function p2iClearResults() {
    p2iState.results.forEach((item) => URL.revokeObjectURL(item.url));
    p2iState.results = [];
    p2iEls.grid.innerHTML = '';
}

async function p2iHandleFile(file) {
    p2iState.file = file;
    p2iState.arrayBuffer = await file.arrayBuffer();

    p2iEls.fileName.textContent = file.name;

    try {
        const pdf = await pdfjsLib.getDocument({
            data: p2iState.arrayBuffer.slice(0),
        }).promise;
        p2iEls.pageCount.textContent = pdf.numPages + ' 頁';
    } catch (err) {
        alert('無法讀取 PDF 檔案:' + err.message);
        return;
    }

    p2iClearResults();
    p2iEls.fileInfo.hidden = false;
    p2iEls.settings.hidden = false;
    p2iEls.result.hidden = true;
    p2iEls.progress.hidden = true;
}

function p2iCanvasToBlob(canvas, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
}

async function p2iRenderPageToCanvas(pdf, pageNum, scale) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
}

async function p2iStartConversion() {
    p2iEls.convertBtn.disabled = true;
    p2iEls.progress.hidden = false;
    p2iEls.result.hidden = true;
    p2iClearResults();
    p2iUpdateProgress(0, '準備中...');

    const mode = document.querySelector('input[name="p2iMode"]:checked').value;
    const scale = parseFloat(p2iEls.scaleSlider.value);
    const quality = parseInt(p2iEls.qualitySlider.value) / 100;
    const baseName = p2iState.file.name.replace(/\.pdf$/i, '');

    try {
        const pdf = await pdfjsLib.getDocument({
            data: p2iState.arrayBuffer.slice(0),
        }).promise;

        if (mode === 'longImage') {
            await p2iConvertToLongImage(pdf, scale, quality, baseName);
        } else {
            await p2iConvertToPerPage(pdf, scale, quality, baseName);
        }

        p2iShowResult(mode);
    } catch (err) {
        alert('轉換失敗:' + err.message);
        console.error(err);
        p2iEls.progress.hidden = true;
    } finally {
        p2iEls.convertBtn.disabled = false;
    }
}

async function p2iConvertToPerPage(pdf, scale, quality, baseName) {
    const total = pdf.numPages;
    const pad = String(total).length;

    for (let i = 1; i <= total; i++) {
        p2iUpdateProgress(((i - 1) / total) * 100, `轉換第 ${i} / ${total} 頁...`);
        const canvas = await p2iRenderPageToCanvas(pdf, i, scale);
        const blob = await p2iCanvasToBlob(canvas, quality);
        const pageStr = String(i).padStart(pad, '0');
        p2iState.results.push({
            name: `${baseName}_${pageStr}.jpg`,
            blob,
            url: URL.createObjectURL(blob),
        });
    }
    p2iUpdateProgress(100, '完成!');
}

async function p2iConvertToLongImage(pdf, scale, quality, baseName) {
    const total = pdf.numPages;
    const canvases = [];
    let maxWidth = 0;
    let totalHeight = 0;

    for (let i = 1; i <= total; i++) {
        p2iUpdateProgress(((i - 1) / total) * 90, `渲染第 ${i} / ${total} 頁...`);
        const canvas = await p2iRenderPageToCanvas(pdf, i, scale);
        canvases.push(canvas);
        maxWidth = Math.max(maxWidth, canvas.width);
        totalHeight += canvas.height;
    }

    p2iUpdateProgress(92, '拼接長圖中...');
    const longCanvas = document.createElement('canvas');
    longCanvas.width = maxWidth;
    longCanvas.height = totalHeight;
    const ctx = longCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, maxWidth, totalHeight);

    let y = 0;
    for (const canvas of canvases) {
        // 每頁水平置中
        const x = Math.floor((maxWidth - canvas.width) / 2);
        ctx.drawImage(canvas, x, y);
        y += canvas.height;
    }

    p2iUpdateProgress(96, '輸出圖片中...');
    const blob = await p2iCanvasToBlob(longCanvas, quality);
    p2iState.results.push({
        name: `${baseName}_long.jpg`,
        blob,
        url: URL.createObjectURL(blob),
    });
    p2iUpdateProgress(100, '完成!');
}

function p2iShowResult(mode) {
    const count = p2iState.results.length;
    const totalBytes = p2iState.results.reduce((s, it) => s + it.blob.size, 0);

    p2iEls.resultSummary.textContent =
        mode === 'longImage'
            ? `1 張長圖 · ${formatBytes(totalBytes)}`
            : `${count} 張圖片 · 共 ${formatBytes(totalBytes)}`;

    // 多張(perPage 且 >1)才需要「全部打包下載」
    p2iEls.downloadAllBtn.hidden = count <= 1;

    p2iEls.grid.innerHTML = '';
    p2iState.results.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'p2i-card';

        const thumb = document.createElement('img');
        thumb.className = 'p2i-thumb';
        thumb.src = item.url;
        thumb.alt = item.name;
        thumb.loading = 'lazy';

        const meta = document.createElement('div');
        meta.className = 'p2i-meta';
        const label = mode === 'longImage' ? '長圖' : `第 ${idx + 1} 頁`;
        meta.innerHTML =
            `<span class="p2i-page">${label}</span>` +
            `<span class="p2i-size">${formatBytes(item.blob.size)}</span>`;

        const dlBtn = document.createElement('button');
        dlBtn.className = 'btn btn-secondary btn-sm';
        dlBtn.textContent = '下載';
        dlBtn.addEventListener('click', () => p2iDownloadOne(item));

        card.appendChild(thumb);
        card.appendChild(meta);
        card.appendChild(dlBtn);
        p2iEls.grid.appendChild(card);
    });

    p2iEls.progress.hidden = true;
    p2iEls.result.hidden = false;
    p2iEls.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function p2iDownloadOne(item) {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function p2iDownloadAll() {
    if (p2iState.results.length === 0) return;

    p2iEls.downloadAllBtn.disabled = true;
    const originalText = p2iEls.downloadAllBtn.textContent;
    p2iEls.downloadAllBtn.textContent = '打包中...';

    try {
        const zip = new JSZip();
        p2iState.results.forEach((item) => {
            zip.file(item.name, item.blob);
        });
        const content = await zip.generateAsync({ type: 'blob' });

        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        const baseName = p2iState.file.name.replace(/\.pdf$/i, '');
        a.href = url;
        a.download = `${baseName}_images.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('打包失敗:' + err.message);
        console.error(err);
    } finally {
        p2iEls.downloadAllBtn.disabled = false;
        p2iEls.downloadAllBtn.textContent = originalText;
    }
}

function p2iResetAll() {
    p2iState.file = null;
    p2iState.arrayBuffer = null;
    p2iClearResults();

    p2iEls.fileInput.value = '';
    p2iEls.fileInfo.hidden = true;
    p2iEls.settings.hidden = true;
    p2iEls.progress.hidden = true;
    p2iEls.result.hidden = true;
}
