/**
 * Popup 主逻辑
 */

// PDF.js CDN
const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs';
const PDF_JS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

// DOM 元素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const panelMain = document.getElementById('panel-main');
const panelSettings = document.getElementById('panel-settings');
const panelResult = document.getElementById('panel-result');
const resultContent = document.getElementById('result-content');
const btnSettings = document.getElementById('btn-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnFill = document.getElementById('btn-fill');
const btnClear = document.getElementById('btn-clear');
const btnDetectInputs = document.getElementById('btn-detect-inputs');
const btnSaveMapping = document.getElementById('btn-save-mapping');
const fieldMappingList = document.getElementById('field-mapping-list');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');

let currentInvoiceData = null;
let settingsVisible = true; // 默认展开设置面板

// 初始化：加载保存的设置
chrome.storage.local.get(['apiKey', 'model'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
    // 已有 API Key 时，默认收起设置面板
    settingsVisible = false;
    panelSettings.classList.add('hidden');
  }
  if (result.model) modelSelect.value = result.model;
});

// === 设置面板 ===
btnSettings.addEventListener('click', () => {
  settingsVisible = !settingsVisible;
  panelSettings.classList.toggle('hidden', !settingsVisible);
});

btnSaveSettings.addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: apiKeyInput.value,
    model: modelSelect.value
  });
  showStatus('设置已保存', 'success');
});

// === PDF 上传 ===
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    processFile(file);
  } else {
    showStatus('请上传 PDF 文件', 'error');
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
});

// === 核心流程 ===
async function processFile(file) {
  showStatus(`正在解析: ${file.name} ...`, 'loading');

  try {
    // 1. 提取 PDF 文本
    const text = await extractPdfText(file);
    if (!text.trim()) {
      showStatus('PDF 中未提取到文本内容，可能是扫描件', 'error');
      return;
    }

    showStatus('正在调用 AI 分析发票内容...', 'loading');

    // 2. 获取 API Key
    const settings = await chrome.storage.local.get(['apiKey', 'model']);
    if (!settings.apiKey) {
      showStatus('请先在设置中配置 API Key', 'error');
      return;
    }

    // 3. 调用 Qwen 提取发票信息
    const invoiceData = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'EXTRACT_INVOICE', data: { apiKey: settings.apiKey, invoiceText: text } },
        (response) => {
          if (response.error) reject(new Error(response.error));
          else resolve(response);
        }
      );
    });

    currentInvoiceData = invoiceData;
    showResult(invoiceData);
    showStatus('解析完成', 'success');

  } catch (err) {
    showStatus(`解析失败: ${err.message}`, 'error');
  }
}

async function extractPdfText(file) {
  const pdfjsLib = await import(PDF_JS_CDN);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    textParts.push(content.items.map(item => item.str).join(' '));
  }

  return textParts.join('\n');
}

// === 结果展示 ===
const FIELD_LABELS = {
  invoiceType: '发票类型',
  invoiceCode: '发票代码',
  invoiceNumber: '发票号码',
  invoiceDate: '开票日期',
  checkCode: '校验码',
  totalAmount: '合计金额',
  totalTax: '合计税额',
  totalWithTaxNumber: '价税合计',
  remark: '备注',
  'seller.name': '销售方',
  'seller.taxId': '销售方税号',
  'buyer.name': '购买方',
  'buyer.taxId': '购买方税号'
};

function showResult(data) {
  panelResult.classList.remove('hidden');
  resultContent.innerHTML = '';

  const flat = {
    invoiceType: data.invoiceType,
    invoiceCode: data.invoiceCode,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    checkCode: data.checkCode,
    'seller.name': data.seller?.name,
    'seller.taxId': data.seller?.taxId,
    'buyer.name': data.buyer?.name,
    'buyer.taxId': data.buyer?.taxId,
    totalAmount: data.totalAmount,
    totalTax: data.totalTax,
    totalWithTaxNumber: data.totalWithTaxNumber,
    remark: data.remark
  };

  // 显示明细项
  if (data.items?.length) {
    const itemNames = data.items.map(i => i.name).filter(Boolean).join('; ');
    flat['items'] = itemNames;
    FIELD_LABELS['items'] = '项目名称';
  }

  for (const [key, value] of Object.entries(flat)) {
    if (!value) continue;
    const div = document.createElement('div');
    div.className = 'result-field';
    div.innerHTML = `
      <span class="field-label">${FIELD_LABELS[key] || key}</span>
      <span class="field-value">${value}</span>
    `;
    resultContent.appendChild(div);
  }
}

// === 填入表单 ===
btnFill.addEventListener('click', async () => {
  if (!currentInvoiceData) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.runtime.sendMessage({
      type: 'FILL_FORM',
      data: currentInvoiceData,
      tabId: tab.id
    });
    showStatus('已填入表单', 'success');
  } catch (err) {
    showStatus(`填入失败: ${err.message}`, 'error');
  }
});

btnClear.addEventListener('click', () => {
  currentInvoiceData = null;
  panelResult.classList.add('hidden');
  statusEl.classList.add('hidden');
  fileInput.value = '';
});

// === 字段映射 ===
btnDetectInputs.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INPUTS' });
    if (response?.inputs) {
      renderFieldMapping(response.inputs);
    }
  } catch (err) {
    showStatus('无法检测页面输入框，请确保在财务系统页面中', 'error');
  }
});

function renderFieldMapping(pageInputs) {
  fieldMappingList.innerHTML = '';
  btnSaveMapping.classList.remove('hidden');

  const invoiceFields = Object.entries(FIELD_LABELS);

  for (const [fieldKey, fieldLabel] of invoiceFields) {
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const label = document.createElement('label');
    label.textContent = fieldLabel;

    const select = document.createElement('select');
    select.dataset.field = fieldKey;
    select.innerHTML = '<option value="">-- 不映射 --</option>';
    for (const input of pageInputs) {
      const desc = input.label || input.placeholder || input.name || input.id || `输入框${input.index}`;
      select.innerHTML += `<option value="${input.selector}">${desc}</option>`;
    }

    row.appendChild(label);
    row.appendChild(select);
    fieldMappingList.appendChild(row);
  }
}

btnSaveMapping.addEventListener('click', () => {
  const mapping = {};
  fieldMappingList.querySelectorAll('select').forEach(select => {
    if (select.value) {
      mapping[select.dataset.field] = select.value;
    }
  });

  chrome.storage.local.set({ fieldMapping: mapping });

  // 同时通知 content script 更新映射
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_FIELD_MAPPING', data: mapping });
  });

  showStatus('字段映射已保存', 'success');
});

// === 工具函数 ===
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}
