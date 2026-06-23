const imgState = {
    images: [],
    pdfBlob: null,
    dragSrcIndex: null,
};

const imgEls = {
    uploadArea: document.getElementById('imgUploadArea'),
    fileInput: document.getElementById('imgFileInput'),
    toolbar: document.getElementById('imgToolbar'),
    count: document.getElementById('imgCount'),
    addMoreBtn: document.getElementById('imgAddMoreBtn'),
    clearBtn: document.getElementById('imgClearBtn'),
    grid: document.getElementById('imgGrid'),
    actions: document.getElementById('imgActions'),
    generateBtn: document.getElementById('imgGenerateBtn'),
    progress: document.getElementById('imgProgress'),
    progressFill: document.getElementById('imgProgressFill'),
    progressText: document.getElementById('imgProgressText'),
    result: document.getElementById('imgResult'),
    pageCount: document.getElementById('imgPageCount'),
    fileSize: document.getElementById('imgFileSize'),
    downloadBtn: document.getElementById('imgDownloadBtn'),
    resetBtn: document.getElementById('imgResetBtn'),
};

let imgIdCounter = 0;

imgEls.uploadArea.addEventListener('click', () => imgEls.fileInput.click());

imgEls.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    imgEls.uploadArea.classList.add('dragover');
});

imgEls.uploadArea.addEventListener('dragleave', () => {
    imgEls.uploadArea.classList.remove('dragover');
});

imgEls.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    imgEls.uploadArea.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f =>
        f.type === 'image/jpeg' || f.type === 'image/png'
    );
    if (files.length) addImages(files);
});

imgEls.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        addImages([...e.target.files]);
        e.target.value = '';
    }
});

imgEls.addMoreBtn.addEventListener('click', () => imgEls.fileInput.click());
imgEls.clearBtn.addEventListener('click', resetImgAll);
imgEls.generateBtn.addEventListener('click', generatePdf);
imgEls.downloadBtn.addEventListener('click', downloadPdf);
imgEls.resetBtn.addEventListener('click', resetImgAll);

function readAsDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function addImages(files) {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const newImages = await Promise.all(
        sorted.map(async (file) => ({
            id: ++imgIdCounter,
            file,
            name: file.name,
            dataUrl: await readAsDataUrl(file),
        }))
    );

    imgState.images.push(...newImages);
    imgState.pdfBlob = null;
    imgEls.result.hidden = true;
    renderGrid();
    syncUI();
}

function syncUI() {
    const hasImages = imgState.images.length > 0;
    imgEls.uploadArea.style.display = hasImages ? 'none' : '';
    imgEls.toolbar.hidden = !hasImages;
    imgEls.actions.hidden = !hasImages;
    imgEls.count.textContent = `${imgState.images.length} 張圖片`;
}

function renderGrid() {
    imgEls.grid.innerHTML = '';

    imgState.images.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'img-item';
        item.setAttribute('draggable', 'true');

        item.innerHTML = `
            <div class="img-order">${index + 1}</div>
            <button class="img-remove" title="移除">&#215;</button>
            <img src="${img.dataUrl}" alt="${img.name}">
            <div class="img-name" title="${img.name}">${img.name}</div>
        `;

        item.querySelector('.img-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            imgState.images.splice(index, 1);
            imgState.pdfBlob = null;
            imgEls.result.hidden = true;
            renderGrid();
            syncUI();
        });

        item.addEventListener('dragstart', (e) => {
            imgState.dragSrcIndex = index;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.img-item').forEach((el) =>
                el.classList.remove('drag-over')
            );
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.img-item').forEach((el) =>
                el.classList.remove('drag-over')
            );
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const src = imgState.dragSrcIndex;
            if (src !== null && src !== index) {
                const [moved] = imgState.images.splice(src, 1);
                imgState.images.splice(index, 0, moved);
                imgState.dragSrcIndex = null;
                renderGrid();
            }
        });

        imgEls.grid.appendChild(item);
    });
}

async function generatePdf() {
    if (imgState.images.length === 0) return;

    imgEls.generateBtn.disabled = true;
    imgEls.progress.hidden = false;
    imgEls.result.hidden = true;

    const setProgress = (pct, text) => {
        imgEls.progressFill.style.width = pct + '%';
        if (text) imgEls.progressText.textContent = text;
    };
    setProgress(0, '準備中...');

    try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const total = imgState.images.length;

        for (let i = 0; i < total; i++) {
            const { file } = imgState.images[i];
            setProgress((i / total) * 90, `處理第 ${i + 1} / ${total} 張...`);

            const arrayBuffer = await file.arrayBuffer();
            let image;
            if (file.type === 'image/png') {
                image = await pdfDoc.embedPng(arrayBuffer);
            } else {
                image = await pdfDoc.embedJpg(arrayBuffer);
            }

            const { width, height } = image;
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(image, { x: 0, y: 0, width, height });
        }

        setProgress(95, '儲存 PDF...');
        const bytes = await pdfDoc.save();
        imgState.pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        setProgress(100, '完成！');

        imgEls.pageCount.textContent = total + ' 頁';
        imgEls.fileSize.textContent = formatBytes(imgState.pdfBlob.size);
        imgEls.progress.hidden = true;
        imgEls.result.hidden = false;
        imgEls.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
        alert('生成失敗:' + err.message);
        console.error(err);
    } finally {
        imgEls.generateBtn.disabled = false;
    }
}

function downloadPdf() {
    if (!imgState.pdfBlob) return;
    const now = new Date();
    const ts = now.getFullYear().toString()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0');
    const url = URL.createObjectURL(imgState.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `images_${ts}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetImgAll() {
    imgState.images = [];
    imgState.pdfBlob = null;
    imgState.dragSrcIndex = null;
    imgEls.fileInput.value = '';
    imgEls.grid.innerHTML = '';
    imgEls.toolbar.hidden = true;
    imgEls.actions.hidden = true;
    imgEls.progress.hidden = true;
    imgEls.result.hidden = true;
    imgEls.uploadArea.style.display = '';
}
