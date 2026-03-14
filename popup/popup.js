/**
 * Popup 主逻辑
 */

// PDF.js 本地路径
const PDF_JS_LOCAL = chrome.runtime.getURL('lib/pdf.min.mjs');
const PDF_JS_WORKER_LOCAL = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

// DOM 元素
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const panelMain = document.getElementById('panel-main');
const panelSettings = document.getElementById('panel-settings');
const panelResult = document.getElementById('panel-result');
const invoiceTbody = document.getElementById('invoice-tbody');
const invoiceCount = document.getElementById('invoice-count');
const btnSettings = document.getElementById('btn-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnFill = document.getElementById('btn-fill');
const btnClear = document.getElementById('btn-clear');
const btnDetectInputs = document.getElementById('btn-detect-inputs');
const btnSaveMapping = document.getElementById('btn-save-mapping');
const fieldMappingList = document.getElementById('field-mapping-list');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');

// 发票列表数据: [{ fileName, data, project }]
let invoiceList = [];
// 页面项目选项: [{ project, subProject }]
let projectOptions = [];
let settingsVisible = true;

// 初始化：加载保存的设置
chrome.storage.local.get(['apiKey', 'model'], (result) => {
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
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
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
  if (files.length > 0) {
    processFiles(files);
  } else {
    showStatus('请上传 PDF 文件', 'error');
  }
});

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) processFiles(files);
});

// === 核心流程 ===
async function processFiles(files) {
  // 先尝试获取页面上的项目选项
  await fetchProjectOptions();

  const settings = await chrome.storage.local.get(['apiKey', 'model']);
  if (!settings.apiKey) {
    showStatus('请先在设置中配置 API Key', 'error');
    return;
  }

  let successCount = 0;
  for (const file of files) {
    showStatus(`正在解析 (${successCount + 1}/${files.length}): ${file.name} ...`, 'loading');
    try {
      const data = await processOneFile(file, settings);
      const autoProject = data.suggestedProject || '';
      invoiceList.push({ fileName: file.name, data, project: autoProject });
      successCount++;
    } catch (err) {
      showStatus(`${file.name} 解析失败: ${err.message}`, 'error');
    }
  }

  if (successCount > 0) {
    renderInvoiceTable();
    showStatus(`解析完成，共 ${successCount} 张发票`, 'success');
  }
}

async function processOneFile(file, settings) {
  const text = await extractPdfText(file);
  if (!text.trim()) {
    throw new Error('未提取到文本内容，可能是扫描件');
  }

  const invoiceData = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_INVOICE', data: { apiKey: settings.apiKey, invoiceText: text, model: settings.model || 'qwen3.5-plus', projectOptions } },
      (response) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      }
    );
  });

  return invoiceData;
}

async function fetchProjectOptions() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: extractExpenseProjects
    });
    // 汇总所有 frame 的结果，取第一个有数据的
    for (const frame of results) {
      if (frame.result?.length) {
        projectOptions = frame.result;
        break;
      }
    }
  } catch {
    // 非财务系统页面或无权限，忽略
  }
}

// 注入到页面 frame 中执行的函数（独立作用域，不能引用外部变量）
function extractExpenseProjects() {
  const projects = [];

  // 直接通过 ID 查找数据表格
  let dataTable = document.getElementById('ctl00_ContentPlaceHolder1_GV_BXNR');

  // 备用：在"费用明细填写"附近查找 .datatable
  if (!dataTable) {
    const h5 = Array.from(document.querySelectorAll('h5')).find(
      el => el.textContent.includes('费用明细填写')
    );
    if (h5) {
      const container = h5.closest('td') || h5.closest('div');
      if (container) {
        // 数据表格是第二个 .datatable（第一个是表头）
        const tables = container.querySelectorAll('table.datatable');
        dataTable = tables.length > 1 ? tables[1] : tables[0];
      }
    }
  }

  if (!dataTable) return projects;

  // 遍历行，处理 rowspan 合并的项目列
  // 表格共 8 列：项目、子项目、关键字摘要、单据数、金额、描述、报销要点、明细
  // - 有 rowspan 的行：8 个 td，第一个是项目(跨行)，第二个是子项目
  // - rowspan 下的后续行：7 个 td，第一个是子项目（项目列被 rowspan 覆盖）
  // - 无 rowspan 的独立行：8 个 td，第一个是项目，第二个是子项目
  let currentProject = '';
  const rows = dataTable.querySelectorAll('tr.row');

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length === 0) continue;

    let subProjectCell;

    if (cells.length >= 8) {
      // 这一行包含项目列（有 rowspan 或独立行）
      currentProject = cells[0].textContent.trim();
      subProjectCell = cells[1];
    } else {
      // rowspan 覆盖的后续行，第一个 td 就是子项目
      subProjectCell = cells[0];
    }

    const subProject = subProjectCell ? subProjectCell.textContent.trim() : '';

    if (currentProject) {
      projects.push({ project: currentProject, subProject });
    }
  }

  return projects;
}

async function extractPdfText(file) {
  const pdfjsLib = await import(PDF_JS_LOCAL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_LOCAL;

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

// === 结果展示（表格） ===
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

function renderInvoiceTable() {
  panelResult.classList.remove('hidden');
  invoiceCount.textContent = invoiceList.length;
  invoiceTbody.innerHTML = '';

  invoiceList.forEach((item, index) => {
    const tr = document.createElement('tr');

    // 文件名
    const tdName = document.createElement('td');
    tdName.textContent = item.fileName;
    tdName.title = item.fileName;
    tdName.className = 'cell-filename';

    // 发票类型
    const tdType = document.createElement('td');
    tdType.textContent = item.data.invoiceType || '-';

    // 金额
    const tdAmount = document.createElement('td');
    tdAmount.textContent = item.data.totalWithTaxNumber ?? item.data.totalAmount ?? '-';

    // 项目下拉
    const tdProject = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'project-select';
    select.innerHTML = '<option value="">-- 选择项目 --</option>';
    for (const opt of projectOptions) {
      const label = opt.subProject ? `${opt.project} - ${opt.subProject}` : opt.project;
      select.innerHTML += `<option value="${label}">${label}</option>`;
    }
    select.value = item.project;
    select.addEventListener('change', () => {
      invoiceList[index].project = select.value;
    });
    tdProject.appendChild(select);

    // 删除按钮
    const tdAction = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-del';
    btnDel.textContent = 'x';
    btnDel.title = '移除';
    btnDel.addEventListener('click', () => {
      invoiceList.splice(index, 1);
      renderInvoiceTable();
    });
    tdAction.appendChild(btnDel);

    tr.appendChild(tdName);
    tr.appendChild(tdType);
    tr.appendChild(tdAmount);
    tr.appendChild(tdProject);
    tr.appendChild(tdAction);
    invoiceTbody.appendChild(tr);
  });
}

// === 填入表单 ===
btnFill.addEventListener('click', async () => {
  if (!invoiceList.length) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const item of invoiceList) {
      await chrome.runtime.sendMessage({
        type: 'FILL_FORM',
        data: { ...item.data, selectedProject: item.project },
        tabId: tab.id
      });
    }
    showStatus('已填入表单', 'success');
  } catch (err) {
    showStatus(`填入失败: ${err.message}`, 'error');
  }
});

btnClear.addEventListener('click', () => {
  invoiceList = [];
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
